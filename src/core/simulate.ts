/**
 * סימולציית רכישה — "אם אוציא ₪200 עכשיו, מה קורה?"
 *
 * המערכת **לא מחליטה במקומי**. היא לא אומרת "אל תקנה" ולא "מגיע לך".
 * היא מציגה ארבעה מספרים: כמה יישאר, האם זה בתקציב, כמה היעד יזוז,
 * ומה הסכום הגדול ביותר שלא מזיז אותו — ואז נותנת לי להחליט.
 */

import { formatILS, clampMin0, divA, minA } from './money';
import { formatMonthHe } from './dates';
import { projectGoal, type GoalProjection, type GoalSimulationInput } from './goal';
import type { SafeToSpendResult } from './safeToSpend';
import type { Agorot, UUID } from './types';

export interface CategoryBudgetState {
  categoryId: UUID;
  categoryName: string;
  plannedAgorot: Agorot;
  spentAgorot: Agorot;
}

export interface PurchaseSimulationInput {
  amountAgorot: Agorot;
  currentBalanceAgorot: Agorot;
  safeToSpend: SafeToSpendResult;
  goal: GoalSimulationInput;
  /** מצב תקציב הבילויים — הכיס שממנו רכישות כאלה בדרך כלל מגיעות. */
  funBudget: { plannedAgorot: Agorot; spentAgorot: Agorot };
  categoryBudget?: CategoryBudgetState;
}

export type PurchaseAlternativeId =
  | 'reduce_amount'
  | 'postpone'
  | 'use_fun_budget'
  | 'split_across_months';

export interface PurchaseAlternative {
  id: PurchaseAlternativeId;
  titleHe: string;
  detailHe: string;
  amountAgorot?: Agorot;
}

export interface PurchaseSimulation {
  amountAgorot: Agorot;
  isWithinSafeToSpend: boolean;
  balanceAfterAgorot: Agorot;
  safeToSpendAfterAgorot: Agorot;
  weekAfterAgorot: Agorot;
  funRemainingAfterAgorot: Agorot;
  categoryAfter: {
    categoryName: string;
    spentAfterAgorot: Agorot;
    plannedAgorot: Agorot;
    exceedsBudget: boolean;
  } | null;
  goalBefore: GoalProjection;
  goalAfter: GoalProjection;
  /** בכמה חודשים היעד נדחה. `null` = לא ניתן להשוואה (לא מגיעים ליעד ממילא). */
  goalDelayMonths: number | null;
  /** הסכום הגדול ביותר שאפשר להוציא בלי להזיז את תאריך היעד. */
  maxWithoutDelayAgorot: Agorot;
  verdictHe: string;
  detailHe: string;
  alternatives: PurchaseAlternative[];
}

/**
 * כמה "עודף" יש בחודש שבו היעד מושג — כל סכום עד לשם לא מזיז את התאריך.
 * מחושב ישירות מהמסלול, בלי חיפוש בינארי: היתרה בחודש ההשגה פחות היעד.
 */
export function slackAtGoalMonth(
  projection: GoalProjection,
  currentBalanceAgorot: Agorot,
  targetAgorot: Agorot,
): Agorot {
  if (projection.monthsToGoal === null) return 0;
  if (projection.monthsToGoal === 0) return clampMin0(currentBalanceAgorot - targetAgorot);
  const point = projection.path[projection.monthsToGoal - 1];
  return point ? clampMin0(point.balanceAgorot - targetAgorot) : 0;
}

