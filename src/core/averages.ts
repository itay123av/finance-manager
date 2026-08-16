/**
 * ממוצעים חודשיים.
 *
 * שתי החלטות שקובעות את איכות כל מה שנבנה מעליהן:
 *
 * 1. **חציון, לא ממוצע** (מ-3 חודשים ומעלה). רכישה חד-פעמית של ₪380 מזיזה
 *    ממוצע של 6 חודשים ב-₪63 לחודש — ומעוותת כל תקציב שנגזר ממנו.
 *
 * 2. **חודש בלי עסקאות כלל אינו נספר.** הוא מטופל כנתון חסר ולא כחודש
 *    שבו לא הוצאתי כלום. ההנחה ההפוכה הייתה גורמת לכל חודש שלא תיעדתי
 *    להוריד את הממוצע ולתת לי תקציב גדול משמגיע לי.
 *
 *    לעומת זאת, חודש שיש בו הוצאות ואין בו הכנסה **כן נספר**, וההכנסה בו
 *    היא 0 — וזה בדיוק המצב הרגיל שלי ברוב חודשי השנה.
 */

import { confidenceFromMonths } from './confidence';
import {
  daysInMonth,
  dayOfMonth,
  isSummerMonth,
  monthEnd,
  monthOf,
  monthStart,
} from './dates';
import { median, mean, maxOf, minOf } from './stats';
import { expenseInCategory, periodSummary, spentSoFarThisMonth } from './periods';
import type { Agorot, Confidence, ISODate, ISOMonth, Transaction, UUID } from './types';

/** ברירת מחדל: מסתכלים על עד 6 החודשים המלאים האחרונים. */
export const DEFAULT_LOOKBACK_MONTHS = 6;

export interface MonthlyValue {
  month: ISOMonth;
  agorot: Agorot;
}

export interface MonthlyAverage {
  /** `null` כאשר אין נתונים כלל — הממשק לא יציג מספר במקרה כזה. */
  agorot: Agorot | null;
  confidence: Confidence;
  monthsUsed: number;
  method: 'median' | 'mean' | 'none';
  values: MonthlyValue[];
  rangeAgorot: { minAgorot: Agorot; maxAgorot: Agorot } | null;
}

export interface AverageOptions {
  lookbackMonths?: number;
  /** להחריג את יולי ואוגוסט — לחישוב "חודש רגיל" בנפרד מחודשי העבודה. */
  excludeSummer?: boolean;
}

/**
 * החודשים המלאים שיש עליהם נתונים, ממוינים מהמוקדם למאוחר.
 * החודש הנוכחי מוחרג תמיד — הוא חלקי ולכן יטה כל ממוצע כלפי מטה.
 */
export function completeMonths(
  transactions: readonly Transaction[],
  today: ISODate,
): ISOMonth[] {
  const currentMonth = monthOf(today);
  const months = new Set<ISOMonth>();
  for (const t of transactions) {
    if (t.status !== 'actual' || t.kind !== 'normal') continue;
    const m = monthOf(t.date);
    if (m < currentMonth) months.add(m);
  }
  return [...months].sort();
}

function selectMonths(
  transactions: readonly Transaction[],
  today: ISODate,
  options: AverageOptions,
): ISOMonth[] {
  const { lookbackMonths = DEFAULT_LOOKBACK_MONTHS, excludeSummer = false } = options;
  let months = completeMonths(transactions, today);
  if (excludeSummer) months = months.filter((m) => !isSummerMonth(m));
  return months.slice(-lookbackMonths);
}

function buildAverage(values: MonthlyValue[]): MonthlyAverage {
  const amounts = values.map((v) => v.agorot);

  if (values.length === 0) {
    return { agorot: null, confidence: 'none', monthsUsed: 0, method: 'none', values, rangeAgorot: null };
  }

  // עד חודשיים אין משמעות לחציון — נופלים לממוצע ומסמנים ביטחון נמוך.
  const method: 'median' | 'mean' = values.length >= 3 ? 'median' : 'mean';
  const raw = method === 'median' ? median(amounts) : mean(amounts);

  return {
    agorot: Math.round(raw),
    confidence: confidenceFromMonths(values.length),
    monthsUsed: values.length,
    method,
    values,
    rangeAgorot: { minAgorot: minOf(amounts), maxAgorot: maxOf(amounts) },
  };
}

type MonthMetric = 'income' | 'expense' | 'net';

function monthlyValues(
  transactions: readonly Transaction[],
  months: readonly ISOMonth[],
  metric: MonthMetric,
): MonthlyValue[] {
  return months.map((month) => {
    const s = periodSummary(transactions, monthStart(month), monthEnd(month));
    const agorot =
      metric === 'income' ? s.incomeAgorot : metric === 'expense' ? s.expenseAgorot : s.netAgorot;
    return { month, agorot };
  });
}

export function monthlyExpenseAverage(
  transactions: readonly Transaction[],
  today: ISODate,
  options: AverageOptions = {},
): MonthlyAverage {
  const months = selectMonths(transactions, today, options);
  return buildAverage(monthlyValues(transactions, months, 'expense'));
}

export function monthlyIncomeAverage(
  transactions: readonly Transaction[],
  today: ISODate,
  options: AverageOptions = {},
): MonthlyAverage {
  const months = selectMonths(transactions, today, options);
  return buildAverage(monthlyValues(transactions, months, 'income'));
}

/**
 * שינוי נטו חודשי ממוצע. זהו הקלט המרכזי לסימולטור היעד.
 * עבור הסימולטור קוראים לו עם `excludeSummer: true` — ההכנסה העונתית
 * מטופלת בנפרד, אחרת חודשי הקיץ היו מנפחים את כל חודשי השנה.
 */
export function monthlyNetAverage(
  transactions: readonly Transaction[],
  today: ISODate,
  options: AverageOptions = {},
): MonthlyAverage {
  const months = selectMonths(transactions, today, options);
  return buildAverage(monthlyValues(transactions, months, 'net'));
}

export function categoryMonthlyAverage(
  transactions: readonly Transaction[],
  categoryId: UUID,
  today: ISODate,
  options: AverageOptions = {},
): MonthlyAverage {
  const months = selectMonths(transactions, today, options);
  const values = months.map((month) => ({
    month,
    agorot: expenseInCategory(transactions, categoryId, monthStart(month), monthEnd(month)),
  }));
  return buildAverage(values);
}

export interface RunRate {
  spentSoFarAgorot: Agorot;
  projectedMonthTotalAgorot: Agorot;
  dayOfMonth: number;
  daysInMonth: number;
}

/**
 * הקצב בחודש הנוכחי, מוקרן לחודש מלא.
 * "הוצאת ₪180 ב-6 ימים" → בקצב הזה החודש ייגמר ב-₪930.
 */
export function runRateThisMonth(
  transactions: readonly Transaction[],
  today: ISODate,
): RunRate {
  const spentSoFarAgorot = spentSoFarThisMonth(transactions, today);
  const day = dayOfMonth(today);
  const total = daysInMonth(today);
  return {
    spentSoFarAgorot,
    projectedMonthTotalAgorot: Math.round((spentSoFarAgorot / day) * total),
    dayOfMonth: day,
    daysInMonth: total,
  };
}
