/**
 * זיהוי דפוסי הוצאה.
 *
 * שני עקרונות מנחים:
 *
 * 1. **שום הוצאה לא נקראת "מיותרת".** יציאה עם חברים היא הוצאה לגיטימית
 *    שנמצאת בתקציב. המערכת מסווגת לפי אופי (`nature`) ומצביעה על שינויים,
 *    לא מחלקת ציונים.
 *
 * 2. **מדדים עמידים.** רכישה גדולה חד-פעמית אחת שוברת ממוצע וסטיית תקן,
 *    ואז כל חודש אחריה נראה "תקין" בהשוואה. חציון ו-MAD לא נשברים ממנה.
 */

import {
  addDays,
  addMonthsToMonth,
  formatWeekdayHe,
  dayOfWeek,
  monthEnd,
  monthOf,
  monthStart,
} from './dates';
import { formatILS, sumA } from './money';
import { mad, maxOf, mean, median, standardDeviation } from './stats';
import { expenseByCategory, transactionsInPeriod } from './periods';
import { categoryMonthlyAverage } from './averages';
import type { Agorot, Category, ISODate, Transaction, UUID } from './types';

/** סף הציון העמיד שמעליו עסקה נחשבת חריגה. */
export const ANOMALY_Z_THRESHOLD = 3.5;
/** רצפה מוחלטת — בלעדיה היינו מתריעים על ₪12 מול ₪8 ומאבדים אמון. */
export const ANOMALY_MIN_ABSOLUTE_AGOROT = 3_000; // ₪30
/** מתחת לכמה עסקאות בקטגוריה אין מספיק בסיס לסטטיסטיקה. */
export const ANOMALY_MIN_SAMPLE = 8;
/** בקטגוריה דלילה נדרשת קפיצה בוטה יותר כדי להתריע. */
export const SPARSE_ANOMALY_MIN_AGOROT = 15_000; // ₪150
export const SMALL_PURCHASE_MAX_AGOROT = 2_500; // ₪25
export const SMALL_ACCUMULATION_THRESHOLD_AGOROT = 8_000; // ₪80
/** שינוי מול הממוצע שמתחתיו לא שווה להזכיר. */
export const CATEGORY_DRIFT_MIN_AGOROT = 3_000; // ₪30
export const CATEGORY_DRIFT_MIN_SHARE = 0.2;

// ---------------------------------------------------------------------------
// עסקאות חריגות
// ---------------------------------------------------------------------------

export interface Anomaly {
  transactionId: UUID;
  date: ISODate;
  merchant: string;
  categoryId: UUID;
  amountAgorot: Agorot;
  typicalAgorot: Agorot;
  /** `robust` = מבוסס MAD. `sparse` = קטגוריה עם מעט נתונים. */
  method: 'robust' | 'sparse';
  messageHe: string;
}

/**
 * מוצא עסקאות חריגות ביחס לקטגוריה שלהן, בטווח הנתון.
 * ההיסטוריה להשוואה נלקחת מכל מה שלפני העסקה — לא כולל אותה עצמה.
 */
