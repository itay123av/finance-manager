/**
 * ⭐ בדיקות "למה בטוח להוציא השתנה".
 *
 * הדרישה המרכזית: סכום הגורמים חייב להסתכם **בדיוק** בהפרש. הסבר
 * שלא מסתכם משאיר את המשתמש עם תחושה שמשהו חסר — וזה בדיוק מה
 * שההסבר אמור למנוע.
 */

import { describe, expect, it } from 'vitest';
import {
  SIGNIFICANT_CHANGE_AGOROT,
  explainSafeToSpendChange,
  type SafeToSpendComponents,
} from '../../core/changeExplain';
import { ILS } from '../helpers';

function components(overrides: Partial<SafeToSpendComponents> = {}): SafeToSpendComponents {
  const base = {
    currentBalanceAgorot: ILS(4400),
    safetyBufferAgorot: ILS(500),
    committedLeftAgorot: ILS(0),
    reservedForFutureMonthsAgorot: ILS(3482),
    goalDueThisMonthAgorot: ILS(0),
    ...overrides,
  };
  return {
    ...base,
    resultAgorot:
      base.currentBalanceAgorot -
      base.safetyBufferAgorot -
      base.committedLeftAgorot -
      base.reservedForFutureMonthsAgorot -
      base.goalDueThisMonthAgorot,
  };
}

describe('⭐ הפירוק מסתכם בדיוק', () => {
  it('שינוי יחיד', () => {
    const before = components();
    const after = components({ currentBalanceAgorot: ILS(4310) });
    const result = explainSafeToSpendChange(before, after);

    expect(result.reconciles).toBe(true);
    expect(result.deltaAgorot).toBe(ILS(-90));
    expect(result.factors).toHaveLength(1);
    expect(result.factors[0]?.kind).toBe('balance');
    expect(result.factors[0]?.labelHe).toBe('הוצאה חדשה');
  });

  it('⭐ כמה שינויים יחד — כמו בדוגמה שביקשת', () => {
    const before = components();
    const after = components({
      currentBalanceAgorot: ILS(4310), // ‎-90 הוצאה
      reservedForFutureMonthsAgorot: ILS(3512), // ‎+30 רזרבה → ‎-30
      goalDueThisMonthAgorot: ILS(18), // ‎+18 יעד → ‎-18
    });
    const result = explainSafeToSpendChange(before, after);

    expect(result.reconciles).toBe(true);
    expect(result.deltaAgorot).toBe(ILS(-138));
    expect(result.factors).toHaveLength(3);

    // ממוין מהגדול לקטן
    expect(result.factors.map((f) => f.effectAgorot)).toEqual([
      ILS(-90),
      ILS(-30),
      ILS(-18),
    ]);
  });

  it('סכום הגורמים תמיד שווה להפרש', () => {
    const cases: Partial<SafeToSpendComponents>[] = [
      { currentBalanceAgorot: ILS(5000) },
      { safetyBufferAgorot: ILS(800) },
      { committedLeftAgorot: ILS(240) },
      { reservedForFutureMonthsAgorot: ILS(3000) },
      { goalDueThisMonthAgorot: ILS(100) },
      { currentBalanceAgorot: ILS(4000), safetyBufferAgorot: ILS(300) },
    ];
    for (const patch of cases) {
      const result = explainSafeToSpendChange(components(), components(patch));
      const sum = result.factors.reduce((total, f) => total + f.effectAgorot, 0);
      expect(sum, JSON.stringify(patch)).toBe(result.deltaAgorot);
      expect(result.reconciles).toBe(true);
    }
  });
});

describe('כיווני ההשפעה', () => {
  it('כסף שנכנס מגדיל', () => {
    const result = explainSafeToSpendChange(
      components(),
      components({ currentBalanceAgorot: ILS(4600) }),
    );
    expect(result.factors[0]?.effectAgorot).toBe(ILS(200));
    expect(result.factors[0]?.labelHe).toBe('נכנס כסף');
    expect(result.headlineHe).toContain('עלה');
  });

  it('סכום ביטחון שגדל מקטין', () => {
    const result = explainSafeToSpendChange(
      components(),
      components({ safetyBufferAgorot: ILS(800) }),
    );
    expect(result.factors[0]?.effectAgorot).toBe(ILS(-300));
    expect(result.factors[0]?.labelHe).toBe('סכום הביטחון גדל');
  });

  it('רזרבה שגדלה מקטינה', () => {
    const result = explainSafeToSpendChange(
      components(),
      components({ reservedForFutureMonthsAgorot: ILS(3582) }),
    );
    expect(result.factors[0]?.labelHe).toContain('הרזרבה');
    expect(result.factors[0]?.effectAgorot).toBe(ILS(-100));
  });

  it('התחייבויות שנוספו מקטינות', () => {
    const result = explainSafeToSpendChange(
      components(),
      components({ committedLeftAgorot: ILS(240) }),
    );
    expect(result.factors[0]?.labelHe).toBe('נוספו הוצאות חובה');
  });
});

describe('מתי שווה להסביר', () => {
  it('שינוי גדול נחשב משמעותי', () => {
    const result = explainSafeToSpendChange(
      components(),
      components({ currentBalanceAgorot: ILS(4310) }),
    );
    expect(result.significant).toBe(true);
  });

  it('שינוי זעיר אינו משמעותי', () => {
    const result = explainSafeToSpendChange(
      components(),
      components({ currentBalanceAgorot: ILS(4395) }),
    );
    expect(result.significant).toBe(false);
  });

  it('הסף מוגדר ב-₪20', () => {
    expect(SIGNIFICANT_CHANGE_AGOROT).toBe(ILS(20));
  });

  it('בלי שינוי — אין גורמים', () => {
    const result = explainSafeToSpendChange(components(), components());
    expect(result.deltaAgorot).toBe(0);
    expect(result.factors).toEqual([]);
    expect(result.headlineHe).toContain('שום דבר לא השתנה');
    expect(result.reconciles).toBe(true);
  });
});
