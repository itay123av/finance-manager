/**
 * סטטיסטיקה עמידה (robust statistics).
 *
 * למה חציון ולא ממוצע: רכישה גדולה חד-פעמית אחת של ₪380 מזיזה ממוצע של
 * 6 חודשים ב-₪63 לחודש ומעוותת כל תקציב שנגזר ממנו. חציון כמעט לא מושפע.
 * אותו הגיון עומד מאחורי MAD במקום סטיית תקן בזיהוי חריגות.
 */

/** סכום פשוט. מערך ריק → 0. */
export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

/** ממיין עותק — לא משנה את הקלט. */
function sorted(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/**
 * אחוזון בשיטת אינטרפולציה לינארית.
 * `p` בטווח 0–1. מערך ריק → 0.
 */
export function quantile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const s = sorted(values);
  const clamped = Math.min(1, Math.max(0, p));
  const pos = clamped * (s.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  const lo = s[lower] ?? 0;
  if (lower === upper) return lo;
  const hi = s[upper] ?? lo;
  return lo + (hi - lo) * (pos - lower);
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

/** טווח בין-רבעוני — מדד פיזור עמיד לחריגים. */
export function iqr(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return quantile(values, 0.75) - quantile(values, 0.25);
}

/**
 * Median Absolute Deviation — חציון המרחקים מהחציון.
 * זהו הבסיס לזיהוי חריגות שאינו נשבר מדגימה חריגה אחת.
 */
export function mad(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

/**
 * ציון סטייה עמיד. הקבוע ‎0.6745 מכייל את ה-MAD כך שעבור התפלגות נורמלית
 * הציון יהיה בקנה מידה של סטיית תקן, ולכן סף כמו 3.5 שומר על משמעותו המוכרת.
 *
 * מחזיר `null` כאשר אין פיזור כלל (MAD=0 וגם סטיית תקן=0) — במצב כזה
 * לא ניתן לומר דבר על חריגוּת, ועדיף לא לענות מאשר לענות שגוי.
 */
export function robustZScore(value: number, values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const m = median(values);
  const madValue = mad(values);
  if (madValue > 0) return (0.6745 * (value - m)) / madValue;

  // כל הערכים זהים או כמעט — נופלים לסטיית תקן.
  const sd = standardDeviation(values);
  if (sd === 0) return null;
  return (value - mean(values)) / sd;
}

export function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/** מקדם השתנות — פיזור יחסי לגודל. עמיד, מבוסס IQR/חציון. */
export function relativeVolatility(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  if (m === 0) return 0;
  return iqr(values) / Math.abs(m);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function maxOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => (b > a ? b : a), values[0] ?? 0);
}

export function minOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => (b < a ? b : a), values[0] ?? 0);
}
