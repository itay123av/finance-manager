/**
 * ארבעה תרחישי תחזית, בארבעה טווחים.
 *
 * ⚠️ ארבעה ולא חמישה, ולא חמישה קווים על גרף אחד. תחזית שאי אפשר
 * להסתכל עליה ולהבין מיד מה היא אומרת אינה עוזרת להחליט.
 *
 * ⚠️ רמת הביטחון יורדת עם הטווח, ותמיד. אצל מי שרוב ההכנסה שלו מגיעה
 * בקיץ, תחזית ל-12 חודשים היא תרחיש ולא חיזוי — והיא לעולם לא תוצג
 * כ"גבוהה".
 */

import { capConfidenceByHorizon } from './confidence';
import { addMonthsToMonth, isSummerMonth, monthEnd, monthOf } from './dates';
import { clampMin0 } from './money';
import type { Agorot, Confidence, ExpectedIncome, ISODate, ISOMonth } from './types';

export type ScenarioId =
  /** ההתנהגות תמשיך כמו שהייתה. */
  | 'current'
  /** אעמוד בתקציב המאוזן. */
  | 'balanced'
  /** שמרני: לא נכנס שום כסף חדש. */
  | 'noNewIncome'
  /** רק הכנסות מאושרות. */
  | 'confirmedIncome';

export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  current: 'הקצב הנוכחי',
  balanced: 'התקציב המאוזן',
  noNewIncome: 'בלי הכנסה נוספת',
  confirmedIncome: 'עם הכנסות מאושרות',
};

export const SCENARIO_EXPLANATIONS: Record<ScenarioId, string> = {
  current: 'מה יקרה אם תמשיך בדיוק כמו עד היום.',
  balanced: 'מה יקרה אם תעמוד בתקציב שבחרת.',
  noNewIncome: 'התרחיש השמרני — כמה זמן מחזיק מה שיש עכשיו.',
  confirmedIncome: 'כולל רק כסף שכבר בטוח שיגיע.',
};

export const HORIZONS = [1, 3, 6, 12] as const;
export type Horizon = (typeof HORIZONS)[number];

export interface ForecastPoint {
  month: ISOMonth;
  balanceAgorot: Agorot;
  /** האם זה חודש שבו צפויה הכנסת קיץ. */
  isSummer: boolean;
}

export interface ScenarioForecast {
  scenarioId: ScenarioId;
  labelHe: string;
  explanationHe: string;
  /** נקודה לכל חודש קדימה, החל מהחודש הבא. */
  points: ForecastPoint[];
  /** היתרה בסוף כל טווח, עם רמת הביטחון המתאימה לו. */
  byHorizon: Record<
    Horizon,
    {
      balanceAgorot: Agorot;
      confidence: Confidence;
      /** מעל 6 חודשים — חובה להציג שזו תחזית רחוקה. */
      requiresFarHorizonWarning: boolean;
    }
  >;
  disclaimerHe: string;
}

export interface ForecastScenariosInput {
  today: ISODate;
  currentBalanceAgorot: Agorot;
  /** חציון ההוצאה החודשית ההיסטורית. */
  averageMonthlyExpenseAgorot: Agorot;
  /** חציון ההכנסה החודשית הרגילה (לא כולל קיץ). */
  averageRegularMonthlyIncomeAgorot: Agorot;
  /** תקציב ההוצאה החודשי לפי המסלול הנבחר. */
  budgetMonthlySpendAgorot: Agorot;
  /** נטו הקיץ הצפוי, מחולק בין יולי לאוגוסט. */
  summerTotalNetAgorot: Agorot;
  expectedIncomes: readonly ExpectedIncome[];
  historicalConfidence: Confidence;
}

/** ההכנסות המאושרות של חודש מסוים. */
function confirmedIncomeIn(
  month: ISOMonth,
  incomes: readonly ExpectedIncome[],
  today: ISODate,
): Agorot {
  return incomes
    .filter(
      (income) =>
        !income.received &&
        income.certainty === 'confirmed' &&
        income.expectedDate > today &&
        monthOf(income.expectedDate) === month,
    )
    .reduce((sum, income) => sum + income.expectedAmountAgorot, 0);
}

/** ההכנסה והוצאה החודשית לפי התרחיש. */
function monthlyDelta(
  scenarioId: ScenarioId,
  month: ISOMonth,
  input: ForecastScenariosInput,
): Agorot {
  const summerHalf = isSummerMonth(month) ? Math.round(input.summerTotalNetAgorot / 2) : 0;
  const confirmed = confirmedIncomeIn(month, input.expectedIncomes, input.today);

  switch (scenarioId) {
    case 'current':
      return (
        input.averageRegularMonthlyIncomeAgorot -
        input.averageMonthlyExpenseAgorot +
        summerHalf
      );
    case 'balanced':
      return (
        input.averageRegularMonthlyIncomeAgorot - input.budgetMonthlySpendAgorot + summerHalf
      );
    case 'noNewIncome':
      // שום כסף חדש — גם לא הקיץ
      return -input.averageMonthlyExpenseAgorot;
    case 'confirmedIncome':
      return confirmed - input.averageMonthlyExpenseAgorot;
  }
}

