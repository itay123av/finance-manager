import { describe, expect, it } from 'vitest';
import {
  apportionForDisplay,
  assertAgorot,
  clampMin0,
  divA,
  formatILS,
  fromShekels,
  maxA,
  minA,
  mulA,
  pctA,
  roundToShekel,
  splitEvenly,
  sumA,
  toShekels,
} from '../../core/money';

describe('אריתמטיקת אגורות', () => {
  it('פותר את בעיית ה-float הקלאסית של 0.1 + 0.2', () => {
    // ב-float: 0.1 + 0.2 === 0.30000000000000004
    expect(0.1 + 0.2).not.toBe(0.3);
    // באגורות זה פשוט 10 + 20 = 30
    expect(fromShekels(0.1) + fromShekels(0.2)).toBe(fromShekels(0.3));
    expect(fromShekels(0.1) + fromShekels(0.2)).toBe(30);
  });

  it('ממיר שקלים לאגורות בלי לאבד אגורה בעיגול', () => {
    expect(fromShekels(12.34)).toBe(1234);
    expect(fromShekels(0)).toBe(0);
    expect(fromShekels(-5.5)).toBe(-550);
    // 1233.9999999 ב-float — חייב להתעגל ל-1234
    expect(fromShekels(12.339999999)).toBe(1234);
  });

  it('דוחה קלט לא תקין', () => {
    expect(() => fromShekels(NaN)).toThrow();
    expect(() => fromShekels(Infinity)).toThrow();
  });

  it('toShekels מחזיר ערך עשרוני לתצוגה בלבד', () => {
    expect(toShekels(1234)).toBe(12.34);
  });

  it('assertAgorot מקבל שלמים ודוחה שברים', () => {
    expect(() => assertAgorot(1234)).not.toThrow();
    expect(() => assertAgorot(-1234)).not.toThrow();
    expect(() => assertAgorot(12.5)).toThrow(/שלם/);
    expect(() => assertAgorot(NaN)).toThrow(/סופי/);
  });

  it('sumA על מערך ריק מחזיר 0', () => {
    expect(sumA([])).toBe(0);
    expect(sumA([100, 250, -50])).toBe(300);
  });

  it('mulA ו-divA תמיד מחזירים מספר שלם', () => {
    expect(Number.isInteger(mulA(333, 0.333))).toBe(true);
    expect(mulA(10000, 0.75)).toBe(7500);
    expect(divA(1000, 3)).toBe(333);
    expect(Number.isInteger(divA(1000, 7))).toBe(true);
  });

  it('divA דוחה חלוקה באפס', () => {
    expect(() => divA(100, 0)).toThrow();
    expect(() => mulA(100, NaN)).toThrow();
  });

  it('pctA מחשב אחוזים', () => {
    expect(pctA(10000, 25)).toBe(2500);
    expect(pctA(10000, 0)).toBe(0);
  });

  it('clampMin0 חוסם ערכים שליליים', () => {
    expect(clampMin0(-500)).toBe(0);
    expect(clampMin0(500)).toBe(500);
    expect(clampMin0(0)).toBe(0);
  });

  it('minA ו-maxA', () => {
    expect(minA(100, 200)).toBe(100);
    expect(maxA(100, 200)).toBe(200);
    expect(minA(-100, 200)).toBe(-100);
    expect(maxA(-100, -200)).toBe(-100);
  });

  it('roundToShekel מעגל לשקל שלם', () => {
    expect(roundToShekel(12_34)).toBe(12_00);
    expect(roundToShekel(12_67)).toBe(13_00);
  });
});

describe('splitEvenly — אף אגורה לא נעלמת', () => {
  it('סכום החלקים שווה בדיוק לסכום המקורי', () => {
    for (const total of [1000, 999, 1, 0, 12345, 100000]) {
      for (const parts of [1, 2, 3, 7, 10, 12]) {
        const split = splitEvenly(total, parts);
        expect(split).toHaveLength(parts);
        expect(sumA(split)).toBe(total);
      }
    }
  });

  it('מחלק שארית מהחלק הראשון והלאה', () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEvenly(10, 4)).toEqual([3, 3, 2, 2]);
  });

  it('מטפל בסכומים שליליים בלי לאבד אגורות', () => {
    const split = splitEvenly(-1000, 3);
    expect(sumA(split)).toBe(-1000);
    expect(split).toEqual([-334, -333, -333]);
  });

  it('דוחה מספר חלקים לא תקין', () => {
    expect(() => splitEvenly(100, 0)).toThrow();
    expect(() => splitEvenly(100, -3)).toThrow();
    expect(() => splitEvenly(100, 2.5)).toThrow();
  });
});

