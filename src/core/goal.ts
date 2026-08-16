/**
 * יעד ה-₪5,000 — התקדמות, תאריך משוער, וחלופות כשהיעד לא ריאלי.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  למה סימולטור חודש-אחר-חודש ולא `פער ÷ ממוצע חודשי`
 * ═══════════════════════════════════════════════════════════════════════
 *  החלוקה הפשוטה שגויה לחלוטין למי שכל ההכנסה שלו בקיץ.
 *  דוגמה: פער ₪3,760, נטו חודשי רגיל ‎−₪150, הכנסת קיץ ₪4,000.
 *   • חילוק פשוט על הממוצע השנתי (‎+₪183) → "20 חודשים" — מספר חסר משמעות.
 *   • סימולטור → נשארים במינוס עד יולי, ואז קופצים מעל היעד בבת אחת.
 *  רק השני מתאר את המציאות.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * כשהיעד לא ניתן להשגה — אין הודעה מפחידה. יש רשימת חלופות מחושבות,
 * כל אחת עם המספר שלה.
 */

import { capConfidenceByHorizon } from './confidence';
import {
  addMonthsToMonth,
  formatMonthHe,
  isSummerMonth,
  monthEnd,
  monthOf,
  monthsBetween,
} from './dates';
import { clampMin0, divA, formatILS } from './money';
import { clamp } from './stats';
import type { Agorot, Confidence, FinancialGoal, ISODate, ISOMonth } from './types';

export const DEFAULT_MAX_SIMULATION_MONTHS = 60;

// ---------------------------------------------------------------------------
// התקדמות
// ---------------------------------------------------------------------------

export interface MilestoneProgress {
  amountAgorot: Agorot;
  reached: boolean;
  progressPct: number;
}

export interface GoalProgress {
  targetAgorot: Agorot;
  currentAgorot: Agorot;
  gapAgorot: Agorot;
  /** 0–100. מבוסס על היתרה מול היעד. */
  progressPct: number;
  /** כמה עליתי מאז שהתחלתי לעקוב — מעודד גם כשהיעד עוד רחוק. */
  sinceStartAgorot: Agorot;
  isAchieved: boolean;
  milestones: MilestoneProgress[];
  nextMilestone: MilestoneProgress | null;
  messageHe: string;
}

export function goalProgress(goal: FinancialGoal, currentBalanceAgorot: Agorot): GoalProgress {
  const gapAgorot = clampMin0(goal.targetAgorot - currentBalanceAgorot);
  const progressPct =
    goal.targetAgorot <= 0
      ? 100
      : Math.round(clamp((currentBalanceAgorot / goal.targetAgorot) * 100, 0, 100) * 10) / 10;

  const milestones: MilestoneProgress[] = [...goal.milestones]
    .sort((a, b) => a - b)
    .map((amountAgorot) => ({
      amountAgorot,
      reached: currentBalanceAgorot >= amountAgorot,
      progressPct:
        amountAgorot <= 0
          ? 100
          : Math.round(clamp((currentBalanceAgorot / amountAgorot) * 100, 0, 100) * 10) / 10,
    }));

  const nextMilestone = milestones.find((m) => !m.reached) ?? null;
  const isAchieved = currentBalanceAgorot >= goal.targetAgorot;
  const sinceStartAgorot = currentBalanceAgorot - goal.startingBalanceAgorot;

  let messageHe: string;
  if (isAchieved) {
    messageHe = `הגעת ליעד. מכאן העניין הוא לשמור על היתרה מעל ${formatILS(goal.minimumAfterReachedAgorot)}.`;
  } else if (nextMilestone) {
    messageHe = `היעד הקרוב: ${formatILS(nextMilestone.amountAgorot)} — נשארו ${formatILS(nextMilestone.amountAgorot - currentBalanceAgorot)}.`;
  } else {
    messageHe = `נשארו ${formatILS(gapAgorot)} עד היעד.`;
  }

  if (sinceStartAgorot > 0 && !isAchieved) {
    messageHe += ` מאז שהתחלת עלית ב-${formatILS(sinceStartAgorot)}.`;
  }

  return {
    targetAgorot: goal.targetAgorot,
    currentAgorot: currentBalanceAgorot,
    gapAgorot,
    progressPct,
    sinceStartAgorot,
    isAchieved,
    milestones,
    nextMilestone,
    messageHe,
  };
}

// ---------------------------------------------------------------------------
// סימולטור
// ---------------------------------------------------------------------------

