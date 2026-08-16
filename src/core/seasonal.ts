/**
 * חלוקת הכנסה עונתית — הכסף של יולי-אוגוסט.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  סדר ההקצאה הוא העניין המרכזי כאן, והוא לא אינטואיטיבי.
 * ═══════════════════════════════════════════════════════════════════════
 *  הדחף הטבעי הוא לקחת קודם את היעד: "יש ₪4,200, חסרים ₪3,760 ליעד,
 *  נשים אותם בצד". התוצאה: ₪0 לחודש למשך 10 חודשים.
 *  תוכנית כזו נשברת בשבוע השני, ואז גם היעד וגם המעקב הולכים לאיבוד.
 *
 *  לכן הסדר הוא:
 *    1. קרן ביטחון
 *    2. רצפת מחייה — הוצאות קבועות × מספר החודשים
 *    3. רצפת הנאה — מינימום בילויים, כדי שהתוכנית תהיה בת-קיימא
 *    4. **רק עכשיו** היעד
 *    5. רכישות מתוכננות הכרחיות
 *    6. השארית מתחלקת 60% להקצבה החודשית, 40% ליעד
 *
 *  היעד נדחה למקום הרביעי לא כי הוא פחות חשוב, אלא כי תוכנית שאי אפשר
 *  לחיות איתה לא מגיעה לשום יעד.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * אינווריאנטה: סכום כל הדליים שווה **בדיוק** להכנסה. נבדק בבדיקות.
 */

import { clampMin0, divA, formatILS, minA, mulA, sumA } from './money';
import type { Agorot } from './types';

/** ספטמבר עד יוני — משנת הלימודים ועד הקיץ הבא. */
export const DEFAULT_MONTHS_TO_COVER = 10;
export const DEFAULT_SAFETY_BUFFER_AGOROT = 50_000; // ₪500
/** רצפת ההנאה: לפחות רבע מההרגל, ולא פחות מ-₪40 לחודש. */
export const FUN_FLOOR_SHARE = 0.25;
export const FUN_FLOOR_MIN_MONTHLY_AGOROT = 4_000; // ₪40
/** חלוקת השארית: רוב להקצבה החודשית, מיעוט ליעד. */
export const REMAINDER_TO_MONTHLY_SHARE = 0.6;

export interface SeasonalAllocationInput {
  /** הכנסת הקיץ נטו — אחרי הוצאות שקשורות לעבודה. */
  summerIncomeAgorot: Agorot;
  /** כמה חודשים הכסף אמור לכסות. */
  monthsToCover: number;
  targetAgorot: Agorot;
  currentBalanceAgorot: Agorot;
  /** הוצאות קבועות וחיוניות לחודש (מנויים, תחבורה, טלפון). */
  essentialMonthlyAgorot: Agorot;
  /** ההוצאה החודשית האופיינית על בילויים — הבסיס לרצפת ההנאה. */
  typicalFunMonthlyAgorot: Agorot;
  /** רכישות גדולות מתוכננות שהוגדרו כהכרחיות. */
  plannedPurchasesAgorot: Agorot;
  safetyBufferTargetAgorot?: number;
  /** חלק הבילויים בהקצבה החודשית, לפי מסלול התקציב. */
  funShare?: number;
}

export interface AllocationStep {
  key: 'safetyBuffer' | 'essential' | 'funFloor' | 'goalReserve' | 'plannedPurchases' | 'remainder';
  labelHe: string;
  amountAgorot: Agorot;
  /** האם הדלי קיבל את מלוא מה שביקש. */
  fullyFunded: boolean;
  noteHe: string;
}

export interface SeasonalAllocation {
  summerIncomeAgorot: Agorot;
  monthsToCover: number;
  steps: AllocationStep[];

  safetyBufferAgorot: Agorot;
  essentialTotalAgorot: Agorot;
  funFloorTotalAgorot: Agorot;
  goalReserveAgorot: Agorot;
  plannedPurchasesAgorot: Agorot;
  remainderAgorot: Agorot;

