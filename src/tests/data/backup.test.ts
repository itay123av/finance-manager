/**
 * בדיקות גיבוי ושחזור — כולל בדיקת round-trip מלאה.
 *
 * זו הבדיקה שנותנת רשות להתחיל לעבוד עם נתונים אמיתיים בשלב 3.
 * היא לא בודקת רק ששורות חוזרות, אלא שכל **מדדי ה-MVP** מחושבים
 * לאותן תוצאות בדיוק אחרי מחיקה ושחזור.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BackupError,
  backupFileName,
  exportBackup,
  previewBackup,
  readBackup,
  restoreFromText,
} from '../../data/backup';
import { FinanceDatabase, wipeAllData } from '../../data/db';
import {
  addTransaction,
  completeOnboarding,
  BANK_ACCOUNT_ID,
  CASH_ACCOUNT_ID,
  loadSnapshot,
} from '../../data/repositories';
import { buildDashboard, type DashboardData } from '../../core/dashboard';
import { fromShekels } from '../../core/money';

const NOW = new Date('2026-08-07T09:00:00Z');
let db: FinanceDatabase;
let dbCounter = 0;

beforeEach(async () => {
  db = new FinanceDatabase(`test-backup-${++dbCounter}`);
  await db.open();
});

async function seedRealisticData(): Promise<void> {
  await completeOnboarding(db, {
    bankBalanceAgorot: fromShekels(1090),
    cashBalanceAgorot: fromShekels(150),
    safetyBufferAgorot: fromShekels(500),
    targetAgorot: fromShekels(5000),
    milestones: [fromShekels(1000), fromShekels(2500), fromShekels(5000)],
    estimatedMonthlySpendAgorot: fromShekels(400),
    openingDate: '2026-06-01',
  });

  await addTransaction(db, {
    accountId: BANK_ACCOUNT_ID,
    date: '2026-07-06',
    amountAgorot: fromShekels(2400),
    type: 'income',
    categoryId: 'cat-work',
    merchant: 'עבודה בעסק מקומי',
  });
  await addTransaction(db, {
    accountId: BANK_ACCOUNT_ID,
    date: '2026-07-12',
    amountAgorot: fromShekels(22),
    type: 'expense',
    categoryId: 'cat-phone',
    merchant: 'Spotify',
  });
  await addTransaction(db, {
    accountId: BANK_ACCOUNT_ID,
    date: '2026-08-03',
    amountAgorot: fromShekels(64),
    type: 'expense',
    categoryId: 'cat-food-out',
    merchant: 'ארומה',
    note: 'עם דניאל',
  });
  await addTransaction(db, {
    accountId: CASH_ACCOUNT_ID,
    date: '2026-08-05',
    amountAgorot: fromShekels(35),
    type: 'expense',
    categoryId: 'cat-shopping',
    merchant: 'רמי לוי',
  });
}

async function computeMetrics(): Promise<DashboardData> {
  const snapshot = await loadSnapshot(db, NOW);
  if (!snapshot.goal) throw new Error('אין יעד');
  return buildDashboard({
    today: snapshot.today,
    accounts: snapshot.accounts,
    transactions: snapshot.transactions,
    categories: snapshot.categories,
    goal: snapshot.goal,
    settings: snapshot.settings,
    expectedIncomes: snapshot.expectedIncomes,
    plannedExpenses: snapshot.plannedExpenses,
    recurringTransactions: snapshot.recurring,
  });
}

/** המדדים שהמשתמש רואה — אלה שחייבים לשרוד שחזור. */
function mvpMetrics(d: DashboardData) {
  return {
    balance: d.balance.totalAgorot,
    bank: d.balance.byAccount.find((a) => a.accountId === BANK_ACCOUNT_ID)?.balanceAgorot,
    cash: d.balance.byAccount.find((a) => a.accountId === CASH_ACCOUNT_ID)?.balanceAgorot,
    monthIncome: d.month.incomeAgorot,
    monthExpense: d.month.expenseAgorot,
    safeToSpendNow: d.safeToSpend.nowAgorot,
    safeToSpendWeek: d.safeToSpend.weekAgorot,
    reserved: d.safeToSpend.breakdown.reservedForFutureMonthsAgorot,
    goalPct: d.goalProgress.progressPct,
    goalGap: d.goalProgress.gapAgorot,
    monthsToGoal: d.goalProjection.monthsToGoal,
    budgetMonthly: d.budgetPlan.monthlySpendAgorot,
    budgetRemaining: d.budgetProgress.remainingAgorot,
    funRemaining: d.fun.remainingAgorot,
    forecastMonthEnd: d.forecast.monthEnd.endBalanceAgorot,
  };
}

