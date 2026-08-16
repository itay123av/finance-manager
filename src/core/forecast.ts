/**
 * תחזיות יתרה.
 *
 * חמישה תרחישים. הם **לא מצטברים** — כל אחד הוא עדשה אחרת על אותם נתונים,
 * ומוצגים כרצועה (מהנמוך לגבוה) ולא כקו יחיד. קו יחיד נראה כמו הבטחה.
 *
 * מיוחד לב לתרחיש `knownIncomeOnly`: הוא בנוי מ"בלי הכנסה נוספת" ועליו
 * מתווספות רק הכנסות ספציפיות שאני כבר יודע עליהן. הוא **לא** מוסיף אותן
 * מעל ההכנסה הממוצעת — אחרת אותה הכנסה הייתה נספרת פעמיים, פעם בממוצע
 * ההיסטורי ופעם כפריט צפוי.
 */

import { capConfidenceByHorizon } from './confidence';
import { addMonthsToMonth, isSummerMonth, monthOf } from './dates';
import { divA, sumA } from './money';
import { maxOf, minOf } from './stats';
import type {
  Agorot,
  Confidence,
  ExpectedIncome,
  ISODate,
  ISOMonth,
  PlannedExpense,
} from './types';

export type ForecastScenarioId =
  | 'noNewIncome'
  | 'currentAverage'
  | 'balancedBudget'
  | 'knownIncomeOnly'
  | 'withSummerWork';

export const FORECAST_HORIZONS = [1, 3, 6, 12] as const;

const SCENARIO_LABELS: Record<ForecastScenarioId, { nameHe: string; descriptionHe: string }> = {
  noNewIncome: {
    nameHe: 'בלי הכנסה נוספת',
    descriptionHe: 'מה קורה אם לא ייכנס שקל נוסף, וההוצאות נמשכות כרגיל. זה הרצפה.',
  },
  currentAverage: {
    nameHe: 'לפי הקצב הנוכחי',
    descriptionHe: 'ההכנסות וההוצאות ממשיכות בערך כמו שהיו עד היום.',
  },
  balancedBudget: {
    nameHe: 'לפי התקציב המאוזן',
    descriptionHe: 'אם תעמוד בתקציב שנבחר.',
  },
  knownIncomeOnly: {
    nameHe: 'רק לפי הכנסות שאני כבר יודע עליהן',
    descriptionHe: 'בלי להניח הכנסה ממוצעת — רק עבודות ותשלומים שכבר רשומים.',
  },
  withSummerWork: {
    nameHe: 'עם עבודה בקיץ',
    descriptionHe: 'הקצב הנוכחי, ובנוסף ההכנסה הצפויה ביולי ואוגוסט.',
  },
};

export interface ForecastInput {
  today: ISODate;
  currentBalanceAgorot: Agorot;
  /** הוצאה חודשית אופיינית (חציון). */
  averageMonthlyExpenseAgorot: Agorot;
  /** הכנסה חודשית אופיינית בחודש רגיל (לא קיץ). */
  averageRegularMonthlyIncomeAgorot: Agorot;
  /** ההוצאה החודשית לפי מסלול התקציב שנבחר. */
  budgetMonthlySpendAgorot: Agorot;
  /** נטו כולל של יולי + אוגוסט. */
  summerTotalNetAgorot: Agorot;
  expectedIncomes: readonly ExpectedIncome[];
  plannedExpenses: readonly PlannedExpense[];
  historicalConfidence: Confidence;
}

export interface ForecastPoint {
  month: ISOMonth;
  balanceAgorot: Agorot;
  isSummer: boolean;
}

export interface ForecastScenario {
  id: ForecastScenarioId;
  nameHe: string;
  descriptionHe: string;
  horizonMonths: number;
  endBalanceAgorot: Agorot;
  points: ForecastPoint[];
  confidence: Confidence;
  requiresFarHorizonWarning: boolean;
  /** תווית חובה — התחזית אינה הבטחה, וזה נאמר בכל מקום שהיא מוצגת. */
  disclaimerHe: string;
}

const DISCLAIMER = 'זו תחזית לפי הנתונים שהוזנו, לא הבטחה. המציאות תמיד קצת אחרת.';

/** הכנסות צפויות שנופלות בחודש נתון, לפי רמות ודאות מבוקשות. */
function expectedIncomeInMonth(
  expectedIncomes: readonly ExpectedIncome[],
  month: ISOMonth,
  certainties: readonly ExpectedIncome['certainty'][],
): Agorot {
  return sumA(
    expectedIncomes
      .filter(
        (e) =>
          !e.received &&
          monthOf(e.expectedDate) === month &&
          certainties.includes(e.certainty),
      )
      .map((e) => e.expectedAmountAgorot),
  );
}

