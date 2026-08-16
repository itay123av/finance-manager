/**
 * "אפשר לקנות את זה?"
 *
 * ⚠️ המודול הזה **לא מחליט**. הוא מראה מה יקרה.
 *
 * ההבדל אינו סמנטי. מערכת שאומרת "אסור לך" מקבלת התעלמות אחרי הפעם
 * השלישית; מערכת שמראה "אחרי הרכישה יישארו ₪38, והיעד יידחה בשבועיים"
 * נותנת למשתמש לשקול בעצמו — וזה מה שמשנה התנהגות לאורך זמן.
 *
 * ⚠️ הכנסה עתידית לעולם אינה נחשבת כסף קיים. היא מוצגת בנפרד
 * כ"אם ההכנסה תיכנס", ואף פעם לא מתווספת ל-`safeToSpendNow`.
 */

import { addDays, addMonths, diffDays, monthEnd } from './dates';
import { clampMin0, divA } from './money';
import { projectGoal, type GoalProjection } from './goal';
import type { Agorot, ExpectedIncome, ISODate, UUID } from './types';

/**
 * ארבע התשובות. הסדר הוא סדר החומרה.
 *
 * `affordable`     — לא נוגע לא ברזרבה ולא בסכום הביטחון.
 * `tight`          — אפשרי, אבל מצמצם משמעותית או דוחה את היעד.
 * `uses_reserve`   — ישתמש בכסף שמיועד לחודשים הבאים.
 * `over_safe`      — עובר את מה שפנוי היום.
 */
export type PurchaseVerdict = 'affordable' | 'tight' | 'uses_reserve' | 'over_safe';

/** מעל זה, רכישה נחשבת "מצמצמת משמעותית" גם אם היא נכנסת. */
const TIGHT_SHARE_OF_SAFE = 0.75;
/** דחיית יעד שמעבר לה שווה להתריע. */
const TIGHT_GOAL_DELAY_DAYS = 14;
/**
 * דחיית היעד לבדה אינה מספיקה לסימון "יש השפעה".
 *
 * ⚠️ הסימולטור מתקדם בצעדים של חודש שלם, ולכן כשהנטו החודשי נמוך
 * **כל** רכישה — גם של ₪20 — נראית כאילו היא דוחה את היעד בחודש.
 * זו תופעת לוואי של הדיסקרטיזציה ולא אות אמיתי. לכן דחייה נספרת רק
 * כשהרכישה גם תופסת נתח משמעותי מהכסף הפנוי.
 */
const MIN_SHARE_FOR_DELAY_WARNING = 0.25;

export interface PurchaseSnapshot {
  balanceAgorot: Agorot;
  safeToSpendNowAgorot: Agorot;
  reservedForFutureMonthsAgorot: Agorot;
  safetyBufferAgorot: Agorot;
  goalGapAgorot: Agorot;
  goalReachMonth: string | null;
  monthEndForecastAgorot: Agorot;
  threeMonthForecastAgorot: Agorot;
}

export interface PurchaseAlternative {
  kind: 'reduce' | 'postpone' | 'save_monthly' | 'wait_for_income';
  labelHe: string;
  detailHe: string;
  /** הסכום הרלוונטי לחלופה, כשיש. */
  amountAgorot?: Agorot;
  /** התאריך הרלוונטי, כשיש. */
  date?: ISODate;
  months?: number;
}

export interface PurchaseSimulationResult {
  verdict: PurchaseVerdict;
  headlineHe: string;
  explanationHe: string;
  amountAgorot: Agorot;
  before: PurchaseSnapshot;
  after: PurchaseSnapshot;
  /** כמה מהרזרבה יידרש. אפס כשלא נוגעים בה. */
  reserveNeededAgorot: Agorot;
  /** כמה מסכום הביטחון ייפגע. אפס כשלא נוגעים בו. */
  bufferBreachAgorot: Agorot;
  /** בכמה ימים נדחה היעד. */
  goalDelayDays: number;
  alternatives: PurchaseAlternative[];
  /** מוצג בנפרד ולעולם לא מחושב כתוך הכסף הפנוי. */
  ifExpectedIncomeArrives: {
    amountAgorot: Agorot;
    date: ISODate | null;
    safeToSpendThenAgorot: Agorot;
  } | null;
}

