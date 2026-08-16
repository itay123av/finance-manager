/**
 * תקציב חודשי גמיש.
 *
 * התקציב **לא מניח משכורת**. הוא נבנה מההוצאות שלי בפועל, לא מהכנסה
 * שאמורה להיכנס. שלושת המסלולים נבדלים בכמה לצמצם מול ההרגל הקיים,
 * ולא בסכום שנשלף מהאוויר.
 *
 * שתי רצפות מגינות על התקציב מלהיות דמיוני:
 *  • **רצפת התחייבויות** — אי אפשר לתקצב מתחת לחשבון הטלפון והמנויים.
 *  • **תקציב בילויים** — שורה מתוכננת ומכובדת, לא שארית. תקציב שמאפס
 *    בילויים נזנח תוך שבועיים, וזו לא הצלחה.
 */

import { clampMin0, divA, maxA, mulA, sumA } from './money';
import { daysInMonth, daysLeftInMonth, monthEnd, monthOf, monthStart } from './dates';
import { spentSoFarThisMonth } from './periods';
import { assessRisk, type RiskAssessment } from './risk';
import type { MonthlyAverage } from './averages';
import type { Agorot, ISODate, ISOMonth, PlannedExpense, Transaction } from './types';

/**
 * פרמטרי המסלולים.
 * `spendFactor` — איזה חלק מההוצאה האופיינית מותר להוציא.
 * `funShare` — איזה חלק מההוצאה הפנויה (אחרי קבועות) מוקצה לבילויים.
 */
export const PLAN_PARAMS = {
  conservative: { spendFactor: 0.75, funShare: 0.3 },
  balanced: { spendFactor: 0.9, funShare: 0.45 },
  flexible: { spendFactor: 1.0, funShare: 0.6 },
} as const;

export type ConcretePlanId = keyof typeof PLAN_PARAMS;

/** ברירת המחדל היא המאוזן — לא השמרני. */
export const DEFAULT_PLAN_ID: ConcretePlanId = 'balanced';

const PLAN_LABELS: Record<ConcretePlanId, { nameHe: string; descriptionHe: string }> = {
  conservative: {
    nameHe: 'שמרני',
    descriptionHe: 'מגיע ליעד מהר יותר, אבל מצריך לוותר על לא מעט.',
  },
  balanced: {
    nameHe: 'מאוזן',
    descriptionHe: 'משאיר מקום ליציאות והנאה, ועדיין מתקדם ליעד. מומלץ.',
  },
  flexible: {
    nameHe: 'גמיש',
    descriptionHe: 'מאפשר להוציא כרגיל, אבל ההגעה ליעד לוקחת יותר זמן.',
  },
};

export interface BudgetPlanInput {
  /** היום שעבורו נבנה התקציב — קובע את אורך החודש בהקצאה השבועית. */
  today: ISODate;
  /** ההוצאה החודשית האופיינית. אם `agorot` הוא null — משתמשים בהערכה. */
  historicalMonthlySpend: MonthlyAverage;
  /** הערכת המשתמש מהאונבורדינג, לשימוש כשאין עדיין היסטוריה. */
  estimatedMonthlySpendAgorot: Agorot;
  /** מנויים והוצאות קבועות — רצפה שאי אפשר לתקצב מתחתיה. */
  fixedCommitmentsAgorot: Agorot;
  /** הכנסה צפויה החודש, ודאית בלבד — לתחזית ולתצוגה. */
  expectedMonthlyIncomeAgorot: Agorot;
  /**
   * הכנסה שכבר **התקבלה** החודש.
   *
   * ⚠️ רק היא רשאית לייצר תרומה ליעד שמנוכה מ"בטוח להוציא". תרומה
   * שמבוססת על כסף שטרם הגיע מורידה למשתמש את הכסף הפנוי בגלל הכנסה
   * שאולי לא תגיע — וזו בדיוק ההפרדה שכל המערכת בנויה סביבה.
   */
  receivedMonthlyIncomeAgorot: Agorot;
  currentBalanceAgorot: Agorot;
  /** חלק ההכנסה המתוכננת שאינו ודאי, 0–1. */
  unconfirmedIncomeShare: number;
}

