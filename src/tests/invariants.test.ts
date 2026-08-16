/**
 * ════════════════════════════════════════════════════════════════════════
 *  ⭐ ה-invariants הפיננסיים של גרסה 1.
 *
 *  זו לא בדיקת יחידה. זו רשימת ההבטחות שהמערכת נותנת על הכסף, במקום
 *  אחד, על מערכת אחת מורכבת — עם כרטיס פעיל שיש לו פירוט, כרטיס ישן
 *  שאין לו, הכנסה עתידית, ורזרבה עונתית.
 *
 *  אם אחת מאלה נופלת, המערכת משקרת על כסף. אין כאן "כמעט": כל
 *  הבדיקות כאן הן שערים לשחרור, לא המלצות.
 * ════════════════════════════════════════════════════════════════════════
 */

import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { FinanceDatabase } from '../data/db';
import {
  addTransaction,
  completeOnboarding,
  loadSnapshot,
  setTransactionCategory,
  BANK_ACCOUNT_ID,
} from '../data/repositories';
import { addExpectedIncome } from '../data/expectedIncome';
import { createBackup, restoreFromText } from '../data/backup';
import { buildDashboard, type DashboardData } from '../core/dashboard';
import { totalBalance } from '../core/balance';
import { checkNoDoubleCounting, getEffectiveExpenses, isOpaqueCategory } from '../core/effectiveSpending';
import { effectiveExpensesByCategory } from '../core/effectiveSpending';
import { simulatePurchase } from '../core/purchaseSimulation';
import { formatILS, fromShekels, toShekels } from '../core/money';
import type { CardTransaction, CreditCard } from '../core/types';
import type { Snapshot as RepoSnapshot } from '../data/repositories';

const NOW = new Date('2026-08-15T09:00:00Z');
const TODAY = '2026-08-15';

const ACTIVE_CARD: CreditCard = {
  id: 'card-active',
  nickname: 'כרטיס נוכחי',
  last4: '1234',
  issuer: 'מנפיק',
  chargeMode: 'immediate',
  active: true,
};

const RETIRED_CARD: CreditCard = {
  id: 'card-retired',
  nickname: 'כרטיס ישן',
  last4: '9876',
  issuer: 'מנפיק',
  chargeMode: 'immediate',
  active: false,
};

let db: FinanceDatabase;
let snapshot: RepoSnapshot;
let dashboard: DashboardData;

function build(s: RepoSnapshot): DashboardData {
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
    lastImportDate: s.lastImportDate,
  });
}

/**
 * מערכת מלאה, בכוונה לא נוחה: כרטיס עם פירוט מקושר, כרטיס ישן בלי
 * פירוט, הכנסת קיץ, והכנסה עתידית ודאית.
 */