export interface PurchaseSimulationInput {
  today: ISODate;
  amountAgorot: Agorot;
  categoryId?: UUID;
  /** ברירת מחדל: היום. */
  plannedDate?: ISODate;
  /** התחייבות חוזרת — הסכום מוכפל במספר החודשים שנותרו לתחזית. */
  recurring?: boolean;
  balanceAgorot: Agorot;
  safeToSpendNowAgorot: Agorot;
  reservedForFutureMonthsAgorot: Agorot;
  safetyBufferAgorot: Agorot;
  targetAgorot: Agorot;
  /** נטו חודשי רגיל, לחישוב חלופות חיסכון ודחייה. */
  regularMonthlyNetAgorot: Agorot;
  summerTotalNetAgorot: Agorot;
  monthEndForecastAgorot: Agorot;
  threeMonthForecastAgorot: Agorot;
  expectedIncomes: readonly ExpectedIncome[];
  historicalConfidence: 'none' | 'low' | 'medium' | 'high';
}

/** האם הרכישה "מצמצמת משמעותית" למרות שהיא נכנסת. */
function isTight(shareOfSafe: number, goalDelayDays: number): boolean {
  if (shareOfSafe >= TIGHT_SHARE_OF_SAFE) return true;
  return goalDelayDays >= TIGHT_GOAL_DELAY_DAYS && shareOfSafe >= MIN_SHARE_FOR_DELAY_WARNING;
}

function projectionFor(input: PurchaseSimulationInput, balanceAgorot: Agorot): GoalProjection {
  return projectGoal({
    today: input.today,
    currentBalanceAgorot: balanceAgorot,
    targetAgorot: input.targetAgorot,
    regularMonthlyNetAgorot: input.regularMonthlyNetAgorot,
    summerTotalNetAgorot: input.summerTotalNetAgorot,
    historicalConfidence: input.historicalConfidence,
  });
}

/**
 * ההפרש בימים בין תאריך היעד לפני הרכישה לאחריה.
 * מוחזר 0 כשאי אפשר להשוות (אחד מהם לא מגיע ליעד).
 */
function goalDelay(before: GoalProjection, after: GoalProjection): number {
  if (before.reachDate === null || after.reachDate === null) return 0;
  return Math.max(0, diffDays(before.reachDate, after.reachDate));
}

