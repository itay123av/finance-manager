/**
 * בדיקות שכבת ההרכבה — המספרים המדויקים שיופיעו על המסך.
 *
 * מכיוון שהממשק לא מחשב כלום, בדיקה של המודול הזה היא בדיקה של לוח
 * הבקרה עצמו, בלי להריץ React.
 */

import { describe, expect, it } from 'vitest';
import {
  buildDashboard,
  detectSeasonalContext,
  lastRelevantSummerYear,
  monthsElapsedSinceSummer,
  MIN_SUMMER_INCOME_FOR_ALLOCATION_AGOROT,
  SEASONAL_MONTHS_TO_COVER,
  type DashboardInput,
} from '../../core/dashboard';
import { DEFAULT_CATEGORIES } from '../../content/categories.seed';
import { DEFAULT_SAFETY_BUFFER_AGOROT, type AppSettings } from '../../core/types';
import { ILS, account, expectedIncome, goal, income, plannedExpense, tx } from '../helpers';

const TODAY = '2026-08-07';

const settings: AppSettings = {
  id: 'singleton',
  schemaVersion: 1,
  safetyBufferAgorot: DEFAULT_SAFETY_BUFFER_AGOROT,
  budgetPlanId: 'balanced',
  estimatedMonthlySpendAgorot: ILS(400),
  showAgorot: false,
  discreetMode: false,
};

function input(overrides: Partial<DashboardInput> = {}): DashboardInput {
  return {
    today: TODAY,
    accounts: [
      account({ id: 'acc-bank', openingBalanceAgorot: ILS(1000), openingDate: '2026-01-01' }),
      account({
        id: 'acc-cash',
        name: 'מזומן',
        type: 'cash',
        openingBalanceAgorot: ILS(200),
        openingDate: '2026-01-01',
      }),
    ],
    transactions: [],
    categories: DEFAULT_CATEGORIES,
    goal: goal(),
    settings,
    expectedIncomes: [],
    plannedExpenses: [],
    recurringTransactions: [],
    ...overrides,
  };
}

