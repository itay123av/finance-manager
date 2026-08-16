/**
 * יעד יציב — ההבדל בין "להגיע ל-₪5,000" לבין "לשמור על ₪5,000".
 *
 * ⚠️ למה זה קיים.
 *
 * להגיע ליום אחד ל-₪5,000 ואז לרדת חזרה זו לא הצלחה, זו תנודה. מערכת
 * שחוגגת את הרגע הזה מלמדת בדיוק את ההרגל הלא נכון — להגיע למספר
 * ואז לבזבז. לכן ההישג נמדד לא בנקודה אחת בזמן אלא בשאלה: האם
 * התחזית מראה שהיתרה נשארת מעל היעד לאורך תקופה.
 */

import { clampMin0 } from './money';
import type { Agorot, Confidence, ISODate, ISOMonth } from './types';

/** כמה חודשים היתרה צריכה להישאר מעל היעד כדי שייחשב יציב. */
export const DEFAULT_STABILITY_MONTHS = 3;

export type GoalPhase =
  /** עוד לא הגענו. */
  | 'building'
  /** הגענו, אבל התחזית מראה ירידה מתחת ליעד. */
  | 'reached_unstable'
  /** הגענו והתחזית נשארת מעל היעד. */
  | 'reached_stable';

export interface GoalStabilityResult {
  phase: GoalPhase;
  reached: boolean;
  stable: boolean;
  /** החודש הראשון שבו התחזית יורדת מתחת ליעד, אם יש. */
  firstDipMonth: ISOMonth | null;
  firstDipBalanceAgorot: Agorot | null;
  /** כמה חודשים קדימה נבדקו. */
  monthsChecked: number;
  /** הסכום שאסור לרדת מתחתיו אחרי שהיעד הושג. */
  minimumAfterReachedAgorot: Agorot;
  confidence: Confidence;
  headlineHe: string;
  detailHe: string;
}

export interface GoalStabilityInput {
  today: ISODate;
  currentBalanceAgorot: Agorot;
  targetAgorot: Agorot;
  minimumAfterReachedAgorot: Agorot;
  /**
   * יתרה חזויה לכל חודש קדימה, החל מהחודש הבא.
   * מגיע מ-`forecastScenarios` כדי שלא יהיו שני מקורות אמת לתחזית.
   */
  projectedBalances: readonly { month: ISOMonth; balanceAgorot: Agorot }[];
  stabilityMonths?: number;
  confidence: Confidence;
}

export function assessGoalStability(input: GoalStabilityInput): GoalStabilityResult {
  const months = input.stabilityMonths ?? DEFAULT_STABILITY_MONTHS;
  const window = input.projectedBalances.slice(0, months);
  const reached = input.currentBalanceAgorot >= input.targetAgorot;

  // הירידה נמדדת מול הרף שאסור לרדת מתחתיו, לא מול היעד עצמו:
  // אחרי שהגענו, המטרה היא לא לצלול — לא להישאר בדיוק על המספר.
  const floor = Math.min(input.minimumAfterReachedAgorot, input.targetAgorot);
  const dip = window.find((point) => point.balanceAgorot < floor);

  const stable = reached && dip === undefined && window.length > 0;

  const phase: GoalPhase = !reached
    ? 'building'
    : stable
      ? 'reached_stable'
      : 'reached_unstable';

  const gap = clampMin0(input.targetAgorot - input.currentBalanceAgorot);

  return {
    phase,
    reached,
    stable,
    firstDipMonth: dip?.month ?? null,
    firstDipBalanceAgorot: dip?.balanceAgorot ?? null,
    monthsChecked: window.length,
    minimumAfterReachedAgorot: input.minimumAfterReachedAgorot,
    confidence: input.confidence,
    headlineHe: !reached
      ? 'בדרך ליעד'
      : stable
        ? 'היעד מוחזק'
        : 'הגעת ליעד — אבל הוא עוד לא יציב',
    detailHe: !reached
      ? `נשארו ${formatAgorot(gap)} עד ₪${Math.round(input.targetAgorot / 100).toLocaleString('en-US')}.`
      : stable
        ? `לפי התחזית, היתרה נשארת מעל היעד לפחות ${window.length} חודשים.`
        : dip
          ? `הגעת ליעד, אבל לפי הקצב הנוכחי צפויה ירידה ל-${formatAgorot(dip.balanceAgorot)} ב-${dip.month}.`
          : 'הגעת ליעד, אבל אין מספיק נתונים כדי לדעת אם הוא יחזיק.',
  };
}

/**
 * כמה צריך לשמור בחודש כדי לא לרדת מתחת לרף.
 *
 * מחזיר 0 כשהתחזית כבר נשארת מעליו.
 */
export function requiredMonthlyToHold(input: GoalStabilityInput): Agorot {
  const months = input.stabilityMonths ?? DEFAULT_STABILITY_MONTHS;
  const window = input.projectedBalances.slice(0, months);
  if (window.length === 0) return 0;

  const floor = Math.min(input.minimumAfterReachedAgorot, input.targetAgorot);
  const worst = window.reduce(
    (lowest, point) => (point.balanceAgorot < lowest.balanceAgorot ? point : lowest),
    window[0]!,
  );

  if (worst.balanceAgorot >= floor) return 0;

  const shortfall = floor - worst.balanceAgorot;
  const monthsUntilWorst =
    window.findIndex((point) => point.month === worst.month) + 1;
  return Math.ceil(shortfall / Math.max(1, monthsUntilWorst));
}

function formatAgorot(agorot: Agorot): string {
  return `₪${Math.round(agorot / 100).toLocaleString('en-US')}`;
}