export function simulatePurchase(input: PurchaseSimulationInput): PurchaseSimulation {
  const { amountAgorot, currentBalanceAgorot, safeToSpend, goal, funBudget, categoryBudget } =
    input;

  const goalBefore = projectGoal(goal);
  const goalAfter = projectGoal({
    ...goal,
    currentBalanceAgorot: goal.currentBalanceAgorot - amountAgorot,
  });

  const goalDelayMonths =
    goalBefore.monthsToGoal === null || goalAfter.monthsToGoal === null
      ? null
      : goalAfter.monthsToGoal - goalBefore.monthsToGoal;

  const maxWithoutDelayAgorot = minA(
    amountAgorot,
    slackAtGoalMonth(goalBefore, goal.currentBalanceAgorot, goal.targetAgorot),
  );

  const safeToSpendAfterAgorot = safeToSpend.nowAgorot - amountAgorot;
  const isWithinSafeToSpend = amountAgorot <= safeToSpend.nowAgorot;
  const funRemainingAfterAgorot =
    funBudget.plannedAgorot - funBudget.spentAgorot - amountAgorot;

  const daysLeft = safeToSpend.daysLeftInMonth;
  const weekAfterAgorot =
    safeToSpendAfterAgorot <= 0
      ? 0
      : divA(safeToSpendAfterAgorot * Math.min(7, daysLeft), daysLeft);

  const categoryAfter = categoryBudget
    ? {
        categoryName: categoryBudget.categoryName,
        spentAfterAgorot: categoryBudget.spentAgorot + amountAgorot,
        plannedAgorot: categoryBudget.plannedAgorot,
        exceedsBudget:
          categoryBudget.spentAgorot + amountAgorot > categoryBudget.plannedAgorot,
      }
    : null;

  // ── ניסוח ────────────────────────────────────────────────────────────
  let verdictHe: string;
  if (isWithinSafeToSpend && (goalDelayMonths === null || goalDelayMonths === 0)) {
    verdictHe = 'זה בתקציב, והיעד לא זז.';
  } else if (isWithinSafeToSpend) {
    verdictHe = `זה בתקציב. היעד יזוז בערך ב-${goalDelayMonths} חודשים.`;
  } else {
    verdictHe = `זה מעבר למה שבטוח להוציא החודש (${formatILS(safeToSpend.nowAgorot)}).`;
  }

  const goalLine =
    goalAfter.reachMonth === null
      ? 'בקצב הנוכחי לא מגיעים ליעד ממילא — הרכישה הזו לא מה שמעכב.'
      : `אחרי הרכישה, היעד צפוי בסביבות ${formatMonthHe(goalAfter.reachMonth)}.`;

  const detailHe =
    `אחרי הרכישה תישאר יתרה של ${formatILS(currentBalanceAgorot - amountAgorot)}, ` +
    `ובטוח להוציא ירד ל-${formatILS(clampMin0(safeToSpendAfterAgorot))}. ${goalLine}`;

  // ── חלופות ───────────────────────────────────────────────────────────
  const alternatives: PurchaseAlternative[] = [];

  if (maxWithoutDelayAgorot > 0 && maxWithoutDelayAgorot < amountAgorot) {
    alternatives.push({
      id: 'reduce_amount',
      titleHe: `להוריד ל-${formatILS(maxWithoutDelayAgorot)}`,
      detailHe: 'זה הסכום הגדול ביותר שלא מזיז את תאריך היעד.',
      amountAgorot: maxWithoutDelayAgorot,
    });
  }

  if (!isWithinSafeToSpend) {
    alternatives.push({
      id: 'postpone',
      titleHe: 'לדחות לחודש הבא',
      detailHe: `החודש נשארו ${daysLeft} ימים. בתחילת החודש הבא התקציב מתאפס והרכישה תיכנס בלי חריגה.`,
    });
  }

  if (funRemainingAfterAgorot >= 0) {
    alternatives.push({
      id: 'use_fun_budget',
      titleHe: 'לקחת מתקציב הבילויים',
      detailHe: `נשארו ${formatILS(clampMin0(funBudget.plannedAgorot - funBudget.spentAgorot))} בתקציב הבילויים — זה מכסה את הרכישה, ואז יישארו ${formatILS(funRemainingAfterAgorot)}.`,
      amountAgorot: funRemainingAfterAgorot,
    });
  }

  if (amountAgorot > 0) {
    alternatives.push({
      id: 'split_across_months',
      titleHe: 'לפצל לשני חודשים',
      detailHe: `${formatILS(divA(amountAgorot, 2))} החודש ו-${formatILS(amountAgorot - divA(amountAgorot, 2))} בחודש הבא.`,
      amountAgorot: divA(amountAgorot, 2),
    });
  }

  return {
    amountAgorot,
    isWithinSafeToSpend,
    balanceAfterAgorot: currentBalanceAgorot - amountAgorot,
    safeToSpendAfterAgorot,
    weekAfterAgorot,
    funRemainingAfterAgorot,
    categoryAfter,
    goalBefore,
    goalAfter,
    goalDelayMonths,
    maxWithoutDelayAgorot,
    verdictHe,
    detailHe,
    alternatives,
  };
}
