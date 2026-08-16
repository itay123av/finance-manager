/**
 * סיכום שבועי וחודשי.
 *
 * ⚠️ למה לא להשתמש ב-`summaries.ts` הקיים.
 *
 * המודול ההוא בונה את פילוח הקטגוריות מתוך תנועות הבנק, ושם רוב
 * העסקאות הן "חיוב לכרטיס ויזה" בלי שם. הסיכום היה מציג "הכי הרבה
 * הוצאת על: אחר" — נכון טכנית וחסר ערך לחלוטין.
 *
 * כאן הסיכום נבנה על ההוצאות האפקטיביות, והפילוח מוצג רק כשהביטחון
 * הקטגוריאלי מצדיק זאת. הסכומים עצמם — נכנס, יצא, נטו — תמיד מוצגים,
 * כי הם נגזרים מהבנק ואמינים גם כשהפילוח אינו.
 */

import { addDays, diffDays, monthEnd, monthStart, weekEnd, weekStart } from './dates';
import {
  effectiveExpensesByCategory,
  isOpaqueCategory,
  type EffectiveExpense,
} from './effectiveSpending';
import { clampMin0, sumA } from './money';
import { periodSummary } from './periods';
import type { SpendingConfidence } from './spendingConfidence';
import type { Agorot, Category, ISODate, ISOMonth, Transaction } from './types';

export interface PeriodComparison {
  /** שינוי מול התקופה הקודמת. חיובי = הוצאת יותר. */
  expenseChangeAgorot: Agorot;
  previousExpenseAgorot: Agorot;
  /** `null` כשאין תקופה קודמת להשוות אליה. */
  changeSharePct: number | null;
  directionHe: 'יותר' | 'פחות' | 'כמו';
}

export interface TopCategoryLine {
  categoryId: string;
  categoryName: string;
  amountAgorot: Agorot;
  /** אטומה = בלי פירוט אמיתי. מוצגת, אבל לא כתובנה. */
  opaque: boolean;
}

export interface PeriodReview {
  from: ISODate;
  to: ISODate;
  incomeAgorot: Agorot;
  expenseAgorot: Agorot;
  netAgorot: Agorot;
  comparison: PeriodComparison;
  /** מוצג רק כשהפילוח אמין מספיק. אחרת ריק. */
  topCategories: TopCategoryLine[];
  categoriesHiddenReasonHe: string | null;
  /** האם נגעת בכסף ששמור לחודשים הבאים. */
  usedReserve: boolean;
  usedReserveAgorot: Agorot;
  headlineHe: string;
}

export interface PeriodReviewInput {
  transactions: readonly Transaction[];
  expenses: readonly EffectiveExpense[];
  categories: readonly Category[];
  confidence: SpendingConfidence;
  from: ISODate;
  to: ISODate;
  /** התקופה הקודמת באותו אורך, להשוואה. */
  previousFrom: ISODate;
  previousTo: ISODate;
  /** תקציב התקופה, כשקיים. */
  budgetAgorot: Agorot | null;
  /** כמה מהרזרבה נוצל בפועל בתקופה. */
  reserveUsedAgorot: Agorot;
}

function buildReview(input: PeriodReviewInput): PeriodReview {
  const current = periodSummary(input.transactions, input.from, input.to);
  const previous = periodSummary(input.transactions, input.previousFrom, input.previousTo);

  const change = current.expenseAgorot - previous.expenseAgorot;
  const comparison: PeriodComparison = {
    expenseChangeAgorot: change,
    previousExpenseAgorot: previous.expenseAgorot,
    changeSharePct:
      previous.expenseAgorot === 0
        ? null
        : Math.round((change / previous.expenseAgorot) * 1000) / 10,
    directionHe: change > 0 ? 'יותר' : change < 0 ? 'פחות' : 'כמו',
  };

  // ── פילוח, רק אם מותר ─────────────────────────────────────────────
  const inPeriod = input.expenses.filter((e) => e.date >= input.from && e.date <= input.to);
  const allowed = input.confidence.categoryAdviceAllowed;

  const topCategories: TopCategoryLine[] = allowed
    ? effectiveExpensesByCategory(inPeriod, input.categories)
        .slice(0, 3)
        .map((entry) => ({
          categoryId: entry.categoryId,
          categoryName: entry.categoryName,
          amountAgorot: entry.amountAgorot,
          opaque: isOpaqueCategory(entry.categoryId),
        }))
    : [];

  return {
    from: input.from,
    to: input.to,
    incomeAgorot: current.incomeAgorot,
    expenseAgorot: current.expenseAgorot,
    netAgorot: current.netAgorot,
    comparison,
    topCategories,
    categoriesHiddenReasonHe: allowed
      ? null
      : 'רוב ההוצאות בתקופה הזו עדיין לא מפורטות, ולכן פילוח לפי קטגוריה לא יהיה מדויק.',
    usedReserve: input.reserveUsedAgorot > 0,
    usedReserveAgorot: clampMin0(input.reserveUsedAgorot),
    headlineHe: buildHeadline(current.netAgorot, current.expenseAgorot, comparison),
  };
}

