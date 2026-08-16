/**
 * דפוסים מתוך ההוצאות **המפורטות**.
 *
 * ⚠️ למה מודול נפרד מ-`patterns.ts`.
 *
 * המנוע הקיים עובד על `Transaction[]` — תנועות הבנק. אבל 39 מתוך 51
 * התנועות שם הן "חיוב לכרטיס ויזה" בלי שם בית עסק, ולכן הוא עיוור
 * בדיוק למקום שבו יש מידע: פירוט הכרטיס.
 *
 * המודול הזה עובד על `EffectiveExpense[]` — השכבה שכבר מיזגה את
 * הפירוט והחליפה את החיובים המרוכזים. שם שמות בתי העסק האמיתיים
 * מופיעים וחוזרים כל חודש, ואפשר לזהות אותם כמנויים.
 *
 * ⚠️ הכל כאן **עובדתי**: "הסכום הזה חזר שלוש פעמים" הוא תצפית, לא
 * המלצה. לכן זה מותר גם כשהביטחון הקטגוריאלי נמוך — בניגוד לאמירות
 * כמו "אתה מוציא יותר מדי על אוכל".
 */

import { diffDays, monthOf } from './dates';
import { isOpaqueCategory, type EffectiveExpense } from './effectiveSpending';
import { sumA } from './money';
import { median } from './stats';
import type { Agorot, ISODate, ISOMonth } from './types';

/** מרווח בימים שנחשב "חודשי". */
export const MONTHLY_MIN_DAYS = 25;
export const MONTHLY_MAX_DAYS = 38;
/** כמה מופעים דרושים כדי לקרוא לזה מנוי. */
export const MIN_OCCURRENCES_FOR_SUBSCRIPTION = 2;
/** סטייה מותרת בסכום בין מופעים. */
export const AMOUNT_TOLERANCE = 0.15;
/** מנוי שלא הופיע כך הרבה ימים — אולי הופסק, אולי נשכח. */
export const SUBSCRIPTION_STALE_DAYS = 50;

function normalize(merchant: string): string {
  return merchant.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// מנויים
// ---------------------------------------------------------------------------

export interface DetectedSubscription {
  merchant: string;
  merchantNormalized: string;
  /** הסכום האופייני — חציון, כדי שעליית מחיר אחת לא תעוות. */
  typicalAmountAgorot: Agorot;
  occurrences: number;
  firstDate: ISODate;
  lastDate: ISODate;
  /** עלות שנתית משוערת, בהנחה שהמנוי ממשיך. */
  yearlyAgorot: Agorot;
  categoryId: string;
  /** לא הופיע זמן רב — שווה לבדוק אם עדיין פעיל. */
  possiblyStale: boolean;
  daysSinceLast: number;
}

export interface SubscriptionInput {
  expenses: readonly EffectiveExpense[];
  today: ISODate;
}

/**
 * מזהה חיובים חוזרים חודשיים לפי שם בית עסק וסכום דומה.
 *
 * שני מופעים מספיקים כאן (ולא שלושה כמו בזיהוי הכללי): פירוט כרטיס
 * מגיע לרוב בקבצים של חודש-חודשיים, ודרישה לשלושה מופעים הייתה
 * מפספסת כמעט כל מנוי אמיתי.
 */
export function detectSubscriptions(input: SubscriptionInput): DetectedSubscription[] {
  const byMerchant = new Map<string, EffectiveExpense[]>();

  for (const expense of input.expenses) {
    // חיוב אטום אין לו שם בית עסק אמיתי — אין ממה לזהות
    if (isOpaqueCategory(expense.categoryId)) continue;
    if (expense.merchant.trim() === '') continue;
    // זיכוי אינו חיוב חוזר
    if (expense.amountAgorot <= 0) continue;

    const key = normalize(expense.merchant);
    const list = byMerchant.get(key);
    if (list) list.push(expense);
    else byMerchant.set(key, [expense]);
  }

  const subscriptions: DetectedSubscription[] = [];

  for (const [key, group] of byMerchant) {
    if (group.length < MIN_OCCURRENCES_FOR_SUBSCRIPTION) continue;

    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map((e) => e.amountAgorot);
    const typical = Math.round(median(amounts));
    if (typical <= 0) continue;

    // כל הסכומים חייבים להיות קרובים לחציון
    const consistent = amounts.every(
      (amount) => Math.abs(amount - typical) <= typical * AMOUNT_TOLERANCE,
    );
    if (!consistent) continue;

    // והמרווחים חייבים להיראות חודשיים
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(diffDays(sorted[i - 1]!.date, sorted[i]!.date));
    }
    const monthly = gaps.every((gap) => gap >= MONTHLY_MIN_DAYS && gap <= MONTHLY_MAX_DAYS);
    if (!monthly) continue;

    const last = sorted[sorted.length - 1]!;
    const daysSinceLast = diffDays(last.date, input.today);

    subscriptions.push({
      merchant: last.merchant,
      merchantNormalized: key,
      typicalAmountAgorot: typical,
      occurrences: sorted.length,
      firstDate: sorted[0]!.date,
      lastDate: last.date,
      yearlyAgorot: typical * 12,
      categoryId: last.categoryId,
      possiblyStale: daysSinceLast > SUBSCRIPTION_STALE_DAYS,
      daysSinceLast,
    });
  }

  return subscriptions.sort((a, b) => b.typicalAmountAgorot - a.typicalAmountAgorot);
}