async function sortedTables() {
  const snapshot = await loadSnapshot(db, NOW);
  const sortById = <T extends { id: string }>(rows: T[]) =>
    [...rows].sort((a, b) => a.id.localeCompare(b.id));
  return {
    accounts: sortById(snapshot.accounts),
    transactions: sortById(snapshot.transactions),
    categories: sortById(snapshot.categories),
    settings: snapshot.settings,
    goal: snapshot.goal,
  };
}

describe('⭐ round-trip מלא: ייצוא → מחיקה → שחזור', () => {
  it('הרשומות והמדדים זהים לחלוטין', async () => {
    await seedRealisticData();

    const before = await sortedTables();
    const metricsBefore = mvpMetrics(await computeMetrics());
    expect(metricsBefore.balance).toBe(fromShekels(1090 + 150 + 2400 - 22 - 64 - 35));

    const file = await exportBackup(db, { now: NOW });

    await wipeAllData(db);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.accounts.count()).toBe(0);

    const { restored } = await restoreFromText(db, file);
    expect(restored).toBeGreaterThan(0);

    const after = await sortedTables();
    expect(after.transactions).toEqual(before.transactions);
    expect(after.accounts).toEqual(before.accounts);
    expect(after.categories).toEqual(before.categories);
    expect(after.settings).toEqual(before.settings);
    expect(after.goal).toEqual(before.goal);

    expect(mvpMetrics(await computeMetrics())).toEqual(metricsBefore);
  });

  it('אותו דבר עם גיבוי מוצפן', async () => {
    await seedRealisticData();
    const metricsBefore = mvpMetrics(await computeMetrics());
    const before = await sortedTables();

    const file = await exportBackup(db, { password: 'סיסמה-חזקה-123', now: NOW });
    expect(file).not.toContain('ארומה'); // התוכן באמת מוצפן

    await wipeAllData(db);
    await restoreFromText(db, file, 'סיסמה-חזקה-123');

    expect((await sortedTables()).transactions).toEqual(before.transactions);
    expect(mvpMetrics(await computeMetrics())).toEqual(metricsBefore);
  });

  it('שחזור מחליף תוכן קיים ולא מתווסף אליו', async () => {
    await seedRealisticData();
    const file = await exportBackup(db, { now: NOW });
    const countBefore = await db.transactions.count();

    // מוסיפים עסקה שלא הייתה בגיבוי
    await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date: '2026-08-06',
      amountAgorot: fromShekels(999),
      type: 'expense',
      categoryId: 'cat-other',
      merchant: 'אחרי הגיבוי',
    });
    expect(await db.transactions.count()).toBe(countBefore + 1);

    await restoreFromText(db, file);
    expect(await db.transactions.count()).toBe(countBefore);
    expect(await db.transactions.filter((t) => t.merchant === 'אחרי הגיבוי').count()).toBe(0);
  });
});

