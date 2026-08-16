import { describe, expect, it } from 'vitest';
import {
  ALL_SCENARIOS,
  forecastAll,
  forecastBand,
  forecastScenario,
  FORECAST_HORIZONS,
  MVP_SCENARIOS,
  type ForecastInput,
} from '../../core/forecast';
import { ILS, expectedIncome, plannedExpense } from '../helpers';

function input(overrides: Partial<ForecastInput> = {}): ForecastInput {
  return {
    today: '2026-08-07',
    currentBalanceAgorot: ILS(1240),
    averageMonthlyExpenseAgorot: ILS(400),
    averageRegularMonthlyIncomeAgorot: ILS(150),
    budgetMonthlySpendAgorot: ILS(360),
    summerTotalNetAgorot: ILS(4000),
    expectedIncomes: [],
    plannedExpenses: [],
    historicalConfidence: 'high',
    ...overrides,
  };
}

describe('תרחישים', () => {
  it('"בלי הכנסה נוספת" הוא הרצפה — רק הוצאות', () => {
    const f = forecastScenario(input(), 'noNewIncome', 3);
    expect(f.points.map((p) => p.balanceAgorot)).toEqual([ILS(840), ILS(440), ILS(40)]);
    expect(f.endBalanceAgorot).toBe(ILS(40));
  });

  it('"לפי הקצב הנוכחי" מוסיף את ההכנסה הממוצעת', () => {
    const f = forecastScenario(input(), 'currentAverage', 3);
    expect(f.points[0]?.balanceAgorot).toBe(ILS(990)); // 1240 + 150 − 400
  });

  it('"לפי התקציב המאוזן" משתמש בתקציב במקום בהוצאה בפועל', () => {
    const f = forecastScenario(input(), 'balancedBudget', 1);
    expect(f.points[0]?.balanceAgorot).toBe(ILS(1030)); // 1240 + 150 − 360
  });

  it('"עם עבודה בקיץ" מוסיף הכנסה רק בחודשי הקיץ', () => {
    const f = forecastScenario(input(), 'withSummerWork', 12);
    const june = f.points.find((p) => p.month === '2027-06');
    const july = f.points.find((p) => p.month === '2027-07');
    expect(july!.balanceAgorot - june!.balanceAgorot).toBe(ILS(1750)); // 150−400+2000
    expect(july?.isSummer).toBe(true);
  });
});

describe('⭐ "רק לפי הכנסות שאני יודע עליהן" — בלי ספירה כפולה', () => {
  it('לא מוסיף הכנסה צפויה מעל ההכנסה הממוצעת', () => {
    const withExpected = input({
      expectedIncomes: [
        expectedIncome({ certainty: 'confirmed', expectedDate: '2026-09-15', expectedAmountAgorot: ILS(500) }),
      ],
    });
    const known = forecastScenario(withExpected, 'knownIncomeOnly', 1);
    // בסיס "בלי הכנסה" (‎−400) ועליו ההכנסה הספציפית (‎+500)
    expect(known.points[0]?.balanceAgorot).toBe(ILS(1340));

    // לו היה מתווסף גם על הממוצע, התוצאה הייתה 1490 — ספירה כפולה
    const average = forecastScenario(withExpected, 'currentAverage', 1);
    expect(average.points[0]?.balanceAgorot).toBe(ILS(990));
  });

  it('כולל גם הכנסה likely, אך לא possible', () => {
    const withLikely = forecastScenario(
      input({
        expectedIncomes: [
          expectedIncome({ certainty: 'likely', expectedDate: '2026-09-15', expectedAmountAgorot: ILS(200) }),
          expectedIncome({ certainty: 'possible', expectedDate: '2026-09-16', expectedAmountAgorot: ILS(900) }),
        ],
      }),
      'knownIncomeOnly',
      1,
    );
    expect(withLikely.points[0]?.balanceAgorot).toBe(ILS(1040)); // 1240 − 400 + 200
  });

  it('הכנסה שכבר התקבלה לא נספרת שוב', () => {
    const f = forecastScenario(
      input({
        expectedIncomes: [
          expectedIncome({ certainty: 'confirmed', expectedDate: '2026-09-15', received: true }),
        ],
      }),
      'knownIncomeOnly',
      1,
    );
    expect(f.points[0]?.balanceAgorot).toBe(ILS(840));
  });
});