export function detectAnomalies(
  transactions: readonly Transaction[],
  from: ISODate,
  to: ISODate,
): Anomaly[] {
  const expenses = transactions.filter(
    (t) => t.status === 'actual' && t.kind === 'normal' && t.type === 'expense',
  );
  const anomalies: Anomaly[] = [];

  // הקוד הקודם סרק את כל ההיסטוריה מחדש לכל עסקה בטווח — O(n²).
  // כאן כל קטגוריה נסרקת פעם אחת לפי תאריך. עסקאות מאותו יום נבדקות
  // מול היסטוריה של ימים קודמים בלבד, בדיוק כמו התנאי המקורי `h.date < t.date`.
  const byCategory = new Map<UUID, Transaction[]>();
  for (const expense of expenses) {
    const rows = byCategory.get(expense.categoryId) ?? [];
    rows.push(expense);
    byCategory.set(expense.categoryId, rows);
  }

  for (const rows of byCategory.values()) {
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const history: Agorot[] = [];

    for (let start = 0; start < rows.length; ) {
      const date = rows[start]!.date;
      let end = start + 1;
      while (end < rows.length && rows[end]!.date === date) end += 1;

      if (date >= from && date <= to && history.length > 0) {
        const group = rows.slice(start, end);
        const center = median(history);
        const typical = Math.round(center);

        if (history.length >= ANOMALY_MIN_SAMPLE) {
          const dispersion = mad(history);
          const average = dispersion === 0 ? mean(history) : 0;
          const deviation = dispersion === 0 ? standardDeviation(history) : 0;

          for (const transaction of group) {
            const z =
              dispersion > 0
                ? (0.6745 * (transaction.amountAgorot - center)) / dispersion
                : deviation > 0
                  ? (transaction.amountAgorot - average) / deviation
                  : null;
            if (
              z !== null &&
              z > ANOMALY_Z_THRESHOLD &&
              transaction.amountAgorot >= typical + ANOMALY_MIN_ABSOLUTE_AGOROT
            ) {
              anomalies.push({
                transactionId: transaction.id,
                date: transaction.date,
                merchant: transaction.merchant,
                categoryId: transaction.categoryId,
                amountAgorot: transaction.amountAgorot,
                typicalAgorot: typical,
                method: 'robust',
                messageHe: `${transaction.merchant} — ${formatILS(transaction.amountAgorot)}, לעומת ${formatILS(typical)} שאתה מוציא בדרך כלל בקטגוריה הזו.`,
              });
            }
          }
        } else {
          const largestSoFar = maxOf(history);
          for (const transaction of group) {
            if (
              transaction.amountAgorot > largestSoFar * 2 &&
              transaction.amountAgorot >= SPARSE_ANOMALY_MIN_AGOROT
            ) {
              anomalies.push({
                transactionId: transaction.id,
                date: transaction.date,
                merchant: transaction.merchant,
                categoryId: transaction.categoryId,
                amountAgorot: transaction.amountAgorot,
                typicalAgorot: typical,
                method: 'sparse',
                messageHe: `${transaction.merchant} — ${formatILS(transaction.amountAgorot)}. זו ההוצאה הגדולה ביותר שרשומה בקטגוריה הזו.`,
              });
            }
          }
        }
      }

      for (let index = start; index < end; index += 1) {
        history.push(rows[index]!.amountAgorot);
      }
      start = end;
    }
  }

  return anomalies.sort((a, b) => b.amountAgorot - a.amountAgorot);
}

// ---------------------------------------------------------------------------
// סחיפת קטגוריות
// ---------------------------------------------------------------------------

export interface CategoryDrift {
  categoryId: UUID;
  categoryName: string;
  thisMonthAgorot: Agorot;
  typicalMonthlyAgorot: Agorot;
  deltaAgorot: Agorot;
  deltaPct: number;
  direction: 'up' | 'down';
  messageHe: string;
}

/** קטגוריות שההוצאה בהן החודש שונה משמעותית מהרגיל. */
export function categoryDrift(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  today: ISODate,
): CategoryDrift[] {
  const thisMonth = expenseByCategory(transactions, categories, monthStart(today), today);
  const out: CategoryDrift[] = [];

  for (const row of thisMonth) {
    const avg = categoryMonthlyAverage(transactions, row.categoryId, today);
    if (avg.agorot === null || avg.confidence === 'none') continue;

    const delta = row.amountAgorot - avg.agorot;
    const threshold = Math.max(
      CATEGORY_DRIFT_MIN_AGOROT,
      Math.round(avg.agorot * CATEGORY_DRIFT_MIN_SHARE),
    );
    if (Math.abs(delta) < threshold) continue;

    const direction: 'up' | 'down' = delta > 0 ? 'up' : 'down';
    out.push({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      thisMonthAgorot: row.amountAgorot,
      typicalMonthlyAgorot: avg.agorot,
      deltaAgorot: delta,
      deltaPct: avg.agorot === 0 ? 0 : Math.round((delta / avg.agorot) * 100),
      direction,
      messageHe:
        direction === 'up'
          ? `החודש הוצאת ${formatILS(delta)} יותר מהרגיל על ${row.categoryName}.`
          : `החודש הוצאת ${formatILS(-delta)} פחות מהרגיל על ${row.categoryName}. יפה.`,
    });
  }

  return out.sort((a, b) => Math.abs(b.deltaAgorot) - Math.abs(a.deltaAgorot));
}

// ---------------------------------------------------------------------------
// הצטברות רכישות קטנות
// ---------------------------------------------------------------------------

export interface SmallPurchaseAccumulation {
  fromDate: ISODate;
  toDate: ISODate;
  count: number;
  totalAgorot: Agorot;
  messageHe: string;
}

/**
 * רכישות קטנות שכל אחת מהן זניחה אבל יחד הן סכום.
 * זה הדפוס הכי שקוף לעין ולכן הכי שווה להצביע עליו.
 */
