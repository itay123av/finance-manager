/**
 * אריתמטיקה של כסף.
 *
 * כל סכום הוא מספר שלם של אגורות. אין ולא יהיה חישוב כספי ב-float:
 * ‎0.1 + 0.2 !== 0.3 ב-JavaScript, וזה שגוי בהקשר של כסף.
 *
 * כל פעולה כאן מובטחת להחזיר מספר שלם.
 */

import type { Agorot } from './types';

/** מוודא שהערך הוא סכום תקין באגורות. זורק אם לא. */
export function assertAgorot(value: number, label = 'סכום'): asserts value is Agorot {
  if (!Number.isFinite(value)) throw new Error(`${label} חייב להיות מספר סופי, התקבל: ${value}`);
  if (!Number.isInteger(value)) throw new Error(`${label} חייב להיות מספר שלם של אגורות, התקבל: ${value}`);
}

/** ממיר שקלים (עשרוני) לאגורות (שלם). ‎12.34 → 1234 */
export function fromShekels(shekels: number): Agorot {
  if (!Number.isFinite(shekels)) throw new Error(`סכום לא תקין: ${shekels}`);
  // כפל ב-100 על float עלול לתת 1233.9999 — העיגול הוא חלק מהנכונות, לא קישוט.
  return Math.round(shekels * 100);
}

/** ממיר אגורות לשקלים (עשרוני). לתצוגה וייצוא בלבד — לא לחישוב. */
export function toShekels(agorot: Agorot): number {
  return agorot / 100;
}

export function sumA(values: readonly Agorot[]): Agorot {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** כפל בגורם עשרוני, עם עיגול לאגורה השלמה הקרובה. */
export function mulA(amount: Agorot, factor: number): Agorot {
  if (!Number.isFinite(factor)) throw new Error(`גורם כפל לא תקין: ${factor}`);
  return Math.round(amount * factor);
}

/** חלוקה במספר, עם עיגול לאגורה השלמה הקרובה. */
export function divA(amount: Agorot, divisor: number): Agorot {
  if (!Number.isFinite(divisor) || divisor === 0) throw new Error(`מחלק לא תקין: ${divisor}`);
  return Math.round(amount / divisor);
}

/** אחוז מסכום. `pctA(10000, 25)` → 2500 */
export function pctA(amount: Agorot, percent: number): Agorot {
  return mulA(amount, percent / 100);
}

/**
 * לא מאפשר לרדת מתחת לאפס. שימושי לסכומים שאין להם משמעות שלילית.
 *
 * ⚠️ `+ 0` בסוף אינו מיותר: הוא מנרמל ‎-0 ל-‎+0. בלעדיו,
 * `clampMin0(-0)` היה מחזיר ‎-0 (כי `-0 < 0` הוא false), והערך הזה
 * זולג להשוואות `Object.is` ולתצוגה כ-"‎-₪0".
 */
export function clampMin0(amount: Agorot): Agorot {
  return (amount < 0 ? 0 : amount) + 0;
}

export function maxA(a: Agorot, b: Agorot): Agorot {
  return a > b ? a : b;
}

export function minA(a: Agorot, b: Agorot): Agorot {
  return a < b ? a : b;
}

/**
 * מחלק סכום ל-n חלקים שווים ככל האפשר.
 * **הסכום של החלקים תמיד שווה בדיוק לסכום המקורי** — השארית מתחלקת
 * אגורה-אגורה מהחלק הראשון והלאה, כדי שלא ייעלמו אגורות בחלוקה.
 *
 * `splitEvenly(1000, 3)` → `[334, 333, 333]`
 */
export function splitEvenly(total: Agorot, parts: number): Agorot[] {
  if (!Number.isInteger(parts) || parts <= 0) throw new Error(`מספר חלקים לא תקין: ${parts}`);
  const base = Math.trunc(total / parts);
  const result: Agorot[] = new Array<Agorot>(parts).fill(base);
  let remainder = total - base * parts;
  const step = remainder >= 0 ? 1 : -1;
  for (let i = 0; remainder !== 0; i++, remainder -= step) {
    result[i % parts] = (result[i % parts] ?? 0) + step;
  }
  return result;
}

/** מוסיף מפרידי אלפים. דטרמיניסטי ולא תלוי ב-locale. */
function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface FormatMoneyOptions {
  /** האם להציג אגורות. ברירת המחדל: לא — עיגול לשקל שלם. */
  showAgorot?: boolean;
  /** להוסיף סימן ‎+‎ לסכומים חיוביים (שימושי לשינוי נטו). */
  signed?: boolean;
}

/**
 * מעצב סכום לתצוגה: ‎`₪1,234`‎ או ‎`₪1,234.50`‎.
 *
 * מוגדר ידנית ולא דרך `Intl` כדי שהפלט יהיה זהה בכל סביבה — כולל בבדיקות.
 * בממשק יש לעטוף במיכל עם `dir="ltr"` כדי שהמספר לא יתהפך בתוך טקסט בעברית.
 */
export function formatILS(amount: Agorot, options: FormatMoneyOptions = {}): string {
  const { showAgorot = false, signed = false } = options;
  const negative = amount < 0;
  const abs = Math.abs(amount);

  let body: string;
  if (showAgorot) {
    body = `${groupThousands(Math.trunc(abs / 100))}.${String(abs % 100).padStart(2, '0')}`;
  } else {
    body = groupThousands(Math.round(abs / 100));
  }

  const sign = negative ? '-' : signed && amount > 0 ? '+' : '';
  return `${sign}₪${body}`;
}

/** מעגל סכום לשקל שלם. שימושי להצגת יעדים ותקציבים עגולים. */
export function roundToShekel(amount: Agorot): Agorot {
  return Math.round(amount / 100) * 100;
}

/**
 * מעגל רכיבים לשקלים שלמים כך שהם **מסתכמים בדיוק** לסך המעוגל.
 *
 * ⚠️ למה זה נחוץ.
 *
 * עיגול כל רכיב בנפרד יוצר סתירה על המסך: ₪194.58 + ₪464.88 = ₪659.46,
 * אבל בתצוגה זה נראה 195 + 465 = 660 מול "סה״כ ₪659". החישוב מדויק
 * לאגורה, אבל המשתמש רואה מספרים שלא מסתדרים — ומאבד אמון גם בשאר.
 *
 * השיטה היא "השארית הגדולה": מעגלים הכל כלפי מטה ומחלקים את ההפרש
 * לרכיבים עם השארית הגדולה ביותר. דטרמיניסטי — אותם קלטים תמיד
 * מחזירים אותה תוצאה.
 */
export function apportionForDisplay(parts: readonly Agorot[]): Agorot[] {
  if (parts.length === 0) return [];

  const total = parts.reduce((sum, part) => sum + part, 0);
  const targetShekels = Math.round(total / 100);

  const floors = parts.map((part) => Math.floor(part / 100));
  const assigned = floors.reduce((sum, value) => sum + value, 0);
  let remaining = targetShekels - assigned;

  // מי הכי "מגיע לו" עיגול כלפי מעלה
  const order = parts
    .map((part, index) => ({ index, remainder: part - Math.floor(part / 100) * 100 }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  const result = [...floors];
  const step = remaining >= 0 ? 1 : -1;
  let cursor = 0;
  while (remaining !== 0 && cursor < order.length * 2) {
    const target = order[cursor % order.length]!.index;
    result[target] = result[target]! + step;
    remaining -= step;
    cursor++;
  }

  return result.map((shekels) => shekels * 100);
}
