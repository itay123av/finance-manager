/**
 * התאמת יתרה מול הדוח מהבנק.
 *
 * ⚠️ עמודת היתרה בקובץ **אינה מקור האמת**. מקור האמת הוא תמיד
 * `openingBalance + Σ עסקאות` (ראה `core/balance.ts`). עמודת היתרה
 * משמשת כאן אך ורק כדי לגלות שמשהו לא מסתדר.
 *
 * וכשמשהו לא מסתדר — המערכת **לא מתקנת לבד**. פער ביתרה הוא כמעט
 * תמיד סימפטום: שורות שלא נקלטו, טווח תאריכים חלקי, או עסקאות
 * שקדמו לתאריך הפתיחה. יצירת "התאמת יתרה" אוטומטית הייתה מסתירה
 * את הסיבה האמיתית מאחורי מספר שנראה תקין.
 */

import { clampMin0 } from './money';
import type { Agorot, ISODate } from './types';

export type DiscrepancyCause =
  | 'rows_failed'
  | 'transactions_before_opening'
  | 'partial_date_range'
  | 'duplicates_skipped'
  | 'unknown';

export interface ReconcileInput {
  /** יתרת הפתיחה של החשבון במערכת. */
  openingBalanceAgorot: Agorot;
  openingDate: ISODate;
  /** מה שנקלט בייבוא הזה. */
  importedIncomeAgorot: Agorot;
  importedExpenseAgorot: Agorot;
  /** יתרת הסיום כפי שמופיעה בשורה האחרונה בקובץ. */
  statementClosingBalanceAgorot: Agorot | null;
  /** עסקאות שכבר היו במערכת ונכללות בטווח — לא נספרות פעמיים. */
  existingNetInRangeAgorot: Agorot;
  rowsFailed: number;
  duplicatesSkipped: number;
  dateRange: { from: ISODate; to: ISODate } | null;
}

export interface ReconcileResult {
  /** האם בכלל אפשר לבדוק (יש יתרת סיום בקובץ). */
  possible: boolean;
  expectedAgorot: Agorot;
  statementAgorot: Agorot | null;
  /** חיובי = במערכת יש יותר ממה שהבנק אומר. */
  differenceAgorot: Agorot;
  matches: boolean;
  causes: { cause: DiscrepancyCause; explanationHe: string }[];
  summaryHe: string;
  /** האם ייתכן שחסרות עסקאות שקדמו לתאריך הפתיחה. */
  mayBeMissingEarlierTransactions: boolean;
}

/** סטייה של עד אגורה בודדת אינה פער אמיתי — היא עיגול. */
const TOLERANCE_AGOROT = 1;

export function reconcile(input: ReconcileInput): ReconcileResult {
  const expectedAgorot =
    input.openingBalanceAgorot +
    input.existingNetInRangeAgorot +
    input.importedIncomeAgorot -
    input.importedExpenseAgorot;

  if (input.statementClosingBalanceAgorot === null) {
    return {
      possible: false,
      expectedAgorot,
      statementAgorot: null,
      differenceAgorot: 0,
      matches: false,
      causes: [],
      summaryHe: 'בקובץ אין עמודת יתרה, ולכן אי אפשר להשוות מול הבנק.',
      mayBeMissingEarlierTransactions: false,
    };
  }

  const differenceAgorot = expectedAgorot - input.statementClosingBalanceAgorot;
  const matches = Math.abs(differenceAgorot) <= TOLERANCE_AGOROT;

  const causes: ReconcileResult['causes'] = [];

  if (input.rowsFailed > 0) {
    causes.push({
      cause: 'rows_failed',
      explanationHe: `${input.rowsFailed} שורות בקובץ לא נקלטו. אם היו בהן עסקאות אמיתיות, הן חסרות בחישוב.`,
    });
  }

  if (input.duplicatesSkipped > 0) {
    causes.push({
      cause: 'duplicates_skipped',
      explanationHe: `${input.duplicatesSkipped} שורות דולגו כי הן כבר קיימות. אם הזיהוי שגה, ייתכן שדילגנו על עסקה אמיתית.`,
    });
  }

  // הקובץ מתחיל לפני תאריך הפתיחה של החשבון במערכת
  const mayBeMissingEarlierTransactions =
    !matches && input.dateRange !== null && input.dateRange.from < input.openingDate;

  if (mayBeMissingEarlierTransactions) {
    causes.push({
      cause: 'transactions_before_opening',
      explanationHe: `הקובץ מתחיל ב-${input.dateRange!.from}, לפני תאריך הפתיחה של החשבון (${input.openingDate}). עסקאות מוקדמות יותר לא נספרות בכוונה, כדי לא לספור פעמיים את יתרת הפתיחה.`,
    });
  }

  if (!matches && input.dateRange !== null && input.dateRange.from > input.openingDate) {
    causes.push({
      cause: 'partial_date_range',
      explanationHe: `הקובץ מכסה רק מ-${input.dateRange.from}. אם היו עסקאות בין ${input.openingDate} לתאריך הזה, הן לא נכללות.`,
    });
  }

  if (!matches && causes.length === 0) {
    causes.push({
      cause: 'unknown',
      explanationHe:
        'לא זיהינו סיבה ברורה לפער. שווה לבדוק שיתרת הפתיחה שהוזנה תואמת ליתרה בבנק באותו תאריך.',
    });
  }

  return {
    possible: true,
    expectedAgorot,
    statementAgorot: input.statementClosingBalanceAgorot,
    differenceAgorot,
    matches,
    causes,
    mayBeMissingEarlierTransactions,
    summaryHe: matches
      ? 'היתרה במערכת תואמת ליתרה בקובץ.'
      : differenceAgorot > 0
        ? 'במערכת יש יותר ממה שכתוב בקובץ. סביר שנספרו עסקאות שלא היו אמורות להיספר, או שיתרת הפתיחה גבוהה מדי.'
        : 'במערכת יש פחות ממה שכתוב בקובץ. סביר שחסרות עסקאות, או שיתרת הפתיחה נמוכה מדי.',
  };
}