export function simulatePurchase(
  input: PurchaseSimulationInput,
): PurchaseSimulationResult {
  const amount = input.amountAgorot;
  const plannedDate = input.plannedDate ?? input.today;

  const beforeProjection = projectionFor(input, input.balanceAgorot);
  const afterBalance = input.balanceAgorot - amount;
  const afterProjection = projectionFor(input, afterBalance);

  const afterSafe = input.safeToSpendNowAgorot - amount;

  // כמה מהרזרבה נדרש: רק החלק שעובר את הכסף הפנוי
  const reserveNeeded = clampMin0(-afterSafe);
  const reserveAvailable = input.reservedForFutureMonthsAgorot;

  // פגיעה בסכום הביטחון: כשגם הרזרבה לא מספיקה
  const bufferBreach = clampMin0(reserveNeeded - reserveAvailable);

  const delay = goalDelay(beforeProjection, afterProjection);

  // ── ההכרעה ─────────────────────────────────────────────────────────
  let verdict: PurchaseVerdict;
  if (bufferBreach > 0) {
    verdict = 'over_safe';
  } else if (reserveNeeded > 0) {
    verdict = 'uses_reserve';
  } else if (input.safeToSpendNowAgorot > 0 && isTight(amount / input.safeToSpendNowAgorot, delay)) {
    verdict = 'tight';
  } else {
    verdict = 'affordable';
  }

  /**
   * ⚠️ טקסט בלבד, בלי סימן ויזואלי.
   *
   * קודם ישבו כאן אמוג'י (🟡/🟠/🔴) שקידדו את החומרה. זו הייתה
   * הצגה בתוך שכבת החישוב, והיא כפלה מידע ש-`verdict` כבר נושא —
   * הממשק צובע ומאייקן לפיו. אמוג'י גם נראה שונה בכל מערכת הפעלה
   * ואינו מקבל את צבע הערכה.
   */
  const HEADLINES: Record<PurchaseVerdict, string> = {
    affordable: 'בתוך התקציב',
    tight: 'אפשרי, אבל יש השפעה',
    uses_reserve: 'דורש שימוש בכסף ששמור לעתיד',
    over_safe: 'כרגע לא נכנס בכסף הפנוי',
  };

  const explanation =
    verdict === 'affordable'
      ? 'הרכישה לא נוגעת בכסף ששמור לחודשים הבאים ולא בסכום הביטחון.'
      : verdict === 'tight'
        ? delay >= TIGHT_GOAL_DELAY_DAYS
          ? `הרכישה נכנסת, אבל דוחה את היעד בכ-${delay} ימים.`
          : 'הרכישה נכנסת, אבל לוקחת חלק גדול מהכסף הפנוי לחודש.'
        : verdict === 'uses_reserve'
          ? `כדי לקנות עכשיו תשתמש בעוד ${formatAgorot(reserveNeeded)} מהכסף שמיועד לחודשים הבאים.`
          : `הסכום עובר את מה שפנוי היום, וגם את הכסף ששמור לחודשים הבאים.`;

  return {
    verdict,
    headlineHe: HEADLINES[verdict],
    explanationHe: explanation,
    amountAgorot: amount,
    reserveNeededAgorot: Math.min(reserveNeeded, reserveAvailable),
    bufferBreachAgorot: bufferBreach,
    goalDelayDays: delay,
    before: {
      balanceAgorot: input.balanceAgorot,
      safeToSpendNowAgorot: input.safeToSpendNowAgorot,
      reservedForFutureMonthsAgorot: input.reservedForFutureMonthsAgorot,
      safetyBufferAgorot: input.safetyBufferAgorot,
      goalGapAgorot: clampMin0(input.targetAgorot - input.balanceAgorot),
      goalReachMonth: beforeProjection.reachMonth,
      monthEndForecastAgorot: input.monthEndForecastAgorot,
      threeMonthForecastAgorot: input.threeMonthForecastAgorot,
    },
    after: {
      balanceAgorot: afterBalance,
      safeToSpendNowAgorot: afterSafe,
      reservedForFutureMonthsAgorot: clampMin0(reserveAvailable - reserveNeeded),
      safetyBufferAgorot: clampMin0(input.safetyBufferAgorot - bufferBreach),
      goalGapAgorot: clampMin0(input.targetAgorot - afterBalance),
      goalReachMonth: afterProjection.reachMonth,
      monthEndForecastAgorot: input.monthEndForecastAgorot - amount,
      threeMonthForecastAgorot: input.threeMonthForecastAgorot - amount,
    },
    alternatives: buildAlternatives(input, verdict, plannedDate),
    ifExpectedIncomeArrives: buildIncomeOutlook(input, afterSafe),
  };
}

// ---------------------------------------------------------------------------
// חלופות
// ---------------------------------------------------------------------------

/**
 * חלופות מחושבות, לא טקסט גנרי.
 *
 * כל אחת מגיעה עם המספר שלה — כמה להקטין, מתי יהיה מספיק, כמה לחסוך
 * ולכמה זמן. חלופה בלי מספר אינה עוזרת להחליט.
 */