/** סך המנויים החודשי — מספר אחד שקל להתייחס אליו. */
export function subscriptionsMonthlyTotal(
  subscriptions: readonly DetectedSubscription[],
): Agorot {
  return sumA(subscriptions.filter((s) => !s.possiblyStale).map((s) => s.typicalAmountAgorot));
}

// ---------------------------------------------------------------------------
// בתי עסק חוזרים
// ---------------------------------------------------------------------------

export interface RepeatMerchant {
  merchant: string;
  visits: number;
  totalAgorot: Agorot;
  averageAgorot: Agorot;
  categoryId: string;
}

/**
 * בתי עסק שחוזרים הרבה — לא בהכרח מנוי.
 *
 * זו תצפית שימושית דווקא כשהסכומים קטנים: חמש קניות של ₪6 לא נראות
 * כמו כלום בנפרד, ויחד הן ₪30.
 */
export function repeatMerchants(
  expenses: readonly EffectiveExpense[],
  minVisits = 3,
): RepeatMerchant[] {
  const byMerchant = new Map<string, EffectiveExpense[]>();

  for (const expense of expenses) {
    if (isOpaqueCategory(expense.categoryId)) continue;
    if (expense.merchant.trim() === '' || expense.amountAgorot <= 0) continue;
    const key = normalize(expense.merchant);
    const list = byMerchant.get(key);
    if (list) list.push(expense);
    else byMerchant.set(key, [expense]);
  }

  return [...byMerchant.values()]
    .filter((group) => group.length >= minVisits)
    .map((group) => {
      const total = sumA(group.map((e) => e.amountAgorot));
      return {
        merchant: group[group.length - 1]!.merchant,
        visits: group.length,
        totalAgorot: total,
        averageAgorot: Math.round(total / group.length),
        categoryId: group[group.length - 1]!.categoryId,
      };
    })
    .sort((a, b) => b.totalAgorot - a.totalAgorot);
}

// ---------------------------------------------------------------------------
// חודשים
// ---------------------------------------------------------------------------

export interface MonthlyTotal {
  month: ISOMonth;
  totalAgorot: Agorot;
  detailedAgorot: Agorot;
  opaqueAgorot: Agorot;
  count: number;
}

export function monthlyTotals(expenses: readonly EffectiveExpense[]): MonthlyTotal[] {
  const byMonth = new Map<ISOMonth, EffectiveExpense[]>();

  for (const expense of expenses) {
    const month = monthOf(expense.date);
    const list = byMonth.get(month);
    if (list) list.push(expense);
    else byMonth.set(month, [expense]);
  }

  return [...byMonth.entries()]
    .map(([month, group]) => {
      const opaque = sumA(
        group.filter((e) => isOpaqueCategory(e.categoryId)).map((e) => e.amountAgorot),
      );
      const total = sumA(group.map((e) => e.amountAgorot));
      return {
        month,
        totalAgorot: total,
        detailedAgorot: total - opaque,
        opaqueAgorot: opaque,
        count: group.length,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * חודש שבו ההוצאה חרגה משמעותית מהרגיל.
 *
 * ⚠️ ברמת **הסכום החודשי** ולא ברמת הקטגוריה — הסכום הכולל אמין גם
 * כשהפילוח אינו, ולכן זו תובנה שמותר להציג תמיד.
 */
export interface MonthOutlier {
  month: ISOMonth;
  totalAgorot: Agorot;
  medianAgorot: Agorot;
  differenceAgorot: Agorot;
  direction: 'higher' | 'lower';
}

/** חריגה מינימלית שנחשבת מעניינת. */
export const MONTH_OUTLIER_MIN_SHARE = 0.4;
export const MONTH_OUTLIER_MIN_AGOROT = 10_000; // ₪100

export function monthOutliers(totals: readonly MonthlyTotal[]): MonthOutlier[] {
  // צריך לפחות שלושה חודשים כדי שיהיה "רגיל" להשוות אליו
  if (totals.length < 3) return [];

  const values = totals.map((t) => t.totalAgorot);
  const typical = Math.round(median(values));
  if (typical <= 0) return [];

  return totals
    .map((entry) => {
      const difference = entry.totalAgorot - typical;
      return {
        month: entry.month,
        totalAgorot: entry.totalAgorot,
        medianAgorot: typical,
        differenceAgorot: difference,
        direction: difference >= 0 ? ('higher' as const) : ('lower' as const),
      };
    })
    .filter(
      (entry) =>
        Math.abs(entry.differenceAgorot) >= MONTH_OUTLIER_MIN_AGOROT &&
        Math.abs(entry.differenceAgorot) >= entry.medianAgorot * MONTH_OUTLIER_MIN_SHARE,
    )
    .sort((a, b) => Math.abs(b.differenceAgorot) - Math.abs(a.differenceAgorot));
}
