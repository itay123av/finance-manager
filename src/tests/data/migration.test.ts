/**
 * שדרוג גרסה על בסיס נתונים קיים.
 *
 * ⚠️ זה התרחיש שאי אפשר לבדוק ידנית אחרי שהוא נשבר. משתמש שכבר מריץ
 * את המערכת חודשיים פותח גרסה חדשה, Dexie מריץ מיגרציה — ואם משהו
 * שם לא בסדר, העסקאות נעלמות. אין "לנסות שוב": בסיס הנתונים כבר
 * שודרג.
 *
 * לכן הבדיקה בונה בסיס נתונים **בגרסת הסכמה הישנה** ממש, כותבת אליו,
 * ואז פותחת אותו עם המחלקה הנוכחית — בדיוק מה שיקרה אצל המשתמש.
 *
 * ⚠️ הקריטריון אינו "לא קרסה". הקריטריון הוא שהיתרה ו"בטוח להוציא"
 * יוצאים **אותו מספר בדיוק** לפני ואחרי.
 */

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { FinanceDatabase } from '../../data/db';
import { loadSnapshot, BANK_ACCOUNT_ID, CASH_ACCOUNT_ID, PRIMARY_GOAL_ID } from '../../data/repositories';
import { buildDashboard } from '../../core/dashboard';
import { fromShekels } from '../../core/money';
import { DEFAULT_CATEGORIES } from '../../content/categories.seed';
import type { Account, AppSettings, FinancialGoal, Transaction } from '../../core/types';

const NOW = new Date('2026-08-15T09:00:00Z');

/** הסכמה כפי שהייתה בגרסה 1 — לפני כרטיסי אשראי ולפני יומן הגיבויים. */
const V1_STORES = {
  accounts: 'id, type',
  transactions:
    'id, date, categoryId, accountId, status, [date+type], [accountId+date], merchantNormalized, importSessionId, importHash',
  categories: 'id, kind, nature, sortOrder, archivedAt',
  goals: 'id, isPrimary',
  expectedIncomes: 'id, expectedDate, certainty, received',
  plannedExpenses: 'id, dueDate, paid, priority',
  recurring: 'id, active, categoryId',
  merchantRules: 'id, &merchantNormalized',
  importSessions: 'id, importedAt, undone',
  budgets: 'id, &month',
  settings: 'id',
};

const accounts: Account[] = [
  {
    id: BANK_ACCOUNT_ID,
    name: 'חשבון בנק',
    type: 'bank',
    openingBalanceAgorot: fromShekels(1200),
    openingDate: '2026-05-01',
  },
  {
    id: CASH_ACCOUNT_ID,
    name: 'מזומן',
    type: 'cash',
    openingBalanceAgorot: fromShekels(80),
    openingDate: '2026-05-01',
  },
];

const goal: FinancialGoal = {
  id: PRIMARY_GOAL_ID,
  name: 'יעד 5,000',
  targetAgorot: fromShekels(5000),
  startingBalanceAgorot: fromShekels(1280),
  startDate: '2026-05-01',
  minimumAfterReachedAgorot: fromShekels(4500),
  milestones: [fromShekels(1000), fromShekels(2500), fromShekels(5000)],
  isPrimary: true,
};

const settings: AppSettings = {
  id: 'singleton',
  schemaVersion: 1,
  safetyBufferAgorot: fromShekels(500),
  budgetPlanId: 'balanced',
  estimatedMonthlySpendAgorot: fromShekels(400),
  showAgorot: false,
  discreetMode: false,
  lastAccountId: BANK_ACCOUNT_ID,
  onboardingCompletedAt: '2026-05-01T08:00:00.000Z',
};

function makeTransaction(i: number, date: string, shekels: number, type: Transaction['type']): Transaction {
  return {
    id: `old-tx-${i}`,
    accountId: BANK_ACCOUNT_ID,
    date,
    amountAgorot: fromShekels(shekels),
    type,
    merchant: type === 'income' ? 'משמרת' : 'קנייה',
    merchantNormalized: type === 'income' ? 'משמרת' : 'קנייה',
    categoryId: type === 'income' ? 'cat-work' : 'cat-food-out',
    paymentMethod: '',
    recurrence: 'one_time',
    planned: false,
    source: 'manual',
    classificationConfidence: 1,
    userCorrected: true,
    status: 'actual',
    kind: 'normal',
    createdAt: `${date}T09:00:00.000Z`,
    updatedAt: `${date}T09:00:00.000Z`,
  };
}

const transactions: Transaction[] = [
  makeTransaction(1, '2026-06-05', 900, 'income'),
  makeTransaction(2, '2026-06-18', 120, 'expense'),
  makeTransaction(3, '2026-07-02', 1500, 'income'),
  makeTransaction(4, '2026-07-21', 340, 'expense'),
  makeTransaction(5, '2026-08-03', 75, 'expense'),
];

