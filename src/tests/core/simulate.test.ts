import { describe, expect, it } from 'vitest';
import { simulatePurchase, slackAtGoalMonth, type PurchaseSimulationInput } from '../../core/simulate';
import { projectGoal, type GoalSimulationInput } from '../../core/goal';
import { safeToSpend } from '../../core/safeToSpend';
import { ILS } from '../helpers';

const TODAY = '2026-08-07';

function goalInput(overrides: Partial<GoalSimulationInput> = {}): GoalSimulationInput {
  return {
    today: TODAY,
    currentBalanceAgorot: ILS(1240),
    targetAgorot: ILS(5000),
    regularMonthlyNetAgorot: ILS(500),
    summerTotalNetAgorot: 0,
    historicalConfidence: 'high',
    ...overrides,
  };
}

function input(overrides: Partial<PurchaseSimulationInput> = {}): PurchaseSimulationInput {
  return {
    amountAgorot: ILS(200),
    currentBalanceAgorot: ILS(1240),
    safeToSpend: safeToSpend({
      today: TODAY,
      currentBalanceAgorot: ILS(1240),
      safetyBufferAgorot: ILS(500),
      plannedExpenses: [],
      recurringTransactions: [],
      expectedIncomes: [],
      reservedForFutureMonthsAgorot: 0,
      goalContributionAgorot: 0,
      goalSavedSoFarThisMonthAgorot: 0,
      plannedDiscretionarySpendAgorot: 0,
    }),
    goal: goalInput(),
    funBudget: { plannedAgorot: ILS(300), spentAgorot: ILS(180) },
    ...overrides,
  };
}

describe('התוצאה הבסיסית', () => {
  it('מחשב יתרה ובטוח-להוציא אחרי הרכישה', () => {
    const s = simulatePurchase(input());
    expect(s.balanceAfterAgorot).toBe(ILS(1040));
    expect(s.safeToSpendAfterAgorot).toBe(ILS(540)); // 740 − 200
    expect(s.isWithinSafeToSpend).toBe(true);
  });

  it('רכישה מעבר לתקציב מסומנת ככזו', () => {
    const s = simulatePurchase(input({ amountAgorot: ILS(900) }));
    expect(s.isWithinSafeToSpend).toBe(false);
    expect(s.verdictHe).toContain('מעבר למה שבטוח');
  });

  it('מחשב מה נשאר בתקציב הבילויים', () => {
    const s = simulatePurchase(input({ amountAgorot: ILS(80) }));
    expect(s.funRemainingAfterAgorot).toBe(ILS(40)); // 300 − 180 − 80
  });

  it('בודק חריגה מתקציב קטגוריה', () => {
    const s = simulatePurchase(
      input({
        amountAgorot: ILS(100),
        categoryBudget: {
          categoryId: 'cat-food-out',
          categoryName: 'אוכל בחוץ',
          plannedAgorot: ILS(150),
          spentAgorot: ILS(120),
        },
      }),
    );
    expect(s.categoryAfter?.spentAfterAgorot).toBe(ILS(220));
    expect(s.categoryAfter?.exceedsBudget).toBe(true);
  });

  it('בלי תקציב קטגוריה — null ולא שגיאה', () => {
    expect(simulatePurchase(input()).categoryAfter).toBeNull();
  });

  it('שבועי אחרי הרכישה לא יורד מתחת לאפס', () => {
    const s = simulatePurchase(input({ amountAgorot: ILS(2000) }));
    expect(s.weekAfterAgorot).toBe(0);
  });
});

describe('⭐ השפעה על תאריך היעד', () => {
  it('רכישה קטנה שנכנסת ל"עודף" לא מזיזה את היעד', () => {
    // נטו 500/חודש, פער 3760 → 8 חודשים, ובחודש ה-8 היתרה 5240 (עודף 240)
    const s = simulatePurchase(input({ amountAgorot: ILS(200) }));
    expect(s.goalDelayMonths).toBe(0);
    expect(s.verdictHe).toContain('היעד לא זז');
  });

  it('רכישה שעוברת את העודף דוחה את היעד בחודש', () => {
    const s = simulatePurchase(input({ amountAgorot: ILS(300) }));
    expect(s.goalDelayMonths).toBe(1);
    expect(s.verdictHe).toContain('היעד יזוז');
  });

  it('maxWithoutDelay הוא בדיוק העודף בחודש ההשגה', () => {
    const s = simulatePurchase(input({ amountAgorot: ILS(500) }));
    expect(s.maxWithoutDelayAgorot).toBe(ILS(240));
    // ואכן — בסכום הזה היעד לא זז
    const atLimit = simulatePurchase(input({ amountAgorot: ILS(240) }));
    expect(atLimit.goalDelayMonths).toBe(0);
  });

  it('לא מציע סכום גדול מהרכישה המבוקשת', () => {
    const s = simulatePurchase(input({ amountAgorot: ILS(50) }));
    expect(s.maxWithoutDelayAgorot).toBe(ILS(50));
  });

  it('כשלא מגיעים ליעד ממילא — אין השוואה, ואומרים את זה', () => {
    const s = simulatePurchase(
      input({ goal: goalInput({ regularMonthlyNetAgorot: ILS(-100) }) }),
    );
    expect(s.goalDelayMonths).toBeNull();
    expect(s.maxWithoutDelayAgorot).toBe(0);
    expect(s.detailHe).toContain('לא מגיעים ליעד ממילא');
  });
});

