/**
 * ⭐ בדיקות תחזיות ויעד יציב.
 *
 * שני כללים נבדקים כאן:
 *  · תחזית ל-12 חודשים **לעולם** לא מוצגת כוודאית.
 *  · "הגעתי ל-5,000" ו-"אני מחזיק 5,000" הם שני מצבים שונים.
 */

import { describe, expect, it } from 'vitest';
import {
  HORIZONS,
  buildAllScenarios,
  buildScenario,
  bufferBreachMonth,
  forecastMarkers,
  lowestPoint,
  monthEndForecast,
  unconfirmedOutlook,
  type ForecastScenariosInput,
} from '../../core/forecastScenarios';
import {
  DEFAULT_STABILITY_MONTHS,
  assessGoalStability,
  requiredMonthlyToHold,
} from '../../core/goalStability';
import { confidenceRank } from '../../core/confidence';
import { ILS } from '../helpers';
import type { ExpectedIncome } from '../../core/types';

const TODAY = '2026-08-07';

function input(overrides: Partial<ForecastScenariosInput> = {}): ForecastScenariosInput {
  return {
    today: TODAY,
    currentBalanceAgorot: ILS(4400),
    averageMonthlyExpenseAgorot: ILS(525),
    averageRegularMonthlyIncomeAgorot: ILS(335),
    budgetMonthlySpendAgorot: ILS(473),
    summerTotalNetAgorot: ILS(3000),
    expectedIncomes: [],
    historicalConfidence: 'high',
    ...overrides,
  };
}

describe('ארבעת התרחישים', () => {
  it('בדיוק ארבעה, עם שמות בעברית', () => {
    const scenarios = buildAllScenarios(input());
    expect(scenarios).toHaveLength(4);
    expect(scenarios.map((s) => s.scenarioId)).toEqual([
      'current',
      'balanced',
      'noNewIncome',
      'confirmedIncome',
    ]);
    expect(scenarios.every((s) => s.labelHe.length > 0)).toBe(true);
  });

  it('המאוזן טוב מהנוכחי כשהתקציב נמוך מההוצאה', () => {
    const current = buildScenario('current', input());
    const balanced = buildScenario('balanced', input());
    expect(balanced.byHorizon[3].balanceAgorot).toBeGreaterThan(
      current.byHorizon[3].balanceAgorot,
    );
  });

  it('⭐ "בלי הכנסה נוספת" לא כולל אפילו את הקיץ', () => {
    const scenario = buildScenario('noNewIncome', input());
    // 12 חודשים של הוצאות בלבד
    expect(scenario.byHorizon[12].balanceAgorot).toBe(ILS(4400) - ILS(525) * 12);
  });

  it('"עם הכנסות מאושרות" סופר רק confirmed', () => {
    const incomes: ExpectedIncome[] = [
      { id: 'a', label: 'ודאי', expectedAmountAgorot: ILS(500), expectedDate: '2026-09-10', certainty: 'confirmed', received: false },
      { id: 'b', label: 'אולי', expectedAmountAgorot: ILS(900), expectedDate: '2026-09-15', certainty: 'possible', received: false },
    ];
    const scenario = buildScenario('confirmedIncome', input({ expectedIncomes: incomes }));
    // חודש 1 = ספטמבר: +500 מאושר, -525 הוצאות
    expect(scenario.points[0]?.balanceAgorot).toBe(ILS(4400) + ILS(500) - ILS(525));
  });

  it('חודשי קיץ מסומנים', () => {
    const scenario = buildScenario('current', input());
    const summer = scenario.points.filter((p) => p.isSummer);
    expect(summer.length).toBeGreaterThan(0);
    expect(summer.every((p) => ['07', '08'].includes(p.month.slice(5, 7)))).toBe(true);
  });
});

