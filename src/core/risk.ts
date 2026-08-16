/**
 * רמת הסיכון של תקציב — מה הסיכוי שלא אעמוד בו.
 *
 * ארבעה גורמים, כל אחד מהם סיבה אמיתית שתוכניות נשברות:
 *  • כמה צריך לצמצם מול ההרגל — הגורם הכבד ביותר. תקציב שדורש לחתוך 40%
 *    ממה שאני רגיל אליו לא ייכשל בגלל חוסר משמעת אלא בגלל שהוא לא מציאותי.
 *  • תנודתיות ההוצאות — חודש של ₪300 וחודש של ₪900 אומרים שקשה לתכנן.
 *  • תלות בהכנסה לא ודאית — תוכנית שנשענת על כסף שאולי יגיע.
 *  • מיעוט נתונים — עוד לא באמת יודעים מה ההרגלים.
 *
 * הציון לא מוצג למשתמש. מוצגת רמה במילים, **תמיד עם הסיבה העיקרית**.
 */

import { clamp, relativeVolatility } from './stats';
import type { Agorot, RiskLevel } from './types';

/**
 * המשקלים **אינם** מסתכמים ל-1, וזה מכוון: הציון אינו הסתברות אלא סכום
 * תרומות סיכון עצמאיות. אילו היו מסתכמים ל-1, שום גורם בודד לא היה יכול
 * להביא לרמה "גבוהה" בעצמו — ותקציב שדורש לצמצם 60% מההרגל היה מסווג
 * "בינוני" בזמן שהוא כמעט בוודאות לא יחזיק.
 *
 * התקרה של כל גורם משקפת כמה הוא לבדו מסוכן:
 *   צמצום נדרש  0.55 → יכול להגיע לבדו ל"גבוה"
 *   תנודתיות    0.30 → לבדו מגיע ל"בינוני"
 *   הכנסה לא ודאית 0.30 → לבדו מגיע ל"בינוני"
 *   מיעוט נתונים 0.15 → לבדו נשאר "נמוך"
 */
const WEIGHTS = {
  cutRequired: 0.55,
  volatility: 0.3,
  unconfirmedIncome: 0.3,
  thinData: 0.15,
} as const;

/** צמצום של 50% מההרגל נחשב חומרה מקסימלית — מעבר לזה כבר לא משנה. */
const MAX_MEANINGFUL_CUT = 0.5;

export interface RiskInput {
  /** התקציב המוצע לחודש. */
  plannedMonthlySpendAgorot: Agorot;
  /** ההוצאה החודשית האופיינית בפועל (חציון). */
  historicalMonthlySpendAgorot: Agorot;
  /** ההוצאות החודשיות ההיסטוריות — לחישוב תנודתיות. */
  monthlySpendHistory: readonly Agorot[];
  /** חלק ההכנסה המתוכננת שאינו ודאי, 0–1. */
  unconfirmedIncomeShare: number;
  monthsOfData: number;
}

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  /** הגורם התורם ביותר לסיכון — זה מה שמוצג למשתמש. */
  primaryReasonHe: string;
  factors: {
    cutRequired: number;
    volatility: number;
    unconfirmedIncome: number;
    thinData: number;
  };
  summaryHe: string;
}

const REASONS = {
  cutRequired: (pct: number) => `התקציב דורש לצמצם כ-${pct}% ממה שאתה רגיל להוציא`,
  volatility: 'ההוצאות שלך משתנות הרבה מחודש לחודש, וקשה לתכנן סביבן',
  unconfirmedIncome: 'חלק גדול מהתוכנית נשען על הכנסה שעדיין לא בטוחה',
  thinData: 'עדיין אין מספיק חודשים של נתונים כדי לדעת מה באמת ההרגלים שלך',
  none: 'התקציב קרוב למה שאתה כבר עושה בפועל',
} as const;

export function assessRisk(input: RiskInput): RiskAssessment {
  const {
    plannedMonthlySpendAgorot,
    historicalMonthlySpendAgorot,
    monthlySpendHistory,
    unconfirmedIncomeShare,
    monthsOfData,
  } = input;

  const cutRequired =
    historicalMonthlySpendAgorot > 0
      ? clamp(
          (historicalMonthlySpendAgorot - plannedMonthlySpendAgorot) /
            historicalMonthlySpendAgorot,
          0,
          1,
        )
      : 0;

  const volatility = clamp(relativeVolatility(monthlySpendHistory), 0, 1);
  const unconfirmed = clamp(unconfirmedIncomeShare, 0, 1);
  const thinData = monthsOfData < 3 ? 1 : 0;

  const cutSeverity = clamp(cutRequired / MAX_MEANINGFUL_CUT, 0, 1);

  const contributions = {
    cutRequired: WEIGHTS.cutRequired * cutSeverity,
    volatility: WEIGHTS.volatility * volatility,
    unconfirmedIncome: WEIGHTS.unconfirmedIncome * unconfirmed,
    thinData: WEIGHTS.thinData * thinData,
  };

  const score = clamp(
    contributions.cutRequired +
      contributions.volatility +
      contributions.unconfirmedIncome +
      contributions.thinData,
    0,
    1,
  );

  const level: RiskLevel = score < 0.25 ? 'low' : score < 0.55 ? 'medium' : 'high';

  const [topKey, topValue] = Object.entries(contributions).sort((a, b) => b[1] - a[1])[0] as [
    keyof typeof contributions,
    number,
  ];

  const primaryReasonHe =
    topValue <= 0
      ? REASONS.none
      : topKey === 'cutRequired'
        ? REASONS.cutRequired(Math.round(cutRequired * 100))
        : REASONS[topKey];

  const summaryHe =
    level === 'low'
      ? 'סיכוי טוב שתעמוד בזה.'
      : level === 'medium'
        ? 'אפשרי, אבל צריך שים לב.'
        : 'קשה — כדאי לשקול תוכנית מקלה יותר.';

  return {
    level,
    score: Math.round(score * 1000) / 1000,
    primaryReasonHe,
    factors: { cutRequired, volatility, unconfirmedIncome: unconfirmed, thinData },
    summaryHe,
  };
}