/** התחייבויות `must` שנופלות בחודש נתון. נכללות בכל התרחישים — הן ודאיות. */
function plannedExpenseInMonth(
  plannedExpenses: readonly PlannedExpense[],
  month: ISOMonth,
): Agorot {
  return sumA(
    plannedExpenses
      .filter((p) => !p.paid && p.priority === 'must' && monthOf(p.dueDate) === month)
      .map((p) => p.amountAgorot),
  );
}

function monthlyDelta(
  input: ForecastInput,
  scenario: ForecastScenarioId,
  month: ISOMonth,
): Agorot {
  const summerMonthlyNet = divA(input.summerTotalNetAgorot, 2);
  const committed = plannedExpenseInMonth(input.plannedExpenses, month);

  switch (scenario) {
    case 'noNewIncome':
      return -input.averageMonthlyExpenseAgorot - committed;

    case 'currentAverage':
      return (
        input.averageRegularMonthlyIncomeAgorot - input.averageMonthlyExpenseAgorot - committed
      );

    case 'balancedBudget':
      return input.averageRegularMonthlyIncomeAgorot - input.budgetMonthlySpendAgorot - committed;

    case 'knownIncomeOnly':
      // בסיס "בלי הכנסה", ועליו רק הכנסות ספציפיות שכבר רשומות.
      return (
        expectedIncomeInMonth(input.expectedIncomes, month, ['confirmed', 'likely']) -
        input.averageMonthlyExpenseAgorot -
        committed
      );

    case 'withSummerWork':
      return (
        input.averageRegularMonthlyIncomeAgorot -
        input.averageMonthlyExpenseAgorot -
        committed +
        (isSummerMonth(month) ? summerMonthlyNet : 0)
      );
  }
}

export function forecastScenario(
  input: ForecastInput,
  scenario: ForecastScenarioId,
  horizonMonths: number,
): ForecastScenario {
  const startMonth = monthOf(input.today);
  const points: ForecastPoint[] = [];
  let balance = input.currentBalanceAgorot;

  for (let i = 1; i <= horizonMonths; i++) {
    const month = addMonthsToMonth(startMonth, i);
    balance += monthlyDelta(input, scenario, month);
    points.push({ month, balanceAgorot: balance, isSummer: isSummerMonth(month) });
  }

  const capped = capConfidenceByHorizon(input.historicalConfidence, horizonMonths);

  return {
    id: scenario,
    nameHe: SCENARIO_LABELS[scenario].nameHe,
    descriptionHe: SCENARIO_LABELS[scenario].descriptionHe,
    horizonMonths,
    endBalanceAgorot: balance,
    points,
    confidence: capped.confidence,
    requiresFarHorizonWarning: capped.requiresFarHorizonWarning,
    disclaimerHe: capped.requiresFarHorizonWarning
      ? `${DISCLAIMER} תחזית רחוקה — משתנה מאוד.`
      : DISCLAIMER,
  };
}

export const ALL_SCENARIOS: readonly ForecastScenarioId[] = [
  'noNewIncome',
  'knownIncomeOnly',
  'currentAverage',
  'balancedBudget',
  'withSummerWork',
];

/** ה-MVP מציג שני תרחישים בלבד — השאר נכנסים בשלב 5. */
export const MVP_SCENARIOS: readonly ForecastScenarioId[] = ['noNewIncome', 'currentAverage'];

export function forecastAll(
  input: ForecastInput,
  horizonMonths: number,
  scenarios: readonly ForecastScenarioId[] = ALL_SCENARIOS,
): ForecastScenario[] {
  return scenarios.map((s) => forecastScenario(input, s, horizonMonths));
}

export interface ForecastBandPoint {
  month: ISOMonth;
  lowAgorot: Agorot;
  highAgorot: Agorot;
}

/**
 * רצועת התחזית — הטווח בין התרחיש הפסימי לאופטימי בכל חודש.
 * זו הצורה שבה התחזית מוצגת בגרף: שטח, לא קו.
 */
export function forecastBand(
  input: ForecastInput,
  horizonMonths: number,
  scenarios: readonly ForecastScenarioId[] = ALL_SCENARIOS,
): ForecastBandPoint[] {
  const runs = forecastAll(input, horizonMonths, scenarios);
  const out: ForecastBandPoint[] = [];

  for (let i = 0; i < horizonMonths; i++) {
    const balances = runs.map((r) => r.points[i]?.balanceAgorot ?? 0);
    const month = runs[0]?.points[i]?.month;
    if (!month) continue;
    out.push({ month, lowAgorot: minOf(balances), highAgorot: maxOf(balances) });
  }
  return out;
}