export interface GoalSimulationInput {
  today: ISODate;
  currentBalanceAgorot: Agorot;
  targetAgorot: Agorot;
  /** נטו חודשי בחודש רגיל (לא קיץ). עשוי להיות שלילי. */
  regularMonthlyNetAgorot: Agorot;
  /**
   * ההכנסה נטו מעבודת הקיץ, **בנוסף** לדפוס החודשי הרגיל.
   * מתחלקת שווה בין יולי לאוגוסט.
   *
   * ⚠️ תוספת ולא החלפה: גם ביולי ממשיכים להיות חיי יומיום והוצאות.
   * אילו הייתה מחליפה את הנטו הרגיל, משתמש שלא הזין הכנסת קיץ היה מקבל
   * יולי ואוגוסט כחודשים שבהם לא נכנס ולא יצא שקל — תיאור שגוי של המציאות.
   */
  summerTotalNetAgorot: Agorot;
  /** רמת הביטחון של הנתונים ההיסטוריים. */
  historicalConfidence: Confidence;
  maxMonths?: number;
}

export interface GoalPathPoint {
  month: ISOMonth;
  balanceAgorot: Agorot;
  isSummer: boolean;
}

export interface GoalProjection {
  /** `null` = לא מגיעים ליעד בטווח הסימולציה בקצב הנוכחי. */
  monthsToGoal: number | null;
  reachMonth: ISOMonth | null;
  reachDate: ISODate | null;
  path: GoalPathPoint[];
  confidence: Confidence;
  requiresFarHorizonWarning: boolean;
  assumptions: {
    regularMonthlyNetAgorot: Agorot;
    /** התוספת החודשית בכל אחד מחודשי הקיץ, מעל הנטו הרגיל. */
    summerMonthlyBonusAgorot: Agorot;
    startingBalanceAgorot: Agorot;
    /** הסימולציה סופרת חודשים מלאים מהחודש הבא — מעגלת כלפי מעלה, לא מטה. */
    countsFullMonthsFromNextMonth: true;
  };
  messageHe: string;
}

/**
 * מתקדם חודש-חודש עד שהיתרה עוברת את היעד.
 *
 * הספירה מתחילה מהחודש הבא ולא מהחודש הנוכחי, שהוא חלקי.
 * זו הטיה מכוונת לכיוון הזהיר: עדיף לומר "מרץ" ולהגיע בפברואר,
 * מאשר לומר "פברואר" ולאכזב.
 */
export function projectGoal(input: GoalSimulationInput): GoalProjection {
  const {
    today,
    currentBalanceAgorot,
    targetAgorot,
    regularMonthlyNetAgorot,
    summerTotalNetAgorot,
    historicalConfidence,
    maxMonths = DEFAULT_MAX_SIMULATION_MONTHS,
  } = input;

  const summerMonthlyBonusAgorot = divA(summerTotalNetAgorot, 2);
  const startMonth = monthOf(today);
  const path: GoalPathPoint[] = [];

  let balance = currentBalanceAgorot;
  let monthsToGoal: number | null = null;

  if (balance >= targetAgorot) {
    monthsToGoal = 0;
  } else {
    for (let i = 1; i <= maxMonths; i++) {
      const month = addMonthsToMonth(startMonth, i);
      const summer = isSummerMonth(month);
      // הבונוס העונתי מתווסף לנטו הרגיל, לא מחליף אותו.
      balance += regularMonthlyNetAgorot + (summer ? summerMonthlyBonusAgorot : 0);
      path.push({ month, balanceAgorot: balance, isSummer: summer });
      if (balance >= targetAgorot) {
        monthsToGoal = i;
        break;
      }
    }
  }

  const reachMonth = monthsToGoal === null ? null : addMonthsToMonth(startMonth, monthsToGoal);
  const capped = capConfidenceByHorizon(historicalConfidence, monthsToGoal ?? maxMonths);

  const messageHe =
    monthsToGoal === null
      ? 'בקצב הנוכחי לא מגיעים ליעד. יש כמה דרכים לשנות את זה — ראה את החלופות למטה.'
      : monthsToGoal === 0
        ? 'כבר הגעת ליעד.'
        : `לפי הקצב הנוכחי, היעד צפוי בסביבות ${formatMonthHe(reachMonth ?? startMonth)}. זו תחזית, לא הבטחה.`;

  return {
    monthsToGoal,
    reachMonth,
    reachDate: reachMonth === null ? null : monthEnd(reachMonth),
    path,
    confidence: capped.confidence,
    requiresFarHorizonWarning: capped.requiresFarHorizonWarning,
    assumptions: {
      regularMonthlyNetAgorot,
      summerMonthlyBonusAgorot,
      startingBalanceAgorot: currentBalanceAgorot,
      countsFullMonthsFromNextMonth: true,
    },
    messageHe,
  };
}

// ---------------------------------------------------------------------------
// חלופות — מוצגות כשהיעד לא ריאלי, בלי לגעור ובלי להפחיד
// ---------------------------------------------------------------------------

export type GoalAlternativeId =
  | 'extend_target_date'
  | 'reduce_monthly_spending'
  | 'intermediate_milestones'
  | 'save_more_of_summer'
  | 'add_income';

