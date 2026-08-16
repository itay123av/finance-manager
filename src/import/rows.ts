/**
 * פענוח שורות: מתאים לתאריך, סכום וכיוון.
 *
 * שני מקומות שבהם קל לטעות ויקר מאוד לטעות:
 *
 * 1. **תאריכים** — בישראל הפורמט הוא יום/חודש/שנה, בניגוד לארה״ב.
 *    פענוח הפוך יעביר עסקאות לחודש הלא נכון וישבש כל ממוצע.
 * 2. **כיוון** — מינוס בסוף המספר (`123.45-`) נפוץ בייצוא מבנקים,
 *    ומימוש נאיבי קורא אותו כחיובי. הכנסה שנקלטת כהוצאה מזיזה את
 *    היתרה בכפליים מהסכום.
 */

import { stripInvisibles } from './encoding';
import { applyDirectionRule } from './direction';
import { normalizeMerchant } from '../data/normalize';
import { isValidISODate } from '../core/dates';
import type { Agorot, ISODate, TransactionType } from '../core/types';
import type {
  ColumnMapping,
  DirectionRule,
  ParsedRow,
  RowFailure,
  RowFailureReason,
} from './types';

// ---------------------------------------------------------------------------
// תאריך
// ---------------------------------------------------------------------------

function expandYear(year: number): number {
  if (year >= 1000) return year;
  // חלון סביר לעסקאות: שנתיים קדימה נחשבות עבר קרוב, השאר — המאה הקודמת
  return year <= 79 ? 2000 + year : 1900 + year;
}

/**
 * מפענח תאריך. מניח יום-לפני-חודש, למעט כשברור אחרת:
 * פורמט ISO מזוהה לפי שנה בת 4 ספרות בהתחלה, ואם היום גדול מ-12
 * אין אי-בהירות בכלל.
 */
export function parseDateCell(value: string): ISODate | null {
  const clean = stripInvisibles(value).trim();
  if (clean === '') return null;

  const match = clean.match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!match) return null;

  const [, first = '', second = '', third = ''] = match;
  let year: number;
  let month: number;
  let day: number;

  if (first.length === 4) {
    // yyyy-mm-dd
    year = Number(first);
    month = Number(second);
    day = Number(third);
  } else {
    day = Number(first);
    month = Number(second);
    year = expandYear(Number(third));
    // ‎03/25/2026 — יום גדול מ-12 בעמודת החודש מסגיר פורמט אמריקאי
    if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // תופס 31/02 ותאריכים שלא קיימים
  return isValidISODate(iso) ? iso : null;
}

// ---------------------------------------------------------------------------
// סכום
// ---------------------------------------------------------------------------

/**
 * מפענח סכום לאגורות בלי לעבור דרך חישוב עשרוני.
 * `1,234.5` → 123450 אגורות, בלי סיכוי לשגיאת float.
 */
export function parseAmountCell(value: string): Agorot | null {
  let clean = stripInvisibles(value).trim();
  if (clean === '') return null;

  let negative = false;

  // סוגריים = שלילי, מוסכמה חשבונאית
  if (/^\(.*\)$/.test(clean)) {
    negative = true;
    clean = clean.slice(1, -1);
  }
  // מינוס בסוף — נפוץ בייצוא ממערכות בנקאיות
  if (/-\s*$/.test(clean)) {
    negative = true;
    clean = clean.replace(/-\s*$/, '');
  }
  if (/^\s*-/.test(clean)) {
    negative = true;
    clean = clean.replace(/^\s*-/, '');
  }
  if (/^\s*\+/.test(clean)) {
    clean = clean.replace(/^\s*\+/, '');
  }

  clean = clean.replace(/[₪$€\s]/g, '').replace(/,/g, '');
  if (clean === '' || !/^\d*\.?\d*$/.test(clean) || !/\d/.test(clean)) return null;

  const [whole = '0', fraction = ''] = clean.split('.');
  const agorot = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  if (!Number.isFinite(agorot)) return null;

  return negative ? -agorot : agorot;
}

// ---------------------------------------------------------------------------
// פענוח הטבלה
// ---------------------------------------------------------------------------