export interface BudgetPlanOption {
  id: ConcretePlanId;
  nameHe: string;
  descriptionHe: string;
  isDefault: boolean;
  monthlySpendAgorot: Agorot;
  weeklySpendAgorot: Agorot;
  fixedCommitmentsAgorot: Agorot;
  /** מה שנשאר אחרי ההתחייבויות הקבועות — משם מגיע תקציב הבילויים. */
  discretionaryAgorot: Agorot;
  funBudgetAgorot: Agorot;
  /**
   * התרומה ליעד שמנוכה מ"בטוח להוציא" — מבוססת על כסף שכבר בחשבון.
   * אפס אם ההוצאות בולעות את ההכנסה שהתקבלה.
   */
  goalContributionAgorot: Agorot;
  /** התרומה הצפויה אם גם ההכנסה הוודאית תיכנס. לתצוגה בלבד. */
  projectedGoalContributionAgorot: Agorot;
  projectedMonthEndBalanceAgorot: Agorot;
  risk: RiskAssessment;
}

/**
 * ההוצאה החודשית האופיינית שממנה נגזרים המסלולים.
 * כשאין נתונים — נופלים להערכת המשתמש, והדבר משתקף ברמת הסיכון.
 */
export function baselineMonthlySpend(input: BudgetPlanInput): Agorot {
  return input.historicalMonthlySpend.agorot ?? input.estimatedMonthlySpendAgorot;
}

export function buildBudgetPlan(id: ConcretePlanId, input: BudgetPlanInput): BudgetPlanOption {
  const params = PLAN_PARAMS[id];
  const baseline = baselineMonthlySpend(input);

  // רצפת ההתחייבויות גוברת על גורם הצמצום — אי אפשר לא לשלם על הטלפון.
  const monthlySpendAgorot = maxA(input.fixedCommitmentsAgorot, mulA(baseline, params.spendFactor));

  const discretionaryAgorot = clampMin0(monthlySpendAgorot - input.fixedCommitmentsAgorot);
  const funBudgetAgorot = mulA(discretionaryAgorot, params.funShare);

  // ⚠️ שתי תרומות שונות בכוונה: זו שמנכים ממנה כסף פנוי מבוססת על
  // מה שכבר התקבל בלבד; זו שמציגים בתחזית כוללת גם הכנסה ודאית.
  const goalContributionAgorot = clampMin0(
    input.receivedMonthlyIncomeAgorot - monthlySpendAgorot,
  );
  const projectedGoalContributionAgorot = clampMin0(
    input.expectedMonthlyIncomeAgorot - monthlySpendAgorot,
  );

  return {
    id,
    nameHe: PLAN_LABELS[id].nameHe,
    descriptionHe: PLAN_LABELS[id].descriptionHe,
    isDefault: id === DEFAULT_PLAN_ID,
    monthlySpendAgorot,
    // נגזר מאורך החודש בפועל ולא מחלוקה ב-4 (חודש הוא ‎~4.35 שבועות).
    weeklySpendAgorot: divA(mulA(monthlySpendAgorot, 7), daysInMonth(input.today)),
    fixedCommitmentsAgorot: input.fixedCommitmentsAgorot,
    discretionaryAgorot,
    funBudgetAgorot,
    goalContributionAgorot,
    projectedGoalContributionAgorot,
    projectedMonthEndBalanceAgorot:
      input.currentBalanceAgorot + input.expectedMonthlyIncomeAgorot - monthlySpendAgorot,
    risk: assessRisk({
      plannedMonthlySpendAgorot: monthlySpendAgorot,
      historicalMonthlySpendAgorot: baseline,
      monthlySpendHistory: input.historicalMonthlySpend.values.map((v) => v.agorot),
      unconfirmedIncomeShare: input.unconfirmedIncomeShare,
      monthsOfData: input.historicalMonthlySpend.monthsUsed,
    }),
  };
}

/** שלושת המסלולים, בסדר: שמרני, מאוזן, גמיש. */
export function buildBudgetPlans(input: BudgetPlanInput): BudgetPlanOption[] {
  return (['conservative', 'balanced', 'flexible'] as const).map((id) =>
    buildBudgetPlan(id, input),
  );
}

