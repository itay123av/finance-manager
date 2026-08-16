/**
 * רמות ביטחון.
 *
 * העיקרון: עדיף לומר "אין מספיק נתונים" מאשר להציג מספר שנראה מדויק ואינו.
 * למי שכל ההכנסה שלו מרוכזת בקיץ, תחזית ל-12 חודשים היא תרחיש ולא חיזוי,
 * ולכן היא לעולם לא תוצג ברמת ביטחון גבוהה — גם אם יש שנתיים של היסטוריה.
 */

import type { Confidence } from './types';

const RANK: Record<Confidence, number> = { none: 0, low: 1, medium: 2, high: 3 };
const BY_RANK: readonly Confidence[] = ['none', 'low', 'medium', 'high'];

export function confidenceRank(c: Confidence): number {
  return RANK[c];
}

/** מחזיר את הנמוכה מבין השתיים. */
export function minConfidence(a: Confidence, b: Confidence): Confidence {
  return BY_RANK[Math.min(RANK[a], RANK[b])] ?? 'none';
}

/**
 * רמת ביטחון לפי כמות החודשים המלאים שיש עליהם נתונים.
 *
 *   0     → none    (הממשק לא יציג מספר כלל)
 *   1–2   → low
 *   3–5   → medium
 *   6+    → high
 */
export function confidenceFromMonths(completeMonths: number): Confidence {
  if (completeMonths <= 0) return 'none';
  if (completeMonths <= 2) return 'low';
  if (completeMonths <= 5) return 'medium';
  return 'high';
}

/**
 * תקרת ביטחון לפי מרחק התחזית.
 * ככל שמסתכלים רחוק יותר, אי-הוודאות גדלה — בלי קשר לכמות הנתונים ההיסטוריים.
 *
 *   ≤ 1 חודש  → ללא תקרה
 *   ≤ 3 חודשים → medium
 *   > 3 חודשים → low
 */
export function horizonCap(horizonMonths: number): Confidence {
  if (horizonMonths <= 1) return 'high';
  if (horizonMonths <= 3) return 'medium';
  return 'low';
}

export interface CappedConfidence {
  confidence: Confidence;
  /** מעל 6 חודשים חובה להציג תווית מפורשת שמדובר בתחזית רחוקה. */
  requiresFarHorizonWarning: boolean;
}

/**
 * משלב ביטחון היסטורי עם תקרת מרחק. נלקחת תמיד הרמה הנמוכה מבין השתיים.
 */
export function capConfidenceByHorizon(
  historical: Confidence,
  horizonMonths: number,
): CappedConfidence {
  return {
    confidence: minConfidence(historical, horizonCap(horizonMonths)),
    requiresFarHorizonWarning: horizonMonths > 6,
  };
}

const LABELS: Record<Confidence, string> = {
  none: 'אין מספיק נתונים',
  low: 'הערכה גסה',
  medium: 'הערכה סבירה',
  high: 'מבוסס על היסטוריה',
};

export function confidenceLabelHe(c: Confidence): string {
  return LABELS[c];
}

const EXPLANATIONS: Record<Confidence, string> = {
  none: 'עדיין לא נאספו מספיק נתונים כדי לחשב את זה. אחרי חודש שימוש המספר יופיע.',
  low: 'מבוסס על חודש-חודשיים בלבד, אז זו הערכה ראשונית שעוד תשתנה.',
  medium: 'מבוסס על כמה חודשים. סביר, אבל עוד עשוי לזוז.',
  high: 'מבוסס על חצי שנה ומעלה של נתונים.',
};

export function confidenceExplanationHe(c: Confidence): string {
  return EXPLANATIONS[c];
}