export interface ParseRowsResult {
  rows: ParsedRow[];
  failures: RowFailure[];
  /**
   * עובדות גולמיות על הכיוון. ההכרעה עצמה נעשית ב-`direction.ts`,
   * שמחליט אם יש מספיק מידע או שצריך לעצור ולשאול.
   */
  hasDebitCredit: boolean;
  sawNegativeAmount: boolean;
}

function firstIndexOf(mapping: ColumnMapping, role: string): number {
  return mapping.roles.indexOf(role as ColumnMapping['roles'][number]);
}

export function parseRows(
  rows: string[][],
  mapping: ColumnMapping,
  options: { directionRule?: DirectionRule } = {},
): ParseRowsResult {
  const dataRows = rows.slice(mapping.headerRowIndex === null ? 0 : mapping.headerRowIndex + 1);

  const dateCol = firstIndexOf(mapping, 'date');
  const merchantCol = firstIndexOf(mapping, 'merchant');
  const amountCol = firstIndexOf(mapping, 'amount');
  const debitCol = firstIndexOf(mapping, 'debit');
  const creditCol = firstIndexOf(mapping, 'credit');
  const balanceCol = firstIndexOf(mapping, 'balance');

  const parsed: ParsedRow[] = [];
  const failures: RowFailure[] = [];
  const offset = (mapping.headerRowIndex === null ? 0 : mapping.headerRowIndex + 1) + 1;

  let sawNegativeAmount = false;
  const usesSingleAmountColumn = amountCol >= 0 && debitCol < 0 && creditCol < 0;

  dataRows.forEach((row, index) => {
    const sourceLine = offset + index;
    const preview = row.filter((c) => c !== '').join(' | ').slice(0, 120);
    const fail = (reason: RowFailureReason) =>
      failures.push({ sourceLine, reason, rawPreview: preview });

    if (row.every((cell) => cell === '')) return; // שורת ריפוד, לא שגיאה

    const rawDate = dateCol >= 0 ? (row[dateCol] ?? '') : '';
    if (rawDate.trim() === '') return fail('missing_date');
    const date = parseDateCell(rawDate);
    if (!date) return fail('invalid_date');

    let signedAgorot: number | null = null;
    if (usesSingleAmountColumn) {
      signedAgorot = parseAmountCell(row[amountCol] ?? '');
      if (signedAgorot === null) {
        return fail((row[amountCol] ?? '').trim() === '' ? 'missing_amount' : 'invalid_amount');
      }
      if (signedAgorot < 0) sawNegativeAmount = true;
    } else {
      const debit = debitCol >= 0 ? parseAmountCell(row[debitCol] ?? '') : null;
      const credit = creditCol >= 0 ? parseAmountCell(row[creditCol] ?? '') : null;
      // עמודות חובה/זכות: הערך מופיע באחת מהן, השנייה ריקה
      if (debit !== null && debit !== 0) signedAgorot = -Math.abs(debit);
      else if (credit !== null && credit !== 0) signedAgorot = Math.abs(credit);
      else if (debit === null && credit === null) return fail('missing_amount');
      else return fail('zero_amount');
    }

    if (signedAgorot === 0) return fail('zero_amount');

    const merchant = merchantCol >= 0 ? (row[merchantCol] ?? '').trim() : '';
    const balance = balanceCol >= 0 ? parseAmountCell(row[balanceCol] ?? '') : null;

    // הכיוון מהקובץ עצמו; כלל של המשתמש, אם נבחר, גובר עליו
    const fromFile: TransactionType = signedAgorot < 0 ? 'expense' : 'income';
    const fromRule = options.directionRule
      ? applyDirectionRule(options.directionRule, row)
      : null;

    parsed.push({
      sourceLine,
      date,
      amountAgorot: Math.abs(signedAgorot),
      type: fromRule ?? fromFile,
      merchant,
      merchantNormalized: normalizeMerchant(merchant),
      ...(balance !== null ? { statementBalanceAgorot: balance } : {}),
    });
  });

  return {
    rows: parsed,
    failures,
    hasDebitCredit: !usesSingleAmountColumn,
    sawNegativeAmount,
  };
}

export const FAILURE_LABELS_HE: Record<RowFailureReason, string> = {
  missing_date: 'אין תאריך',
  invalid_date: 'תאריך לא תקין',
  missing_amount: 'אין סכום',
  invalid_amount: 'סכום לא תקין',
  zero_amount: 'סכום אפס',
  empty_row: 'שורה ריקה',
};
