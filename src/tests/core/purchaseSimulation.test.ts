/**
 * ⭐ בדיקות סימולציית רכישה.
 *
 * הכלל שנבדק לאורך כל הקובץ: המערכת **לא מחליטה**. היא מסווגת את
 * ההשפעה לארבע רמות ומראה מספרים — ולעולם לא כותבת "אסור לך".
 */

import { describe, expect, it } from 'vitest';
import {
  simulatePurchase,
  whatIfReceive,
  whatIfSaveMonthly,
  whatIfSpend,
  earliestAffordableDate,
  type PurchaseSimulationInput,
} from '../../core/purchaseSimulation';
import { ILS } from '../helpers';
import type { ExpectedIncome } from '../../core/types';

const TODAY = '2026-08-07';

function input(overrides: Partial<PurchaseSimulationInput> = {}): PurchaseSimulationInput {
  return {
    today: TODAY,
    amountAgorot: ILS(100),
    balanceAgorot: ILS(4400),
    safeToSpendNowAgorot: ILS(418),
    reservedForFutureMonthsAgorot: ILS(3481),
    safetyBufferAgorot: ILS(500),
    targetAgorot: ILS(5000),
    regularMonthlyNetAgorot: ILS(100),
    summerTotalNetAgorot: ILS(3000),
    monthEndForecastAgorot: ILS(4300),
    threeMonthForecastAgorot: ILS(4100),
    expectedIncomes: [],
    historicalConfidence: 'high',
    ...overrides,
  };
}

describe('⭐ ארבעת הסטטוסים', () => {
  it('רכישה קטנה — בתוך התקציב', () => {
    const result = simulatePurchase(input({ amountAgorot: ILS(50) }));
    expect(result.verdict).toBe('affordable');
    expect(result.headlineHe).toContain('בתוך התקציב');
    expect(result.reserveNeededAgorot).toBe(0);
    expect(result.bufferBreachAgorot).toBe(0);
  });

  it('רכישה שלוקחת רוב הכסף הפנוי — אפשרי אבל יש השפעה', () => {
    const result = simulatePurchase(input({ amountAgorot: ILS(400) }));
    expect(result.verdict).toBe('tight');
    expect(result.headlineHe).toContain('אפשרי');
  });

  it('⭐ בדיוק הסכום הבטוח — עדיין לא נוגע ברזרבה', () => {
    const result = simulatePurchase(input({ amountAgorot: ILS(418) }));
    expect(result.reserveNeededAgorot).toBe(0);
    expect(result.after.safeToSpendNowAgorot).toBe(0);
    expect(result.verdict).toBe('tight');
  });

  it('⭐ רכישה קטנה אינה מסומנת רק בגלל דחיית יעד', () => {
    // ‎₪50 מתוך ₪418 הם 12%. הסימולטור מתקדם בחודשים שלמים, ולכן
    // כמעט כל רכישה "דוחה" את היעד בחודש — זו תופעת לוואי, לא אות.
    const small = simulatePurchase(input({ amountAgorot: ILS(50) }));
    expect(small.verdict).toBe('affordable');

    // אבל רכישה גדולה שכן דוחה — כן מסומנת
    const large = simulatePurchase(input({ amountAgorot: ILS(300) }));
    expect(large.verdict).toBe('tight');
  });

  it('⭐ מעל הסכום הבטוח — דורש שימוש ברזרבה', () => {
    const result = simulatePurchase(input({ amountAgorot: ILS(600) }));
    expect(result.verdict).toBe('uses_reserve');
    expect(result.reserveNeededAgorot).toBe(ILS(182));
    expect(result.explanationHe).toContain('₪182');
  });

  it('⭐ מעל הרזרבה כולה — פוגע בסכום הביטחון', () => {
    const result = simulatePurchase(input({ amountAgorot: ILS(4500) }));
    expect(result.verdict).toBe('over_safe');
    expect(result.bufferBreachAgorot).toBeGreaterThan(0);
    expect(result.headlineHe).toContain('לא נכנס');
  });

  it('לעולם לא נכתב "אסור"', () => {
    for (const amount of [50, 400, 600, 1000, 5000]) {
      const result = simulatePurchase(input({ amountAgorot: ILS(amount) }));
      expect(result.headlineHe).not.toContain('אסור');
      expect(result.explanationHe).not.toContain('אסור');
    }
  });
});

