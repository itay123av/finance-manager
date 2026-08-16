import { describe, expect, it } from 'vitest';
import {
  baselineMonthlySpend,
  budgetProgress,
  buildBudgetPlan,
  buildBudgetPlans,
  committedRemainingThisMonth,
  DEFAULT_PLAN_ID,
  defaultPlan,
  PLAN_PARAMS,
  weeklyAllowance,
  type BudgetPlanInput,
} from '../../core/budget';
import type { MonthlyAverage } from '../../core/averages';
import { ILS, plannedExpense, tx } from '../helpers';

function average(agorot: number | null, months = 6): MonthlyAverage {
  return {
    agorot,
    confidence: months >= 6 ? 'high' : months >= 3 ? 'medium' : months >= 1 ? 'low' : 'none',
    monthsUsed: months,
    method: agorot === null ? 'none' : 'median',
    values: Array.from({ length: months }, (_, i) => ({
      month: `2026-0${i + 1}`,
      agorot: agorot ?? 0,
    })),
    rangeAgorot: agorot === null ? null : { minAgorot: agorot, maxAgorot: agorot },
  };
}

function input(overrides: Partial<BudgetPlanInput> = {}): BudgetPlanInput {
  return {
    today: '2026-08-07',
    historicalMonthlySpend: average(ILS(400)),
    estimatedMonthlySpendAgorot: ILS(350),
    fixedCommitmentsAgorot: ILS(50),
    expectedMonthlyIncomeAgorot: ILS(500),
    // כברירת מחדל בבדיקות: כל ההכנסה כבר התקבלה
    receivedMonthlyIncomeAgorot: ILS(500),
    currentBalanceAgorot: ILS(1240),
    unconfirmedIncomeShare: 0,
    ...overrides,
  };
}

describe('שלושת המסלולים', () => {
  it('נבנים מההוצאה בפועל, לא ממספר שרירותי', () => {
    const plans = buildBudgetPlans(input());
    expect(plans.map((p) => p.id)).toEqual(['conservative', 'balanced', 'flexible']);
    expect(plans[0]?.monthlySpendAgorot).toBe(ILS(300)); // 400 × 0.75
    expect(plans[1]?.monthlySpendAgorot).toBe(ILS(360)); // 400 × 0.90
    expect(plans[2]?.monthlySpendAgorot).toBe(ILS(400)); // 400 × 1.00
  });

  it('ברירת המחדל היא המאוזן, לא השמרני', () => {
    expect(DEFAULT_PLAN_ID).toBe('balanced');
    const plans = buildBudgetPlans(input());
    expect(defaultPlan(plans).id).toBe('balanced');
    expect(plans.filter((p) => p.isDefault)).toHaveLength(1);
  });

  it('defaultPlan זורק אם המסלול חסר', () => {
    expect(() => defaultPlan([])).toThrow();
  });

  it('כל מסלול מקצה תקציב בילויים מההוצאה הפנויה', () => {
    const balanced = buildBudgetPlan('balanced', input());
    expect(balanced.discretionaryAgorot).toBe(ILS(310)); // 360 − 50 קבועות
    expect(balanced.funBudgetAgorot).toBe(ILS(139.5)); // 310 × 0.45
  });

  it('המסלול הגמיש מאפשר יותר בילויים מהשמרני', () => {
    const plans = buildBudgetPlans(input());
    expect(plans[2]!.funBudgetAgorot).toBeGreaterThan(plans[0]!.funBudgetAgorot);
    expect(PLAN_PARAMS.flexible.funShare).toBeGreaterThan(PLAN_PARAMS.conservative.funShare);
  });

  it('תרומה ליעד = הכנסה שהתקבלה פחות תקציב, ואף פעם לא שלילית', () => {
    const plans = buildBudgetPlans(
      input({ expectedMonthlyIncomeAgorot: ILS(500), receivedMonthlyIncomeAgorot: ILS(500) }),
    );
    expect(plans[0]?.goalContributionAgorot).toBe(ILS(200)); // 500 − 300
    expect(plans[2]?.goalContributionAgorot).toBe(ILS(100)); // 500 − 400

    // בחודש בלי הכנסה — אין תרומה, ולא מספר שלילי
    const noIncome = buildBudgetPlans(
      input({ expectedMonthlyIncomeAgorot: 0, receivedMonthlyIncomeAgorot: 0 }),
    );
    expect(noIncome.every((p) => p.goalContributionAgorot === 0)).toBe(true);
  });

  it('⭐ הכנסה שטרם התקבלה אינה מייצרת תרומה ליעד', () => {
    // ₪500 ודאיים אבל עוד לא בחשבון: התרומה שמנוכה מהכסף הפנוי היא 0,
    // והתחזית מציגה בנפרד מה יקרה אם הכסף אכן ייכנס.
    const plans = buildBudgetPlans(
      input({ expectedMonthlyIncomeAgorot: ILS(500), receivedMonthlyIncomeAgorot: 0 }),
    );
    expect(plans[0]?.goalContributionAgorot).toBe(0);
    expect(plans[0]?.projectedGoalContributionAgorot).toBe(ILS(200));
  });

  it('תחזית יתרה לסוף החודש', () => {
    const balanced = buildBudgetPlan('balanced', input());
    expect(balanced.projectedMonthEndBalanceAgorot).toBe(ILS(1380)); // 1240 + 500 − 360
  });
});