describe('הרכבה בסיסית', () => {
  it('מחזיר את כל מה שהמסך צריך', () => {
    const d = buildDashboard(input());
    expect(d.today).toBe(TODAY);
    expect(d.balance.totalAgorot).toBe(ILS(1200));
    expect(d.balance.byAccount).toHaveLength(2);
    expect(d.goalProgress.targetAgorot).toBe(ILS(5000));
    expect(d.budgetPlan.id).toBe('balanced');
    expect(d.forecast.monthEnd.horizonMonths).toBe(1);
    expect(d.forecast.threeMonths.horizonMonths).toBe(3);
  });

  it('בלי היסטוריה — התקציב נשען על ההערכה מהאונבורדינג', () => {
    const d = buildDashboard(input());
    // 400 × 0.9 = 360
    expect(d.budgetPlan.monthlySpendAgorot).toBe(ILS(360));
  });

  it('עם היסטוריה — התקציב נשען על ההוצאה בפועל', () => {
    // סכומים ובתי עסק משתנים בכוונה: סדרה זהה לחלוטין הייתה מזוהה כמנוי
    // חודשי, והופכת לרצפת התחייבויות שלא ניתן לתקצב מתחתיה.
    const transactions = [
      ['2026-04', 600, 'ארומה'],
      ['2026-05', 610, 'פיצה האט'],
      ['2026-06', 590, 'קופיקס'],
      ['2026-07', 600, 'שווארמה'],
    ].map(([month, shekels, merchant]) =>
      tx({
        date: `${month as string}-10`,
        shekels: shekels as number,
        merchant: merchant as string,
        categoryId: 'cat-food-out',
      }),
    );
    const d = buildDashboard(input({ transactions }));
    expect(d.budgetPlan.monthlySpendAgorot).toBe(ILS(540)); // חציון 600 × 0.9
  });

  it('⭐ הכנסה ודאית שטרם התקבלה אינה מקטינה את "בטוח להוציא"', () => {
    // ⚠️ הבאג שנתפס: תרומה ליעד שנגזרת מהכנסה עתידית הייתה מנוכה
    // מהכסף הפנוי — כלומר המשתמש נדרש להוציא פחות היום, בגלל כסף
    // שאולי לא יגיע. זו בדיוק ההפרדה שכל המערכת בנויה סביבה.
    const withoutIncome = buildDashboard(input());
    const withIncome = buildDashboard(
      input({
        expectedIncomes: [
          expectedIncome({ certainty: 'confirmed', expectedDate: '2026-08-25', expectedAmountAgorot: ILS(900) }),
        ],
      }),
    );

    expect(withIncome.safeToSpend.nowAgorot).toBe(withoutIncome.safeToSpend.nowAgorot);
    expect(withIncome.budgetPlan.goalContributionAgorot).toBe(0);

    // אבל התחזית כן מציגה מה יקרה אם הכסף ייכנס
    expect(withIncome.budgetPlan.projectedGoalContributionAgorot).toBe(ILS(540)); // 900 − 360
    expect(withIncome.safeToSpend.projection.confirmedIncomeLeftAgorot).toBe(ILS(900));
  });

  it('הכנסה לא ודאית מעלה את רמת הסיכון של התקציב', () => {
    const risky = buildDashboard(
      input({
        expectedIncomes: [
          expectedIncome({ certainty: 'possible', expectedDate: '2026-08-25', expectedAmountAgorot: ILS(900) }),
        ],
      }),
    );
    expect(risky.budgetPlan.risk.factors.unconfirmedIncome).toBe(1);
    expect(buildDashboard(input()).budgetPlan.risk.factors.unconfirmedIncome).toBe(0);
  });

  it('הקטגוריות הבולטות מוגבלות לחמש', () => {
    const transactions = DEFAULT_CATEGORIES.filter((c) => c.kind === 'expense').map((c, i) =>
      tx({ date: '2026-08-02', shekels: 100 + i, categoryId: c.id }),
    );
    expect(buildDashboard(input({ transactions })).topCategories).toHaveLength(5);
  });

  it('אחוז החלק מסך ההוצאות מחושב', () => {
    const transactions = [
      tx({ date: '2026-08-02', shekels: 75, categoryId: 'cat-food-out' }),
      tx({ date: '2026-08-03', shekels: 25, categoryId: 'cat-transport' }),
    ];
    const top = buildDashboard(input({ transactions })).topCategories;
    expect(top[0]?.sharePct).toBe(75);
    expect(top[1]?.sharePct).toBe(25);
  });
});

describe('זיהוי הקיץ הרלוונטי', () => {
  it('ביולי-אוגוסט זה הקיץ הנוכחי', () => {
    expect(lastRelevantSummerYear('2026-07-15')).toBe(2026);
    expect(lastRelevantSummerYear('2026-08-07')).toBe(2026);
    expect(lastRelevantSummerYear('2026-09-01')).toBe(2026);
  });

  it('לפני יולי זה הקיץ שקדם', () => {
    expect(lastRelevantSummerYear('2026-01-15')).toBe(2025);
    expect(lastRelevantSummerYear('2026-06-30')).toBe(2025);
  });

  it('חודשים שעברו מתחילת הפריסה', () => {
    expect(monthsElapsedSinceSummer('2026-07-15')).toBe(0); // הקיץ עצמו
    expect(monthsElapsedSinceSummer('2026-08-07')).toBe(0);
    expect(monthsElapsedSinceSummer('2026-09-10')).toBe(0); // החודש הראשון
    expect(monthsElapsedSinceSummer('2026-10-10')).toBe(1);
    expect(monthsElapsedSinceSummer('2027-06-10')).toBe(9);
  });

  it('לא חורג מאורך התקופה גם בחודש חריג', () => {
    // יוני הוא החודש האחרון בפריסה; מעבר לזה כבר קיץ חדש
    expect(monthsElapsedSinceSummer('2027-06-30')).toBe(SEASONAL_MONTHS_TO_COVER - 1);
  });
});