describe('לפני ואחרי', () => {
  it('כל המספרים מוצגים לשני המצבים', () => {
    const result = simulatePurchase(input({ amountAgorot: ILS(200) }));

    expect(result.before.balanceAgorot).toBe(ILS(4400));
    expect(result.after.balanceAgorot).toBe(ILS(4200));
    expect(result.before.safeToSpendNowAgorot).toBe(ILS(418));
    expect(result.after.safeToSpendNowAgorot).toBe(ILS(218));
    expect(result.after.monthEndForecastAgorot).toBe(ILS(4100));
    expect(result.after.threeMonthForecastAgorot).toBe(ILS(3900));
  });

  it('הפער ליעד גדל אחרי הרכישה', () => {
    const result = simulatePurchase(input({ amountAgorot: ILS(200) }));
    expect(result.before.goalGapAgorot).toBe(ILS(600));
    expect(result.after.goalGapAgorot).toBe(ILS(800));
  });

  it('רכישה שמורידה מתחת לסכום הביטחון מסומנת', () => {
    const result = simulatePurchase(
      input({ amountAgorot: ILS(4200), reservedForFutureMonthsAgorot: ILS(3400) }),
    );
    expect(result.bufferBreachAgorot).toBeGreaterThan(0);
    expect(result.after.safetyBufferAgorot).toBeLessThan(ILS(500));
  });
});

describe('⭐ חלופות מחושבות', () => {
  it('רכישה שנכנסת לא מייצרת חלופות', () => {
    expect(simulatePurchase(input({ amountAgorot: ILS(50) })).alternatives).toEqual([]);
  });

  it('הקטנה לסכום שנכנס', () => {
    const result = simulatePurchase(input({ amountAgorot: ILS(600) }));
    const reduce = result.alternatives.find((a) => a.kind === 'reduce');
    expect(reduce?.amountAgorot).toBe(ILS(418));
    expect(reduce?.labelHe).toContain('418');
  });

  it('דחייה עם תאריך מחושב', () => {
    const result = simulatePurchase(input({ amountAgorot: ILS(600) }));
    const postpone = result.alternatives.find((a) => a.kind === 'postpone');
    // חסרים ₪182, נטו חודשי ₪100 → חודשיים
    expect(postpone?.months).toBe(2);
    expect(postpone?.date).toBe('2026-10-07');
  });

  it('חיסכון חודשי עם סכום מחושב', () => {
    const result = simulatePurchase(input({ amountAgorot: ILS(600) }));
    const save = result.alternatives.find((a) => a.kind === 'save_monthly');
    expect(save?.amountAgorot).toBe(ILS(91)); // 182 / 2
    expect(save?.months).toBe(2);
  });

  it('⭐ המתנה להכנסה מאושרת', () => {
    const incomes: ExpectedIncome[] = [
      {
        id: 'e1',
        label: 'משכורת',
        expectedAmountAgorot: ILS(900),
        expectedDate: '2026-08-25',
        certainty: 'confirmed',
        received: false,
      },
    ];
    const result = simulatePurchase(input({ amountAgorot: ILS(600), expectedIncomes: incomes }));
    const wait = result.alternatives.find((a) => a.kind === 'wait_for_income');
    expect(wait?.date).toBe('2026-08-25');
    expect(wait?.labelHe).toContain('משכורת');
  });

  it('הכנסה שאינה מאושרת אינה מוצעת כחלופה', () => {
    const incomes: ExpectedIncome[] = [
      {
        id: 'e1',
        label: 'אולי עבודה',
        expectedAmountAgorot: ILS(900),
        expectedDate: '2026-08-25',
        certainty: 'possible',
        received: false,
      },
    ];
    const result = simulatePurchase(input({ amountAgorot: ILS(600), expectedIncomes: incomes }));
    expect(result.alternatives.some((a) => a.kind === 'wait_for_income')).toBe(false);
  });

  it('בלי נטו חיובי אין חלופת דחייה', () => {
    const result = simulatePurchase(
      input({ amountAgorot: ILS(600), regularMonthlyNetAgorot: ILS(-50) }),
    );
    expect(result.alternatives.some((a) => a.kind === 'postpone')).toBe(false);
  });
});

