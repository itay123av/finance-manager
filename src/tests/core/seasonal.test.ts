import { describe, expect, it } from 'vitest';
import {
  allocateSeasonalIncome,
  allocationTotal,
  DEFAULT_MONTHS_TO_COVER,
  FUN_FLOOR_MIN_MONTHLY_AGOROT,
  REMAINDER_TO_MONTHLY_SHARE,
  type SeasonalAllocationInput,
} from '../../core/seasonal';
import { ILS } from '../helpers';

function input(overrides: Partial<SeasonalAllocationInput> = {}): SeasonalAllocationInput {
  return {
    summerIncomeAgorot: ILS(4200),
    monthsToCover: DEFAULT_MONTHS_TO_COVER,
    targetAgorot: ILS(5000),
    currentBalanceAgorot: ILS(1240),
    essentialMonthlyAgorot: ILS(90),
    typicalFunMonthlyAgorot: ILS(200),
    plannedPurchasesAgorot: 0,
    ...overrides,
  };
}

describe('⭐ סדר ההקצאה — היעד לא בולע את כל הכסף', () => {
  it('התוכנית הישנה הייתה משאירה ₪0 לחודש; החדשה לא', () => {
    const a = allocateSeasonalIncome(input());
    // הפער ליעד הוא ₪3,760 — כמעט כל ההכנסה. אבל הוא לא ראשון בתור.
    expect(a.goalReserveAgorot).toBeLessThan(ILS(3760));
    expect(a.monthlyAllowanceAgorot).toBeGreaterThan(0);
  });

  it('קרן הביטחון ראשונה', () => {
    const a = allocateSeasonalIncome(input());
    expect(a.safetyBufferAgorot).toBe(ILS(500));
  });

  it('רצפת המחייה נשמרת לפני היעד', () => {
    const a = allocateSeasonalIncome(input({ essentialMonthlyAgorot: ILS(90) }));
    expect(a.essentialTotalAgorot).toBe(ILS(900)); // 90 × 10
  });

  it('רצפת ההנאה נשמרת לפני היעד — תוכנית בלי בילויים לא שורדת', () => {
    const a = allocateSeasonalIncome(input({ typicalFunMonthlyAgorot: ILS(200) }));
    expect(a.funFloorTotalAgorot).toBe(ILS(500)); // 200 × 0.25 × 10
    expect(a.monthlyFunAgorot).toBeGreaterThan(0);
  });

  it('רצפת ההנאה לא יורדת מהמינימום המוחלט', () => {
    const a = allocateSeasonalIncome(input({ typicalFunMonthlyAgorot: ILS(20) }));
    expect(a.funFloorTotalAgorot).toBe(FUN_FLOOR_MIN_MONTHLY_AGOROT * 10);
  });

  it('היעד מקבל את מה שנשאר אחרי שלוש הרצפות', () => {
    const a = allocateSeasonalIncome(input());
    // 4200 − 500 − 900 − 500 = 2300, והפער ליעד 3760 → נלקח הכל
    expect(a.goalReserveAgorot).toBe(ILS(2300));
    expect(a.remainderAgorot).toBe(0);
  });

  it('רכישות מתוכננות אחרי היעד — ומקבלות רק את מה שנשאר', () => {
    // 8000 − 500 − 900 − 500 = 6100; היעד לוקח 3760 ונשארים 2340
    const enough = allocateSeasonalIncome(
      input({ summerIncomeAgorot: ILS(8000), plannedPurchasesAgorot: ILS(400) }),
    );
    expect(enough.goalReserveAgorot).toBe(ILS(3760)); // הפער המלא
    expect(enough.plannedPurchasesAgorot).toBe(ILS(400));

    // 6000 − 500 − 900 − 500 = 4100; היעד לוקח 3760 ונשארים רק 340
    const partial = allocateSeasonalIncome(
      input({ summerIncomeAgorot: ILS(6000), plannedPurchasesAgorot: ILS(400) }),
    );
    expect(partial.plannedPurchasesAgorot).toBe(ILS(340));
    expect(partial.steps.find((s) => s.key === 'plannedPurchases')?.fullyFunded).toBe(false);
  });
});

describe('⭐ האינווריאנטה: לא נעלמות ולא נוצרות אגורות', () => {
  it('סכום כל הדליים שווה בדיוק להכנסה', () => {
    const cases = [
      input(),
      input({ summerIncomeAgorot: ILS(1000) }),
      input({ summerIncomeAgorot: ILS(12345.67) }),
      input({ summerIncomeAgorot: ILS(300) }),
      input({ summerIncomeAgorot: 1 }),
      input({ summerIncomeAgorot: ILS(20000), plannedPurchasesAgorot: ILS(800) }),
      input({ summerIncomeAgorot: ILS(9999), monthsToCover: 7 }),
    ];
    for (const c of cases) {
      const a = allocateSeasonalIncome(c);
      expect(allocationTotal(a)).toBe(c.summerIncomeAgorot);
    }
  });

  it('הכנסה אפס — הכל אפס, בלי שגיאה', () => {
    const a = allocateSeasonalIncome(input({ summerIncomeAgorot: 0 }));
    expect(allocationTotal(a)).toBe(0);
    expect(a.monthlyAllowanceAgorot).toBe(0);
    expect(a.isSufficient).toBe(false);
  });

  it('הכנסה שלילית מטופלת כאפס', () => {
    const a = allocateSeasonalIncome(input({ summerIncomeAgorot: ILS(-100) }));
    expect(a.safetyBufferAgorot).toBe(0);
  });
});