describe('התחייבויות מנוכות בכל התרחישים', () => {
  it('הוצאה must מנוכה בכל תרחיש', () => {
    const withPlanned = input({
      plannedExpenses: [plannedExpense({ amountAgorot: ILS(240), dueDate: '2026-09-20' })],
    });
    for (const scenario of ALL_SCENARIOS) {
      const withIt = forecastScenario(withPlanned, scenario, 1).endBalanceAgorot;
      const without = forecastScenario(input(), scenario, 1).endBalanceAgorot;
      expect(without - withIt).toBe(ILS(240));
    }
  });

  it('הוצאה want לא מנוכה', () => {
    const f = forecastScenario(
      input({
        plannedExpenses: [
          plannedExpense({ amountAgorot: ILS(300), dueDate: '2026-09-20', priority: 'want' }),
        ],
      }),
      'noNewIncome',
      1,
    );
    expect(f.points[0]?.balanceAgorot).toBe(ILS(840));
  });
});

describe('רמות ביטחון ותוויות', () => {
  it('תחזית ל-12 חודשים לעולם לא high', () => {
    for (const scenario of ALL_SCENARIOS) {
      const f = forecastScenario(input(), scenario, 12);
      expect(f.confidence).not.toBe('high');
      expect(f.requiresFarHorizonWarning).toBe(true);
      expect(f.disclaimerHe).toContain('משתנה מאוד');
    }
  });

  it('לכל תחזית יש תווית "לא הבטחה"', () => {
    for (const horizon of FORECAST_HORIZONS) {
      const f = forecastScenario(input(), 'currentAverage', horizon);
      expect(f.disclaimerHe).toContain('לא הבטחה');
      expect(f.nameHe.length).toBeGreaterThan(0);
      expect(f.descriptionHe.length).toBeGreaterThan(0);
    }
  });

  it('תחזית לחודש עם נתונים טובים → high', () => {
    expect(forecastScenario(input(), 'currentAverage', 1).confidence).toBe('high');
  });

  it('בלי נתונים — none בכל טווח', () => {
    const f = forecastScenario(input({ historicalConfidence: 'none' }), 'currentAverage', 1);
    expect(f.confidence).toBe('none');
  });
});

describe('הרצה מרובה ורצועה', () => {
  it('forecastAll מריץ את כל התרחישים', () => {
    expect(forecastAll(input(), 6)).toHaveLength(ALL_SCENARIOS.length);
    expect(forecastAll(input(), 6, MVP_SCENARIOS)).toHaveLength(2);
  });

  it('ה-MVP מציג שני תרחישים בלבד', () => {
    expect(MVP_SCENARIOS).toEqual(['noNewIncome', 'currentAverage']);
  });

  it('הרצועה עוטפת את כל התרחישים', () => {
    const band = forecastBand(input(), 6);
    const runs = forecastAll(input(), 6);
    expect(band).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      const balances = runs.map((r) => r.points[i]!.balanceAgorot);
      expect(band[i]!.lowAgorot).toBe(Math.min(...balances));
      expect(band[i]!.highAgorot).toBe(Math.max(...balances));
      expect(band[i]!.lowAgorot).toBeLessThanOrEqual(band[i]!.highAgorot);
    }
  });

  it('טווח אפס מחזיר רצועה ריקה', () => {
    expect(forecastBand(input(), 0)).toEqual([]);
    expect(forecastScenario(input(), 'noNewIncome', 0).points).toEqual([]);
  });

  it('רצועה עם רשימת תרחישים ריקה לא מפילה', () => {
    expect(forecastBand(input(), 3, [])).toEqual([]);
  });
});
