/**
 * חלוקת הכנסה גדולה.
 *
 * ⚠️ ה-invariant המרכזי: `sum(allocations) === incomeAmountAgorot`,
 * **בדיוק באגורה**. לא נעלמת אגורה ולא נוצרת אגורה.
 *
 * זה נשמע טריוויאלי, אבל כל חלוקה כאן כרוכה בעיגולים — אחוזים, חלוקה
 * לחודשים, מינימומים. חלוקה שמאבדת אגורה אחת בחודש מאבדת ₪1.20 בשנה,
 * והמשתמש רואה שהמספרים לא מסתדרים ומפסיק להאמין למערכת.
 *
 * ⚠️ סדר העדיפויות מכוון: חובות → ביטחון → מחיה → יעד → הנאה → רכישות.
 * היעד **אינו ראשון**. תוכנית שמעבירה את כל המשכורת ליעד ומשאירה ₪0
 * לעשרה חודשים נזנחת בשבוע השני, וזו תוכנית גרועה יותר מאחת שמקדמת
 * לאט אבל שורדת.
 */

import { clampMin0 } from './money';
import type { Agorot } from './types';

export type AllocationPlanId = 'conservative' | 'balanced' | 'flexible';

export type AllocationBucket =
  | 'commitments'
  | 'safetyBuffer'
  | 'essentials'
  | 'goal'
  | 'fun'
  | 'plannedPurchases'
  | 'leftover';

export interface AllocationLine {
  bucket: AllocationBucket;
  labelHe: string;
  amountAgorot: Agorot;
  /** הסבר קצר למה הסכום הזה. */
  reasonHe: string;
  /** לחלוקה חודשית — כמה זה יוצא לחודש. */
  perMonthAgorot?: Agorot;
}

export interface AllocationResult {
  planId: AllocationPlanId;
  incomeAgorot: Agorot;
  lines: AllocationLine[];
  monthsCovered: number;
  /** ההקצבה החודשית הפנויה שנוצרת מהחלוקה. */
  monthlyAllowanceAgorot: Agorot;
  monthlyFunAgorot: Agorot;
  /** תמיד שווה ל-`incomeAgorot`. נבדק ב-invariant. */
  totalAllocatedAgorot: Agorot;
  noteHe: string | null;
}

export interface AllocationInput {
  incomeAgorot: Agorot;
  /** כמה חודשים הכסף צריך להחזיק. */
  monthsToCover: number;
  /** התחייבויות חובה ידועות עד ההכנסה המשמעותית הבאה. */
  commitmentsAgorot: Agorot;
  /** כמה חסר להשלמת סכום הביטחון. */
  bufferShortfallAgorot: Agorot;
  /** הוצאות חיוניות חודשיות. */
  essentialMonthlyAgorot: Agorot;
  /** הוצאות הנאה חודשיות אופייניות. */
  typicalFunMonthlyAgorot: Agorot;
  /** כמה חסר ליעד. */
  goalGapAgorot: Agorot;
  plannedPurchasesAgorot: Agorot;
}

/** כמה מהעודף הולך ליעד, לפי מסלול. */
const GOAL_SHARE: Record<AllocationPlanId, number> = {
  conservative: 0.7,
  balanced: 0.4,
  flexible: 0.2,
};

/** מינימום הנאה לחודש — תוכנית בלי זה אינה בת-קיימא. */
const MIN_FUN_PER_MONTH: Agorot = 4_000; // ₪40

/**
 * לוקח מהיתרה הזמינה עד לסכום המבוקש, ומעדכן את מה שנשאר.
 * מחזיר את מה שהוקצה בפועל.
 */
function take(available: { value: Agorot }, wanted: Agorot): Agorot {
  const taken = Math.max(0, Math.min(available.value, wanted));
  available.value -= taken;
  return taken;
}

