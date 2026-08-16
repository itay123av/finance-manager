/**
 * זיהוי כפילויות.
 *
 * הבעיה: ייבוא של אותו חודש פעמיים חייב לא ליצור עסקאות כפולות —
 * אבל שתי כוסות קפה באותו יום, באותו מקום, באותו מחיר הן **שתי
 * עסקאות אמיתיות**, לא כפילות.
 *
 * לכן הזיהוי אינו "המפתח כבר קיים?" אלא **ספירת מופעים**: אם בבסיס
 * הנתונים יש שתי עסקאות עם אותו מפתח ובקובץ יש שלוש, אז שתיים כפולות
 * ואחת חדשה. מימוש נאיבי מבוסס-מפתח היה מוחק כאן עסקה אמיתית בשקט.
 *
 * בנוסף יש שכבה מטושטשת לזיהוי אותה עסקה שנרשמה בתאריך ערך שונה או
 * בתיאור מעט אחר. היא **לא** מדלגת לבד — היא מסמנת, והמשתמש מחליט.
 */

import { diffDays } from '../core/dates';
import type { Agorot, ISODate, Transaction, TransactionType } from '../core/types';
import type { DuplicateVerdict, ParsedRow } from './types';

/** הפרש ימים מרבי שבו עדיין נחשוד באותה עסקה. */
export const FUZZY_DAY_WINDOW = 3;
/** סף דמיון תיאורים לחשד. */
export const FUZZY_SIMILARITY_THRESHOLD = 0.85;

/**
 * מפתח הזיהוי. מכיל את כל מה שמזהה עסקה בקובץ בנק, ותו לא.
 *
 * זהו מפתח מלא ולא גיבוב: גיבוב היה מכניס סיכון להתנגשות, וכל
 * התנגשות משמעותה עסקה אמיתית שנעלמת בלי שאיש ישים לב.
 */
export function dedupeKey(input: {
  accountId: string;
  date: ISODate;
  amountAgorot: Agorot;
  type: TransactionType;
  merchantNormalized: string;
}): string {
  return [
    input.accountId,
    input.date,
    input.type,
    input.amountAgorot,
    input.merchantNormalized,
  ].join('|');
}

// ---------------------------------------------------------------------------
// דמיון טקסטואלי
// ---------------------------------------------------------------------------

function bigrams(value: string): string[] {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length < 2) return clean === '' ? [] : [clean];
  const result: string[] = [];
  for (let i = 0; i < clean.length - 1; i++) result.push(clean.slice(i, i + 2));
  return result;
}

/** מקדם Dice על צמדי תווים. 1 = זהה, 0 = אין שום חפיפה. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.length === 0 || right.length === 0) return 0;

  const pool = new Map<string, number>();
  for (const gram of left) pool.set(gram, (pool.get(gram) ?? 0) + 1);

  let shared = 0;
  for (const gram of right) {
    const remaining = pool.get(gram) ?? 0;
    if (remaining > 0) {
      shared++;
      pool.set(gram, remaining - 1);
    }
  }
  return (2 * shared) / (left.length + right.length);
}

// ---------------------------------------------------------------------------

export interface DedupeDecision {
  verdict: DuplicateVerdict;
  reasonHe?: string;
  dedupeKey: string;
}

export interface DedupeInput {
  accountId: string;
  rows: readonly ParsedRow[];
  existing: readonly Transaction[];
}

export function classifyDuplicates(input: DedupeInput): DedupeDecision[] {
  const { accountId, rows, existing } = input;

  // כמה עסקאות עם כל מפתח כבר קיימות
  const existingCounts = new Map<string, number>();
  for (const transaction of existing) {
    if (transaction.accountId !== accountId) continue;
    const key = dedupeKey({
      accountId: transaction.accountId,
      date: transaction.date,
      amountAgorot: transaction.amountAgorot,
      type: transaction.type,
      merchantNormalized: transaction.merchantNormalized,
    });
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
  }

  // מועמדים לחשד מטושטש: אותו סכום, אותו כיוון, תאריך קרוב
  const byAmount = new Map<string, Transaction[]>();
  for (const transaction of existing) {
    if (transaction.accountId !== accountId) continue;
    const key = `${transaction.type}:${transaction.amountAgorot}`;
    const list = byAmount.get(key);
    if (list) list.push(transaction);
    else byAmount.set(key, [transaction]);
  }

  const consumed = new Map<string, number>();

  return rows.map((row) => {
    const key = dedupeKey({ ...row, accountId });

    const available = (existingCounts.get(key) ?? 0) - (consumed.get(key) ?? 0);
    if (available > 0) {
      consumed.set(key, (consumed.get(key) ?? 0) + 1);
      return {
        verdict: 'exact_duplicate',
        reasonHe: 'העסקה הזו כבר קיימת במערכת',
        dedupeKey: key,
      };
    }

    const sameAmount = byAmount.get(`${row.type}:${row.amountAgorot}`) ?? [];
    for (const candidate of sameAmount) {
      const gap = Math.abs(diffDays(candidate.date, row.date));
      if (gap === 0 || gap > FUZZY_DAY_WINDOW) continue;
      const score = similarity(candidate.merchantNormalized, row.merchantNormalized);
      if (score >= FUZZY_SIMILARITY_THRESHOLD) {
        return {
          verdict: 'possible_duplicate',
          reasonHe: `דומה לעסקה מ-${candidate.date} באותו סכום`,
          dedupeKey: key,
        };
      }
    }

    return { verdict: 'new', dedupeKey: key };
  });
}
