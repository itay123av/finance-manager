/**
 * ⭐ בדיקת רגרסיה קבועה: כסף הקיץ ו"בטוח להוציא".
 *
 * הבאג שנתפס באימות שלב 3: אחרי ייבוא משכורת קיץ, הדשבורד הציג
 * "בטוח להוציא: ₪0" ובאותו מסך "הקצבה חודשית: ₪40" — שני מספרים
 * שסותרים זה את זה. שתי סיבות: ההקצבה של החודש הנוכחי נכללה בסכום
 * השמור, וסכום הביטחון נוכה פעמיים.
 *
 * הבדיקה הזו רצה מקצה לקצה — מבסיס נתונים אמיתי ועד המספרים שעל
 * המסך — כדי שהבאג לא יחזור בשקט דרך שינוי במודול אחר.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { FinanceDatabase } from '../../data/db';
import {
  BANK_ACCOUNT_ID,
  addTransaction,
  completeOnboarding,
  loadSnapshot,
  saveSettings,
} from '../../data/repositories';
import { buildDashboard, type DashboardData } from '../../core/dashboard';
import { fromShekels } from '../../core/money';
import { DEFAULT_SAFETY_BUFFER_AGOROT } from '../../core/types';

/** אוגוסט — מיד אחרי שנכנסה משכורת הקיץ. */
const NOW = new Date('2026-08-07T09:00:00Z');
let db: FinanceDatabase;
let counter = 0;

beforeEach(async () => {
  db = new FinanceDatabase(`test-seasonal-${++counter}`);
  await db.open();
  await completeOnboarding(db, {
    bankBalanceAgorot: fromShekels(300),
    cashBalanceAgorot: fromShekels(0),
    safetyBufferAgorot: DEFAULT_SAFETY_BUFFER_AGOROT,
    targetAgorot: fromShekels(5000),
    milestones: [fromShekels(1000), fromShekels(2500), fromShekels(5000)],
    estimatedMonthlySpendAgorot: fromShekels(400),
    openingDate: '2026-06-01',
  });
});

async function dashboard(): Promise<DashboardData> {
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
  });
}

/** משכורת קיץ גדולה + קצת הוצאות רגילות לפניה. */
async function addSummerSalary(shekels = 4200) {
  await addTransaction(db, {
    accountId: BANK_ACCOUNT_ID,
    date: '2026-07-05',
    amountAgorot: fromShekels(shekels),
    type: 'income',
    categoryId: 'cat-work',
    merchant: 'עבודה בעסק מקומי',
  });
  for (const [date, amount, merchant] of [
    ['2026-06-10', 120, 'ארומה'],
    ['2026-07-14', 95, 'פיצה האט'],
    ['2026-08-02', 60, 'קופיקס'],
  ] as const) {
    await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date,
      amountAgorot: fromShekels(amount),
      type: 'expense',
      categoryId: 'cat-food-out',
      merchant,
    });
  }
}

describe('⭐ משכורת קיץ נכנסת', () => {
  it('חלק מהכסף מוקצה לחודשים הבאים', async () => {
    const before = await dashboard();
    expect(before.seasonal.allocation).toBeNull();
    expect(before.seasonal.reservedAgorot).toBe(0);

    await addSummerSalary();
    const after = await dashboard();

    expect(after.seasonal.allocation).not.toBeNull();
    expect(after.seasonal.reservedAgorot).toBeGreaterThan(0);
    expect(after.seasonal.summerIncomeAgorot).toBe(fromShekels(4200));
  });

  it('⭐ ההקצבה של החודש הנוכחי אינה נכללת בסכום השמור', async () => {
    await addSummerSalary();
    const d = await dashboard();
    const allowance = d.seasonal.allocation!.monthlyAllowanceAgorot;

    // השמור + הביטחון + ההקצבה של החודש חייבים להיכנס בתוך היתרה
    expect(
      d.seasonal.reservedAgorot + d.safeToSpend.breakdown.safetyBufferAgorot + allowance,
    ).toBeLessThanOrEqual(d.balance.totalAgorot);
  });

  it('⭐ סכום הביטחון אינו מנוכה פעמיים', async () => {
    await addSummerSalary();
    const { breakdown } = (await dashboard()).safeToSpend;

    // הפירוק חייב להסתכם בדיוק — כל ניכוי כפול היה שובר את השוויון
    expect(
      breakdown.currentBalanceAgorot -
        breakdown.safetyBufferAgorot -
        breakdown.committedLeftAgorot -
        breakdown.reservedForFutureMonthsAgorot -
        breakdown.goalDueThisMonthAgorot,
    ).toBe(breakdown.resultAgorot);

    // והביטחון מופיע פעם אחת בלבד, בערכו המלא
    expect(breakdown.safetyBufferAgorot).toBe(DEFAULT_SAFETY_BUFFER_AGOROT);
  });

  it('⭐ safeToSpendNow משקף רק את מה שבאמת זמין עכשיו', async () => {
    await addSummerSalary();
    const d = await dashboard();

    // חיובי — לא "הכל שמור" כמו בבאג
    expect(d.safeToSpend.nowAgorot).toBeGreaterThan(0);
    // אבל הרבה פחות מהיתרה — הרי רוב הכסף מיועד לחודשים הבאים
    expect(d.safeToSpend.nowAgorot).toBeLessThan(d.balance.totalAgorot / 2);
    // ולפחות ההקצבה של החודש
    expect(d.safeToSpend.nowAgorot).toBeGreaterThanOrEqual(
      d.seasonal.allocation!.monthlyAllowanceAgorot,
    );
  });

  it('⭐ אין סתירה בין "בטוח להוציא" להקצבה החודשית', async () => {
    await addSummerSalary();
    const d = await dashboard();
    // בדיוק הסתירה שהתגלתה: ₪0 על המסך לצד ₪40 הקצבה
    expect(d.safeToSpend.isOverspent).toBe(false);
    expect(d.seasonal.allocation!.monthlyAllowanceAgorot).toBeGreaterThan(0);
  });
});