describe('⭐ רצפת ההתחייבויות — אי אפשר לתקצב מתחת לחשבון הטלפון', () => {
  it('התקציב לא יורד מתחת להוצאות הקבועות', () => {
    const plan = buildBudgetPlan('conservative', input({ fixedCommitmentsAgorot: ILS(380) }));
    // 400 × 0.75 = 300, אבל הקבועות הן 380
    expect(plan.monthlySpendAgorot).toBe(ILS(380));
    expect(plan.discretionaryAgorot).toBe(0);
    expect(plan.funBudgetAgorot).toBe(0);
  });

  it('הוצאה פנויה לא הופכת שלילית', () => {
    const plan = buildBudgetPlan('conservative', input({ fixedCommitmentsAgorot: ILS(1000) }));
    expect(plan.discretionaryAgorot).toBe(0);
  });
});

describe('כשאין היסטוריה', () => {
  it('נופל להערכת המשתמש מהאונבורדינג', () => {
    const noHistory = input({
      historicalMonthlySpend: average(null, 0),
      estimatedMonthlySpendAgorot: ILS(350),
    });
    expect(baselineMonthlySpend(noHistory)).toBe(ILS(350));
    expect(buildBudgetPlan('balanced', noHistory).monthlySpendAgorot).toBe(ILS(315));
  });

  it('מיעוט הנתונים משתקף ברמת הסיכון', () => {
    const noHistory = buildBudgetPlan(
      'balanced',
      input({ historicalMonthlySpend: average(null, 0) }),
    );
    expect(noHistory.risk.factors.thinData).toBe(1);
  });
});

describe('מעקב מול התקציב', () => {
  const transactions = [
    tx({ date: '2026-08-01', shekels: 200 }),
    tx({ date: '2026-08-05', shekels: 150 }),
  ];

  it('מחשב כמה נשאר', () => {
    const p = budgetProgress(transactions, ILS(400), '2026-08-06');
    expect(p.spentAgorot).toBe(ILS(350));
    expect(p.remainingAgorot).toBe(ILS(50));
    expect(p.isOverBudget).toBe(false);
    expect(p.month).toBe('2026-08');
  });

  it('מזהה חריגה מהתקציב', () => {
    const p = budgetProgress(transactions, ILS(300), '2026-08-06');
    expect(p.isOverBudget).toBe(true);
    expect(p.remainingAgorot).toBe(ILS(-50));
  });

  it('מזהה קצב מהיר מדי, עם מרווח סובלנות', () => {
    // ביום 6 מתוך 31 עבר 19% מהחודש. הוצאנו 87% מהתקציב.
    const fast = budgetProgress(transactions, ILS(400), '2026-08-06');
    expect(fast.isAheadOfPace).toBe(true);

    // הוצאה תואמת קצב — לא מתריע
    const onPace = budgetProgress([tx({ date: '2026-08-01', shekels: 80 })], ILS(400), '2026-08-06');
    expect(onPace.isAheadOfPace).toBe(false);
  });

  it('תקציב אפס לא גורם לחלוקה באפס', () => {
    expect(budgetProgress(transactions, 0, '2026-08-06').spentSharePct).toBe(0);
  });
});

describe('⭐ הקצאה שבועית — לא חלוקה ב-4', () => {
  it('נגזרת מהימים שנותרו בפועל', () => {
    // 7 באוגוסט → 25 ימים נותרו
    const w = weeklyAllowance(ILS(750), 0, '2026-08-07');
    expect(w.daysLeftInMonth).toBe(25);
    expect(w.dailyAgorot).toBe(ILS(30));
    expect(w.weeklyAgorot).toBe(ILS(210));
  });

  it('בסוף החודש מכסה רק את הימים שנותרו — לא שבוע מלא', () => {
    const w = weeklyAllowance(ILS(300), 0, '2026-08-29');
    expect(w.daysLeftInMonth).toBe(3);
    expect(w.daysCovered).toBe(3);
    expect(w.weeklyAgorot).toBe(ILS(300));
    // חלוקה ב-4 הייתה נותנת ₪75 לשבוע — פחות ממה שבאמת אפשר
  });

  it('מנכה התחייבויות ידועות לפני החלוקה', () => {
    const w = weeklyAllowance(ILS(750), ILS(250), '2026-08-07');
    expect(w.dailyAgorot).toBe(ILS(20)); // (750−250)/25
  });

  it('לא מחזיר סכום שלילי', () => {
    const w = weeklyAllowance(ILS(100), ILS(500), '2026-08-07');
    expect(w.dailyAgorot).toBe(0);
    expect(w.weeklyAgorot).toBe(0);
  });
});

describe('התחייבויות שנותרו החודש', () => {
  it('סופר רק must שטרם שולמו ובתוך החודש', () => {
    const expenses = [
      plannedExpense({ amountAgorot: ILS(240), dueDate: '2026-08-25', priority: 'must' }),
      plannedExpense({ amountAgorot: ILS(300), dueDate: '2026-08-30', priority: 'want' }),
      plannedExpense({ amountAgorot: ILS(100), dueDate: '2026-08-10', paid: true }),
      plannedExpense({ amountAgorot: ILS(500), dueDate: '2026-09-05', priority: 'must' }),
    ];
    expect(committedRemainingThisMonth(expenses, '2026-08-07')).toBe(ILS(240));
  });

  it('רשימה ריקה מחזירה אפס', () => {
    expect(committedRemainingThisMonth([], '2026-08-07')).toBe(0);
  });
});
