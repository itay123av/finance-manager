/**
 * סיכומי הכנסות והוצאות לתקופה.
 *
 * ⚠️ הבדל מהותי מ-`balance.ts`: כאן **מוחרגות** עסקאות `balance_adjustment`.
 * תיקון התאמה מול הבנק אינו הכנסה ואינו הוצאה — הוא תיקון חשבונאי.
 * אילו נספר, הוא היה מזהם את התשובה לשאלה "כמה הוצאתי החודש" ואת כל
 * הממוצעים, התקציבים והדפוסים שנגזרים ממנה.
 */

import { sumA } from './money';
import { isBetween, monthEnd, monthStart, weekEnd, weekStart } from './dates';
import type { Agorot, Category, ISODate, Transaction, UUID } from './types';

export interface PeriodSummary {
  from: ISODate;
  to: ISODate;
  incomeAgorot: Agorot;
  expenseAgorot: Agorot;
  /** הכנסות פחות הוצאות. שלילי = הוצאת יותר ממה שנכנס. */
  netAgorot: Agorot;
  transactionCount: number;
}

/** עסקאות שנספרות בניתוח התנהגות: בפועל, בטווח, ולא תיקון התאמה. */
export function transactionsInPeriod(
  transactions: readonly Transaction[],
  from: ISODate,
  to: ISODate,
): Transaction[] {
  return transactions.filter(
    (t) => t.status === 'actual' && t.kind === 'normal' && isBetween(t.date, from, to),
  );
}

export function incomeInPeriod(
  transactions: readonly Transaction[],
  from: ISODate,
  to: ISODate,
): Agorot {
  return sumA(
    transactionsInPeriod(transactions, from, to)
      .filter((t) => t.type === 'income')
      .map((t) => t.amountAgorot),
  );
}

export function expenseInPeriod(
  transactions: readonly Transaction[],
  from: ISODate,
  to: ISODate,
): Agorot {
  return sumA(
    transactionsInPeriod(transactions, from, to)
      .filter((t) => t.type === 'expense')
      .map((t) => t.amountAgorot),
  );
}

export function periodSummary(
  transactions: readonly Transaction[],
  from: ISODate,
  to: ISODate,
): PeriodSummary {
  const inPeriod = transactionsInPeriod(transactions, from, to);
  const incomeAgorot = sumA(
    inPeriod.filter((t) => t.type === 'income').map((t) => t.amountAgorot),
  );
  const expenseAgorot = sumA(
    inPeriod.filter((t) => t.type === 'expense').map((t) => t.amountAgorot),
  );
  return {
    from,
    to,
    incomeAgorot,
    expenseAgorot,
    netAgorot: incomeAgorot - expenseAgorot,
    transactionCount: inPeriod.length,
  };
}

export function monthSummary(
  transactions: readonly Transaction[],
  date: ISODate,
): PeriodSummary {
  return periodSummary(transactions, monthStart(date), monthEnd(date));
}

export function weekSummary(transactions: readonly Transaction[], date: ISODate): PeriodSummary {
  return periodSummary(transactions, weekStart(date), weekEnd(date));
}

/** הוצאות מתחילת החודש ועד התאריך הנתון (כולל) — הוצאה בפועל, לא כל החודש. */
export function spentSoFarThisMonth(
  transactions: readonly Transaction[],
  today: ISODate,
): Agorot {
  return expenseInPeriod(transactions, monthStart(today), today);
}

export interface CategoryTotal {
  categoryId: UUID;
  categoryName: string;
  amountAgorot: Agorot;
  transactionCount: number;
  /** חלק מסך ההוצאות בתקופה, באחוזים (0–100). */
  sharePct: number;
}

/** הוצאות לפי קטגוריה, ממוינות מהגדולה לקטנה. */
export function expenseByCategory(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  from: ISODate,
  to: ISODate,
): CategoryTotal[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const totals = new Map<UUID, { amount: Agorot; count: number }>();

  for (const t of transactionsInPeriod(transactions, from, to)) {
    if (t.type !== 'expense') continue;
    const current = totals.get(t.categoryId) ?? { amount: 0, count: 0 };
    current.amount += t.amountAgorot;
    current.count += 1;
    totals.set(t.categoryId, current);
  }

  const grandTotal = sumA([...totals.values()].map((v) => v.amount));

  return [...totals.entries()]
    .map(([categoryId, { amount, count }]) => ({
      categoryId,
      categoryName: nameById.get(categoryId) ?? 'לא ידוע',
      amountAgorot: amount,
      transactionCount: count,
      sharePct: grandTotal === 0 ? 0 : Math.round((amount / grandTotal) * 1000) / 10,
    }))
    .sort((a, b) => b.amountAgorot - a.amountAgorot);
}

export function expenseInCategory(
  transactions: readonly Transaction[],
  categoryId: UUID,
  from: ISODate,
  to: ISODate,
): Agorot {
  return sumA(
    transactionsInPeriod(transactions, from, to)
      .filter((t) => t.type === 'expense' && t.categoryId === categoryId)
      .map((t) => t.amountAgorot),
  );
}