describe('⭐ שינוי בסכום הביטחון מעדכן מיד', () => {
  it('העלאת הביטחון מקטינה את "בטוח להוציא" בדיוק בהפרש', async () => {
    await addSummerSalary();
    const before = await dashboard();

    await saveSettings(db, { safetyBufferAgorot: fromShekels(800) });
    const after = await dashboard();

    expect(after.safeToSpend.breakdown.safetyBufferAgorot).toBe(fromShekels(800));
    // הסכום השמור מותאם כדי שההקצבה החודשית תישמר זמינה
    expect(after.safeToSpend.nowAgorot).toBeGreaterThanOrEqual(
      after.seasonal.allocation!.monthlyAllowanceAgorot,
    );
    expect(after.safeToSpend.nowAgorot).toBeLessThanOrEqual(before.safeToSpend.nowAgorot);
  });

  it('הורדת הביטחון משחררת כסף', async () => {
    await addSummerSalary();
    await saveSettings(db, { safetyBufferAgorot: fromShekels(800) });
    const high = await dashboard();

    await saveSettings(db, { safetyBufferAgorot: fromShekels(300) });
    const low = await dashboard();

    expect(low.safeToSpend.nowAgorot).toBeGreaterThanOrEqual(high.safeToSpend.nowAgorot);
  });
});

describe('⭐ ברירת המחדל של סכום הביטחון', () => {
  it('הקבוע בקוד הוא ₪500', () => {
    expect(DEFAULT_SAFETY_BUFFER_AGOROT).toBe(50_000);
  });

  it('אונבורדינג בלי בחירה מפורשת שומר ₪500', async () => {
    const fresh = new FinanceDatabase(`test-buffer-default-${++counter}`);
    await fresh.open();
    await completeOnboarding(fresh, {
      bankBalanceAgorot: fromShekels(1000),
      cashBalanceAgorot: 0,
      safetyBufferAgorot: DEFAULT_SAFETY_BUFFER_AGOROT,
      targetAgorot: fromShekels(5000),
      milestones: [fromShekels(5000)],
      estimatedMonthlySpendAgorot: fromShekels(400),
      openingDate: '2026-08-01',
    });
    const snapshot = await loadSnapshot(fresh, NOW);
    expect(snapshot.settings.safetyBufferAgorot).toBe(fromShekels(500));
  });

  it('הבחירה האמצעית מבין השלוש היא ברירת המחדל', async () => {
    const { SAFETY_BUFFER_PRESETS_AGOROT } = await import('../../core/types');
    expect([...SAFETY_BUFFER_PRESETS_AGOROT]).toEqual([30_000, 50_000, 80_000]);
    expect(SAFETY_BUFFER_PRESETS_AGOROT[1]).toBe(DEFAULT_SAFETY_BUFFER_AGOROT);
  });

  it('בבסיס נתונים חדש בלי אונבורדינג — ההגדרות נושאות ₪500', async () => {
    const fresh = new FinanceDatabase(`test-buffer-fresh-${++counter}`);
    await fresh.open();
    const snapshot = await loadSnapshot(fresh, NOW);
    expect(snapshot.settings.safetyBufferAgorot).toBe(fromShekels(500));
  });
});
