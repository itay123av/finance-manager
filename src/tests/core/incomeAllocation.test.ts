/**
 * ⭐ בדיקות חלוקת הכנסה.
 *
 * ה-invariant המרכזי: `sum(allocations) === incomeAmountAgorot`, בדיוק
 * באגורה. אגורה שנעלמת בחודש היא ₪1.20 בשנה — ומשתמש שרואה שהמספרים
 * לא מסתדרים מפסיק להאמין לכל השאר.
 */

import { describe, expect, it } from 'vitest';
import {
  allocateIncome,
  allocationIsBalanced,
  allocationOptions,
  bufferShortfall,
  splitAcrossMonths,
  type AllocationInput,
} from '../../core/incomeAllocation';
import { ILS } from '../helpers';

function input(overrides: Partial<AllocationInput> = {}): AllocationInput {
  return {
    incomeAgorot: ILS(4200),
    monthsToCover: 10,
    commitmentsAgorot: ILS(200),
    bufferShortfallAgorot: ILS(0),
    essentialMonthlyAgorot: ILS(60),
    typicalFunMonthlyAgorot: ILS(70),
    goalGapAgorot: ILS(600),
    plannedPurchasesAgorot: 0,
    ...overrides,
  };
}

describe('⭐ ה-invariant: סכום החלקים = ההכנסה', () => {
  it('מתקיים במסלול מאוזן', () => {
    const result = allocateIncome('balanced', input());
    expect(result.totalAllocatedAgorot).toBe(result.incomeAgorot);
    expect(allocationIsBalanced(result)).toBe(true);
  });

  it('מתקיים בשלושת המסלולים', () => {
    for (const result of allocationOptions(input())) {
      expect(allocationIsBalanced(result)).toBe(true);
    }
  });

  it('⭐ מתקיים גם עם סכומים שלא מתחלקים יפה', () => {
    const awkward = [
      ILS(1000.01),
      ILS(333.33),
      ILS(7.77),
      ILS(0.01),
      ILS(99999.99),
      1, // אגורה בודדת
      7, // שבע אגורות
    ];
    for (const incomeAgorot of awkward) {
      for (const result of allocationOptions(input({ incomeAgorot }))) {
        expect(result.totalAllocatedAgorot, `${incomeAgorot} · ${result.planId}`).toBe(
          incomeAgorot,
        );
      }
    }
  });

  it('מתקיים כשההכנסה קטנה מההתחייבויות', () => {
    const result = allocateIncome('balanced', input({ incomeAgorot: ILS(50) }));
    expect(allocationIsBalanced(result)).toBe(true);
    expect(result.noteHe).toContain('לא מספיק');
  });

  it('הכנסה אפס מחזירה חלוקה ריקה ומאוזנת', () => {
    const result = allocateIncome('balanced', input({ incomeAgorot: 0 }));
    expect(result.lines).toEqual([]);
    expect(result.totalAllocatedAgorot).toBe(0);
  });
});

describe('⭐ סדר העדיפויות', () => {
  it('התחייבויות וסכום ביטחון לפני היעד', () => {
    // הכנסה גדולה מספיק כדי שגם היעד יקבל משהו — אחרת אין מה לסדר
    const result = allocateIncome(
      'balanced',
      input({ incomeAgorot: ILS(5000), commitmentsAgorot: ILS(300), bufferShortfallAgorot: ILS(400) }),
    );
    const buckets = result.lines.map((l) => l.bucket);

    expect(buckets).toContain('goal');
    expect(buckets.indexOf('commitments')).toBeLessThan(buckets.indexOf('goal'));
    expect(buckets.indexOf('safetyBuffer')).toBeLessThan(buckets.indexOf('goal'));
  });

  it('⭐ הכנסה שלא מספיקה למחיה כלל לא מגיעה ליעד', () => {
    // ₪1,000 מול 10 חודשי מחיה — הכל נבלע בהתחייבויות, ביטחון ומחיה
    const result = allocateIncome(
      'balanced',
      input({ incomeAgorot: ILS(1000), commitmentsAgorot: ILS(300), bufferShortfallAgorot: ILS(400) }),
    );
    expect(result.lines.some((l) => l.bucket === 'goal')).toBe(false);
    expect(allocationIsBalanced(result)).toBe(true);
  });

  it('⭐ היעד לא בולע את כל ההכנסה', () => {
    const result = allocateIncome('conservative', input({ goalGapAgorot: ILS(4000) }));
    const goal = result.lines.find((l) => l.bucket === 'goal');
    expect(goal!.amountAgorot).toBeLessThan(result.incomeAgorot);
    // נשארת הקצבה חודשית שאפשר לחיות איתה
    expect(result.monthlyAllowanceAgorot).toBeGreaterThan(0);
  });

  it('⭐ תמיד נשאר מינימום הנאה', () => {
    const result = allocateIncome('conservative', input({ goalGapAgorot: ILS(99999) }));
    expect(result.monthlyFunAgorot).toBeGreaterThan(0);
  });

  it('שמרני מקצה ליעד יותר מגמיש', () => {
    const conservative = allocateIncome('conservative', input());
    const flexible = allocateIncome('flexible', input());
    const goalOf = (r: typeof conservative) =>
      r.lines.find((l) => l.bucket === 'goal')?.amountAgorot ?? 0;

    expect(goalOf(conservative)).toBeGreaterThan(goalOf(flexible));
  });

  it('גמיש משאיר יותר להנאה', () => {
    const funOf = (planId: 'conservative' | 'flexible') =>
      allocateIncome(planId, input()).monthlyFunAgorot;
    expect(funOf('flexible')).toBeGreaterThan(funOf('conservative'));
  });
});