describe('⭐ רמות ביטחון לפי טווח', () => {
  it('ארבעה טווחים', () => {
    expect([...HORIZONS]).toEqual([1, 3, 6, 12]);
  });

  it('⭐ 12 חודשים לעולם לא "high" — גם עם היסטוריה מלאה', () => {
    for (const scenario of buildAllScenarios(input({ historicalConfidence: 'high' }))) {
      expect(scenario.byHorizon[12].confidence).not.toBe('high');
      expect(scenario.byHorizon[12].requiresFarHorizonWarning).toBe(true);
    }
  });

  it('הביטחון יורד ככל שהטווח גדל', () => {
    const scenario = buildScenario('current', input());
    const ranks = HORIZONS.map((h) => confidenceRank(scenario.byHorizon[h].confidence));
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]!).toBeLessThanOrEqual(ranks[i - 1]!);
    }
  });

  it('אזהרת טווח רחוק רק מעל 6 חודשים', () => {
    const scenario = buildScenario('current', input());
    expect(scenario.byHorizon[1].requiresFarHorizonWarning).toBe(false);
    expect(scenario.byHorizon[6].requiresFarHorizonWarning).toBe(false);
    expect(scenario.byHorizon[12].requiresFarHorizonWarning).toBe(true);
  });

  it('בלי היסטוריה — הכל none', () => {
    const scenario = buildScenario('current', input({ historicalConfidence: 'none' }));
    expect(HORIZONS.every((h) => scenario.byHorizon[h].confidence === 'none')).toBe(true);
  });

  it('לכל תרחיש יש הסתייגות', () => {
    for (const scenario of buildAllScenarios(input())) {
      expect(scenario.disclaimerHe).toContain('לא הבטחה');
    }
  });
});

describe('הכנסות לא ודאיות — מידע בלבד', () => {
  const incomes: ExpectedIncome[] = [
    { id: 'a', label: 'סביר', expectedAmountAgorot: ILS(300), expectedDate: '2026-09-10', certainty: 'likely', received: false },
    { id: 'b', label: 'אולי', expectedAmountAgorot: ILS(200), expectedDate: '2026-10-10', certainty: 'possible', received: false },
  ];

  it('מוצגות בנפרד ולא כתרחיש', () => {
    const outlook = unconfirmedOutlook(incomes, TODAY);
    expect(outlook.likelyAgorot).toBe(ILS(300));
    expect(outlook.possibleAgorot).toBe(ILS(200));
    expect(outlook.noteHe).toContain('אינן נכללות בתחזיות');
  });

  it('⭐ אינן משפיעות על אף תרחיש', () => {
    const without = buildScenario('confirmedIncome', input());
    const with_ = buildScenario('confirmedIncome', input({ expectedIncomes: incomes }));
    expect(with_.byHorizon[3].balanceAgorot).toBe(without.byHorizon[3].balanceAgorot);
  });

  it('בלי הכנסות כאלה — אין הערה', () => {
    expect(unconfirmedOutlook([], TODAY).noteHe).toBeNull();
  });
});

describe('נקודות ציון וסיכונים', () => {
  it('סימון היעד, הביטחון וחודשי הקיץ', () => {
    const scenario = buildScenario('current', input());
    const markers = forecastMarkers(scenario, ILS(5000), ILS(500));
    expect(markers.targetAgorot).toBe(ILS(5000));
    expect(markers.safetyBufferAgorot).toBe(ILS(500));
    expect(markers.summerMonths.length).toBeGreaterThan(0);
  });

  it('הנקודה הנמוכה ביותר בטווח', () => {
    const scenario = buildScenario('noNewIncome', input());
    expect(lowestPoint(scenario, 3).month).toBe(scenario.points[2]?.month);
  });

  it('מתי התחזית יורדת מתחת לסכום הביטחון', () => {
    const scenario = buildScenario('noNewIncome', input());
    const breach = bufferBreachMonth(scenario, ILS(500));
    expect(breach).not.toBeNull();
  });

  it('תחזית שלא יורדת — null', () => {
    const scenario = buildScenario('current', input({ currentBalanceAgorot: ILS(50000) }));
    expect(bufferBreachMonth(scenario, ILS(500), 3)).toBeNull();
  });

  it('תחזית סוף החודש היא חלקית לפי הימים שנותרו', () => {
    const result = monthEndForecast(input());
    expect(result.date).toBe('2026-08-31');
    expect(result.confidence).toBe('high');
  });
});

