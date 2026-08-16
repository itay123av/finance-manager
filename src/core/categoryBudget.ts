/**
 * תקציב לפי קטגוריה.
 *
 * ⚠️ העיקרון: התקציב הקטגוריאלי נבנה **רק מהוצאות מפורטות**.
 *
 * אם ניקח את סך ההוצאות (כולל חיובי כרטיס ישן ללא פירוט) ונחלק אותו
 * בין הקטגוריות הידועות, נקבל תקציבים מנופחים לכל קטגוריה — כסף
 * שבאמת הלך למקום אחר יוקצה לאוכל בחוץ, לקניות ולבילויים. המשתמש
 * יקבל אישור להוציא יותר ממה שיש לו.
 *
 * לכן: הבסיס לחישוב הוא ההוצאות שיש להן קטגוריה אמיתית, והתוצאה
 * מסומנת בשקיפות כמכסה רק חלק מההוצאה הכוללת.
 */

import { eachMonth, monthEnd, monthOf, monthStart } from './dates';
import { isOpaqueCategory, type EffectiveExpense } from './effectiveSpending';
import { clampMin0, sumA } from './money';
import { median } from './stats';
import { monthDetailWeight } from './spendingConfidence';
import type { Agorot, Category, CategoryNature, ISOMonth, UUID } from './types';

export interface CategoryBudgetLine {
  categoryId: UUID;
  categoryName: string;
  nature: CategoryNature;
  /** חציון ההוצאה החודשית בקטגוריה, מהחודשים המפורטים. */
  typicalMonthlyAgorot: Agorot;
  /** התקציב המוצע לחודש הקרוב. */
  plannedAgorot: Agorot;
  /** כמה כבר הוצא החודש. */
  spentAgorot: Agorot;
  remainingAgorot: Agorot;
  /** כמה חודשים תרמו לחישוב — מדד לאמינות השורה. */
  monthsUsed: number;
}

export interface CategoryBudgetResult {
  lines: CategoryBudgetLine[];
  /** סך התקציב הקטגוריאלי — מכסה רק את החלק המפורט. */
  totalPlannedAgorot: Agorot;
  /** ההוצאה החודשית האטומה, שאינה מיוצגת באף שורה. */
  opaqueMonthlyAgorot: Agorot;
  /** התקציב הכולל, כולל הרזרבה לאטום. */
  grandTotalAgorot: Agorot;
  monthsAnalyzed: number;
  noteHe: string | null;
}

export interface CategoryBudgetInput {
  /** הוצאות אפקטיביות על פני כל ההיסטוריה. */
  expenses: readonly EffectiveExpense[];
  categories: readonly Category[];
  today: string;
  /**
   * יחס הקטנה או הגדלה מהחציון, לפי מסלול התקציב.
   * שמרני 0.75, מאוזן 0.90, גמיש 1.00.
   */
  planRatio: number;
  /** חודשים שנלקחים בחשבון לאחור. */
  lookbackMonths?: number;
}

const DEFAULT_LOOKBACK = 6;