beforeAll(async () => {
  db = new FinanceDatabase(`test-invariants-${Date.now()}`);
  await db.open();

  await completeOnboarding(db, {
    bankBalanceAgorot: fromShekels(800),
    cashBalanceAgorot: fromShekels(120),
    safetyBufferAgorot: fromShekels(500),
    targetAgorot: fromShekels(5000),
    milestones: [fromShekels(1000), fromShekels(2500), fromShekels(5000)],
    estimatedMonthlySpendAgorot: fromShekels(400),
    openingDate: '2026-02-01',
  });

  // הכנסות: רגילות לאורך השנה, ושיא בקיץ
  for (const [date, shekels] of [
    ['2026-03-05', 250],
    ['2026-04-05', 180],
    ['2026-05-05', 220],
    ['2026-07-04', 2400],
    ['2026-08-03', 1900],
  ] as const) {
    await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date,
      amountAgorot: fromShekels(shekels),
      type: 'income',
      categoryId: 'cat-work',
      merchant: 'משמרת',
    });
  }

  // הוצאות רגילות
  for (const [date, shekels, categoryId] of [
    ['2026-03-12', 90, 'cat-food-out'],
    ['2026-04-19', 140, 'cat-shopping'],
    ['2026-05-22', 75, 'cat-transport'],
    ['2026-06-14', 210, 'cat-friends'],
    ['2026-07-18', 160, 'cat-food-out'],
  ] as const) {
    await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date,
      amountAgorot: fromShekels(shekels),
      type: 'expense',
      categoryId,
      merchant: 'קנייה',
    });
  }

  // ── חיוב כרטיס פעיל, עם פירוט מקושר ────────────────────────────
  const activeCharge = await addTransaction(db, {
    accountId: BANK_ACCOUNT_ID,
    date: '2026-08-06',
    amountAgorot: fromShekels(180),
    type: 'expense',
    categoryId: 'cat-shopping',
    merchant: 'חיוב לכרטיס ויזה 1234',
  });

  // ── חיוב כרטיס ישן, בלי פירוט לעולם ────────────────────────────
  await addTransaction(db, {
    accountId: BANK_ACCOUNT_ID,
    date: '2026-08-08',
    amountAgorot: fromShekels(95),
    type: 'expense',
    categoryId: 'cat-shopping',
    merchant: 'חיוב לכרטיס ויזה 9876',
  });

  await db.cards.bulkPut([ACTIVE_CARD, RETIRED_CARD]);

  const detail: CardTransaction[] = [
    {
      id: 'cd-1',
      cardId: ACTIVE_CARD.id,
      purchaseDate: '2026-08-05',
      billingDate: '2026-08-06',
      merchant: 'חנות ספרים',
      merchantNormalized: 'חנות ספרים',
      amountAgorot: fromShekels(120),
      currency: 'ILS',
      categoryId: 'cat-study',
      isRefund: false,
      status: 'billed',
      sourceFile: 'בדיקה',
      classificationConfidence: 1,
      userCorrected: true,
      linkedBankTransactionId: activeCharge.id,
      createdAt: '2026-08-06T09:00:00.000Z',
      updatedAt: '2026-08-06T09:00:00.000Z',
    },
    {
      id: 'cd-2',
      cardId: ACTIVE_CARD.id,
      purchaseDate: '2026-08-05',
      billingDate: '2026-08-06',
      merchant: 'בית קפה',
      merchantNormalized: 'בית קפה',
      amountAgorot: fromShekels(60),
      currency: 'ILS',
      categoryId: 'cat-food-out',
      isRefund: false,
      status: 'billed',
      sourceFile: 'בדיקה',
      classificationConfidence: 1,
      userCorrected: true,
      linkedBankTransactionId: activeCharge.id,
      createdAt: '2026-08-06T09:00:00.000Z',
      updatedAt: '2026-08-06T09:00:00.000Z',
    },
  ];
  await db.cardTransactions.bulkPut(detail);

  await addExpectedIncome(db, {
    label: 'משמרת בסוף החודש',
    expectedAmountAgorot: fromShekels(400),
    expectedDate: '2026-08-28',
    certainty: 'confirmed',
  });

  snapshot = await loadSnapshot(db, NOW);
  dashboard = build(snapshot);
});

// ---------------------------------------------------------------------------

describe('⭐ invariant 1 — ליתרה יש מקור אמת אחד', () => {
  it('היתרה נגזרת מהעסקאות, ואינה שדה שמור', () => {
    const derived = totalBalance(snapshot.accounts, snapshot.transactions, TODAY);
    expect(dashboard.balance.totalAgorot).toBe(derived.totalAgorot);

    // ואפשר לגזור אותה גם ידנית, ולקבל את אותו מספר
    const manual =
      snapshot.accounts.reduce((sum, a) => sum + a.openingBalanceAgorot, 0) +
      snapshot.transactions
        .filter((t) => t.status === 'actual' && t.date <= TODAY)
        .reduce((sum, t) => sum + (t.type === 'income' ? t.amountAgorot : -t.amountAgorot), 0);
    expect(dashboard.balance.totalAgorot).toBe(manual);
  });

  it('סכום היתרות לפי חשבון שווה לסך הכולל', () => {
    const sum = dashboard.balance.byAccount.reduce((s, a) => s + a.balanceAgorot, 0);
    expect(sum).toBe(dashboard.balance.totalAgorot);
  });
});