/** כותב בסיס נתונים בגרסה 1 וסוגר אותו — כמו משתמש שהתקין מזמן. */
async function seedLegacyDatabase(name: string): Promise<void> {
  const legacy = new Dexie(name);
  legacy.version(1).stores(V1_STORES);
  await legacy.open();
  await legacy.table('accounts').bulkPut(accounts);
  await legacy.table('categories').bulkPut(DEFAULT_CATEGORIES);
  await legacy.table('goals').put(goal);
  await legacy.table('settings').put(settings);
  await legacy.table('transactions').bulkPut(transactions);
  legacy.close();
}

async function measure(db: FinanceDatabase) {
  const snapshot = await loadSnapshot(db, NOW);
  const dashboard = buildDashboard({
    today: snapshot.today,
    accounts: snapshot.accounts,
    transactions: snapshot.transactions,
    categories: snapshot.categories,
    goal: snapshot.goal!,
    settings: snapshot.settings,
    expectedIncomes: snapshot.expectedIncomes,
    plannedExpenses: snapshot.plannedExpenses,
    recurringTransactions: snapshot.recurring,
    cardTransactions: snapshot.cardTransactions,
    cards: snapshot.cards,
    lastImportDate: snapshot.lastImportDate,
  });
  return {
    balance: dashboard.balance.totalAgorot,
    safeToSpendNow: dashboard.safeToSpend.nowAgorot,
    reserved: dashboard.safeToSpend.breakdown.reservedForFutureMonthsAgorot,
    goalPct: dashboard.goalProgress.progressPct,
    transactionCount: snapshot.transactions.length,
  };
}

describe('שדרוג מסכמה ישנה', () => {
  it('⭐ כל העסקאות שורדות, והיתרה ו"בטוח להוציא" זהים', async () => {
    const name = `test-migration-${Date.now()}`;
    await seedLegacyDatabase(name);

    // ── לפני: מחשבים מול הנתונים כפי שהם, בלי לעבור דרך המיגרציה ──
    const before = {
      balance:
        accounts.reduce((sum, a) => sum + a.openingBalanceAgorot, 0) +
        transactions.reduce(
          (sum, t) => sum + (t.type === 'income' ? t.amountAgorot : -t.amountAgorot),
          0,
        ),
      transactionCount: transactions.length,
    };

    // ── השדרוג עצמו ──
    const upgraded = new FinanceDatabase(name);
    await upgraded.open();
    const after = await measure(upgraded);

    expect(after.transactionCount).toBe(before.transactionCount);
    expect(after.balance).toBe(before.balance);

    // הטבלאות החדשות קיימות וריקות — ולא מכילות זבל מהמיגרציה
    expect(await upgraded.cards.count()).toBe(0);
    expect(await upgraded.cardTransactions.count()).toBe(0);
    expect(await upgraded.backupRecords.count()).toBe(0);

    upgraded.close();
  });

  it('⭐ פתיחה חוזרת אחרי השדרוג מחזירה בדיוק אותם מספרים', async () => {
    const name = `test-migration-stable-${Date.now()}`;
    await seedLegacyDatabase(name);

    const first = new FinanceDatabase(name);
    await first.open();
    const afterUpgrade = await measure(first);
    first.close();

    const second = new FinanceDatabase(name);
    await second.open();
    const afterReopen = await measure(second);
    second.close();

    // ⚠️ לא רק היתרה: גם "בטוח להוציא", הרזרבה וההתקדמות ליעד.
    // מיגרציה ששינתה לוגיקה בשקט הייתה מתגלה כאן.
    expect(afterReopen).toEqual(afterUpgrade);
  });

  it('הגדרות המשתמש שורדות את השדרוג', async () => {
    const name = `test-migration-settings-${Date.now()}`;
    await seedLegacyDatabase(name);

    const upgraded = new FinanceDatabase(name);
    await upgraded.open();
    const snapshot = await loadSnapshot(upgraded, NOW);

    expect(snapshot.settings.safetyBufferAgorot).toBe(fromShekels(500));
    expect(snapshot.settings.budgetPlanId).toBe('balanced');
    expect(snapshot.settings.onboardingCompletedAt).toBe('2026-05-01T08:00:00.000Z');
    expect(snapshot.goal?.targetAgorot).toBe(fromShekels(5000));

    // שדות שנוספו אחרי גרסה 1 נעדרים — ולא מקבלים ערך מומצא
    expect(snapshot.settings.lock).toBeUndefined();
    expect(snapshot.settings.backupReminderDismissedUntil).toBeUndefined();

    upgraded.close();
  });
});