describe('slackAtGoalMonth', () => {
  it('מחזיר את העודף בחודש ההשגה', () => {
    const p = projectGoal(goalInput());
    expect(slackAtGoalMonth(p, ILS(1240), ILS(5000))).toBe(ILS(240));
  });

  it('כשהיעד כבר הושג — העודף הוא ההפרש מהיתרה הנוכחית', () => {
    const p = projectGoal(goalInput({ currentBalanceAgorot: ILS(5300) }));
    expect(slackAtGoalMonth(p, ILS(5300), ILS(5000))).toBe(ILS(300));
  });

  it('כשלא מגיעים ליעד — אפס', () => {
    const p = projectGoal(goalInput({ regularMonthlyNetAgorot: ILS(-50) }));
    expect(slackAtGoalMonth(p, ILS(1240), ILS(5000))).toBe(0);
  });
});

describe('חלופות — המערכת לא מחליטה במקומי', () => {
  it('אף חלופה לא אומרת "אל תקנה"', () => {
    for (const amount of [ILS(50), ILS(200), ILS(900), ILS(5000)]) {
      const s = simulatePurchase(input({ amountAgorot: amount }));
      for (const alt of s.alternatives) {
        expect(alt.titleHe).not.toMatch(/אל תקנה|לא כדאי|אסור|מיותר/);
      }
      expect(s.verdictHe).not.toMatch(/אל תקנה|מיותר/);
    }
  });

  it('מציעה להוריד לסכום שלא מזיז את היעד', () => {
    const s = simulatePurchase(input({ amountAgorot: ILS(500) }));
    const reduce = s.alternatives.find((a) => a.id === 'reduce_amount');
    expect(reduce?.amountAgorot).toBe(ILS(240));
  });

  it('לא מציעה להוריד כשהסכום כבר לא מזיז את היעד', () => {
    const s = simulatePurchase(input({ amountAgorot: ILS(100) }));
    expect(s.alternatives.some((a) => a.id === 'reduce_amount')).toBe(false);
  });

  it('מציעה דחייה רק כשחורגים', () => {
    expect(simulatePurchase(input({ amountAgorot: ILS(900) })).alternatives.some((a) => a.id === 'postpone')).toBe(true);
    expect(simulatePurchase(input({ amountAgorot: ILS(100) })).alternatives.some((a) => a.id === 'postpone')).toBe(false);
  });

  it('מציעה את תקציב הבילויים רק כשהוא מספיק', () => {
    expect(simulatePurchase(input({ amountAgorot: ILS(80) })).alternatives.some((a) => a.id === 'use_fun_budget')).toBe(true);
    expect(simulatePurchase(input({ amountAgorot: ILS(500) })).alternatives.some((a) => a.id === 'use_fun_budget')).toBe(false);
  });

  it('מציעה פיצול לשני חודשים, והחצאים מסתכמים לסכום המלא', () => {
    const s = simulatePurchase(input({ amountAgorot: ILS(201) }));
    const split = s.alternatives.find((a) => a.id === 'split_across_months');
    expect(split).toBeDefined();
    expect(split?.detailHe).toContain('₪101'); // 201/2 מעוגל, והמשלים
  });

  it('רכישה בסכום אפס לא מציעה פיצול', () => {
    expect(simulatePurchase(input({ amountAgorot: 0 })).alternatives.some((a) => a.id === 'split_across_months')).toBe(false);
  });

  it('לכל חלופה יש כותרת והסבר', () => {
    const s = simulatePurchase(input({ amountAgorot: ILS(500) }));
    expect(s.alternatives.length).toBeGreaterThan(0);
    for (const alt of s.alternatives) {
      expect(alt.titleHe.length).toBeGreaterThan(0);
      expect(alt.detailHe.length).toBeGreaterThan(0);
    }
  });
});
