/**
 * הכנסות צפויות, וקבלתן בפועל.
 *
 * ⚠️ הסיכון המרכזי כאן הוא **ספירה כפולה**: כשהכסף נכנס, נוצרת עסקה
 * חדשה — ואם ההכנסה הצפויה לא מסומנת כ"התקבלה", היא תמשיך להופיע
 * בתחזיות כאילו היא עוד עתידה לבוא. היתרה תהיה נכונה, אבל התחזית
 * תראה כסף שכבר נספר.
 *
 * לכן שתי הפעולות — יצירת העסקה וסימון ההכנסה — קורות בטרנזקציה אחת.
 */

import { TABLE_SCHEMAS } from './schema';
import { allTables, type FinanceDatabase } from './db';
import { buildTransaction, newId } from './repositories';
import { clampMin0 } from '../core/money';
import type { Agorot, ExpectedIncome, ISODate, Transaction, UUID } from '../core/types';

export interface NewExpectedIncomeInput {
  label: string;
  expectedAmountAgorot: Agorot;
  expectedDate: ISODate;
  certainty: ExpectedIncome['certainty'];
  /** לחישוב נטו: שעות × שכר לשעה, פחות הוצאות. */
  hours?: number;
  hourlyRateAgorot?: Agorot;
  relatedCostsAgorot?: Agorot;
}

/**
 * הסכום נטו — מה שבאמת יישאר ביד.
 *
 * `grossExpectedIncome - relatedCosts`. הוצאות נסיעה או ציוד שקשורות
 * לעבודה אינן כסף שנכנס, וספירתן כהכנסה מנפחת את התחזית.
 */
export function netExpectedIncome(input: {
  expectedAmountAgorot: Agorot;
  hours?: number;
  hourlyRateAgorot?: Agorot;
  relatedCostsAgorot?: Agorot;
}): Agorot {
  const gross =
    input.hours !== undefined && input.hourlyRateAgorot !== undefined
      ? Math.round(input.hours * input.hourlyRateAgorot)
      : input.expectedAmountAgorot;
  return clampMin0(gross - (input.relatedCostsAgorot ?? 0));
}

export async function addExpectedIncome(
  db: FinanceDatabase,
  input: NewExpectedIncomeInput,
): Promise<ExpectedIncome> {
  const net = netExpectedIncome(input);

  const income: ExpectedIncome = {
    id: newId(),
    label: input.label.trim(),
    // הסכום שנשמר הוא הנטו — הוא זה שמשפיע על כל חישוב
    expectedAmountAgorot: net,
    expectedDate: input.expectedDate,
    certainty: input.certainty,
    received: false,
    ...(input.hours !== undefined ? { hours: input.hours } : {}),
    ...(input.hourlyRateAgorot !== undefined ? { hourlyRateAgorot: input.hourlyRateAgorot } : {}),
    ...(input.relatedCostsAgorot !== undefined
      ? { relatedCostsAgorot: input.relatedCostsAgorot }
      : {}),
  };

  TABLE_SCHEMAS.expectedIncomes.parse(income);
  await db.expectedIncomes.put(income);
  return income;
}

export async function updateExpectedIncome(
  db: FinanceDatabase,
  id: UUID,
  patch: Partial<NewExpectedIncomeInput>,
): Promise<void> {
  const existing = await db.expectedIncomes.get(id);
  if (!existing) throw new Error('ההכנסה הצפויה לא נמצאה');
  if (existing.received) throw new Error('אי אפשר לערוך הכנסה שכבר התקבלה');

  const next: ExpectedIncome = {
    ...existing,
    ...(patch.label ? { label: patch.label.trim() } : {}),
    ...(patch.expectedDate ? { expectedDate: patch.expectedDate } : {}),
    ...(patch.certainty ? { certainty: patch.certainty } : {}),
  };

  if (
    patch.expectedAmountAgorot !== undefined ||
    patch.hours !== undefined ||
    patch.hourlyRateAgorot !== undefined ||
    patch.relatedCostsAgorot !== undefined
  ) {
    next.expectedAmountAgorot = netExpectedIncome({
      expectedAmountAgorot: patch.expectedAmountAgorot ?? existing.expectedAmountAgorot,
      ...(patch.hours ?? existing.hours ? { hours: patch.hours ?? existing.hours } : {}),
      ...(patch.hourlyRateAgorot ?? existing.hourlyRateAgorot
        ? { hourlyRateAgorot: patch.hourlyRateAgorot ?? existing.hourlyRateAgorot }
        : {}),
      ...(patch.relatedCostsAgorot ?? existing.relatedCostsAgorot
        ? { relatedCostsAgorot: patch.relatedCostsAgorot ?? existing.relatedCostsAgorot }
        : {}),
    });
  }

  TABLE_SCHEMAS.expectedIncomes.parse(next);
  await db.expectedIncomes.put(next);
}

