/**
 * עזרי בדיקות. נתונים פיקטיביים בלבד — לעולם לא נטענים באפליקציה.
 */

import { fromShekels } from '../core/money';
import type {
  Account,
  Agorot,
  ExpectedIncome,
  FinancialGoal,
  ISODate,
  PlannedExpense,
  RecurringTransaction,
  Transaction,
} from '../core/types';

/**
 * מונה מזהים גלובלי לאורך כל ריצת הבדיקות.
 *
 * ⚠️ בכוונה אין פונקציית איפוס. מערכים שנבנים בהיקף `describe` נוצרים לפני
 * ה-`beforeEach`, ואיפוס היה גורם לעסקה שנוצרת בתוך הבדיקה לקבל מזהה שכבר
 * קיים. חישובים שמסננים לפי `id` (למשל `detectAnomalies`, שבונה היסטוריה
 * מכל העסקאות פרט לזו הנבדקת) היו מאבדים שורה בשקט — באג שקשה לאתר.
 */
let counter = 0;

export const ILS = fromShekels;

export interface TxOverrides {
  id?: string;
  accountId?: string;
  date?: ISODate;
  shekels?: number;
  amountAgorot?: Agorot;
  type?: Transaction['type'];
  merchant?: string;
  merchantNormalized?: string;
  categoryId?: string;
  status?: Transaction['status'];
  kind?: Transaction['kind'];
  planned?: boolean;
  recurrence?: Transaction['recurrence'];
  classificationConfidence?: number;
  userCorrected?: boolean;
  note?: string;
}

export function tx(overrides: TxOverrides = {}): Transaction {
  const merchant = overrides.merchant ?? 'חנות';
  const date = overrides.date ?? '2026-08-01';
  return {
    id: overrides.id ?? `tx-${++counter}`,
    accountId: overrides.accountId ?? 'acc-bank',
    date,
    amountAgorot: overrides.amountAgorot ?? fromShekels(overrides.shekels ?? 50),
    type: overrides.type ?? 'expense',
    merchant,
    merchantNormalized: overrides.merchantNormalized ?? merchant.toLowerCase(),
    categoryId: overrides.categoryId ?? 'cat-food-out',
    paymentMethod: 'כרטיס אשראי',
    recurrence: overrides.recurrence ?? 'one_time',
    planned: overrides.planned ?? false,
    source: 'manual',
    classificationConfidence: overrides.classificationConfidence ?? 0.8,
    userCorrected: overrides.userCorrected ?? false,
    status: overrides.status ?? 'actual',
    kind: overrides.kind ?? 'normal',
    createdAt: `${date}T09:00:00.000Z`,
    updatedAt: `${date}T09:00:00.000Z`,
    ...(overrides.note === undefined ? {} : { note: overrides.note }),
  };
}

export function income(overrides: TxOverrides = {}): Transaction {
  return tx({ type: 'income', categoryId: 'cat-work', merchant: 'עבודה', ...overrides });
}

export function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-bank',
    name: 'חשבון בנק',
    type: 'bank',
    openingBalanceAgorot: fromShekels(1000),
    openingDate: '2026-01-01',
    ...overrides,
  };
}

export function goal(overrides: Partial<FinancialGoal> = {}): FinancialGoal {
  return {
    id: 'goal-1',
    name: 'יעד 5,000',
    targetAgorot: fromShekels(5000),
    startingBalanceAgorot: fromShekels(700),
    startDate: '2026-01-01',
    minimumAfterReachedAgorot: fromShekels(4500),
    milestones: [fromShekels(1000), fromShekels(2500), fromShekels(5000)],
    isPrimary: true,
    ...overrides,
  };
}

export function plannedExpense(overrides: Partial<PlannedExpense> = {}): PlannedExpense {
  return {
    id: `plan-${++counter}`,
    label: 'הוצאה מתוכננת',
    amountAgorot: fromShekels(100),
    dueDate: '2026-08-20',
    priority: 'must',
    paid: false,
    ...overrides,
  };
}

export function expectedIncome(overrides: Partial<ExpectedIncome> = {}): ExpectedIncome {
  return {
    id: `inc-${++counter}`,
    label: 'הכנסה צפויה',
    expectedAmountAgorot: fromShekels(400),
    expectedDate: '2026-08-25',
    certainty: 'confirmed',
    received: false,
    ...overrides,
  };
}

export function recurring(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
  return {
    id: `rec-${++counter}`,
    label: 'מנוי',
    amountAgorot: fromShekels(22),
    type: 'expense',
    categoryId: 'cat-phone',
    frequency: 'monthly',
    dayOfCycle: 12,
    active: true,
    detectedAutomatically: true,
    ...overrides,
  };
}

/** יוצר סדרת עסקאות חודשיות באותו יום בחודש. */
export function monthlySeries(
  months: readonly string[],
  shekelsPerMonth: number | readonly number[],
  overrides: TxOverrides = {},
): Transaction[] {
  return months.map((month, i) => {
    const shekels =
      typeof shekelsPerMonth === 'number' ? shekelsPerMonth : (shekelsPerMonth[i] ?? 0);
    return tx({ ...overrides, date: `${month}-15`, shekels });
  });
}