describe('חלוקת השארית', () => {
  it('60% להקצבה החודשית, 40% ליעד', () => {
    const a = allocateSeasonalIncome(input({ summerIncomeAgorot: ILS(10000) }));
    // 10000 − 500 − 900 − 500 − 3760 = 4340 שארית
    expect(a.remainderAgorot).toBe(ILS(4340));
    const toMonthly = Math.round(ILS(4340) * REMAINDER_TO_MONTHLY_SHARE);
    expect(a.goalTotalAgorot).toBe(ILS(3760) + (ILS(4340) - toMonthly));
    // ההקצבה החודשית גדלה בזכות השארית
    expect(a.monthlyAllowanceAgorot).toBeGreaterThan(ILS(140));
  });

  it('כשאין שארית — היעד מקבל בדיוק את הרזרבה', () => {
    const a = allocateSeasonalIncome(input());
    expect(a.remainderAgorot).toBe(0);
    expect(a.goalTotalAgorot).toBe(a.goalReserveAgorot);
  });
});

describe('כשההכנסה לא מספיקה — אומרים את האמת', () => {
  it('מסמן שאין די, ומחשב כמה חודשים באמת מכוסים', () => {
    // 90 + 40 = ₪130 לחודש למחייה. אחרי ₪500 ביטחון נשארו ₪500.
    const a = allocateSeasonalIncome(
      input({ summerIncomeAgorot: ILS(1000), typicalFunMonthlyAgorot: ILS(160) }),
    );
    expect(a.isSufficient).toBe(false);
    expect(a.monthsActuallyCovered).toBeLessThan(DEFAULT_MONTHS_TO_COVER);
    expect(a.goalReserveAgorot).toBe(0); // היעד לא מקבל כלום כשאין למחייה
    expect(a.messageHe).toContain('מתוך');
  });

  it('לא מבטיח יותר חודשים ממה שביקשו', () => {
    const a = allocateSeasonalIncome(input({ summerIncomeAgorot: ILS(99999) }));
    expect(a.monthsActuallyCovered).toBe(DEFAULT_MONTHS_TO_COVER);
    expect(a.isSufficient).toBe(true);
  });

  it('הודעת הצלחה מפרטת את החלוקה', () => {
    const a = allocateSeasonalIncome(input({ summerIncomeAgorot: ILS(10000) }));
    expect(a.isSufficient).toBe(true);
    expect(a.messageHe).toContain('קרן ביטחון');
    expect(a.messageHe).toContain('לחודש');
  });

  it('הוצאות מחייה אפס לא גורמות לחלוקה באפס', () => {
    const a = allocateSeasonalIncome(
      input({ essentialMonthlyAgorot: 0, typicalFunMonthlyAgorot: 0, summerIncomeAgorot: ILS(600) }),
    );
    expect(Number.isFinite(a.monthsActuallyCovered)).toBe(true);
  });
});

describe('פירוט הצעדים לתצוגה', () => {
  it('שישה צעדים, כל אחד עם תווית והסבר', () => {
    const a = allocateSeasonalIncome(input());
    expect(a.steps).toHaveLength(6);
    for (const step of a.steps) {
      expect(step.labelHe.length).toBeGreaterThan(0);
      expect(step.noteHe.length).toBeGreaterThan(0);
    }
    expect(a.steps.map((s) => s.key)).toEqual([
      'safetyBuffer',
      'essential',
      'funFloor',
      'goalReserve',
      'plannedPurchases',
      'remainder',
    ]);
  });

  it('סכום הצעדים שווה להכנסה', () => {
    const a = allocateSeasonalIncome(input());
    expect(a.steps.reduce((s, x) => s + x.amountAgorot, 0)).toBe(a.summerIncomeAgorot);
  });

  it('מסמן אילו דליים לא מומנו במלואם', () => {
    const a = allocateSeasonalIncome(input({ summerIncomeAgorot: ILS(700) }));
    expect(a.steps.find((s) => s.key === 'safetyBuffer')?.fullyFunded).toBe(true);
    expect(a.steps.find((s) => s.key === 'essential')?.fullyFunded).toBe(false);
  });
});

describe('ולידציה', () => {
  it('דוחה מספר חודשים לא תקין', () => {
    expect(() => allocateSeasonalIncome(input({ monthsToCover: 0 }))).toThrow();
    expect(() => allocateSeasonalIncome(input({ monthsToCover: -3 }))).toThrow();
  });
});