export function allocateIncome(
  planId: AllocationPlanId,
  input: AllocationInput,
): AllocationResult {
  const months = Math.max(1, input.monthsToCover);
  const remaining = { value: input.incomeAgorot };
  const lines: AllocationLine[] = [];

  const push = (
    bucket: AllocationBucket,
    labelHe: string,
    amountAgorot: Agorot,
    reasonHe: string,
    perMonthAgorot?: Agorot,
  ) => {
    if (amountAgorot <= 0) return;
    lines.push({
      bucket,
      labelHe,
      amountAgorot,
      reasonHe,
      ...(perMonthAgorot !== undefined ? { perMonthAgorot } : {}),
    });
  };

  // 1. התחייבויות חובה — לפני הכל
  push(
    'commitments',
    'התחייבויות שכבר קיימות',
    take(remaining, input.commitmentsAgorot),
    'תשלומים שכבר התחייבת אליהם עד ההכנסה הבאה.',
  );

  // 2. השלמת סכום הביטחון
  push(
    'safetyBuffer',
    'השלמת סכום הביטחון',
    take(remaining, input.bufferShortfallAgorot),
    'הכרית שלא נוגעים בה, למקרה של הפתעה.',
  );

  // 3. מחיה חיונית לתקופה
  const essentialsWanted = input.essentialMonthlyAgorot * months;
  const essentials = take(remaining, essentialsWanted);
  push(
    'essentials',
    'הוצאות חיוניות',
    essentials,
    `תחבורה, טלפון וכדומה — ל-${months} חודשים.`,
    Math.floor(essentials / months),
  );

  // 4. מינימום הנאה — לפני היעד, כדי שהתוכנית תשרוד
  const funWanted = Math.max(MIN_FUN_PER_MONTH, input.typicalFunMonthlyAgorot) * months;
  const funFloor = take(remaining, funWanted);

  // 5. היעד — מהעודף שנשאר, לפי המסלול
  const goalWanted = Math.min(input.goalGapAgorot, Math.round(remaining.value * GOAL_SHARE[planId]));
  push(
    'goal',
    'ליעד ₪5,000',
    take(remaining, goalWanted),
    planId === 'conservative'
      ? 'רוב העודף הולך ליעד — מגיעים מהר יותר.'
      : planId === 'balanced'
        ? 'חלק מהעודף ליעד, וחלק נשאר זמין.'
        : 'קצת ליעד, רוב הכסף נשאר זמין לשימוש.',
  );

  // 6. רכישות מתוכננות
  push(
    'plannedPurchases',
    'רכישות מתוכננות',
    take(remaining, input.plannedPurchasesAgorot),
    'דברים שכבר תכננת לקנות.',
  );

  // 7. כל מה שנשאר מצטרף להנאה ולשימוש חופשי
  const leftover = remaining.value;
  remaining.value = 0;

  const funTotal = funFloor + leftover;
  push(
    'fun',
    'בילויים וכיף',
    funTotal,
    leftover > 0
      ? 'מינימום ההנאה, ועוד כל מה שנשאר אחרי שאר החלוקה.'
      : 'מינימום שמאפשר לתוכנית לשרוד לאורך זמן.',
    Math.floor(funTotal / months),
  );

  // ── ⭐ ה-invariant מובטח במבנה, לא בתיקון בדיעבד ────────────────────
  //
  // `take` מחסיר מהיתרה בדיוק את מה שהוא מקצה, וכל מה שנשאר בסוף
  // מועבר במלואו להנאה. לכן סכום השורות שווה להכנסה תמיד — בלי צורך
  // ב"תיקון סחיפה" שמפזר אגורות אבודות.
  //
  // תיקון כזה היה גם קוד מת (הוא לעולם לא היה נכנס לפעולה) וגם מסתיר
  // באג עתידי: אם מישהו יוסיף שורה עם עיגול, עדיף שהבדיקה תיפול מאשר
  // שהתיקון יבלע את ההפרש בשקט.
  const finalTotal = lines.reduce((sum, line) => sum + line.amountAgorot, 0);
  const monthlySpendable = Math.floor((essentials + funTotal) / months);

  return {
    planId,
    incomeAgorot: input.incomeAgorot,
    lines,
    monthsCovered: months,
    monthlyAllowanceAgorot: monthlySpendable,
    monthlyFunAgorot: Math.floor(funTotal / months),
    totalAllocatedAgorot: finalTotal,
    noteHe:
      input.incomeAgorot < input.commitmentsAgorot + input.bufferShortfallAgorot
        ? `הסכום הזה מכסה את ההתחייבויות אבל לא מספיק כדי לפרוס על ${months} חודשים.`
        : null,
  };
}

/** שלושת המסלולים להשוואה. */
export function allocationOptions(input: AllocationInput): AllocationResult[] {
  return (['conservative', 'balanced', 'flexible'] as AllocationPlanId[]).map((planId) =>
    allocateIncome(planId, input),
  );
}

/**
 * חלוקת סכום בין חודשים, עם שארית דטרמיניסטית.
 *
 * ⚠️ השארית נכנסת ל**חודש הראשון** בכוונה: הכסף כבר נמצא בחשבון, ועדיף
 * שיהיה זמין מוקדם מאשר להיתקע בחודש האחרון. הבחירה קבועה כדי שאותם
 * קלטים יחזירו תמיד אותה חלוקה.
 */
export function splitAcrossMonths(totalAgorot: Agorot, months: number): Agorot[] {
  if (months <= 0) return [];
  const base = Math.floor(totalAgorot / months);
  const remainder = totalAgorot - base * months;
  return Array.from({ length: months }, (_, index) =>
    index === 0 ? base + remainder : base,
  );
}

/** בדיקת ה-invariant — לשימוש בבדיקות וב-runtime. */
export function allocationIsBalanced(result: AllocationResult): boolean {
  return result.totalAllocatedAgorot === result.incomeAgorot;
}

/** כמה חסר להשלמת סכום הביטחון. */
export function bufferShortfall(
  currentBalanceAgorot: Agorot,
  safetyBufferAgorot: Agorot,
): Agorot {
  return clampMin0(safetyBufferAgorot - currentBalanceAgorot);
}