export function defaultPlan(plans: readonly BudgetPlanOption[]): BudgetPlanOption {
  const found = plans.find((p) => p.id === DEFAULT_PLAN_ID);
  if (!found) throw new Error('לא נמצא מסלול ברירת המחדל');
  return found;
}

// ---------------------------------------------------------------------------
// מעקב מול התקציב במהלך החודש
// ---------------------------------------------------------------------------

export interface BudgetProgress {
  month: ISOMonth;
  plannedAgorot: Agorot;
  spentAgorot: Agorot;
  remainingAgorot: Agorot;
  spentSharePct: number;
  /** איזה חלק מהחודש עבר, באחוזים. */
  monthElapsedPct: number;
  /**
   * חורג מהקצב — הוצאתי חלק גדול מהתקציב ביחס לחלק החודש שעבר.
   * מרווח של 15 נקודות אחוז מונע התרעה על כל יום שבו יצאתי עם חברים.
   */
  isAheadOfPace: boolean;
  isOverBudget: boolean;
}

const PACE_TOLERANCE_PCT = 15;

export function budgetProgress(
  transactions: readonly Transaction[],
  plannedAgorot: Agorot,
  today: ISODate,
): BudgetProgress {
  const spentAgorot = spentSoFarThisMonth(transactions, today);
  const total = daysInMonth(today);
  const elapsedDays = total - daysLeftInMonth(today) + 1;

  const spentSharePct = plannedAgorot === 0 ? 0 : (spentAgorot / plannedAgorot) * 100;
  const monthElapsedPct = (elapsedDays / total) * 100;

  return {
    month: monthOf(today),
    plannedAgorot,
    spentAgorot,
    remainingAgorot: plannedAgorot - spentAgorot,
    spentSharePct: Math.round(spentSharePct * 10) / 10,
    monthElapsedPct: Math.round(monthElapsedPct * 10) / 10,
    isAheadOfPace: spentSharePct > monthElapsedPct + PACE_TOLERANCE_PCT,
    isOverBudget: spentAgorot > plannedAgorot,
  };
}

export interface WeeklyAllowance {
  dailyAgorot: Agorot;
  weeklyAgorot: Agorot;
  daysLeftInMonth: number;
  daysCovered: number;
}

/**
 * הקצאה שבועית.
 *
 * ⚠️ לא `חודשי / 4`. ההקצאה נגזרת מהימים שנותרו בפועל, ולאחר ניכוי
 * התחייבויות שידוע שיגיעו עד סוף החודש. ב-28 בחודש נותרו 3 ימים ולא שבוע,
 * וחלוקה ב-4 הייתה נותנת אישור להוציא פי שניים מהקיים.
 */
export function weeklyAllowance(
  availableAgorot: Agorot,
  committedLeftAgorot: Agorot,
  today: ISODate,
): WeeklyAllowance {
  const daysLeft = daysLeftInMonth(today);
  const spendable = clampMin0(availableAgorot - committedLeftAgorot);
  const dailyAgorot = divA(spendable, daysLeft);
  const daysCovered = Math.min(7, daysLeft);
  return {
    dailyAgorot,
    weeklyAgorot: mulA(dailyAgorot, daysCovered),
    daysLeftInMonth: daysLeft,
    daysCovered,
  };
}

/**
 * סך ההתחייבויות שטרם שולמו עד סוף החודש.
 *
 * נספרות רק הוצאות בעדיפות `must`. הוצאה בעדיפות `want` היא רצון ולא
 * התחייבות, ואם היינו מנכים אותה מ"בטוח להוציא" היינו הופכים כל רצון
 * עתידי לחוב שמקטין את מה שמותר לי היום.
 */
export function committedRemainingThisMonth(
  plannedExpenses: readonly PlannedExpense[],
  today: ISODate,
): Agorot {
  const start = monthStart(today);
  const end = monthEnd(today);
  return sumA(
    plannedExpenses
      .filter((p) => !p.paid && p.priority === 'must' && p.dueDate >= start && p.dueDate <= end)
      .map((p) => p.amountAgorot),
  );
}