describe('⭐ כסף הקיץ — הרכיב שמונע את הטעות המסוכנת', () => {
  const summerTransactions = [
    income({ date: '2026-07-06', shekels: 2400, categoryId: 'cat-work' }),
    income({ date: '2026-08-05', shekels: 1200, categoryId: 'cat-work' }),
    ...['2026-04', '2026-05', '2026-06'].map((m) =>
      tx({ date: `${m}-10`, shekels: 300, categoryId: 'cat-food-out' }),
    ),
  ];

  it('מזהה הכנסת קיץ ושומר חלק ניכר ממנה', () => {
    const context = detectSeasonalContext(input({ transactions: summerTransactions }));
    expect(context.allocation).not.toBeNull();
    expect(context.summerIncomeAgorot).toBe(ILS(3600));
    expect(context.reservedAgorot).toBeGreaterThan(0);
    expect(context.explanationHe).toContain('חודשים');
  });

  it('הסכום השמור מקטין את "בטוח להוציא" משמעותית', () => {
    const withSummer = buildDashboard(input({ transactions: summerTransactions }));
    expect(withSummer.safeToSpend.breakdown.reservedForFutureMonthsAgorot).toBeGreaterThan(0);
    // בלי הרכיב הזה היה מותר להוציא כמעט את כל היתרה מעל סכום הביטחון
    const naiveCeiling = withSummer.balance.totalAgorot - DEFAULT_SAFETY_BUFFER_AGOROT;
    expect(withSummer.safeToSpend.nowAgorot).toBeLessThan(naiveCeiling);
  });

  it('הסכום השמור לעולם לא עולה על היתרה בפועל', () => {
    const context = detectSeasonalContext(
      input({
        transactions: [
          ...summerTransactions,
          tx({ date: '2026-08-06', shekels: 4000, categoryId: 'cat-shopping' }),
        ],
      }),
    );
    const balance = ILS(1200) + ILS(3600) - ILS(900) - ILS(4000);
    expect(context.reservedAgorot).toBeLessThanOrEqual(Math.max(0, balance));
  });

  it('⭐ ההקצבה של החודש הנוכחי נשארת זמינה — לא נשמרת לעתיד', () => {
    // משתמש חדש שקיבל משכורת קיץ: בלי התקרה, כל היתרה הייתה נשמרת
    // ו"בטוח להוציא" היה 0 — באותו מסך שבו כתוב "הקצבה חודשית ₪40".
    const d = buildDashboard(input({ transactions: summerTransactions }));
    expect(d.seasonal.allocation).not.toBeNull();
    expect(d.safeToSpend.nowAgorot).toBeGreaterThan(0);
    expect(d.safeToSpend.nowAgorot).toBeGreaterThanOrEqual(
      d.seasonal.allocation!.monthlyAllowanceAgorot,
    );
  });

  it('⭐ סכום הביטחון לא נספר פעמיים', () => {
    const d = buildDashboard(input({ transactions: summerTransactions }));
    const { breakdown } = d.safeToSpend;
    // היתרה פחות הביטחון פחות השמור חייבת להסתדר בדיוק
    expect(
      breakdown.currentBalanceAgorot -
        breakdown.safetyBufferAgorot -
        breakdown.reservedForFutureMonthsAgorot -
        breakdown.committedLeftAgorot -
        breakdown.goalDueThisMonthAgorot,
    ).toBe(breakdown.resultAgorot);
    expect(breakdown.resultAgorot).toBeGreaterThanOrEqual(0);
  });

  it('הקצבת הבילויים מגיעה מהפריסה העונתית כשהיא פעילה', () => {
    const d = buildDashboard(input({ transactions: summerTransactions }));
    expect(d.fun.plannedAgorot).toBe(d.seasonal.allocation?.monthlyFunAgorot);
  });

  it('בלי פריסה עונתית — הבילויים מגיעים מהתקציב הרגיל', () => {
    const d = buildDashboard(input());
    expect(d.seasonal.allocation).toBeNull();
    expect(d.fun.plannedAgorot).toBe(d.budgetPlan.funBudgetAgorot);
  });

  it('⭐ אין ניכוי כפול: כשהפריסה פעילה, תרומת היעד אינה מנוכה בנוסף', () => {
    const d = buildDashboard(input({ transactions: summerTransactions }));
    expect(d.seasonal.allocation).not.toBeNull();
    expect(d.safeToSpend.breakdown.goalDueThisMonthAgorot).toBe(0);
  });

  it('הכנסת קיץ זניחה אינה מפעילה פריסה', () => {
    const context = detectSeasonalContext(
      input({
        transactions: [
          income({
            date: '2026-07-06',
            amountAgorot: MIN_SUMMER_INCOME_FOR_ALLOCATION_AGOROT - 1,
            categoryId: 'cat-work',
          }),
        ],
      }),
    );
    expect(context.allocation).toBeNull();
    expect(context.reservedAgorot).toBe(0);
    expect(context.explanationHe).toContain('לא נרשמה');
  });

  it('בלי שום הכנסה — אין פריסה ואין סכום שמור', () => {
    const d = buildDashboard(input());
    expect(d.seasonal.reservedAgorot).toBe(0);
    expect(d.safeToSpend.breakdown.reservedForFutureMonthsAgorot).toBe(0);
  });
});