function buildAlternatives(
  input: PurchaseSimulationInput,
  verdict: PurchaseVerdict,
  plannedDate: ISODate,
): PurchaseAlternative[] {
  if (verdict === 'affordable') return [];

  const alternatives: PurchaseAlternative[] = [];
  const safe = input.safeToSpendNowAgorot;
  const shortfall = clampMin0(input.amountAgorot - safe);

  // א׳ — להקטין לסכום שנכנס
  if (safe > 0 && safe < input.amountAgorot) {
    alternatives.push({
      kind: 'reduce',
      labelHe: `להקטין ל-${formatAgorot(safe)}`,
      detailHe: 'זה הסכום שנכנס כרגע בכסף הפנוי, בלי לגעת ברזרבה.',
      amountAgorot: safe,
    });
  }

  // ב׳ — לדחות עד שיהיה מספיק
  if (input.regularMonthlyNetAgorot > 0 && shortfall > 0) {
    const monthsNeeded = Math.ceil(shortfall / input.regularMonthlyNetAgorot);
    if (monthsNeeded <= 12) {
      const date = addMonths(plannedDate, monthsNeeded);
      alternatives.push({
        kind: 'postpone',
        labelHe: `לדחות בכ-${monthsNeeded} ${monthsNeeded === 1 ? 'חודש' : 'חודשים'}`,
        detailHe: `בקצב הנוכחי, בערך ב-${date} יהיה מספיק בלי לגעת ברזרבה.`,
        date,
        months: monthsNeeded,
      });
    }
  }

  // ג׳ — לחסוך סכום קבוע
  if (shortfall > 0) {
    for (const months of [2, 3]) {
      const perMonth = divA(shortfall, months);
      if (perMonth > 0) {
        alternatives.push({
          kind: 'save_monthly',
          labelHe: `לחסוך ${formatAgorot(perMonth)} בחודש`,
          detailHe: `${months} חודשים כאלה סוגרים את הפער של ${formatAgorot(shortfall)}.`,
          amountAgorot: perMonth,
          months,
        });
        break;
      }
    }
  }

  // ד׳ — להמתין להכנסה מאושרת
  const nextConfirmed = input.expectedIncomes
    .filter((e) => !e.received && e.certainty === 'confirmed' && e.expectedDate >= input.today)
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))[0];

  if (nextConfirmed && nextConfirmed.expectedAmountAgorot >= shortfall) {
    alternatives.push({
      kind: 'wait_for_income',
      labelHe: `להמתין ל-${nextConfirmed.label}`,
      detailHe: `${formatAgorot(nextConfirmed.expectedAmountAgorot)} צפויים ב-${nextConfirmed.expectedDate}. אחריהם הרכישה נכנסת בלי לגעת ברזרבה.`,
      amountAgorot: nextConfirmed.expectedAmountAgorot,
      date: nextConfirmed.expectedDate,
    });
  }

  return alternatives;
}

/**
 * מה יקרה אם ההכנסה הצפויה תיכנס.
 *
 * ⚠️ מוצג **בנפרד** ואינו חלק מהכסף הפנוי. רק `confirmed` נספר —
 * הכנסה שרק "אולי" תגיע אינה בסיס להחלטת קנייה.
 */
function buildIncomeOutlook(
  input: PurchaseSimulationInput,
  afterSafeAgorot: Agorot,
): PurchaseSimulationResult['ifExpectedIncomeArrives'] {
  const upcoming = input.expectedIncomes.filter(
    (e) =>
      !e.received &&
      e.certainty === 'confirmed' &&
      e.expectedDate > input.today &&
      e.expectedDate <= monthEnd(input.today),
  );
  if (upcoming.length === 0) return null;

  const total = upcoming.reduce((sum, e) => sum + e.expectedAmountAgorot, 0);
  const earliest = upcoming
    .map((e) => e.expectedDate)
    .sort()[0]!;

  return {
    amountAgorot: total,
    date: earliest,
    safeToSpendThenAgorot: afterSafeAgorot + total,
  };
}

/** עיצוב מקומי כדי ש-`core` יישאר חסר תלויות. */
function formatAgorot(agorot: Agorot): string {
  const shekels = Math.round(agorot / 100);
  return `₪${shekels.toLocaleString('en-US')}`;
}

// ---------------------------------------------------------------------------
// קיצורי דרך: "מה יקרה אם…"
// ---------------------------------------------------------------------------