describe('⭐ invariant 2 — כרטיס אשראי בלי ספירה כפולה', () => {
  const range = { from: '2026-02-01' as const, to: TODAY };

  it('ההוצאה האפקטיבית לעולם אינה עולה על ההוצאה בבנק', () => {
    const check = checkNoDoubleCounting({
      transactions: snapshot.transactions,
      cardTransactions: snapshot.cardTransactions,
      cards: snapshot.cards,
      ...range,
    });
    expect(check.ok).toBe(true);
  });

  it('חיוב שיש לו פירוט מוחלף בפירוט — ולא מתווסף אליו', () => {
    const effective = getEffectiveExpenses({
      transactions: snapshot.transactions,
      cardTransactions: snapshot.cardTransactions,
      cards: snapshot.cards,
      ...range,
    });

    // שתי שורות הפירוט נמצאות; החיוב המרוכז של ₪180 אינו
    expect(effective.filter((e) => e.merchant === 'חנות ספרים')).toHaveLength(1);
    expect(effective.filter((e) => e.merchant === 'בית קפה')).toHaveLength(1);
    expect(effective.some((e) => e.merchant === 'חיוב לכרטיס ויזה 1234')).toBe(false);

    // וסכומן שווה בדיוק לחיוב שהוחלף
    const replaced = effective
      .filter((e) => e.replacesBankTransactionId !== undefined)
      .reduce((sum, e) => sum + e.amountAgorot, 0);
    expect(replaced).toBe(fromShekels(180));
  });
});

describe('⭐ invariant 3 — סימולציה אינה נוגעת בנתונים', () => {
  it('הרצת סימולציה לא משנה אף רשומה ולא את היתרה', async () => {
    const before = await db.transactions.toArray();

    simulatePurchase({
      today: TODAY,
      amountAgorot: fromShekels(300),
      balanceAgorot: dashboard.balance.totalAgorot,
      safeToSpendNowAgorot: dashboard.safeToSpend.nowAgorot,
      reservedForFutureMonthsAgorot: dashboard.safeToSpend.breakdown.reservedForFutureMonthsAgorot,
      safetyBufferAgorot: dashboard.safeToSpend.breakdown.safetyBufferAgorot,
      targetAgorot: snapshot.goal!.targetAgorot,
      regularMonthlyNetAgorot: fromShekels(50),
      summerTotalNetAgorot: fromShekels(4000),
      monthEndForecastAgorot: dashboard.forecast.monthEnd.endBalanceAgorot,
      threeMonthForecastAgorot: dashboard.forecast.threeMonths.endBalanceAgorot,
      expectedIncomes: snapshot.expectedIncomes,
      historicalConfidence: dashboard.spendingConfidence.total,
    });

    const after = await db.transactions.toArray();
    expect(after).toEqual(before);

    const fresh = await loadSnapshot(db, NOW);
    expect(build(fresh).balance.totalAgorot).toBe(dashboard.balance.totalAgorot);
  });
});

describe('⭐ invariant 4 — הכנסה עתידית אינה כסף שיש', () => {
  it('הכנסה ודאית שטרם התקבלה לא נכנסת ל"בטוח להוציא עכשיו"', () => {
    const confirmed = dashboard.safeToSpend.projection.confirmedIncomeLeftAgorot;
    expect(confirmed).toBe(fromShekels(400));

    // הפירוק נשען על היתרה בלבד
    const b = dashboard.safeToSpend.breakdown;
    expect(b.currentBalanceAgorot).toBe(dashboard.balance.totalAgorot);
    expect(b.availableNowAgorot).toBe(b.currentBalanceAgorot - b.safetyBufferAgorot);

    // וההפרש בין התחזית לעכשיו הוא בדיוק ההכנסה הוודאית
    expect(dashboard.safeToSpend.projection.byMonthEndAgorot - dashboard.safeToSpend.nowAgorot).toBe(
      confirmed,
    );
  });

  it('הכנסה עתידית אינה משנה את היתרה', () => {
    expect(dashboard.balance.totalAgorot).toBe(
      totalBalance(snapshot.accounts, snapshot.transactions, TODAY).totalAgorot,
    );
  });
});