describe('בילויים', () => {
  it('מחשב ניצול מקטגוריות הנאה בלבד', () => {
    const transactions = [
      tx({ date: '2026-08-02', shekels: 60, categoryId: 'cat-food-out' }), // fun
      tx({ date: '2026-08-03', shekels: 40, categoryId: 'cat-friends' }), // fun
      tx({ date: '2026-08-04', shekels: 90, categoryId: 'cat-transport' }), // essential
    ];
    const d = buildDashboard(input({ transactions }));
    expect(d.fun.spentAgorot).toBe(ILS(100));
  });

  it('לא סופר עסקאות של חודש קודם', () => {
    const d = buildDashboard(
      input({ transactions: [tx({ date: '2026-07-20', shekels: 90, categoryId: 'cat-food-out' })] }),
    );
    expect(d.fun.spentAgorot).toBe(0);
  });

  it('תקציב בילויים אפס לא גורם לחלוקה באפס', () => {
    const d = buildDashboard(
      input({ settings: { ...settings, estimatedMonthlySpendAgorot: 0 } }),
    );
    expect(d.fun.plannedAgorot).toBe(0);
    expect(d.fun.usedPct).toBe(0);
  });

  it('חריגה מתקציב הבילויים נותנת יתרה שלילית ואחוז מעל 100', () => {
    const transactions = [tx({ date: '2026-08-02', shekels: 500, categoryId: 'cat-food-out' })];
    const d = buildDashboard(input({ transactions }));
    expect(d.fun.remainingAgorot).toBeLessThan(0);
    expect(d.fun.usedPct).toBeGreaterThan(100);
  });
});

describe('התחייבויות ותחזית', () => {
  it('הוצאה מתוכננת מנוכה מ"בטוח להוציא"', () => {
    const without = buildDashboard(input()).safeToSpend.nowAgorot;
    const withPlanned = buildDashboard(
      input({
        plannedExpenses: [
          plannedExpense({ amountAgorot: ILS(240), dueDate: '2026-08-25', priority: 'must' }),
        ],
      }),
    ).safeToSpend.nowAgorot;
    expect(without - withPlanned).toBe(ILS(240));
  });

  it('התחזית לשלושה חודשים אינה ברמת ביטחון גבוהה', () => {
    const transactions = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].map(
      (m) => tx({ date: `${m}-10`, shekels: 300, categoryId: 'cat-food-out' }),
    );
    const d = buildDashboard(input({ transactions }));
    expect(d.forecast.monthEnd.confidence).toBe('high');
    expect(d.forecast.threeMonths.confidence).toBe('medium');
  });
});