export function buildScenario(
  scenarioId: ScenarioId,
  input: ForecastScenariosInput,
): ScenarioForecast {
  const points: ForecastPoint[] = [];
  let balance = input.currentBalanceAgorot;
  let month = monthOf(input.today);

  const maxHorizon = HORIZONS[HORIZONS.length - 1] ?? 12;
  for (let step = 1; step <= maxHorizon; step++) {
    month = addMonthsToMonth(month, 1);
    balance += monthlyDelta(scenarioId, month, input);
    points.push({ month, balanceAgorot: balance, isSummer: isSummerMonth(month) });
  }

  const byHorizon = {} as ScenarioForecast['byHorizon'];
  for (const horizon of HORIZONS) {
    const point = points[horizon - 1]!;
    // ⚠️ תקרה לפי טווח — 12 חודשים לעולם לא 'high'
    const capped = capConfidenceByHorizon(input.historicalConfidence, horizon);
    byHorizon[horizon] = {
      balanceAgorot: point.balanceAgorot,
      confidence: capped.confidence,
      requiresFarHorizonWarning: capped.requiresFarHorizonWarning,
    };
  }

  return {
    scenarioId,
    labelHe: SCENARIO_LABELS[scenarioId],
    explanationHe: SCENARIO_EXPLANATIONS[scenarioId],
    points,
    byHorizon,
    disclaimerHe:
      'זו תחזית לפי הנתונים שלך, לא הבטחה. ככל שהטווח רחוק יותר, היא פחות מדויקת.',
  };
}

export function buildAllScenarios(input: ForecastScenariosInput): ScenarioForecast[] {
  return (['current', 'balanced', 'noNewIncome', 'confirmedIncome'] as ScenarioId[]).map(
    (id) => buildScenario(id, input),
  );
}

/**
 * הכנסות שאינן מאושרות — מוצגות כמידע נוסף בלבד.
 *
 * ⚠️ הן לעולם אינן תרחיש ברירת מחדל. תחזית שמניחה כסף ש"אולי" יגיע
 * מייצרת החלטות על בסיס משאלה.
 */
export interface UnconfirmedOutlook {
  likelyAgorot: Agorot;
  possibleAgorot: Agorot;
  noteHe: string | null;
}

export function unconfirmedOutlook(
  incomes: readonly ExpectedIncome[],
  today: ISODate,
): UnconfirmedOutlook {
  const upcoming = incomes.filter((i) => !i.received && i.expectedDate > today);
  const likely = upcoming
    .filter((i) => i.certainty === 'likely')
    .reduce((sum, i) => sum + i.expectedAmountAgorot, 0);
  const possible = upcoming
    .filter((i) => i.certainty === 'possible')
    .reduce((sum, i) => sum + i.expectedAmountAgorot, 0);

  return {
    likelyAgorot: likely,
    possibleAgorot: possible,
    noteHe:
      likely + possible === 0
        ? null
        : 'הכנסות שעדיין לא בטוחות אינן נכללות בתחזיות — הן מוצגות כאן בלבד.',
  };
}

/** נקודות ציון לגרף: היעד, סכום הביטחון, וחודשי הקיץ. */
export interface ForecastMarkers {
  targetAgorot: Agorot;
  safetyBufferAgorot: Agorot;
  summerMonths: ISOMonth[];
}

export function forecastMarkers(
  scenario: ScenarioForecast,
  targetAgorot: Agorot,
  safetyBufferAgorot: Agorot,
): ForecastMarkers {
  return {
    targetAgorot,
    safetyBufferAgorot,
    summerMonths: scenario.points.filter((p) => p.isSummer).map((p) => p.month),
  };
}

/** התחזית עד סוף החודש הנוכחי — שונה מ"חודש קדימה". */
export function monthEndForecast(
  input: ForecastScenariosInput,
  scenarioId: ScenarioId = 'current',
): { date: ISODate; balanceAgorot: Agorot; confidence: Confidence } {
  const month = monthOf(input.today);
  const delta = monthlyDelta(scenarioId, month, input);
  // חלק יחסי של החודש שנותר
  const dayOfMonth = Number(input.today.slice(8, 10));
  const daysInMonth = Number(monthEnd(input.today).slice(8, 10));
  const remainingShare = (daysInMonth - dayOfMonth) / daysInMonth;

  return {
    date: monthEnd(input.today),
    balanceAgorot: input.currentBalanceAgorot + Math.round(delta * remainingShare),
    confidence: capConfidenceByHorizon(input.historicalConfidence, 1).confidence,
  };
}

/** היתרה הנמוכה ביותר בתחזית — עוזר לזהות סיכון לרדת מתחת לביטחון. */
export function lowestPoint(scenario: ScenarioForecast, horizon: Horizon): ForecastPoint {
  const window = scenario.points.slice(0, horizon);
  return window.reduce(
    (lowest, point) => (point.balanceAgorot < lowest.balanceAgorot ? point : lowest),
    window[0]!,
  );
}

/** האם התחזית יורדת מתחת לסכום הביטחון, ומתי. */
export function bufferBreachMonth(
  scenario: ScenarioForecast,
  safetyBufferAgorot: Agorot,
  horizon: Horizon = 12,
): ISOMonth | null {
  const breach = scenario.points
    .slice(0, horizon)
    .find((point) => point.balanceAgorot < clampMin0(safetyBufferAgorot));
  return breach?.month ?? null;
}