export function smallPurchaseAccumulation(
  transactions: readonly Transaction[],
  today: ISODate,
  windowDays = 7,
): SmallPurchaseAccumulation | null {
  const from = addDays(today, -(windowDays - 1));
  const small = transactionsInPeriod(transactions, from, today).filter(
    (t) => t.type === 'expense' && t.amountAgorot <= SMALL_PURCHASE_MAX_AGOROT,
  );

  const totalAgorot = sumA(small.map((t) => t.amountAgorot));
  if (totalAgorot < SMALL_ACCUMULATION_THRESHOLD_AGOROT || small.length < 3) return null;

  return {
    fromDate: from,
    toDate: today,
    count: small.length,
    totalAgorot,
    messageHe: `${small.length} רכישות קטנות ב-${windowDays} הימים האחרונים הצטברו ל-${formatILS(totalAgorot)}.`,
  };
}

// ---------------------------------------------------------------------------
// ימי שבוע
// ---------------------------------------------------------------------------

export interface WeekdayPattern {
  weekday: number;
  weekdayNameHe: string;
  totalAgorot: Agorot;
  transactionCount: number;
}

export interface WeekdayAnalysis {
  byWeekday: WeekdayPattern[];
  peak: WeekdayPattern | null;
  messageHe: string | null;
}

export function weekdayPattern(
  transactions: readonly Transaction[],
  from: ISODate,
  to: ISODate,
): WeekdayAnalysis {
  const buckets: WeekdayPattern[] = Array.from({ length: 7 }, (_, i) => ({
    weekday: i,
    weekdayNameHe: formatWeekdayHe(addDays('2026-01-04', i)), // 04/01/2026 הוא יום ראשון
    totalAgorot: 0,
    transactionCount: 0,
  }));

  for (const t of transactionsInPeriod(transactions, from, to)) {
    if (t.type !== 'expense') continue;
    const bucket = buckets[dayOfWeek(t.date)];
    if (!bucket) continue;
    bucket.totalAgorot += t.amountAgorot;
    bucket.transactionCount += 1;
  }

  const withData = buckets.filter((b) => b.transactionCount > 0);
  if (withData.length < 3) return { byWeekday: buckets, peak: null, messageHe: null };

  const peak = withData.reduce((a, b) => (b.totalAgorot > a.totalAgorot ? b : a));
  const typical = median(withData.map((b) => b.totalAgorot));

  // מוצג רק כשהפער בולט — אחרת זה רעש שנשמע כמו תובנה.
  const messageHe =
    typical > 0 && peak.totalAgorot > typical * 1.6
      ? `יום ${peak.weekdayNameHe} הוא היום שבו אתה מוציא הכי הרבה — ${formatILS(peak.totalAgorot)} בתקופה הזו.`
      : null;

  return { byWeekday: buckets, peak, messageHe };
}

// ---------------------------------------------------------------------------
// השוואה לחודש הקודם
// ---------------------------------------------------------------------------

export interface MonthComparison {
  thisMonthAgorot: Agorot;
  previousMonthAgorot: Agorot;
  deltaAgorot: Agorot;
  deltaPct: number;
  hasPreviousData: boolean;
  messageHe: string;
}

export function compareToPreviousMonth(
  transactions: readonly Transaction[],
  today: ISODate,
): MonthComparison {
  const previousMonth = addMonthsToMonth(monthOf(today), -1);

  const thisMonthAgorot = sumA(
    transactionsInPeriod(transactions, monthStart(today), today)
      .filter((t) => t.type === 'expense')
      .map((t) => t.amountAgorot),
  );
  const previousFull = transactionsInPeriod(
    transactions,
    monthStart(previousMonth),
    monthEnd(previousMonth),
  ).filter((t) => t.type === 'expense');
  const previousMonthAgorot = sumA(previousFull.map((t) => t.amountAgorot));

  const hasPreviousData = previousFull.length > 0;
  const deltaAgorot = thisMonthAgorot - previousMonthAgorot;

  return {
    thisMonthAgorot,
    previousMonthAgorot,
    deltaAgorot,
    deltaPct:
      previousMonthAgorot === 0 ? 0 : Math.round((deltaAgorot / previousMonthAgorot) * 100),
    hasPreviousData,
    messageHe: !hasPreviousData
      ? 'אין עדיין נתונים מהחודש הקודם להשוואה.'
      : deltaAgorot > 0
        ? `עד עכשיו החודש הוצאת ${formatILS(deltaAgorot)} יותר מאשר בכל החודש שעבר.`
        : `עד עכשיו החודש הוצאת ${formatILS(-deltaAgorot)} פחות מאשר בכל החודש שעבר.`,
  };
}