describe('הגנות על השחזור', () => {
  it('קובץ שאינו JSON נדחה', async () => {
    await expect(readBackup('לא JSON בכלל')).rejects.toThrow(BackupError);
    await expect(readBackup('לא JSON בכלל')).rejects.toMatchObject({ reason: 'malformed' });
  });

  it('JSON תקין שאינו גיבוי של המערכת נדחה', async () => {
    await expect(readBackup('{"hello":"world"}')).rejects.toMatchObject({
      reason: 'wrong_format',
    });
  });

  it('גיבוי עם מבנה פגום נדחה', async () => {
    const broken = JSON.stringify({
      format: 'finance-manager-backup',
      schemaVersion: 1,
      createdAt: '2026-08-07T09:00:00.000Z',
      encrypted: false,
      data: { accounts: [{ id: 'x' }] },
    });
    await expect(readBackup(broken)).rejects.toMatchObject({ reason: 'malformed' });
  });

  it('גיבוי מגרסה חדשה יותר נדחה עם הסבר', async () => {
    await seedRealisticData();
    const file = JSON.parse(await exportBackup(db, { now: NOW }));
    file.schemaVersion = 99;
    await expect(readBackup(JSON.stringify(file))).rejects.toMatchObject({
      reason: 'unsupported_version',
    });
  });

  it('סיסמה שגויה נדחית, ולא מייצרת נתונים פגומים', async () => {
    await seedRealisticData();
    const file = await exportBackup(db, { password: 'הסיסמה-הנכונה', now: NOW });
    await expect(readBackup(file, 'סיסמה-אחרת')).rejects.toMatchObject({
      reason: 'bad_password',
    });
    await expect(readBackup(file)).rejects.toMatchObject({ reason: 'bad_password' });
  });

  it('שחזור כושל לא משנה את הנתונים הקיימים', async () => {
    await seedRealisticData();
    const countBefore = await db.transactions.count();
    await expect(restoreFromText(db, 'זבל')).rejects.toThrow(BackupError);
    expect(await db.transactions.count()).toBe(countBefore);
  });
});

describe('תצוגה מקדימה', () => {
  it('מציגה מה עומד להשתחזר לפני האישור', async () => {
    await seedRealisticData();
    const file = await exportBackup(db, { now: NOW });
    const preview = await previewBackup(file);

    expect(preview.encrypted).toBe(false);
    expect(preview.schemaVersion).toBe(1);
    expect(preview.createdAt).toBe(NOW.toISOString());
    expect(preview.counts.transactions).toBe(4);
    expect(preview.counts.accounts).toBe(2);
    expect(preview.counts.categories).toBeGreaterThan(10);
    expect(preview.totalRecords).toBe(
      Object.values(preview.counts).reduce((a, b) => a + b, 0),
    );
  });

  it('עובדת גם על גיבוי מוצפן, עם הסיסמה', async () => {
    await seedRealisticData();
    const file = await exportBackup(db, { password: '1234', now: NOW });
    const preview = await previewBackup(file, '1234');
    expect(preview.encrypted).toBe(true);
    expect(preview.counts.transactions).toBe(4);
  });
});

describe('מחיקת כל הנתונים', () => {
  it('מוחקת הכל ולא משאירה שריד', async () => {
    await seedRealisticData();
    await wipeAllData(db);

    for (const table of db.tables) {
      expect(await table.count(), table.name).toBe(0);
    }
  });

  it('אחרי מחיקה המערכת חוזרת למצב "לא עברתי אונבורדינג"', async () => {
    await seedRealisticData();
    await wipeAllData(db);
    const snapshot = await loadSnapshot(db, NOW);
    expect(snapshot.goal).toBeUndefined();
    expect(snapshot.settings.onboardingCompletedAt).toBeUndefined();
  });
});

describe('שם קובץ הגיבוי', () => {
  it('כולל חותמת זמן וניתן למיון', () => {
    expect(backupFileName(NOW)).toBe('backup-2026-08-07-09-00-00.json');
  });

  it('תואם לתבנית שמוגנת ב-gitignore', () => {
    expect(backupFileName(NOW)).toMatch(/^backup-.*\.json$/);
  });
});