describe('⭐ יעד יציב מול יעד שהושג לרגע', () => {
  const stable = [
    { month: '2026-09', balanceAgorot: ILS(5100) },
    { month: '2026-10', balanceAgorot: ILS(5200) },
    { month: '2026-11', balanceAgorot: ILS(5300) },
  ];
  const declining = [
    { month: '2026-09', balanceAgorot: ILS(4800) },
    { month: '2026-10', balanceAgorot: ILS(4400) },
    { month: '2026-11', balanceAgorot: ILS(4000) },
  ];

  const base = {
    today: TODAY,
    targetAgorot: ILS(5000),
    minimumAfterReachedAgorot: ILS(4500),
    confidence: 'medium' as const,
  };

  it('עוד לא הגענו — בונים', () => {
    const result = assessGoalStability({
      ...base,
      currentBalanceAgorot: ILS(4400),
      projectedBalances: stable,
    });
    expect(result.phase).toBe('building');
    expect(result.reached).toBe(false);
    expect(result.detailHe).toContain('600');
  });

  it('⭐ הגענו והתחזית מחזיקה — יציב', () => {
    const result = assessGoalStability({
      ...base,
      currentBalanceAgorot: ILS(5000),
      projectedBalances: stable,
    });
    expect(result.phase).toBe('reached_stable');
    expect(result.stable).toBe(true);
    expect(result.headlineHe).toBe('היעד מוחזק');
  });

  it('⭐ הגענו אבל צפויה ירידה — לא יציב', () => {
    const result = assessGoalStability({
      ...base,
      currentBalanceAgorot: ILS(5000),
      projectedBalances: declining,
    });
    expect(result.phase).toBe('reached_unstable');
    expect(result.stable).toBe(false);
    expect(result.firstDipMonth).toBe('2026-10');
    expect(result.detailHe).toContain('צפויה ירידה');
  });

  it('הרף הוא הסכום שאסור לרדת מתחתיו, לא היעד עצמו', () => {
    // ‎₪4,800 מתחת ליעד אבל מעל הרף ₪4,500 → עדיין יציב
    const result = assessGoalStability({
      ...base,
      currentBalanceAgorot: ILS(5000),
      projectedBalances: [{ month: '2026-09', balanceAgorot: ILS(4800) }],
    });
    expect(result.stable).toBe(true);
  });

  it('ברירת המחדל היא שלושה חודשים', () => {
    expect(DEFAULT_STABILITY_MONTHS).toBe(3);
    const result = assessGoalStability({
      ...base,
      currentBalanceAgorot: ILS(5000),
      projectedBalances: stable,
    });
    expect(result.monthsChecked).toBe(3);
  });

  it('בלי תחזית — לא נחשב יציב', () => {
    const result = assessGoalStability({
      ...base,
      currentBalanceAgorot: ILS(5000),
      projectedBalances: [],
    });
    expect(result.stable).toBe(false);
    expect(result.detailHe).toContain('אין מספיק נתונים');
  });

  it('כמה צריך לשמור בחודש כדי להחזיק', () => {
    expect(
      requiredMonthlyToHold({
        ...base,
        currentBalanceAgorot: ILS(5000),
        projectedBalances: stable,
      }),
    ).toBe(0);

    expect(
      requiredMonthlyToHold({
        ...base,
        currentBalanceAgorot: ILS(5000),
        projectedBalances: declining,
      }),
    ).toBeGreaterThan(0);
  });

  it('בלי תחזית אין דרישה', () => {
    expect(
      requiredMonthlyToHold({
        ...base,
        currentBalanceAgorot: ILS(5000),
        projectedBalances: [],
      }),
    ).toBe(0);
  });
});
