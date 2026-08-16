/**
 * ⭐ בדיקות הפרדת רמות הביטחון.
 *
 * הרעיון שנבדק: "הוצאת ₪525 החודש" ו-"הוצאת ₪180 על אוכל בחוץ" הם
 * שני מספרים עם ודאות שונה לגמרי. הראשון מתאמת מול הבנק; השני תלוי
 * בכמה מההוצאות באמת מפורטות.
 */

import { describe, expect, it } from 'vitest';
import {
  MIN_DETAILED_SHARE_FOR_CATEGORY_ADVICE,
  assessSpendingConfidence,
  monthDetailWeight,
} from '../../core/spendingConfidence';
import {
  RETIRED_CARD_CATEGORY_ID,
  UNDETAILED_CARD_CATEGORY_ID,
  type EffectiveExpense,
} from '../../core/effectiveSpending';
import { ILS } from '../helpers';

function expense(shekels: number, categoryId: string, date = '2026-07-10'): EffectiveExpense {
  return {
    id: `${categoryId}-${shekels}-${date}`,
    date,
    amountAgorot: ILS(shekels),
    categoryId,
    merchant: 'x',
    source: categoryId === RETIRED_CARD_CATEGORY_ID ? 'card_retired' : 'bank',
  };
}

describe('⭐ הסכום הכולל אמין גם כשהפילוח לא', () => {
  it('הרבה היסטוריה אבל רוב ההוצאות אטומות', () => {
    const result = assessSpendingConfidence({
      expenses: [
        expense(800, RETIRED_CARD_CATEGORY_ID),
        expense(200, 'cat-food-out'),
      ],
      monthsOfData: 7,
    });

    // הסכום נגזר מהבנק — אמין
    expect(result.total).toBe('high');
    // הפילוח מבוסס על 20% בלבד — לא בר-שימוש
    expect(result.category).toBe('none');
    expect(result.categoryAdviceAllowed).toBe(false);
    expect(result.detailedShare).toBeCloseTo(0.2);
  });

  it('הכל מפורט — שתי הרמות גבוהות', () => {
    const result = assessSpendingConfidence({
      expenses: [expense(500, 'cat-food-out'), expense(500, 'cat-shopping')],
      monthsOfData: 7,
    });

    expect(result.total).toBe('high');
    expect(result.category).toBe('high');
    expect(result.categoryAdviceAllowed).toBe(true);
    expect(result.detailedShare).toBe(1);
    expect(result.disclaimerHe).toBeNull();
  });

  it('⭐ הפילוח לעולם לא בטוח יותר מהסכום', () => {
    // הכל מפורט, אבל יש רק חודש אחד של נתונים
    const result = assessSpendingConfidence({
      expenses: [expense(500, 'cat-food-out')],
      monthsOfData: 1,
    });
    expect(result.total).toBe('low');
    expect(result.category).toBe('low');
  });
});

describe('מדרגות לפי חלק ההוצאות המפורטות', () => {
  const at = (detailedShekels: number, opaqueShekels: number) =>
    assessSpendingConfidence({
      expenses: [
        expense(detailedShekels, 'cat-food-out'),
        expense(opaqueShekels, RETIRED_CARD_CATEGORY_ID),
      ],
      monthsOfData: 12,
    });

  it('90% מפורט → גבוה', () => {
    expect(at(900, 100).category).toBe('high');
  });

  it('70% מפורט → בינוני', () => {
    expect(at(700, 300).category).toBe('medium');
  });

  it('55% מפורט → נמוך, אבל עדיין מותר', () => {
    const result = at(550, 450);
    expect(result.category).toBe('low');
    expect(result.categoryAdviceAllowed).toBe(true);
  });

  it('40% מפורט → אין ייעוץ קטגוריאלי', () => {
    const result = at(400, 600);
    expect(result.category).toBe('none');
    expect(result.categoryAdviceAllowed).toBe(false);
  });

  it('הסף מוגדר במחצית ההוצאות', () => {
    expect(MIN_DETAILED_SHARE_FOR_CATEGORY_ADVICE).toBe(0.5);
  });
});

describe('הסתייגות למשתמש', () => {
  it('מוצגת כשיש הוצאות אטומות', () => {
    const result = assessSpendingConfidence({
      expenses: [expense(500, 'cat-food-out'), expense(100, RETIRED_CARD_CATEGORY_ID)],
      monthsOfData: 7,
    });
    expect(result.disclaimerHe).toContain('כרטיס ישן ללא פירוט');
    expect(result.opaqueAgorot).toBe(ILS(100));
  });

  it('גם חיוב "לא מפורט" נחשב אטום', () => {
    const result = assessSpendingConfidence({
      expenses: [expense(500, 'cat-food-out'), expense(500, UNDETAILED_CARD_CATEGORY_ID)],
      monthsOfData: 7,
    });
    expect(result.opaqueAgorot).toBe(ILS(500));
    expect(result.detailedShare).toBe(0.5);
  });
});

describe('מקרי קצה', () => {
  it('בלי הוצאות בכלל', () => {
    const result = assessSpendingConfidence({ expenses: [], monthsOfData: 0 });
    expect(result.total).toBe('none');
    expect(result.detailedShare).toBe(1);
    expect(result.totalAgorot).toBe(0);
    expect(result.disclaimerHe).toBeNull();
  });

  it('בלי היסטוריה — שתי הרמות none', () => {
    const result = assessSpendingConfidence({
      expenses: [expense(100, 'cat-food-out')],
      monthsOfData: 0,
    });
    expect(result.total).toBe('none');
    expect(result.category).toBe('none');
    expect(result.categoryAdviceAllowed).toBe(false);
  });
});

describe('⭐ משקל חודש לפי מידת הפירוט', () => {
  it('חודש מפורט לגמרי מקבל משקל מלא', () => {
    expect(monthDetailWeight([expense(100, 'cat-food-out')])).toBe(1);
  });

  it('חודש אטום לגמרי מקבל אפס', () => {
    expect(monthDetailWeight([expense(100, RETIRED_CARD_CATEGORY_ID)])).toBe(0);
  });

  it('חודש מעורב מקבל משקל יחסי', () => {
    expect(
      monthDetailWeight([
        expense(300, 'cat-food-out'),
        expense(100, RETIRED_CARD_CATEGORY_ID),
      ]),
    ).toBe(0.75);
  });

  it('חודש ריק מקבל אפס', () => {
    expect(monthDetailWeight([])).toBe(0);
  });
});