describe('התראות', () => {
  it('ההתראות מגיעות מלוח הבקרה, ממוינות לפי דחיפות', () => {
    const d = buildDashboard(input());
    expect(Array.isArray(d.alerts)).toBe(true);
    const priorities = d.alerts.map((a) => a.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
  });

  it('⭐ חיוב כרטיס מרוכז אינו מייצר התראת "עסקה חריגה"', () => {
    // הסכום הזה חורג מכל עסקה רגילה — אבל הוא סכום של יום שלם, ואין
    // לו שם בית עסק. "שווה לוודא שהיא נכונה" בלי לומר מה לוודא.
    const transactions = [
      tx({ date: '2026-08-01', shekels: 40 }),
      tx({ date: '2026-08-02', shekels: 45 }),
      tx({ date: '2026-08-03', shekels: 38 }),
      tx({ date: '2026-08-04', shekels: 900, merchant: 'חיוב לכרטיס ויזה 1234' }),
    ];
    const d = buildDashboard(input({ transactions }));
    expect(d.alerts.find((a) => a.type === 'unusual_transaction')).toBeUndefined();
  });

  it('עסקה חריגה רגילה כן מייצרת התראה', () => {
    const transactions = [
      tx({ date: '2026-07-01', shekels: 40 }),
      tx({ date: '2026-07-10', shekels: 45 }),
      tx({ date: '2026-07-20', shekels: 38 }),
      tx({ date: '2026-08-04', shekels: 700 }),
    ];
    const d = buildDashboard(input({ transactions }));
    expect(d.alerts.find((a) => a.type === 'unusual_transaction')).toBeDefined();
  });

  it('תזכורת רעננות כשהייבוא האחרון ישן', () => {
    const d = buildDashboard(input({ lastImportDate: '2026-06-01' }));
    expect(d.alerts.find((a) => a.type === 'import_stale')).toBeDefined();
  });

  it('בלי תזכורת רעננות כשהייבוא טרי, וכשמעולם לא יובא קובץ', () => {
    expect(
      buildDashboard(input({ lastImportDate: '2026-08-05' })).alerts.find(
        (a) => a.type === 'import_stale',
      ),
    ).toBeUndefined();
    expect(
      buildDashboard(input()).alerts.find((a) => a.type === 'import_stale'),
    ).toBeUndefined();
  });
});

describe('חיוב חוזר חדש', () => {
  // שם בית עסק בדוי בכוונה — אין שמות אמיתיים בבדיקות
  const SUBSCRIPTION = 'שירות דיגיטלי';

  it('מתריע על מנוי שהתחיל לאחרונה', () => {
    const transactions = [
      tx({ date: '2026-07-05', shekels: 30, merchant: SUBSCRIPTION }),
      tx({ date: '2026-08-04', shekels: 30, merchant: SUBSCRIPTION }),
    ];
    const alert = buildDashboard(input({ transactions })).alerts.find(
      (a) => a.type === 'new_recurring_detected',
    );
    expect(alert?.bodyHe).toContain(SUBSCRIPTION);
    // ⭐ המערכת מזהה — היא לא מוסיפה לתקציב, ולכן לא מבטיחה שכן
    expect(alert?.bodyHe).not.toContain('הוספתי');
    expect(alert?.bodyHe).toContain('בשנה');
  });

  it('⭐ מנוי ותיק אינו מוכרז מחדש בכל טעינה', () => {
    const transactions = [
      tx({ date: '2026-03-05', shekels: 30, merchant: SUBSCRIPTION }),
      tx({ date: '2026-04-04', shekels: 30, merchant: SUBSCRIPTION }),
      tx({ date: '2026-05-05', shekels: 30, merchant: SUBSCRIPTION }),
      tx({ date: '2026-06-04', shekels: 30, merchant: SUBSCRIPTION }),
      tx({ date: '2026-07-05', shekels: 30, merchant: SUBSCRIPTION }),
      tx({ date: '2026-08-04', shekels: 30, merchant: SUBSCRIPTION }),
    ];
    expect(
      buildDashboard(input({ transactions })).alerts.find(
        (a) => a.type === 'new_recurring_detected',
      ),
    ).toBeUndefined();
  });
});