describe('⭐ הכנסה עתידית מוצגת בנפרד', () => {
  const incomes: ExpectedIncome[] = [
    {
      id: 'e1',
      label: 'משכורת',
      expectedAmountAgorot: ILS(450),
      expectedDate: '2026-08-25',
      certainty: 'confirmed',
      received: false,
    },
  ];

  it('אינה מתווספת לכסף הפנוי', () => {
    const result = simulatePurchase(input({ amountAgorot: ILS(100), expectedIncomes: incomes }));
    // safeToSpend אחרי = 418 - 100, בלי ה-450
    expect(result.after.safeToSpendNowAgorot).toBe(ILS(318));
  });

  it('מוצגת בשדה נפרד', () => {
    const result = simulatePurchase(input({ amountAgorot: ILS(100), expectedIncomes: incomes }));
    expect(result.ifExpectedIncomeArrives?.amountAgorot).toBe(ILS(450));
    expect(result.ifExpectedIncomeArrives?.safeToSpendThenAgorot).toBe(ILS(768));
  });

  it('בלי הכנסות מאושרות — null', () => {
    expect(simulatePurchase(input()).ifExpectedIncomeArrives).toBeNull();
  });

  it('הכנסה שאינה מאושרת לא נספרת', () => {
    const possible: ExpectedIncome[] = [{ ...incomes[0]!, certainty: 'possible' }];
    expect(
      simulatePurchase(input({ expectedIncomes: possible })).ifExpectedIncomeArrives,
    ).toBeNull();
  });
});

describe('תאריך עתידי והתחייבות חוזרת', () => {
  it('תאריך מתוכנן משפיע על חלופת הדחייה', () => {
    const result = simulatePurchase(
      input({ amountAgorot: ILS(600), plannedDate: '2026-09-01' }),
    );
    expect(result.alternatives.find((a) => a.kind === 'postpone')?.date).toBe('2026-11-01');
  });

  it('רכישה חוזרת נשמרת בקלט', () => {
    const result = simulatePurchase(input({ amountAgorot: ILS(50), recurring: true }));
    expect(result.amountAgorot).toBe(ILS(50));
  });

  it('התאריך הקרוב ביותר שבו הרכישה נכנסת', () => {
    expect(earliestAffordableDate(input({ amountAgorot: ILS(50) }))).toBe(TODAY);
    expect(earliestAffordableDate(input({ amountAgorot: ILS(600) }))).toBe('2026-10-07');
    expect(
      earliestAffordableDate(input({ amountAgorot: ILS(600), regularMonthlyNetAgorot: 0 })),
    ).toBeNull();
  });
});