export function buildCategoryBudget(input: CategoryBudgetInput): CategoryBudgetResult {
  const lookback = input.lookbackMonths ?? DEFAULT_LOOKBACK;
  const currentMonth = monthOf(input.today);

  const dates = input.expenses.map((e) => e.date).sort();
  if (dates.length === 0) {
    return {
      lines: [],
      totalPlannedAgorot: 0,
      opaqueMonthlyAgorot: 0,
      grandTotalAgorot: 0,
      monthsAnalyzed: 0,
      noteHe: 'עדיין אין מספיק נתונים כדי להציע תקציב לפי קטגוריה.',
    };
  }

  // חודשים מלאים בלבד — החודש הנוכחי חלקי ויעוות את החציון
  const allMonths = eachMonth(monthOf(dates[0]!), currentMonth).filter((m) => m !== currentMonth);
  const months = allMonths.slice(-lookback);

  /** הוצאות של חודש מסוים. */
  const expensesOf = (month: ISOMonth) =>
    input.expenses.filter((e) => e.date >= monthStart(month) && e.date <= monthEnd(month));

  // ── משקל לכל חודש לפי מידת הפירוט שלו ──────────────────────────────
  const weighted = months.map((month) => {
    const monthExpenses = expensesOf(month);
    return { month, expenses: monthExpenses, weight: monthDetailWeight(monthExpenses) };
  });

  // חודש בלי שום פירוט אינו תורם דבר לתקציב הקטגוריאלי
  const usable = weighted.filter((m) => m.weight > 0);

  const natureOf = new Map(input.categories.map((c) => [c.id, c.nature]));
  const nameOf = new Map(input.categories.map((c) => [c.id, c.name]));

  // ── חציון לכל קטגוריה, מהחודשים שיש בהם פירוט ──────────────────────
  const categoryIds = [
    ...new Set(
      input.expenses.filter((e) => !isOpaqueCategory(e.categoryId)).map((e) => e.categoryId),
    ),
  ];

  const thisMonthExpenses = expensesOf(currentMonth);

  const lines: CategoryBudgetLine[] = categoryIds
    .map((categoryId) => {
      // חודש שבו הקטגוריה לא הופיעה נספר כאפס: היעדר הוצאה הוא נתון,
      // לא חוסר נתונים — אחרת קטגוריה שקנו בה פעם אחת תיראה קבועה
      const monthlyTotals = usable.map((m) =>
        sumA(m.expenses.filter((e) => e.categoryId === categoryId).map((e) => e.amountAgorot)),
      );

      const typical = monthlyTotals.length === 0 ? 0 : Math.round(median(monthlyTotals));
      const spent = sumA(
        thisMonthExpenses.filter((e) => e.categoryId === categoryId).map((e) => e.amountAgorot),
      );
      const planned = Math.round(typical * input.planRatio);

      return {
        categoryId,
        categoryName: nameOf.get(categoryId) ?? 'לא ידוע',
        nature: natureOf.get(categoryId) ?? 'reducible',
        typicalMonthlyAgorot: typical,
        plannedAgorot: planned,
        spentAgorot: spent,
        remainingAgorot: planned - spent,
        monthsUsed: monthlyTotals.length,
      };
    })
    // קטגוריה שמעולם לא הוצא בה כלום אינה שורה בתקציב
    .filter((line) => line.typicalMonthlyAgorot > 0 || line.spentAgorot > 0)
    .sort((a, b) => b.plannedAgorot - a.plannedAgorot);

  // ── הרזרבה לחלק האטום ──────────────────────────────────────────────
  const opaqueMonthly =
    usable.length === 0
      ? 0
      : Math.round(
          median(
            weighted.map((m) =>
              sumA(
                m.expenses.filter((e) => isOpaqueCategory(e.categoryId)).map((e) => e.amountAgorot),
              ),
            ),
          ),
        );

  const totalPlanned = sumA(lines.map((l) => l.plannedAgorot));

  return {
    lines,
    totalPlannedAgorot: totalPlanned,
    opaqueMonthlyAgorot: clampMin0(opaqueMonthly),
    grandTotalAgorot: totalPlanned + clampMin0(opaqueMonthly),
    monthsAnalyzed: usable.length,
    noteHe:
      opaqueMonthly > 0
        ? 'חלק מההוצאות ההיסטוריות שייכות לכרטיס ישן ללא פירוט, ולכן ההמלצות לפי קטגוריה מבוססות בעיקר על הנתונים המפורטים יותר.'
        : null,
  };
}

/**
 * קטגוריות שמותר להציע לצמצם בהן.
 *
 * לעולם לא קטגוריה אטומה — אין שום בסיס לומר על כסף שלא יודעים לאן
 * הלך שאפשר להוציא ממנו פחות.
 */
export function reducibleLines(result: CategoryBudgetResult): CategoryBudgetLine[] {
  return result.lines.filter(
    (line) =>
      !isOpaqueCategory(line.categoryId) &&
      (line.nature === 'reducible' || line.nature === 'fun'),
  );
}