// ---------------------------------------------------------------------------
// הליכה על הדוח, עסקה אחרי עסקה
// ---------------------------------------------------------------------------

export interface StatementRow {
  date: ISODate;
  /** חיובי = נכנס, שלילי = יצא. */
  signedAmountAgorot: Agorot;
  /** היתרה **אחרי** העסקה, כפי שמופיעה בקובץ. */
  statementBalanceAgorot: Agorot;
}

export interface LedgerBreak {
  index: number;
  date: ISODate;
  expectedAgorot: Agorot;
  actualAgorot: Agorot;
  driftAgorot: Agorot;
}

export interface LedgerWalkResult {
  /** היתרה שהייתה לפני העסקה הראשונה — נגזרת, לא מוזנת. */
  inferredOpeningBalanceAgorot: Agorot | null;
  /** התאריך שאליו מתייחסת יתרת הפתיחה. */
  openingDate: ISODate | null;
  closingBalanceAgorot: Agorot | null;
  /** שורות שבהן היתרה אינה ממשיכה את הקודמת. */
  breaks: LedgerBreak[];
  consistent: boolean;
  /** האם השורות היו מסודרות מהישן לחדש. */
  chronological: boolean;
}

function walkInOrder(rows: readonly StatementRow[]): LedgerBreak[] {
  const breaks: LedgerBreak[] = [];
  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1]!;
    const current = rows[i]!;
    const expected = previous.statementBalanceAgorot + current.signedAmountAgorot;
    const drift = current.statementBalanceAgorot - expected;
    if (Math.abs(drift) > TOLERANCE_AGOROT) {
      breaks.push({
        index: i,
        date: current.date,
        expectedAgorot: expected,
        actualAgorot: current.statementBalanceAgorot,
        driftAgorot: drift,
      });
    }
  }
  return breaks;
}

/**
 * עובר על הדוח עסקה-עסקה ומסיק ממנו את יתרת הפתיחה.
 *
 * ⭐ למה זה שווה את המאמץ: עמודת היתרה בקובץ היא שרשרת. אם כל חוליה
 * מתחברת לקודמת, זו הוכחה שכל העסקאות פוענחו נכון — הסכום, הסימן
 * והסדר. שרשרת שלמה שווה יותר מכל בדיקת סכומים כוללת, כי היא מאתרת
 * **איפה בדיוק** נשבר משהו.
 *
 * קובצי בנק מגיעים לא פעם מהחדש לישן, ולכן נבדקים שני הכיוונים
 * ונבחר זה שמסתדר.
 */
export function walkStatement(rows: readonly StatementRow[]): LedgerWalkResult {
  if (rows.length === 0) {
    return {
      inferredOpeningBalanceAgorot: null,
      openingDate: null,
      closingBalanceAgorot: null,
      breaks: [],
      consistent: false,
      chronological: true,
    };
  }

  const forward = walkInOrder(rows);
  const reversed = [...rows].reverse();
  const backward = walkInOrder(reversed);

  // הכיוון עם פחות שברים הוא הסדר האמיתי של הדוח
  const chronological = forward.length <= backward.length;
  const ordered = chronological ? rows : reversed;
  const breaks = chronological ? forward : backward;

  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;

  return {
    inferredOpeningBalanceAgorot: first.statementBalanceAgorot - first.signedAmountAgorot,
    openingDate: first.date,
    closingBalanceAgorot: last.statementBalanceAgorot,
    breaks,
    consistent: breaks.length === 0,
    chronological,
  };
}

/** הסכום שעסקת התאמה תצטרך לשאת כדי לסגור את הפער. */
export function adjustmentAmountAgorot(result: ReconcileResult): Agorot {
  return clampMin0(Math.abs(result.differenceAgorot));
}

export function adjustmentDirection(result: ReconcileResult): 'income' | 'expense' {
  // במערכת יש יותר מדי → צריך להוריד; פחות מדי → צריך להוסיף
  return result.differenceAgorot > 0 ? 'expense' : 'income';
}