describe('קיצורי "מה יקרה אם"', () => {
  it('חיסכון חודשי מקצר את הדרך ליעד', () => {
    const result = whatIfSaveMonthly(input(), ILS(100));
    expect(result.labelHe).toContain('100');
    expect(result.summaryHe.length).toBeGreaterThan(0);
  });

  it('קבלת כסף שמספיק ליעד', () => {
    const result = whatIfReceive(input(), ILS(700));
    expect(result.balanceChangeAgorot).toBe(ILS(700));
    expect(result.summaryHe).toContain('מספיק כדי להגיע ליעד');
  });

  it('הוצאה מחזירה את סטטוס הסימולציה', () => {
    const result = whatIfSpend(input(), ILS(600));
    expect(result.balanceChangeAgorot).toBe(ILS(-600));
    expect(result.summaryHe).toContain('שמור לעתיד');
  });

  it('חיסכון שמקצר את הדרך מציין בכמה חודשים', () => {
    const result = whatIfSaveMonthly(
      input({ balanceAgorot: ILS(4000), regularMonthlyNetAgorot: ILS(100) }),
      ILS(400),
    );
    expect(result.summaryHe).toMatch(/מקצר|נשאר|צפוי/);
  });

  it('חיסכון שעדיין לא מספיק — נאמר בכנות', () => {
    const result = whatIfSaveMonthly(
      input({ balanceAgorot: ILS(100), regularMonthlyNetAgorot: ILS(-200) }),
      ILS(10),
    );
    expect(result.summaryHe).toContain('עדיין לא מספיק');
  });

  it('חיסכון שלא משנה את תאריך היעד', () => {
    const result = whatIfSaveMonthly(
      input({ balanceAgorot: ILS(4990), regularMonthlyNetAgorot: ILS(100) }),
      ILS(1),
    );
    expect(result.goalReachMonthAfter).not.toBeNull();
  });

  it('קבלת כסף שלא מספיקה ליעד', () => {
    const result = whatIfReceive(
      input({ balanceAgorot: ILS(1000), regularMonthlyNetAgorot: ILS(50) }),
      ILS(100),
    );
    expect(result.summaryHe).toMatch(/היעד צפוי|עדיין לא מגיעים/);
  });

  it('קבלת כסף כשאין דרך להגיע ליעד', () => {
    const result = whatIfReceive(
      input({ balanceAgorot: ILS(500), regularMonthlyNetAgorot: ILS(-100), summerTotalNetAgorot: 0 }),
      ILS(100),
    );
    expect(result.summaryHe).toContain('עדיין לא מגיעים ליעד');
  });

  it('⭐ "מקצר את הדרך" כשהחיסכון באמת מקדים את היעד', () => {
    // פער ₪600, נטו ₪50 → 12 חודשים. עם ₪250 נוספים → 2 חודשים.
    const result = whatIfSaveMonthly(
      input({
        balanceAgorot: ILS(4400),
        regularMonthlyNetAgorot: ILS(50),
        summerTotalNetAgorot: 0,
      }),
      ILS(250),
    );
    expect(result.summaryHe).toContain('מקצר את הדרך');
  });

  it('רכישה גדולה שלא דוחה את היעד — ההסבר מדבר על הכסף הפנוי', () => {
    // היעד כבר הושג, ולכן אין דחייה — אבל הרכישה עדיין תופסת
    // כמעט את כל הכסף הפנוי לחודש
    const result = simulatePurchase(
      input({ amountAgorot: ILS(400), balanceAgorot: ILS(6000) }),
    );
    expect(result.verdict).toBe('tight');
    expect(result.goalDelayDays).toBe(0);
    expect(result.explanationHe).toContain('חלק גדול מהכסף הפנוי');
  });

  it('⭐ חיסכון שהופך יעד בלתי-מושג למושג', () => {
    // בלי החיסכון הנטו שלילי ואף פעם לא מגיעים; איתו — כן
    const result = whatIfSaveMonthly(
      input({
        balanceAgorot: ILS(4400),
        regularMonthlyNetAgorot: ILS(-50),
        summerTotalNetAgorot: 0,
      }),
      ILS(150),
    );
    expect(result.goalReachMonthBefore).toBeNull();
    expect(result.goalReachMonthAfter).not.toBeNull();
    expect(result.summaryHe).toContain('היעד צפוי');
  });

  it('⭐ רכישה שדוחה את היעד — ההסבר מציין בכמה ימים', () => {
    // רכישה שתופסת נתח משמעותי וגם דוחה את היעד מעבר לסף
    const result = simulatePurchase(
      input({
        amountAgorot: ILS(200),
        safeToSpendNowAgorot: ILS(418),
        balanceAgorot: ILS(4400),
        regularMonthlyNetAgorot: ILS(50),
        summerTotalNetAgorot: 0,
      }),
    );
    expect(result.verdict).toBe('tight');
    expect(result.explanationHe).toContain('דוחה את היעד');
  });

  it('רכישה שדורשת יותר מ-24 חודשי חיסכון — אין תאריך', () => {
    expect(
      earliestAffordableDate(
        input({ amountAgorot: ILS(100_000), regularMonthlyNetAgorot: ILS(10) }),
      ),
    ).toBeNull();
  });
});

describe('מקרי קצה', () => {
  it('כסף פנוי אפס', () => {
    const result = simulatePurchase(input({ amountAgorot: ILS(50), safeToSpendNowAgorot: 0 }));
    expect(result.verdict).toBe('uses_reserve');
  });

  it('רכישה באפס', () => {
    const result = simulatePurchase(input({ amountAgorot: 0 }));
    expect(result.verdict).toBe('affordable');
    expect(result.after.balanceAgorot).toBe(result.before.balanceAgorot);
  });

  it('רזרבה אפס — כל חריגה פוגעת בביטחון', () => {
    const result = simulatePurchase(
      input({ amountAgorot: ILS(500), reservedForFutureMonthsAgorot: 0 }),
    );
    expect(result.verdict).toBe('over_safe');
  });
});
