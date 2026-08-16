/**
 * ⭐ בדיקות הכנסות צפויות.
 *
 * הסיכון המרכזי: **ספירה כפולה**. כשהכסף נכנס נוצרת עסקה, ואם ההכנסה
 * הצפויה לא מסומנת — היא ממשיכה להופיע בתחזיות כאילו היא עוד עתידה
 * להגיע. היתרה תהיה נכונה, התחזית לא.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { FinanceDatabase } from '../../data/db';
import {
  BANK_ACCOUNT_ID,
  completeOnboarding,
  loadSnapshot,
} from '../../data/repositories';
import {
  addExpectedIncome,
  deleteExpectedIncome,
  markIncomeReceived,
  netExpectedIncome,
  overdueIncomes,
  pendingIncomes,
  undoIncomeReceived,
  updateExpectedIncome,
} from '../../data/expectedIncome';
import { buildDashboard } from '../../core/dashboard';
import { buildScenario } from '../../core/forecastScenarios';
import { fromShekels } from '../../core/money';

const NOW = new Date('2026-08-07T12:00:00Z');
const TODAY = '2026-08-07';
let db: FinanceDatabase;
let counter = 0;

beforeEach(async () => {
  db = new FinanceDatabase(`test-income-${++counter}`);
  await db.open();
  await completeOnboarding(db, {
    bankBalanceAgorot: fromShekels(1000),
    cashBalanceAgorot: 0,
    safetyBufferAgorot: fromShekels(500),
    targetAgorot: fromShekels(5000),
    milestones: [fromShekels(5000)],
    estimatedMonthlySpendAgorot: fromShekels(400),
    openingDate: '2026-08-01',
  });
});

async function dashboard() {
  const s = await loadSnapshot(db, NOW);
  return buildDashboard({
    today: s.today,
    accounts: s.accounts,
    transactions: s.transactions,
    categories: s.categories,
    goal: s.goal!,
    settings: s.settings,
    expectedIncomes: s.expectedIncomes,
    plannedExpenses: s.plannedExpenses,
    recurringTransactions: s.recurring,
    cardTransactions: s.cardTransactions,
    cards: s.cards,
  });
}

describe('נטו אחרי הוצאות', () => {
  it('שעות × שכר פחות הוצאות', () => {
    expect(
      netExpectedIncome({
        expectedAmountAgorot: 0,
        hours: 10,
        hourlyRateAgorot: fromShekels(40),
        relatedCostsAgorot: fromShekels(30),
      }),
    ).toBe(fromShekels(370));
  });

  it('בלי שעות — הסכום שהוזן פחות הוצאות', () => {
    expect(
      netExpectedIncome({
        expectedAmountAgorot: fromShekels(500),
        relatedCostsAgorot: fromShekels(50),
      }),
    ).toBe(fromShekels(450));
  });

  it('הוצאות גדולות מההכנסה לא יוצרות סכום שלילי', () => {
    expect(
      netExpectedIncome({
        expectedAmountAgorot: fromShekels(100),
        relatedCostsAgorot: fromShekels(300),
      }),
    ).toBe(0);
  });

  it('⭐ הנטו הוא מה שנשמר ומשפיע על החישובים', async () => {
    const income = await addExpectedIncome(db, {
      label: 'עבודה',
      expectedAmountAgorot: fromShekels(500),
      expectedDate: '2026-08-25',
      certainty: 'confirmed',
      relatedCostsAgorot: fromShekels(50),
    });
    expect(income.expectedAmountAgorot).toBe(fromShekels(450));
  });
});

describe('רמות ודאות', () => {
  it('רק confirmed משפיעה על התחזית המרכזית', async () => {
    for (const certainty of ['confirmed', 'likely', 'possible'] as const) {
      await addExpectedIncome(db, {
        label: certainty,
        expectedAmountAgorot: fromShekels(300),
        expectedDate: '2026-09-10',
        certainty,
      });
    }

    const s = await loadSnapshot(db, NOW);
    const scenario = buildScenario('confirmedIncome', {
      today: TODAY,
      currentBalanceAgorot: fromShekels(1000),
      averageMonthlyExpenseAgorot: 0,
      averageRegularMonthlyIncomeAgorot: 0,
      budgetMonthlySpendAgorot: 0,
      summerTotalNetAgorot: 0,
      expectedIncomes: s.expectedIncomes,
      historicalConfidence: 'high',
    });

    // רק ה-confirmed נספר
    expect(scenario.points[0]?.balanceAgorot).toBe(fromShekels(1300));
  });

  it('⭐ הכנסה לא ודאית אינה נכנסת ל-safeToSpendNow', async () => {
    const before = (await dashboard()).safeToSpend.nowAgorot;
    await addExpectedIncome(db, {
      label: 'אולי',
      expectedAmountAgorot: fromShekels(900),
      expectedDate: '2026-08-25',
      certainty: 'possible',
    });
    expect((await dashboard()).safeToSpend.nowAgorot).toBe(before);
  });

  it('גם הכנסה מאושרת אינה נכנסת לכסף הפנוי — רק לתחזית', async () => {
    const before = (await dashboard()).safeToSpend.nowAgorot;
    await addExpectedIncome(db, {
      label: 'ודאי',
      expectedAmountAgorot: fromShekels(900),
      expectedDate: '2026-08-25',
      certainty: 'confirmed',
    });
    const after = await dashboard();
    expect(after.safeToSpend.nowAgorot).toBe(before);
    expect(after.safeToSpend.projection.confirmedIncomeLeftAgorot).toBe(fromShekels(900));
  });
});

describe('⭐ "הכסף נכנס" — בלי ספירה כפולה', () => {
  it('נוצרת עסקה וההכנסה מסומנת, בפעולה אחת', async () => {
    const income = await addExpectedIncome(db, {
      label: 'משכורת',
      expectedAmountAgorot: fromShekels(900),
      expectedDate: '2026-08-05',
      certainty: 'confirmed',
    });

    const before = await dashboard();
    const result = await markIncomeReceived(db, income.id, {
      accountId: BANK_ACCOUNT_ID,
      categoryId: 'cat-work',
    });

    expect(result.income.received).toBe(true);
    expect(result.income.receivedTransactionId).toBe(result.transaction.id);

    const after = await dashboard();
    // ⭐ היתרה עלתה בדיוק פעם אחת
    expect(after.balance.totalAgorot - before.balance.totalAgorot).toBe(fromShekels(900));
  });

  it('⭐ אחרי הקבלה, ההכנסה לא נספרת שוב בתחזית', async () => {
    const income = await addExpectedIncome(db, {
      label: 'משכורת',
      expectedAmountAgorot: fromShekels(900),
      expectedDate: '2026-08-25',
      certainty: 'confirmed',
    });

    const before = await dashboard();
    expect(before.safeToSpend.projection.confirmedIncomeLeftAgorot).toBe(fromShekels(900));

    await markIncomeReceived(db, income.id, {
      accountId: BANK_ACCOUNT_ID,
      categoryId: 'cat-work',
      actualDate: '2026-08-06',
    });

    const after = await dashboard();
    // הכסף עכשיו ביתרה, וכבר לא בתחזית
    expect(after.safeToSpend.projection.confirmedIncomeLeftAgorot).toBe(0);
    expect(after.balance.totalAgorot).toBe(fromShekels(1900));
  });

  it('סימון פעמיים נדחה', async () => {
    const income = await addExpectedIncome(db, {
      label: 'משכורת',
      expectedAmountAgorot: fromShekels(900),
      expectedDate: '2026-08-05',
      certainty: 'confirmed',
    });
    await markIncomeReceived(db, income.id, {
      accountId: BANK_ACCOUNT_ID,
      categoryId: 'cat-work',
    });
    await expect(
      markIncomeReceived(db, income.id, {
        accountId: BANK_ACCOUNT_ID,
        categoryId: 'cat-work',
      }),
    ).rejects.toThrow('כבר סומנה');

    expect(await db.transactions.count()).toBe(1);
  });

  it('סכום שונה מהצפוי נשמר כפי שהתקבל', async () => {
    const income = await addExpectedIncome(db, {
      label: 'עבודה',
      expectedAmountAgorot: fromShekels(500),
      expectedDate: '2026-08-05',
      certainty: 'confirmed',
    });
    const result = await markIncomeReceived(db, income.id, {
      accountId: BANK_ACCOUNT_ID,
      categoryId: 'cat-work',
      actualAmountAgorot: fromShekels(430),
    });
    expect(result.transaction.amountAgorot).toBe(fromShekels(430));
    expect((await dashboard()).balance.totalAgorot).toBe(fromShekels(1430));
  });
});

describe('ביטול קבלה', () => {
  it('⭐ מוחק את העסקה ומחזיר את ההכנסה לצפויה', async () => {
    const income = await addExpectedIncome(db, {
      label: 'משכורת',
      expectedAmountAgorot: fromShekels(900),
      expectedDate: '2026-08-25',
      certainty: 'confirmed',
    });
    const before = await dashboard();

    await markIncomeReceived(db, income.id, {
      accountId: BANK_ACCOUNT_ID,
      categoryId: 'cat-work',
    });
    await undoIncomeReceived(db, income.id);

    const after = await dashboard();
    expect(after.balance.totalAgorot).toBe(before.balance.totalAgorot);
    expect(await db.transactions.count()).toBe(0);

    const reverted = await db.expectedIncomes.get(income.id);
    expect(reverted?.received).toBe(false);
    expect(reverted?.receivedTransactionId).toBeUndefined();
    // וחזרה להופיע בתחזית
    expect(after.safeToSpend.projection.confirmedIncomeLeftAgorot).toBe(fromShekels(900));
  });

  it('ביטול הכנסה שלא התקבלה אינו עושה כלום', async () => {
    const income = await addExpectedIncome(db, {
      label: 'x',
      expectedAmountAgorot: fromShekels(100),
      expectedDate: '2026-08-25',
      certainty: 'likely',
    });
    await expect(undoIncomeReceived(db, income.id)).resolves.toBeUndefined();
  });
});

describe('עריכה ומחיקה', () => {
  it('עריכה מחשבת נטו מחדש', async () => {
    const income = await addExpectedIncome(db, {
      label: 'עבודה',
      expectedAmountAgorot: fromShekels(500),
      expectedDate: '2026-08-25',
      certainty: 'likely',
    });
    await updateExpectedIncome(db, income.id, { relatedCostsAgorot: fromShekels(80) });
    expect((await db.expectedIncomes.get(income.id))?.expectedAmountAgorot).toBe(
      fromShekels(420),
    );
  });

  it('אי אפשר לערוך הכנסה שהתקבלה', async () => {
    const income = await addExpectedIncome(db, {
      label: 'x',
      expectedAmountAgorot: fromShekels(100),
      expectedDate: '2026-08-05',
      certainty: 'confirmed',
    });
    await markIncomeReceived(db, income.id, {
      accountId: BANK_ACCOUNT_ID,
      categoryId: 'cat-work',
    });
    await expect(updateExpectedIncome(db, income.id, { label: 'y' })).rejects.toThrow(
      'שכבר התקבלה',
    );
  });

  it('מחיקת הכנסה שהתקבלה נחסמת', async () => {
    const income = await addExpectedIncome(db, {
      label: 'x',
      expectedAmountAgorot: fromShekels(100),
      expectedDate: '2026-08-05',
      certainty: 'confirmed',
    });
    await markIncomeReceived(db, income.id, {
      accountId: BANK_ACCOUNT_ID,
      categoryId: 'cat-work',
    });
    await expect(deleteExpectedIncome(db, income.id)).rejects.toThrow('כבר התקבלה');
  });

  it('מחיקת הכנסה שטרם התקבלה עובדת', async () => {
    const income = await addExpectedIncome(db, {
      label: 'x',
      expectedAmountAgorot: fromShekels(100),
      expectedDate: '2026-08-25',
      certainty: 'possible',
    });
    await deleteExpectedIncome(db, income.id);
    expect(await db.expectedIncomes.count()).toBe(0);
  });
});

describe('רשימות', () => {
  it('צפויות וממתינות לסימון', async () => {
    await addExpectedIncome(db, {
      label: 'עתידית',
      expectedAmountAgorot: fromShekels(100),
      expectedDate: '2026-08-25',
      certainty: 'confirmed',
    });
    await addExpectedIncome(db, {
      label: 'עברה',
      expectedAmountAgorot: fromShekels(100),
      expectedDate: '2026-08-01',
      certainty: 'confirmed',
    });

    expect((await pendingIncomes(db, TODAY)).map((i) => i.label)).toEqual(['עתידית']);
    expect((await overdueIncomes(db, TODAY)).map((i) => i.label)).toEqual(['עברה']);
  });
});