  /** כמה מותר להוציא בכל חודש עד הקיץ הבא. */
  monthlyAllowanceAgorot: Agorot;
  /** מתוך ההקצבה החודשית — כמה מיועד לבילויים. */
  monthlyFunAgorot: Agorot;
  /** סך מה שהולך ליעד: הרזרבה + החלק מהשארית. */
  goalTotalAgorot: Agorot;

  /** האם ההכנסה הספיקה לשלושת הדליים הראשונים (ביטחון, מחייה, הנאה). */
  isSufficient: boolean;
  monthsActuallyCovered: number;
  messageHe: string;
}

export function allocateSeasonalIncome(input: SeasonalAllocationInput): SeasonalAllocation {
  const {
    summerIncomeAgorot,
    monthsToCover,
    targetAgorot,
    currentBalanceAgorot,
    essentialMonthlyAgorot,
    typicalFunMonthlyAgorot,
    plannedPurchasesAgorot,
    safetyBufferTargetAgorot = DEFAULT_SAFETY_BUFFER_AGOROT,
    funShare = 0.45,
  } = input;

  if (monthsToCover <= 0) throw new Error(`מספר חודשים לא תקין: ${monthsToCover}`);

  const funFloorMonthly = Math.max(
    FUN_FLOOR_MIN_MONTHLY_AGOROT,
    mulA(typicalFunMonthlyAgorot, FUN_FLOOR_SHARE),
  );

  const asked = {
    safetyBuffer: safetyBufferTargetAgorot,
    essential: essentialMonthlyAgorot * monthsToCover,
    funFloor: funFloorMonthly * monthsToCover,
    goalReserve: clampMin0(targetAgorot - currentBalanceAgorot),
    plannedPurchases: plannedPurchasesAgorot,
  };

  let left = clampMin0(summerIncomeAgorot);

  const take = (amount: Agorot): Agorot => {
    const taken = minA(left, clampMin0(amount));
    left -= taken;
    return taken;
  };

  const safetyBufferAgorot = take(asked.safetyBuffer);
  const essentialTotalAgorot = take(asked.essential);
  const funFloorTotalAgorot = take(asked.funFloor);
  const goalReserveAgorot = take(asked.goalReserve);
  const plannedPurchasesTaken = take(asked.plannedPurchases);
  const remainderAgorot = left;

  // חלוקת השארית — המשלים מחושב בחיסור כדי שלא תיעלם אגורה בעיגול.
  const remainderToMonthly = mulA(remainderAgorot, REMAINDER_TO_MONTHLY_SHARE);
  const remainderToGoal = remainderAgorot - remainderToMonthly;

  const monthlyAllowanceAgorot = divA(
    essentialTotalAgorot + funFloorTotalAgorot + remainderToMonthly,
    monthsToCover,
  );
  const monthlyFunAgorot = divA(
    funFloorTotalAgorot + mulA(remainderToMonthly, funShare),
    monthsToCover,
  );

  const isSufficient =
    safetyBufferAgorot === asked.safetyBuffer &&
    essentialTotalAgorot === asked.essential &&
    funFloorTotalAgorot === asked.funFloor;

  // `funFloorMonthly` תמיד לפחות ₪40, ולכן העלות החודשית לעולם אינה אפס
  // ואין כאן חשש לחלוקה באפס.
  const livingMonthly = essentialMonthlyAgorot + funFloorMonthly;
  const monthsActuallyCovered = Math.min(
    monthsToCover,
    Math.floor((essentialTotalAgorot + funFloorTotalAgorot) / livingMonthly),
  );

  const messageHe = isSufficient
    ? `מתוך ${formatILS(summerIncomeAgorot)}: ${formatILS(goalReserveAgorot + remainderToGoal)} הולכים ליעד, ` +
      `${formatILS(safetyBufferAgorot)} קרן ביטחון, והשאר מתחלק ל-${formatILS(monthlyAllowanceAgorot)} לחודש ` +
      `למשך ${monthsToCover} חודשים.`
    : `הכסף הזה מכסה בערך ${monthsActuallyCovered} מתוך ${monthsToCover} חודשים בקצב הנוכחי. ` +
      `זה עדיין מקרב אותך ליעד, אבל כדאי לתכנן הכנסה נוספת במהלך השנה.`;

  const steps: AllocationStep[] = [
    {
      key: 'safetyBuffer',
      labelHe: 'קרן ביטחון',
      amountAgorot: safetyBufferAgorot,
      fullyFunded: safetyBufferAgorot === asked.safetyBuffer,
      noteHe: 'כסף שלא נוגעים בו, למקרה של הפתעה.',
    },
    {
      key: 'essential',
      labelHe: `הוצאות קבועות ל-${monthsToCover} חודשים`,
      amountAgorot: essentialTotalAgorot,
      fullyFunded: essentialTotalAgorot === asked.essential,
      noteHe: 'טלפון, תחבורה, מנויים — הדברים שממשיכים בכל מקרה.',
    },
    {
      key: 'funFloor',
      labelHe: 'בילויים והנאה',
      amountAgorot: funFloorTotalAgorot,
      fullyFunded: funFloorTotalAgorot === asked.funFloor,
      noteHe: 'תקציב מתוכנן, לא שארית. תוכנית בלי זה לא שורדת.',
    },
    {
      key: 'goalReserve',
      labelHe: 'ליעד ה-₪5,000',
      amountAgorot: goalReserveAgorot,
      fullyFunded: goalReserveAgorot === asked.goalReserve,
      noteHe: 'נעול. זה מה שמקרב אותך ליעד.',
    },
    {
      key: 'plannedPurchases',
      labelHe: 'רכישות מתוכננות',
      amountAgorot: plannedPurchasesTaken,
      fullyFunded: plannedPurchasesTaken === asked.plannedPurchases,
      noteHe: 'דברים שכבר החלטת עליהם.',
    },
    {
      key: 'remainder',
      labelHe: 'שארית',
      amountAgorot: remainderAgorot,
      fullyFunded: true,
      noteHe: `${Math.round(REMAINDER_TO_MONTHLY_SHARE * 100)}% מגדילים את ההקצבה החודשית, השאר ליעד.`,
    },
  ];

  return {
    summerIncomeAgorot,
    monthsToCover,
    steps,
    safetyBufferAgorot,
    essentialTotalAgorot,
    funFloorTotalAgorot,
    goalReserveAgorot,
    plannedPurchasesAgorot: plannedPurchasesTaken,
    remainderAgorot,
    monthlyAllowanceAgorot,
    monthlyFunAgorot,
    goalTotalAgorot: goalReserveAgorot + remainderToGoal,
    isSufficient,
    monthsActuallyCovered,
    messageHe,
  };
}