export async function deleteExpectedIncome(db: FinanceDatabase, id: UUID): Promise<void> {
  const existing = await db.expectedIncomes.get(id);
  if (existing?.received && existing.receivedTransactionId) {
    throw new Error('ההכנסה כבר התקבלה — כדי לבטל, מחק קודם את העסקה שנוצרה');
  }
  await db.expectedIncomes.delete(id);
}

export interface MarkReceivedInput {
  accountId: UUID;
  categoryId: UUID;
  /** ברירת המחדל: הסכום הצפוי. */
  actualAmountAgorot?: Agorot;
  /** ברירת המחדל: התאריך הצפוי. */
  actualDate?: ISODate;
}

export interface MarkReceivedResult {
  transaction: Transaction;
  income: ExpectedIncome;
}

/**
 * "הכסף נכנס".
 *
 * ⚠️ יוצר עסקה **ומסמן** את ההכנסה כהתקבלה, בטרנזקציה אחת. שני
 * החלקים חייבים לקרות יחד: עסקה בלי סימון = ספירה כפולה בתחזית;
 * סימון בלי עסקה = כסף שנעלם מהיתרה.
 */
export async function markIncomeReceived(
  db: FinanceDatabase,
  incomeId: UUID,
  input: MarkReceivedInput,
): Promise<MarkReceivedResult> {
  const tables = allTables(db);
  let result: MarkReceivedResult | null = null;

  await db.transaction('rw', [tables.transactions, tables.expectedIncomes], async () => {
    const income = await tables.expectedIncomes.get(incomeId);
    if (!income) throw new Error('ההכנסה הצפויה לא נמצאה');
    if (income.received) throw new Error('ההכנסה כבר סומנה כהתקבלה');

    const transaction = buildTransaction({
      accountId: input.accountId,
      date: input.actualDate ?? income.expectedDate,
      amountAgorot: input.actualAmountAgorot ?? income.expectedAmountAgorot,
      type: 'income',
      categoryId: input.categoryId,
      merchant: income.label,
    });

    const updated: ExpectedIncome = {
      ...income,
      received: true,
      receivedTransactionId: transaction.id,
    };
    TABLE_SCHEMAS.expectedIncomes.parse(updated);

    await tables.transactions.put(transaction);
    await tables.expectedIncomes.put(updated);
    result = { transaction, income: updated };
  });

  if (!result) throw new Error('סימון ההכנסה נכשל');
  return result;
}

/**
 * ביטול הסימון — מוחק את העסקה שנוצרה ומחזיר את ההכנסה למצב "צפויה".
 * שוב, שני החלקים יחד.
 */
export async function undoIncomeReceived(
  db: FinanceDatabase,
  incomeId: UUID,
): Promise<void> {
  const tables = allTables(db);

  await db.transaction('rw', [tables.transactions, tables.expectedIncomes], async () => {
    const income = await tables.expectedIncomes.get(incomeId);
    if (!income) throw new Error('ההכנסה הצפויה לא נמצאה');
    if (!income.received) return;

    if (income.receivedTransactionId) {
      await tables.transactions.delete(income.receivedTransactionId);
    }
    const reverted = { ...income, received: false };
    delete reverted.receivedTransactionId;
    await tables.expectedIncomes.put(reverted);
  });
}

/** הכנסות שטרם התקבלו, ממוינות לפי תאריך. */
export async function pendingIncomes(
  db: FinanceDatabase,
  today: ISODate,
): Promise<ExpectedIncome[]> {
  const all = await db.expectedIncomes.toArray();
  return all
    .filter((i) => !i.received && i.expectedDate >= today)
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}

/**
 * הכנסות שהתאריך שלהן עבר והן עדיין לא סומנו.
 * מזכיר למשתמש לסמן — אחרת התחזית מציגה כסף שכבר הגיע.
 */
export async function overdueIncomes(
  db: FinanceDatabase,
  today: ISODate,
): Promise<ExpectedIncome[]> {
  const all = await db.expectedIncomes.toArray();
  return all
    .filter((i) => !i.received && i.expectedDate < today)
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}
