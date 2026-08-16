/**
 * סיכומים שבועיים וחודשיים.
 *
 * הטון: רגוע, מעודד, לא שיפוטי. סיכום שגורם להרגיש רע נסגר ולא נקרא שוב,
 * ואז אין סיכום בכלל. לכן כל סיכום חודשי מתחיל ממה שהלך טוב, ומסתיים
 * בדבר אחד או שניים לשיפור — לא ברשימת כשלים.
 */

import {
  addMonthsToMonth,
  formatMonthHe,
  monthEnd,
  monthOf,
  monthStart,
  weekEnd,
  weekStart,
} from './dates';
import { formatILS } from './money';
import { expenseByCategory, periodSummary, type CategoryTotal } from './periods';
import type { Anomaly } from './patterns';
import type { BudgetProgress } from './budget';
import type { SafeToSpendResult } from './safeToSpend';
import type { GoalProgress } from './goal';
import type { Agorot, Category, ISODate, ISOMonth, Transaction } from './types';

// ---------------------------------------------------------------------------
// סיכום שבועי
// ---------------------------------------------------------------------------

export interface WeeklySummary {
  from: ISODate;
  to: ISODate;
  incomeAgorot: Agorot;
  expenseAgorot: Agorot;
  netAgorot: Agorot;
  topCategories: CategoryTotal[];
  metBudget: boolean | null;
  safeToSpendNextWeekAgorot: Agorot;
  headlineHe: string;
  suggestedActionHe: string;
}

export function weeklySummary(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  today: ISODate,
  budgetProgress: BudgetProgress | null,
  safeToSpend: SafeToSpendResult,
): WeeklySummary {
  const from = weekStart(today);
  const to = weekEnd(today);
  const summary = periodSummary(transactions, from, to);
  const topCategories = expenseByCategory(transactions, categories, from, to).slice(0, 3);
  const top = topCategories[0];

  const metBudget = budgetProgress === null ? null : !budgetProgress.isAheadOfPace;

  const headlineHe =
    summary.netAgorot >= 0
      ? `השבוע נכנס ${formatILS(summary.incomeAgorot)} ויצא ${formatILS(summary.expenseAgorot)} — נשארת בפלוס.`
      : `השבוע יצא ${formatILS(summary.expenseAgorot)} ונכנס ${formatILS(summary.incomeAgorot)}.`;

  const suggestedActionHe =
    metBudget === false
      ? 'הקצב קצת מהיר. שווה לתכנן את השבוע הבא מראש — אפילו רק להחליט על תקרה ליציאה.'
      : top
        ? `רוב ההוצאה השבוע הייתה על ${top.categoryName}. אם זה מה שרצית — הכל בסדר.`
        : 'שבוע רגוע. אפשר להוסיף עסקאות שאולי שכחת לרשום.';

  return {
    from,
    to,
    incomeAgorot: summary.incomeAgorot,
    expenseAgorot: summary.expenseAgorot,
    netAgorot: summary.netAgorot,
    topCategories,
    metBudget,
    safeToSpendNextWeekAgorot: safeToSpend.weekAgorot,
    headlineHe,
    suggestedActionHe,
  };
}

// ---------------------------------------------------------------------------
// סיכום חודשי
// ---------------------------------------------------------------------------

export interface MonthlySummary {
  month: ISOMonth;
  monthLabelHe: string;
  incomeAgorot: Agorot;
  expenseAgorot: Agorot;
  netAgorot: Agorot;
  balanceChangeAgorot: Agorot;
  topCategories: CategoryTotal[];
  anomalies: Anomaly[];
  goalProgressPct: number;
  goalDeltaAgorot: Agorot;
  /** מה הלך טוב — תמיד ראשון. */
  winsHe: string[];
  /** דבר אחד או שניים לשיפור. לא רשימת כשלים. */
  improvementsHe: string[];
  suggestedNextMonthBudgetAgorot: Agorot | null;
  headlineHe: string;
}

