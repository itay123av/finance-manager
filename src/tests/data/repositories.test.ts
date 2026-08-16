/**
 * בדיקות שכבת הנתונים — הזרימה שהמשתמש עובר בפועל.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { FinanceDatabase } from '../../data/db';
import {
  BANK_ACCOUNT_ID,
  CASH_ACCOUNT_ID,
  addTransaction,
  archiveOrDeleteCategory,
  completeOnboarding,
  createCategory,
  deleteTransaction,
  getSettings,
  isOnboarded,
  loadSnapshot,
  saveSettings,
  setTransactionCategory,
  unarchiveCategory,
  updateCategory,
  updateGoal,
  updateTransaction,
} from '../../data/repositories';
import { normalizeMerchant } from '../../data/normalize';
import { buildDashboard } from '../../core/dashboard';
import { fromShekels } from '../../core/money';

const NOW = new Date('2026-08-07T09:00:00Z');
let db: FinanceDatabase;
let counter = 0;

beforeEach(async () => {
  db = new FinanceDatabase(`test-repo-${++counter}`);
  await db.open();
});

async function onboard() {
  await completeOnboarding(db, {
    bankBalanceAgorot: fromShekels(1090),
    cashBalanceAgorot: fromShekels(150),
    safetyBufferAgorot: fromShekels(500),
    targetAgorot: fromShekels(5000),
    milestones: [fromShekels(1000), fromShekels(2500), fromShekels(5000)],
    estimatedMonthlySpendAgorot: fromShekels(400),
    openingDate: '2026-08-01',
  });
}

async function dashboard() {
  const s = await loadSnapshot(db, NOW);
  if (!s.goal) throw new Error('אין יעד');
  return buildDashboard({
    today: s.today,
    accounts: s.accounts,
    transactions: s.transactions,
    categories: s.categories,
    goal: s.goal,
    settings: s.settings,
    expectedIncomes: s.expectedIncomes,
    plannedExpenses: s.plannedExpenses,
    recurringTransactions: s.recurring,
  });
}

describe('אונבורדינג', () => {
  it('יוצר שני חשבונות, יעד וקטגוריות בפעולה אחת', async () => {
    expect(await isOnboarded(db)).toBe(false);
    await onboard();
    expect(await isOnboarded(db)).toBe(true);

    const snapshot = await loadSnapshot(db, NOW);
    expect(snapshot.accounts.map((a) => a.type).sort()).toEqual(['bank', 'cash']);
    expect(snapshot.goal?.targetAgorot).toBe(fromShekels(5000));
    expect(snapshot.goal?.startingBalanceAgorot).toBe(fromShekels(1240));
    expect(snapshot.categories.length).toBeGreaterThan(10);
    expect(snapshot.settings.safetyBufferAgorot).toBe(fromShekels(500));
  });

  it('לא שומר שום פרט מזהה', async () => {
    await onboard();

    // סורקים שמות שדות בפועל ולא מחרוזות חופשיות: המזהה `cat-phone` הוא
    // קטגוריית "טלפון ומנויים" ולא שדה של מספר טלפון.
    const forbidden = new Set([
      'password',
      'email',
      'phone',
      'phoneNumber',
      'fullName',
      'idNumber',
      'accountNumber',
      'cardNumber',
      'iban',
      'otp',
      'token',
      'username',
    ]);
    const found: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          if (forbidden.has(key)) found.push(key);
          walk(child);
        }
      }
    };
    walk(await loadSnapshot(db, NOW));
    expect(found).toEqual([]);
  });

  it('היתרה ההתחלתית מגיעה מיתרות הפתיחה', async () => {
    await onboard();
    expect((await dashboard()).balance.totalAgorot).toBe(fromShekels(1240));
  });
});

describe('⭐ זרימת המשתמש: הוספה, עדכון, מחיקה', () => {
  it('הוספת הוצאה מעדכנת יתרה ו"בטוח להוציא" מיד', async () => {
    await onboard();
    const before = await dashboard();

    await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date: '2026-08-05',
      amountAgorot: fromShekels(64),
      type: 'expense',
      categoryId: 'cat-food-out',
      merchant: 'ארומה',
    });

    const after = await dashboard();
    expect(before.balance.totalAgorot - after.balance.totalAgorot).toBe(fromShekels(64));
    expect(before.safeToSpend.nowAgorot - after.safeToSpend.nowAgorot).toBe(fromShekels(64));
    expect(after.fun.spentAgorot).toBe(fromShekels(64));
  });

  it('הוספת הכנסה מקדמת את ההתקדמות ליעד', async () => {
    await onboard();
    const before = await dashboard();

    await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date: '2026-08-06',
      amountAgorot: fromShekels(500),
      type: 'income',
      categoryId: 'cat-work',
      merchant: 'עבודה',
    });

    const after = await dashboard();
    expect(after.balance.totalAgorot - before.balance.totalAgorot).toBe(fromShekels(500));
    expect(after.goalProgress.progressPct).toBeGreaterThan(before.goalProgress.progressPct);
    expect(after.goalProgress.gapAgorot).toBeLessThan(before.goalProgress.gapAgorot);
  });

  it('מחיקת עסקה מחזירה את המספרים בדיוק לקדמותם', async () => {
    await onboard();
    const before = await dashboard();

    const t = await addTransaction(db, {
      accountId: CASH_ACCOUNT_ID,
      date: '2026-08-05',
      amountAgorot: fromShekels(35),
      type: 'expense',
      categoryId: 'cat-shopping',
      merchant: 'רמי לוי',
    });
    await deleteTransaction(db, t.id);

    const after = await dashboard();
    expect(after.balance.totalAgorot).toBe(before.balance.totalAgorot);
    expect(after.safeToSpend.nowAgorot).toBe(before.safeToSpend.nowAgorot);
    expect(after.goalProgress.progressPct).toBe(before.goalProgress.progressPct);
  });

  it('עריכת עסקה מעדכנת את החישובים', async () => {
    await onboard();
    const t = await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date: '2026-08-05',
      amountAgorot: fromShekels(64),
      type: 'expense',
      categoryId: 'cat-food-out',
      merchant: 'ארומה',
    });

    await updateTransaction(db, t.id, { amountAgorot: fromShekels(120) });
    expect((await dashboard()).month.expenseAgorot).toBe(fromShekels(120));

    // החלפת כיוון: מהוצאה להכנסה
    await updateTransaction(db, t.id, { type: 'income', categoryId: 'cat-work' });
    const after = await dashboard();
    expect(after.month.expenseAgorot).toBe(0);
    expect(after.month.incomeAgorot).toBe(fromShekels(120));
  });

  it('עריכה מנקה הערה כשמוחקים אותה', async () => {
    await onboard();
    const t = await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date: '2026-08-05',
      amountAgorot: fromShekels(20),
      type: 'expense',
      categoryId: 'cat-food-out',
      note: 'עם דניאל',
    });
    expect((await db.transactions.get(t.id))?.note).toBe('עם דניאל');
    await updateTransaction(db, t.id, { note: '' });
    expect((await db.transactions.get(t.id))?.note).toBeUndefined();
  });

  it('עריכה של עסקה שאינה קיימת נכשלת בבירור', async () => {
    await onboard();
    await expect(updateTransaction(db, 'no-such-id', {})).rejects.toThrow('העסקה לא נמצאה');
  });

  it('שם בית העסק נשמר מנורמל לצורך זיהוי חוזר', async () => {
    await onboard();
    const t = await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date: '2026-08-05',
      amountAgorot: fromShekels(22),
      type: 'expense',
      categoryId: 'cat-phone',
      merchant: '  Spotify   Premium ',
    });
    expect(t.merchantNormalized).toBe('spotify premium');
    expect(normalizeMerchant('ארומה  "סניף" 41')).toBe('ארומה סניף 41');
  });

  it('סכום לא תקין נדחה לפני שהוא נוגע בבסיס הנתונים', async () => {
    await onboard();
    await expect(
      addTransaction(db, {
        accountId: BANK_ACCOUNT_ID,
        date: '2026-08-05',
        amountAgorot: 0,
        type: 'expense',
        categoryId: 'cat-food-out',
      }),
    ).rejects.toThrow();
    expect(await db.transactions.count()).toBe(0);
  });

  it('החשבון האחרון נשמר כברירת מחדל להזנה הבאה', async () => {
    await onboard();
    await addTransaction(db, {
      accountId: CASH_ACCOUNT_ID,
      date: '2026-08-05',
      amountAgorot: fromShekels(30),
      type: 'expense',
      categoryId: 'cat-shopping',
    });
    expect((await getSettings(db)).lastAccountId).toBe(CASH_ACCOUNT_ID);
  });

  it('תיקון קטגוריה מסמן את העסקה כמתוקנת ידנית', async () => {
    await onboard();
    const t = await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date: '2026-08-05',
      amountAgorot: fromShekels(40),
      type: 'expense',
      categoryId: 'cat-other',
    });
    await setTransactionCategory(db, t.id, 'cat-food-out');
    const updated = await db.transactions.get(t.id);
    expect(updated?.categoryId).toBe('cat-food-out');
    expect(updated?.userCorrected).toBe(true);
    expect(updated?.classificationConfidence).toBe(1);
  });
});

describe('הגדרות משפיעות מיד על החישובים', () => {
  it('שינוי סכום הביטחון מעדכן את "בטוח להוציא"', async () => {
    await onboard();
    const before = await dashboard();

    await saveSettings(db, { safetyBufferAgorot: fromShekels(800) });
    const after = await dashboard();

    expect(after.safeToSpend.breakdown.safetyBufferAgorot).toBe(fromShekels(800));
    expect(before.safeToSpend.nowAgorot - after.safeToSpend.nowAgorot).toBe(fromShekels(300));
  });

  it('שינוי מסלול התקציב מעדכן את התקציב ואת תקציב הבילויים', async () => {
    await onboard();
    const balanced = await dashboard();
    await saveSettings(db, { budgetPlanId: 'conservative' });
    const conservative = await dashboard();

    expect(conservative.budgetPlan.monthlySpendAgorot).toBeLessThan(
      balanced.budgetPlan.monthlySpendAgorot,
    );
    expect(conservative.fun.plannedAgorot).toBeLessThan(balanced.fun.plannedAgorot);
  });

  it('שינוי היעד מעדכן את ההתקדמות', async () => {
    await onboard();
    await updateGoal(db, { targetAgorot: fromShekels(2500) });
    const d = await dashboard();
    expect(d.goalProgress.targetAgorot).toBe(fromShekels(2500));
    expect(d.goalProgress.progressPct).toBe(49.6);
  });

  it('עדכון יעד ללא יעד קיים נכשל בבירור', async () => {
    await expect(updateGoal(db, { targetAgorot: 100 })).rejects.toThrow('לא נמצא יעד');
  });
});

describe('קטגוריות', () => {
  it('יצירה, שינוי שם ושינוי אופי', async () => {
    await onboard();
    const created = await createCategory(db, {
      name: 'קפה בדרך ללימודים',
      kind: 'expense',
      nature: 'fun',
    });
    expect(created.isSystem).toBe(false);

    await updateCategory(db, created.id, { name: 'קפה', nature: 'reducible' });
    const updated = await db.categories.get(created.id);
    expect(updated?.name).toBe('קפה');
    expect(updated?.nature).toBe('reducible');
  });

  it('⭐ קטגוריה עם עסקאות עוברת לארכיון ולא נמחקת', async () => {
    await onboard();
    const category = await createCategory(db, { name: 'זמנית', kind: 'expense', nature: 'fun' });
    await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date: '2026-08-05',
      amountAgorot: fromShekels(30),
      type: 'expense',
      categoryId: category.id,
    });

    const result = await archiveOrDeleteCategory(db, category.id);
    expect(result).toMatchObject({ archived: true, deleted: false, transactionCount: 1 });
    expect((await db.categories.get(category.id))?.archivedAt).toBeTruthy();
    // ההיסטוריה נשארת שלמה — העסקה עדיין מסווגת
    expect((await db.transactions.count())).toBe(1);
  });

  it('קטגוריה בלי עסקאות נמחקת לגמרי', async () => {
    await onboard();
    const category = await createCategory(db, { name: 'טעות', kind: 'expense', nature: 'fun' });
    const result = await archiveOrDeleteCategory(db, category.id);
    expect(result).toMatchObject({ archived: false, deleted: true });
    expect(await db.categories.get(category.id)).toBeUndefined();
  });

  it('החזרה מארכיון מסירה את הסימון', async () => {
    await onboard();
    const category = await createCategory(db, { name: 'חוזרת', kind: 'expense', nature: 'fun' });
    await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date: '2026-08-05',
      amountAgorot: fromShekels(30),
      type: 'expense',
      categoryId: category.id,
    });
    await archiveOrDeleteCategory(db, category.id);
    await unarchiveCategory(db, category.id);
    expect((await db.categories.get(category.id))?.archivedAt).toBeUndefined();
  });

  it('אי אפשר למחוק קטגוריית מערכת', async () => {
    await onboard();
    await expect(archiveOrDeleteCategory(db, 'cat-other')).rejects.toThrow('מערכת');
  });

  it('פעולות על קטגוריה שאינה קיימת נכשלות בבירור', async () => {
    await onboard();
    await expect(archiveOrDeleteCategory(db, 'nope')).rejects.toThrow('לא נמצאה');
    await expect(updateCategory(db, 'nope', { name: 'x' })).rejects.toThrow('לא נמצאה');
    await expect(unarchiveCategory(db, 'nope')).resolves.toBeUndefined();
  });
});
