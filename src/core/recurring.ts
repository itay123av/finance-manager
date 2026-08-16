/**
 * זיהוי הוצאות חוזרות ומנויים.
 *
 * שתי שאלות שונות, ושתיהן שוות כסף:
 *  • "מה חוזר כל חודש?" — הבסיס לרצפת ההתחייבויות בתקציב.
 *  • "על מה אני משלם בלי לשים לב?" — ₪22 בחודש נראה כלום, ‎₪264 בשנה זה
 *    כבר ‎5% מהיעד.
 */

import { median } from './stats';
import { addDays, diffDays, monthOf } from './dates';
import { formatILS, mulA } from './money';
import type { Agorot, ISODate, Transaction, UUID } from './types';

/** מרווח שנחשב חודשי. חודשים אינם שווי אורך, וחיובים זזים בסופי שבוע. */
export const MONTHLY_INTERVAL_MIN_DAYS = 25;
export const MONTHLY_INTERVAL_MAX_DAYS = 35;
/** סטייה מותרת בסכום בין חיובים — מנויים לפעמים מתייקרים במעט. */
export const AMOUNT_TOLERANCE = 0.1;
export const MIN_OCCURRENCES = 3;
/** אחרי כמה ימים בלי חיוב נחשוד שההוצאה החוזרת הפסיקה. */
export const STALE_AFTER_DAYS = 45;

export interface RecurringCandidate {
  merchantNormalized: string;
  label: string;
  categoryId: UUID;
  /** הסכום האופייני (חציון) — עמיד לחיוב חריג אחד. */
  amountAgorot: Agorot;
  yearlyAgorot: Agorot;
  occurrences: number;
  averageIntervalDays: number;
  firstSeenDate: ISODate;
  lastSeenDate: ISODate;
  /** 0–1. עולה עם מספר החזרות ועם עקביות המרווחים. */
  confidence: number;
}

function groupByMerchant(transactions: readonly Transaction[]): Map<string, Transaction[]> {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.status !== 'actual' || t.kind !== 'normal' || t.type !== 'expense') continue;
    const key = t.merchantNormalized;
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }
  return groups;
}

/**
 * מוצא חיובים שחוזרים בערך כל חודש באותו סכום.
 * דורש לפחות 3 מופעים — שניים יכולים להיות צירוף מקרים.
 */
export function detectRecurring(transactions: readonly Transaction[]): RecurringCandidate[] {
  const candidates: RecurringCandidate[] = [];

  for (const [merchantNormalized, group] of groupByMerchant(transactions)) {
    if (group.length < MIN_OCCURRENCES) continue;

    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map((t) => t.amountAgorot);
    const typical = Math.round(median(amounts));
    if (typical <= 0) continue;

    // כל החיובים חייבים להיות קרובים לסכום האופייני.
    const amountsConsistent = amounts.every(
      (a) => Math.abs(a - typical) <= Math.max(100, mulA(typical, AMOUNT_TOLERANCE)),
    );
    if (!amountsConsistent) continue;

    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (!prev || !cur) continue;
      intervals.push(diffDays(prev.date, cur.date));
    }
    if (intervals.length === 0) continue;

    const monthlyIntervals = intervals.filter(
      (d) => d >= MONTHLY_INTERVAL_MIN_DAYS && d <= MONTHLY_INTERVAL_MAX_DAYS,
    );
    // רוב המרווחים חייבים להיות חודשיים.
    if (monthlyIntervals.length < intervals.length / 2) continue;

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last) continue;

    const regularity = monthlyIntervals.length / intervals.length;
    const confidence = Math.min(0.99, 0.5 + 0.1 * sorted.length) * regularity;

    candidates.push({
      merchantNormalized,
      label: last.merchant,
      categoryId: last.categoryId,
      amountAgorot: typical,
      yearlyAgorot: typical * 12,
      occurrences: sorted.length,
      averageIntervalDays: Math.round(median(intervals)),
      firstSeenDate: first.date,
      lastSeenDate: last.date,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  return candidates.sort((a, b) => b.amountAgorot - a.amountAgorot);
}

export interface SubscriptionNotice {
  merchantNormalized: string;
  label: string;
  monthlyAgorot: Agorot;
  yearlyAgorot: Agorot;
  occurrences: number;
  lastSeenDate: ISODate;
  messageHe: string;
}

/**
 * מנויים ששווה לשים לב אליהם: חיוב חודשי שרץ 3 חודשים ומעלה ועדיין פעיל.
 * לא נאמר עליהם שהם "מיותרים" — רק מוצג כמה הם עולים בשנה.
 */
export function activeSubscriptions(
  transactions: readonly Transaction[],
  today: ISODate,
): SubscriptionNotice[] {
  const cutoff = addDays(today, -STALE_AFTER_DAYS);
  return detectRecurring(transactions)
    .filter((c) => c.lastSeenDate >= cutoff)
    .map((c) => ({
      merchantNormalized: c.merchantNormalized,
      label: c.label,
      monthlyAgorot: c.amountAgorot,
      yearlyAgorot: c.yearlyAgorot,
      occurrences: c.occurrences,
      lastSeenDate: c.lastSeenDate,
      messageHe: `${c.label} — ${formatILS(c.amountAgorot)} בחודש, כלומר ${formatILS(c.yearlyAgorot)} בשנה. עדיין בשימוש?`,
    }));
}

/**
 * הוצאות חוזרות שהפסיקו להיגבות. יכול להיות שהמנוי בוטל — ואז כדאי
 * לעדכן את התקציב, כי יש שם כסף פנוי שהמערכת עדיין שומרת בצד.
 */
export function staleRecurring(
  transactions: readonly Transaction[],
  today: ISODate,
): SubscriptionNotice[] {
  const cutoff = addDays(today, -STALE_AFTER_DAYS);
  return detectRecurring(transactions)
    .filter((c) => c.lastSeenDate < cutoff)
    .map((c) => ({
      merchantNormalized: c.merchantNormalized,
      label: c.label,
      monthlyAgorot: c.amountAgorot,
      yearlyAgorot: c.yearlyAgorot,
      occurrences: c.occurrences,
      lastSeenDate: c.lastSeenDate,
      messageHe: `${c.label} לא חויב מאז ${monthOf(c.lastSeenDate)}. אם המנוי הסתיים, אפשר לשחרר ${formatILS(c.amountAgorot)} בחודש בתקציב.`,
    }));
}

/** סך ההתחייבויות הקבועות החודשיות — הרצפה שהתקציב לא יורד מתחתיה. */
export function fixedMonthlyCommitments(
  transactions: readonly Transaction[],
  today: ISODate,
): Agorot {
  return activeSubscriptions(transactions, today).reduce((sum, s) => sum + s.monthlyAgorot, 0);
}