describe('formatILS', () => {
  it('מעצב שקלים שלמים כברירת מחדל', () => {
    expect(formatILS(123400)).toBe('₪1,234');
    expect(formatILS(0)).toBe('₪0');
    expect(formatILS(5000)).toBe('₪50');
  });

  it('מציג אגורות כשמבקשים', () => {
    expect(formatILS(123456, { showAgorot: true })).toBe('₪1,234.56');
    expect(formatILS(5, { showAgorot: true })).toBe('₪0.05');
  });

  it('מציג סכומים שליליים עם מינוס לפני סימן השקל', () => {
    expect(formatILS(-4500)).toBe('-₪45');
    expect(formatILS(-4550, { showAgorot: true })).toBe('-₪45.50');
  });

  it('מוסיף פלוס רק כשמבקשים ורק לחיוביים', () => {
    expect(formatILS(14000, { signed: true })).toBe('+₪140');
    expect(formatILS(-14000, { signed: true })).toBe('-₪140');
    expect(formatILS(0, { signed: true })).toBe('₪0');
  });

  it('מוסיף מפרידי אלפים גם למספרים גדולים', () => {
    expect(formatILS(123456789)).toBe('₪1,234,568');
  });

  it('הפלט דטרמיניסטי ולא תלוי ב-locale של הסביבה', () => {
    // אותו קלט, שתי קריאות — אין תלות בשעון או בהגדרות מערכת
    expect(formatILS(99999)).toBe(formatILS(99999));
    expect(formatILS(99999)).toBe('₪1,000');
  });
});

describe('⭐ עיגול לתצוגה בלי לייצר סתירה', () => {
  it('⭐ המקרה שנתפס: 194.58 + 464.88 לא מוצגים כ-660 מול סה״כ 659', () => {
    // עיגול כל רכיב בנפרד: 195 + 465 = 660, אבל הסכום האמיתי
    // ‎₪659.46 מתעגל ל-659. המשתמש רואה מספרים שלא מסתדרים.
    const parts = [19_458, 46_488];
    const displayed = apportionForDisplay(parts);

    const displayedSum = displayed.reduce((a, b) => a + b, 0);
    const trueTotalRounded = Math.round((19_458 + 46_488) / 100) * 100;

    expect(displayedSum).toBe(trueTotalRounded);
    expect(displayed).toEqual([19_400, 46_500]);
  });

  it('סכום הרכיבים המוצגים תמיד שווה לסך המעוגל', () => {
    const cases: number[][] = [
      [19_458, 46_488],
      [3_333, 3_333, 3_334],
      [1, 1, 1],
      [99, 99, 99, 99],
      [12_345, 67_890, 11_111],
      [50],
      [0, 0],
    ];
    for (const parts of cases) {
      const displayed = apportionForDisplay(parts);
      const total = parts.reduce((a, b) => a + b, 0);
      expect(
        displayed.reduce((a, b) => a + b, 0),
        JSON.stringify(parts),
      ).toBe(Math.round(total / 100) * 100);
    }
  });

  it('כל רכיב מוצג בשקלים שלמים', () => {
    for (const value of apportionForDisplay([19_458, 46_488, 7_777])) {
      expect(value % 100).toBe(0);
    }
  });

  it('דטרמיניסטי — אותו קלט, אותה תוצאה', () => {
    const parts = [19_458, 46_488, 7_777];
    expect(apportionForDisplay(parts)).toEqual(apportionForDisplay(parts));
  });

  it('רשימה ריקה', () => {
    expect(apportionForDisplay([])).toEqual([]);
  });

  it('עובד גם כשהסכום מתעגל כלפי מטה', () => {
    // ‎0.20 + 0.20 = 0.40 → מתעגל ל-0
    const displayed = apportionForDisplay([20, 20]);
    expect(displayed.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('⭐ clampMin0 מנרמל מינוס אפס', () => {
  it('‎-0 הופך ל-‎+0', () => {
    // בלי הנרמול, `clampMin0(-0)` היה מחזיר ‎-0 (כי `-0 < 0` הוא false)
    // והערך זולג להשוואות Object.is ולתצוגה כ-"‎-₪0"
    expect(Object.is(clampMin0(-0), 0)).toBe(true);
    expect(Object.is(clampMin0(-0), -0)).toBe(false);
  });

  it('ערכים רגילים לא מושפעים', () => {
    expect(clampMin0(500)).toBe(500);
    expect(clampMin0(-500)).toBe(0);
    expect(clampMin0(0)).toBe(0);
  });
});
