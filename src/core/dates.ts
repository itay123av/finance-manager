/**
 * תאריכי לוח.
 *
 * תאריך במערכת הוא מחרוזת 'YYYY-MM-DD' — יום בלוח, בלי שעה ובלי אזור זמן.
 * כל האריתמטיקה מתבצעת ב-UTC בשעה 12:00, כדי ששעון קיץ לא יוכל להזיז יום.
 * (‎`new Date(2026, 2, 27) + 1 day` בטיימזון עם DST עלול לתת את אותו יום.)
 *
 * המקום היחיד שבו אזור זמן רלוונטי הוא תרגום רגע ("עכשיו") ליום לוח —
 * `todayInIsrael`.
 */

import type { ISODate, ISOMonth } from './types';

const ISRAEL_TZ = 'Asia/Jerusalem';
const MS_PER_DAY = 86_400_000;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH_RE = /^\d{4}-\d{2}$/;

export const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
] as const;

export const HEBREW_WEEKDAYS = [
  'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת',
] as const;

/** החודשים שבהם מרוכזת ההכנסה העונתית: יולי ואוגוסט. */
export const SUMMER_MONTHS = [7, 8] as const;

// ---------------------------------------------------------------------------
// ולידציה ופירוק
// ---------------------------------------------------------------------------

export function isValidISODate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > daysInMonthOf(y, m)) return false;
  return true;
}

export function isValidISOMonth(value: string): boolean {
  if (!ISO_MONTH_RE.test(value)) return false;
  const m = Number(value.slice(5, 7));
  return m >= 1 && m <= 12;
}

export function parseISODate(date: ISODate): { year: number; month: number; day: number } {
  if (!isValidISODate(date)) throw new Error(`תאריך לא תקין: ${date}`);
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

export function makeISODate(year: number, month: number, day: number): ISODate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

function daysInMonthOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ממיר תאריך לוח ל-Date ב-UTC בצהריים — נקודת עוגן בטוחה לאריתמטיקה. */
function toUtcNoon(date: ISODate): Date {
  const { year, month, day } = parseISODate(date);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function fromUtc(d: Date): ISODate {
  return makeISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

// ---------------------------------------------------------------------------
// "עכשיו" — הנקודה היחידה שתלויה באזור זמן
// ---------------------------------------------------------------------------

/**
 * מתרגם רגע בזמן ליום הלוח שלו בישראל.
 * ב-2026-08-07T00:30 בישראל זה עדיין ה-7 באוגוסט, גם אם ב-UTC כבר עבר/טרם עבר חצות.
 */
export function todayInIsrael(now: Date): ISODate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ISRAEL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// ---------------------------------------------------------------------------
// אריתמטיקה
// ---------------------------------------------------------------------------

export function addDays(date: ISODate, days: number): ISODate {
  return fromUtc(new Date(toUtcNoon(date).getTime() + days * MS_PER_DAY));
}

/**
 * מוסיף חודשים, עם קיטום יום החודש כשצריך.
 * ‎`addMonths('2026-01-31', 1)` → `'2026-02-28'` (ולא 3 במרץ).
 */
export function addMonths(date: ISODate, months: number): ISODate {
  const { year, month, day } = parseISODate(date);
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  const maxDay = daysInMonthOf(targetYear, targetMonth);
  return makeISODate(targetYear, targetMonth, Math.min(day, maxDay));
}

/** מספר הימים מ-`from` ל-`to`. חיובי אם `to` מאוחר יותר. */
export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((toUtcNoon(to).getTime() - toUtcNoon(from).getTime()) / MS_PER_DAY);
}

export function compareDates(a: ISODate, b: ISODate): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** האם `date` נמצא בטווח, כולל שני הקצוות. */
export function isBetween(date: ISODate, from: ISODate, to: ISODate): boolean {
  return date >= from && date <= to;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

// ---------------------------------------------------------------------------
// חודשים
// ---------------------------------------------------------------------------

export function monthOf(date: ISODate): ISOMonth {
  return date.slice(0, 7);
}

export function monthNumber(month: ISOMonth): number {
  return Number(month.slice(5, 7));
}

export function monthStart(dateOrMonth: ISODate | ISOMonth): ISODate {
  return `${dateOrMonth.slice(0, 7)}-01`;
}

export function monthEnd(dateOrMonth: ISODate | ISOMonth): ISODate {
  const year = Number(dateOrMonth.slice(0, 4));
  const month = Number(dateOrMonth.slice(5, 7));
  return makeISODate(year, month, daysInMonthOf(year, month));
}

export function daysInMonth(dateOrMonth: ISODate | ISOMonth): number {
  return daysInMonthOf(Number(dateOrMonth.slice(0, 4)), Number(dateOrMonth.slice(5, 7)));
}

export function dayOfMonth(date: ISODate): number {
  return Number(date.slice(8, 10));
}

/** כמה ימים נותרו בחודש, כולל היום הנוכחי. ב-31 בחודש → 1. */
export function daysLeftInMonth(date: ISODate): number {
  return daysInMonth(date) - dayOfMonth(date) + 1;
}

export function addMonthsToMonth(month: ISOMonth, delta: number): ISOMonth {
  return monthOf(addMonths(monthStart(month), delta));
}

/** מספר החודשים מ-`from` ל-`to`. */
export function monthsBetween(from: ISOMonth, to: ISOMonth): number {
  const fy = Number(from.slice(0, 4));
  const fm = Number(from.slice(5, 7));
  const ty = Number(to.slice(0, 4));
  const tm = Number(to.slice(5, 7));
  return (ty - fy) * 12 + (tm - fm);
}

/** רשימת החודשים בטווח, כולל שני הקצוות. */
export function eachMonth(from: ISOMonth, to: ISOMonth): ISOMonth[] {
  const out: ISOMonth[] = [];
  const count = monthsBetween(from, to);
  for (let i = 0; i <= count; i++) out.push(addMonthsToMonth(from, i));
  return out;
}

/** האם זהו חודש של הכנסה עונתית (יולי/אוגוסט). */
export function isSummerMonth(month: ISOMonth): boolean {
  return (SUMMER_MONTHS as readonly number[]).includes(monthNumber(month));
}

// ---------------------------------------------------------------------------
// שבועות — השבוע מתחיל ביום ראשון, כמקובל בישראל
// ---------------------------------------------------------------------------

/** ‎0 = ראשון … 6 = שבת. */
export function dayOfWeek(date: ISODate): number {
  return toUtcNoon(date).getUTCDay();
}

export function weekStart(date: ISODate): ISODate {
  return addDays(date, -dayOfWeek(date));
}

export function weekEnd(date: ISODate): ISODate {
  return addDays(weekStart(date), 6);
}

// ---------------------------------------------------------------------------
// תצוגה בעברית
// ---------------------------------------------------------------------------

/** פורמט ישראלי: ‎`07/08/2026`. */
export function formatDateHe(date: ISODate): string {
  const { year, month, day } = parseISODate(date);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

/** ‎`'2026-08'` → `'אוגוסט 2026'`. */
export function formatMonthHe(month: ISOMonth): string {
  if (!isValidISOMonth(month)) throw new Error(`חודש לא תקין: ${month}`);
  return `${HEBREW_MONTHS[monthNumber(month) - 1]} ${month.slice(0, 4)}`;
}

export function formatWeekdayHe(date: ISODate): string {
  return HEBREW_WEEKDAYS[dayOfWeek(date)] ?? '';
}