/**
 * הכסף מתוך הכנסת הקיץ ששייך לחודשים שאחרי הנוכחי, ולכן **אינו פנוי היום**.
 * זהו הקלט ל-`reservedForFutureMonthsAgorot` ב-`core/safeToSpend.ts`.
 *
 * ⚠️ בשימוש במנגנון הזה יש להעביר `goalContributionAgorot: 0` ל-safeToSpend —
 * כסף היעד כבר נעול בתוך הסכום המוחזר כאן, וניכוי כפול היה מקטין את
 * "בטוח להוציא" פעמיים על אותו שקל.
 *
 * @param monthsElapsed כמה חודשים מתוך התקופה כבר נוצלו (0 = החודש הראשון).
 */
export function reservedForFutureMonths(
  allocation: SeasonalAllocation,
  monthsElapsed: number,
): Agorot {
  const monthsLeft = Math.max(0, allocation.monthsToCover - monthsElapsed - 1);
  return allocation.monthlyAllowanceAgorot * monthsLeft + allocation.goalTotalAgorot;
}

/** האינווריאנטה שמוודאת שלא נעלמו או נוצרו אגורות בחלוקה. */
export function allocationTotal(allocation: SeasonalAllocation): Agorot {
  return sumA([
    allocation.safetyBufferAgorot,
    allocation.essentialTotalAgorot,
    allocation.funFloorTotalAgorot,
    allocation.goalReserveAgorot,
    allocation.plannedPurchasesAgorot,
    allocation.remainderAgorot,
  ]);
}