export interface GoalAlternative {
  id: GoalAlternativeId;
  titleHe: string;
  detailHe: string;
  /** הסכום החודשי שצריך לשנות, אם רלוונטי. */
  monthlyDeltaAgorot?: Agorot;
}

export interface GoalAlternativesInput extends GoalSimulationInput {
  /** תאריך היעד הרצוי, אם הוגדר. */
  targetDate?: ISODate;
  /** הקטגוריה הגדולה ביותר שניתן לצמצם — לניסוח ההצעה. */
  largestReducibleCategoryName?: string;
}

/**
 * כמה נטו חודשי רגיל דרוש כדי להגיע ליעד עד תאריך מסוים.
 * מחזיר `null` אם אין חודשים רגילים בטווח (למשל טווח של חודשיים בקיץ).
 */
export function requiredRegularNetForDate(input: GoalAlternativesInput): Agorot | null {
  if (!input.targetDate) return null;

  const startMonth = monthOf(input.today);
  const endMonth = monthOf(input.targetDate);
  const totalMonths = monthsBetween(startMonth, endMonth);
  if (totalMonths <= 0) return null;

  let summerCount = 0;
  for (let i = 1; i <= totalMonths; i++) {
    if (isSummerMonth(addMonthsToMonth(startMonth, i))) summerCount++;
  }

  // כל חודש תורם את הנטו הרגיל; חודשי הקיץ תורמים בנוסף את הבונוס.
  //   gap = totalMonths × x + summerCount × bonus
  const gap = input.targetAgorot - input.currentBalanceAgorot;
  const fromSummerBonus = divA(input.summerTotalNetAgorot, 2) * summerCount;
  return Math.round((gap - fromSummerBonus) / totalMonths);
}

export function goalAlternatives(input: GoalAlternativesInput): GoalAlternative[] {
  const alternatives: GoalAlternative[] = [];
  const gap = clampMin0(input.targetAgorot - input.currentBalanceAgorot);
  if (gap === 0) return alternatives;

  // ── א׳. להאריך את תאריך היעד לתאריך שכן מתקבל מהנתונים ──────────────
  const relaxed = projectGoal({ ...input, maxMonths: DEFAULT_MAX_SIMULATION_MONTHS });
  if (relaxed.reachMonth) {
    alternatives.push({
      id: 'extend_target_date',
      titleHe: 'להזיז את תאריך היעד',
      detailHe: `בקצב הנוכחי היעד מתקבל בסביבות ${formatMonthHe(relaxed.reachMonth)}. זה עדיין להגיע — רק בלי לחץ מיותר.`,
    });
  }

  // ── ב׳. לצמצם הוצאה חודשית כדי לעמוד בתאריך שנבחר ───────────────────
  const required = requiredRegularNetForDate(input);
  if (required !== null && required > input.regularMonthlyNetAgorot) {
    const delta = required - input.regularMonthlyNetAgorot;
    const where = input.largestReducibleCategoryName
      ? ` הקטגוריה שהכי קל להתחיל ממנה היא ${input.largestReducibleCategoryName}.`
      : '';
    alternatives.push({
      id: 'reduce_monthly_spending',
      titleHe: `לחסוך ${formatILS(delta)} נוספים בחודש`,
      detailHe: `זה מה שדרוש כדי לעמוד בתאריך היעד שבחרת.${where}`,
      monthlyDeltaAgorot: delta,
    });
  }

  // ── ג׳. יעדי ביניים — הופכים מספר רחוק לסדרת ניצחונות קרובים ────────
  alternatives.push({
    id: 'intermediate_milestones',
    titleHe: 'לפרק ליעדי ביניים',
    detailHe: `במקום לכוון ישר ל-${formatILS(input.targetAgorot)}, לסמן ₪1,000, אחר כך ₪2,500, ואז ₪5,000. כל שלב הוא הצלחה בפני עצמה.`,
  });

  // ── ד׳. לשמור נתח גדול יותר מהכנסת הקיץ ─────────────────────────────
  if (input.summerTotalNetAgorot > 0) {
    alternatives.push({
      id: 'save_more_of_summer',
      titleHe: 'לשמור חלק גדול יותר מכסף הקיץ',
      detailHe: `הקיץ הוא רוב ההכנסה השנתית שלך. כל ₪100 נוספים שנשמרים ביולי-אוגוסט מקצרים את הדרך ליעד יותר מכל צמצום חודשי.`,
    });
  } else {
    alternatives.push({
      id: 'add_income',
      titleHe: 'להוסיף הכנסה',
      detailHe: 'גם עבודה מזדמנת קטנה משנה את התמונה כשההוצאות כבר מצומצמות.',
    });
  }

  return alternatives;
}