export interface MonthlySummaryInput {
  transactions: readonly Transaction[];
  categories: readonly Category[];
  month: ISOMonth;
  goalProgress: GoalProgress;
  anomalies: readonly Anomaly[];
  suggestedNextMonthBudgetAgorot: Agorot | null;
}

export function monthlySummary(input: MonthlySummaryInput): MonthlySummary {
  const { transactions, categories, month, goalProgress, anomalies } = input;

  const from = monthStart(month);
  const to = monthEnd(month);
  const summary = periodSummary(transactions, from, to);
  const topCategories = expenseByCategory(transactions, categories, from, to).slice(0, 5);

  const previousMonth = addMonthsToMonth(month, -1);
  const previous = periodSummary(
    transactions,
    monthStart(previousMonth),
    monthEnd(previousMonth),
  );

  const winsHe: string[] = [];
  const improvementsHe: string[] = [];

  if (summary.netAgorot > 0) {
    winsHe.push(`סיימת את החודש בפלוס של ${formatILS(summary.netAgorot)}.`);
  }
  if (previous.transactionCount > 0 && summary.expenseAgorot < previous.expenseAgorot) {
    winsHe.push(
      `הוצאת ${formatILS(previous.expenseAgorot - summary.expenseAgorot)} פחות מהחודש הקודם.`,
    );
  }
  if (summary.transactionCount > 0) {
    winsHe.push(`תיעדת ${summary.transactionCount} עסקאות — בלי זה אף מספר כאן לא היה אמין.`);
  }
  if (goalProgress.sinceStartAgorot > 0) {
    winsHe.push(`מאז שהתחלת לעקוב, היתרה עלתה ב-${formatILS(goalProgress.sinceStartAgorot)}.`);
  }

  const biggest = topCategories[0];
  if (summary.netAgorot < 0) {
    improvementsHe.push(
      `החודש יצא ${formatILS(-summary.netAgorot)} יותר ממה שנכנס. בחודש עם הכנסה זה מתאזן — כדאי לשים לב שזה לא נמשך.`,
    );
  }
  if (biggest && biggest.sharePct > 40) {
    improvementsHe.push(
      `${biggest.categoryName} תפסה ${biggest.sharePct}% מכל ההוצאות. לא בהכרח בעיה — רק שווה לדעת.`,
    );
  }
  if (anomalies.length > 0) {
    improvementsHe.push(`היו ${anomalies.length} עסקאות חריגות. שווה לוודא שכולן מוכרות לך.`);
  }

  const headlineHe =
    summary.netAgorot >= 0
      ? `${formatMonthHe(month)}: נכנס ${formatILS(summary.incomeAgorot)}, יצא ${formatILS(summary.expenseAgorot)}. חודש טוב.`
      : `${formatMonthHe(month)}: נכנס ${formatILS(summary.incomeAgorot)}, יצא ${formatILS(summary.expenseAgorot)}.`;

  return {
    month,
    monthLabelHe: formatMonthHe(month),
    incomeAgorot: summary.incomeAgorot,
    expenseAgorot: summary.expenseAgorot,
    netAgorot: summary.netAgorot,
    balanceChangeAgorot: summary.netAgorot,
    topCategories,
    anomalies: [...anomalies],
    goalProgressPct: goalProgress.progressPct,
    goalDeltaAgorot: goalProgress.sinceStartAgorot,
    winsHe,
    // לכל היותר שני דברים לשיפור — רשימה ארוכה מרתיעה ולא נקראת.
    improvementsHe: improvementsHe.slice(0, 2),
    suggestedNextMonthBudgetAgorot: input.suggestedNextMonthBudgetAgorot,
    headlineHe,
  };
}

/** החודשים שיש עליהם מספיק נתונים כדי להפיק סיכום. */
export function summarizableMonths(
  transactions: readonly Transaction[],
  today: ISODate,
): ISOMonth[] {
  const current = monthOf(today);
  const months = new Set<ISOMonth>();
  for (const t of transactions) {
    if (t.status !== 'actual' || t.kind !== 'normal') continue;
    const m = monthOf(t.date);
    if (m < current) months.add(m);
  }
  return [...months].sort();
}