export interface WhatIfResult {
  labelHe: string;
  balanceChangeAgorot: Agorot;
  goalReachMonthBefore: string | null;
  goalReachMonthAfter: string | null;
  summaryHe: string;
}

/** מה קורה אם אחסוך סכום קבוע כל חודש. */
export function whatIfSaveMonthly(
  input: PurchaseSimulationInput,
  monthlyAgorot: Agorot,
): WhatIfResult {
  const before = projectionFor(input, input.balanceAgorot);
  const after = projectGoal({
    today: input.today,
    currentBalanceAgorot: input.balanceAgorot,
    targetAgorot: input.targetAgorot,
    regularMonthlyNetAgorot: input.regularMonthlyNetAgorot + monthlyAgorot,
    summerTotalNetAgorot: input.summerTotalNetAgorot,
    historicalConfidence: input.historicalConfidence,
  });

  const monthsSaved =
    before.monthsToGoal !== null && after.monthsToGoal !== null
      ? before.monthsToGoal - after.monthsToGoal
      : null;

  return {
    labelHe: `לחסוך ${formatAgorot(monthlyAgorot)} בחודש`,
    balanceChangeAgorot: 0,
    goalReachMonthBefore: before.reachMonth,
    goalReachMonthAfter: after.reachMonth,
    summaryHe:
      after.reachMonth === null
        ? 'עדיין לא מספיק כדי להגיע ליעד בקצב הזה, אבל זה מקרב.'
        : monthsSaved === null
          ? `עם החיסכון הזה, היעד צפוי ב-${after.reachMonth}.`
          : monthsSaved > 0
            ? `מקצר את הדרך ליעד ב-${monthsSaved} ${monthsSaved === 1 ? 'חודש' : 'חודשים'} — ${after.reachMonth} במקום ${before.reachMonth}.`
            : `היעד נשאר ב-${after.reachMonth}.`,
  };
}

/** מה קורה אם תיכנס הכנסה חד-פעמית. */
export function whatIfReceive(
  input: PurchaseSimulationInput,
  amountAgorot: Agorot,
): WhatIfResult {
  const before = projectionFor(input, input.balanceAgorot);
  const after = projectionFor(input, input.balanceAgorot + amountAgorot);

  return {
    labelHe: `לקבל ${formatAgorot(amountAgorot)}`,
    balanceChangeAgorot: amountAgorot,
    goalReachMonthBefore: before.reachMonth,
    goalReachMonthAfter: after.reachMonth,
    summaryHe:
      input.balanceAgorot + amountAgorot >= input.targetAgorot
        ? 'זה מספיק כדי להגיע ליעד.'
        : after.reachMonth === null
          ? `היתרה תעלה, אבל בקצב הנוכחי עדיין לא מגיעים ליעד.`
          : `היעד צפוי ב-${after.reachMonth}${before.reachMonth ? ` במקום ${before.reachMonth}` : ''}.`,
  };
}

/** מה קורה אם אוציא סכום חד-פעמי — קיצור דרך לסימולציה מלאה. */
export function whatIfSpend(
  input: PurchaseSimulationInput,
  amountAgorot: Agorot,
): WhatIfResult {
  const result = simulatePurchase({ ...input, amountAgorot });
  return {
    labelHe: `להוציא ${formatAgorot(amountAgorot)}`,
    balanceChangeAgorot: -amountAgorot,
    goalReachMonthBefore: result.before.goalReachMonth,
    goalReachMonthAfter: result.after.goalReachMonth,
    summaryHe: `${result.headlineHe} · ${result.explanationHe}`,
  };
}

/** תאריך שבו צפוי להיות מספיק — לשימוש בחלופת הדחייה. */
export function earliestAffordableDate(
  input: PurchaseSimulationInput,
): ISODate | null {
  if (input.regularMonthlyNetAgorot <= 0) return null;
  const shortfall = clampMin0(input.amountAgorot - input.safeToSpendNowAgorot);
  if (shortfall === 0) return input.today;
  const months = Math.ceil(shortfall / input.regularMonthlyNetAgorot);
  return months > 24 ? null : addDays(addMonths(input.today, months), 0);
}