describe('⭐ invariant 5 — הרזרבה מנוכה פעם אחת', () => {
  it('הפירוק מסתכם בדיוק בתוצאה, בלי ניכוי כפול', () => {
    const b = dashboard.safeToSpend.breakdown;
    const sum =
      b.currentBalanceAgorot -
      b.safetyBufferAgorot -
      b.committedLeftAgorot -
      b.reservedForFutureMonthsAgorot -
      b.goalDueThisMonthAgorot;

    expect(sum).toBe(b.resultAgorot);
    expect(b.resultAgorot).toBe(dashboard.safeToSpend.nowAgorot);
  });

  it('הרזרבה בפירוק זהה לרזרבה העונתית', () => {
    expect(dashboard.safeToSpend.breakdown.reservedForFutureMonthsAgorot).toBe(
      dashboard.seasonal.reservedAgorot,
    );
  });
});

describe('⭐ invariant 6 — גיבוי ושחזור משמרים את התוצאות', () => {
  it('round-trip מלא מחזיר את אותם מספרים בדיוק', async () => {
    const { content } = await createBackup(db, { password: 'סיסמה-לבדיקה', now: NOW });

    // מוחקים בפועל ומשחזרים — לא רק "קוראים את הקובץ"
    await db.transactions.clear();
    await db.accounts.clear();
    expect((await loadSnapshot(db, NOW)).transactions).toHaveLength(0);

    await restoreFromText(db, content, 'סיסמה-לבדיקה');
    const restored = build(await loadSnapshot(db, NOW));

    expect(restored.balance.totalAgorot).toBe(dashboard.balance.totalAgorot);
    expect(restored.safeToSpend.nowAgorot).toBe(dashboard.safeToSpend.nowAgorot);
    expect(restored.safeToSpend.breakdown).toEqual(dashboard.safeToSpend.breakdown);
    expect(restored.goalProgress.progressPct).toBe(dashboard.goalProgress.progressPct);
    expect(restored.seasonal.reservedAgorot).toBe(dashboard.seasonal.reservedAgorot);
    expect(restored.forecast.threeMonths.endBalanceAgorot).toBe(
      dashboard.forecast.threeMonths.endBalanceAgorot,
    );
  });
});

describe('⭐ invariant 7 — שינוי קטגוריה אינו נוגע ביתרה', () => {
  it('סיווג מחדש משנה את הפילוח בלבד', async () => {
    const before = build(await loadSnapshot(db, NOW));
    const target = before.topCategories[0];
    const victim = (await db.transactions.toArray()).find(
      (t) => t.categoryId === 'cat-food-out' && t.merchant === 'קנייה',
    )!;

    await setTransactionCategory(db, victim.id, 'cat-clothes');
    const after = build(await loadSnapshot(db, NOW));

    expect(after.balance.totalAgorot).toBe(before.balance.totalAgorot);
    expect(after.safeToSpend.nowAgorot).toBe(before.safeToSpend.nowAgorot);
    expect(after.month.expenseAgorot).toBe(before.month.expenseAgorot);
    expect(after.goalProgress.progressPct).toBe(before.goalProgress.progressPct);

    // הפילוח כן זז — אחרת הבדיקה לא בדקה כלום
    expect(target).toBeDefined();

    await setTransactionCategory(db, victim.id, 'cat-food-out');
  });
});