function buildHeadline(
  netAgorot: Agorot,
  expenseAgorot: Agorot,
  comparison: PeriodComparison,
): string {
  // ⚠️ תקופה בלי הוצאות אינה "ירידה של 100%".
  //
  // שבוע שרק התחיל, או שטרם יובאו אליו נתונים, ייראה כמו הישג אדיר
  // אם משווים אותו לתקופה קודמת. זו מחמאה על כלום, והיא מלמדת
  // להתעלם מהכותרת.
  if (expenseAgorot === 0) {
    return comparison.previousExpenseAgorot > 0
      ? 'עדיין לא נרשמו הוצאות בתקופה הזו.'
      : 'אין עדיין נתונים לתקופה הזו.';
  }

  if (comparison.changeSharePct === null) {
    return netAgorot >= 0 ? 'נשאר לך משהו בצד.' : 'יצא יותר ממה שנכנס.';
  }
  const magnitude = Math.abs(comparison.changeSharePct);
  if (magnitude < 10) return 'בערך כמו התקופה הקודמת.';
  return comparison.expenseChangeAgorot > 0
    ? `הוצאת ${magnitude}% יותר מהתקופה הקודמת.`
    : `הוצאת ${magnitude}% פחות מהתקופה הקודמת.`;
}

// ---------------------------------------------------------------------------
// שבוע
// ---------------------------------------------------------------------------

export interface WeekReviewInput
  extends Omit<PeriodReviewInput, 'from' | 'to' | 'previousFrom' | 'previousTo'> {
  today: ISODate;
}

export function reviewWeek(input: WeekReviewInput): PeriodReview {
  const from = weekStart(input.today);
  const to = weekEnd(input.today);
  return buildReview({
    ...input,
    from,
    to,
    previousFrom: addDays(from, -7),
    previousTo: addDays(from, -1),
  });
}

// ---------------------------------------------------------------------------
// חודש
// ---------------------------------------------------------------------------

export interface MonthReviewInput
  extends Omit<PeriodReviewInput, 'from' | 'to' | 'previousFrom' | 'previousTo'> {
  month: ISOMonth;
}

export interface MonthReview extends PeriodReview {
  openingBalanceAgorot: Agorot;
  closingBalanceAgorot: Agorot;
  /** כמה מהתקציב נוצל, באחוזים. `null` כשאין תקציב. */
  budgetUsedPct: number | null;
  metBudget: boolean | null;
}

export function reviewMonth(
  input: MonthReviewInput & {
    openingBalanceAgorot: Agorot;
    closingBalanceAgorot: Agorot;
  },
): MonthReview {
  const from = monthStart(input.month);
  const to = monthEnd(input.month);

  // החודש הקודם, באורך המלא שלו
  const previousTo = addDays(from, -1);
  const previousFrom = monthStart(previousTo);

  const base = buildReview({ ...input, from, to, previousFrom, previousTo });

  const budgetUsedPct =
    input.budgetAgorot === null || input.budgetAgorot === 0
      ? null
      : Math.round((base.expenseAgorot / input.budgetAgorot) * 1000) / 10;

  return {
    ...base,
    openingBalanceAgorot: input.openingBalanceAgorot,
    closingBalanceAgorot: input.closingBalanceAgorot,
    budgetUsedPct,
    metBudget: input.budgetAgorot === null ? null : base.expenseAgorot <= input.budgetAgorot,
  };
}

/**
 * כמה מהרזרבה נוצל בתקופה.
 *
 * נמדד כירידה ביתרה מעבר למה שההכנסה כיסתה — כלומר כמה מהכסף ששמור
 * לחודשים הבאים נגרע בפועל.
 */
export function reserveUsedInPeriod(
  transactions: readonly Transaction[],
  from: ISODate,
  to: ISODate,
  monthlyAllowanceAgorot: Agorot,
): Agorot {
  const summary = periodSummary(transactions, from, to);
  const days = Math.max(1, diffDays(from, to) + 1);
  // חלק יחסי של ההקצבה החודשית לתקופה הזו
  const allowanceForPeriod = Math.round((monthlyAllowanceAgorot * days) / 30);
  const overspend = summary.expenseAgorot - summary.incomeAgorot - allowanceForPeriod;
  return clampMin0(overspend);
}

/** סך ההוצאות האטומות בתקופה — לשקיפות בסיכום. */
export function opaqueInPeriod(
  expenses: readonly EffectiveExpense[],
  from: ISODate,
  to: ISODate,
): Agorot {
  return sumA(
    expenses
      .filter((e) => e.date >= from && e.date <= to && isOpaqueCategory(e.categoryId))
      .map((e) => e.amountAgorot),
  );
}