describe('מקרי יעד', () => {
  it('יעד כמעט הושג — מוקצה רק הפער', () => {
    const result = allocateIncome('conservative', input({ goalGapAgorot: ILS(100) }));
    expect(result.lines.find((l) => l.bucket === 'goal')?.amountAgorot).toBe(ILS(100));
  });

  it('יעד כבר הושג — אין הקצאה ליעד', () => {
    const result = allocateIncome('balanced', input({ goalGapAgorot: 0 }));
    expect(result.lines.some((l) => l.bucket === 'goal')).toBe(false);
    expect(allocationIsBalanced(result)).toBe(true);
  });
});

describe('סכום הביטחון', () => {
  it('חסר — מושלם לפני היעד', () => {
    const result = allocateIncome('balanced', input({ bufferShortfallAgorot: ILS(500) }));
    expect(result.lines.find((l) => l.bucket === 'safetyBuffer')?.amountAgorot).toBe(ILS(500));
  });

  it('מלא — אין שורה', () => {
    const result = allocateIncome('balanced', input({ bufferShortfallAgorot: 0 }));
    expect(result.lines.some((l) => l.bucket === 'safetyBuffer')).toBe(false);
  });

  it('חישוב החוסר', () => {
    expect(bufferShortfall(ILS(300), ILS(500))).toBe(ILS(200));
    expect(bufferShortfall(ILS(800), ILS(500))).toBe(0);
  });
});

describe('⭐ חלוקה בין חודשים', () => {
  it('מתחלק שווה כשאפשר', () => {
    expect(splitAcrossMonths(ILS(300), 3)).toEqual([ILS(100), ILS(100), ILS(100)]);
  });

  it('⭐ השארית נכנסת לחודש הראשון, ודטרמיניסטית', () => {
    const parts = splitAcrossMonths(1000, 3); // 10 שקלים ל-3 חודשים
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    // אותו קלט תמיד אותה תוצאה
    expect(splitAcrossMonths(1000, 3)).toEqual(parts);
  });

  it('סכום החלקים תמיד שווה למקור', () => {
    for (const total of [1, 7, 99, 1234, 45678]) {
      for (const months of [1, 2, 3, 7, 10, 12]) {
        const parts = splitAcrossMonths(total, months);
        expect(parts.reduce((a, b) => a + b, 0), `${total}/${months}`).toBe(total);
      }
    }
  });

  it('אפס חודשים מחזיר רשימה ריקה', () => {
    expect(splitAcrossMonths(ILS(100), 0)).toEqual([]);
  });
});

describe('הקצבה חודשית', () => {
  it('מחושבת מהמחיה וההנאה', () => {
    const result = allocateIncome('balanced', input());
    expect(result.monthlyAllowanceAgorot).toBeGreaterThan(0);
    expect(result.monthsCovered).toBe(10);
  });

  it('חודש אחד לפחות', () => {
    expect(allocateIncome('balanced', input({ monthsToCover: 0 })).monthsCovered).toBe(1);
  });
});