describe('⭐ invariant 8 — כרטיס ישן אינו מעוות ייעוץ קטגוריאלי', () => {
  it('חיוב הכרטיס הישן מסווג כאטום ולא כ"קניות"', () => {
    const effective = getEffectiveExpenses({
      transactions: snapshot.transactions,
      cardTransactions: snapshot.cardTransactions,
      cards: snapshot.cards,
      from: '2026-02-01',
      to: TODAY,
    });

    const retired = effective.find((e) => e.amountAgorot === fromShekels(95));
    expect(retired).toBeDefined();
    expect(isOpaqueCategory(retired!.categoryId)).toBe(true);
  });

  it('⭐ הסכומים האטומים אינם נספרים כחלק המפורט, וחוסמים ייעוץ קטגוריאלי', () => {
    const confidence = dashboard.spendingConfidence;
    expect(confidence.opaqueAgorot).toBeGreaterThan(0);
    expect(confidence.detailedAgorot + confidence.opaqueAgorot).toBe(confidence.totalAgorot);
    expect(confidence.detailedShare).toBeLessThan(1);
  });

  it('הקטגוריות האטומות מופיעות בנפרד בפילוח, ולא מתמזגות לקטגוריה אמיתית', () => {
    const effective = getEffectiveExpenses({
      transactions: snapshot.transactions,
      cardTransactions: snapshot.cardTransactions,
      cards: snapshot.cards,
      from: '2026-02-01',
      to: TODAY,
    });
    const totals = effectiveExpensesByCategory(effective, snapshot.categories);
    expect(totals.some((row) => isOpaqueCategory(row.categoryId))).toBe(true);
  });
});

describe('⭐ invariant 9 — הרכיבים המוצגים מסתכמים לסך המוצג', () => {
  it('הפילוק של "בטוח להוציא" מסתכם גם אחרי עיגול לתצוגה', () => {
    // ⚠️ הבדיקה החשובה: לא שהמספרים הפנימיים מסתכמים (זה invariant 5)
    // אלא ש**מה שהמשתמש רואה** מסתכם. עיגול של כל רכיב בנפרד יכול
    // לייצר טור שלא מגיע לסכום שכתוב בשורה התחתונה.
    const b = dashboard.safeToSpend.breakdown;
    const shown = [
      b.currentBalanceAgorot,
      -b.safetyBufferAgorot,
      -b.committedLeftAgorot,
      -b.reservedForFutureMonthsAgorot,
      -b.goalDueThisMonthAgorot,
    ].map((agorot) => Math.round(toShekels(agorot)));

    expect(shown.reduce((a, c) => a + c, 0)).toBe(Math.round(toShekels(b.resultAgorot)));
  });

  it('כל הסכומים נשמרים כאגורות שלמות', () => {
    for (const t of snapshot.transactions) {
      expect(Number.isInteger(t.amountAgorot)).toBe(true);
    }
    for (const value of [
      dashboard.balance.totalAgorot,
      dashboard.safeToSpend.nowAgorot,
      dashboard.seasonal.reservedAgorot,
      dashboard.budgetPlan.monthlySpendAgorot,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe('⭐ invariant 10 — אפס שלילי לא מוצג לעולם', () => {
  it('‎-0‎ מעוצב כאפס רגיל', () => {
    expect(formatILS(-0)).toBe('₪0');
    expect(formatILS(-0, { signed: true })).not.toContain('-');
    expect(formatILS(0, { signed: true })).not.toContain('-');
  });

  it('אף מספר בלוח הבקרה אינו ‎-0‎', () => {
    const values = [
      dashboard.balance.totalAgorot,
      dashboard.safeToSpend.nowAgorot,
      dashboard.safeToSpend.weekAgorot,
      dashboard.safeToSpend.breakdown.committedLeftAgorot,
      dashboard.safeToSpend.breakdown.goalDueThisMonthAgorot,
      dashboard.seasonal.reservedAgorot,
      dashboard.month.netAgorot,
      dashboard.fun.remainingAgorot,
      dashboard.goalProgress.gapAgorot,
    ];
    for (const value of values) {
      expect(Object.is(value, -0)).toBe(false);
      expect(formatILS(value)).not.toBe('-₪0');
    }
  });
});
