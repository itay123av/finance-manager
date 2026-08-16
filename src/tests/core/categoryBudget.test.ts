/**
 * ⭐ בדיקות התקציב לפי קטגוריה.
 *
 * הסכנה שנבדקת: אם חיובי הכרטיס הישן ייכנסו לחישוב, כל קטגוריה תקבל
 * תקציב מנופח — כסף שהלך למקום לא ידוע יוקצה לאוכל בחוץ ולבילויים,
 * והמשתמש יקבל אישור להוציא יותר ממה שיש לו.
 */

import { describe, expect, it } from 'vitest';
import { buildCategoryBudget, reducibleLines } from '../../core/categoryBudget';
import { RETIRED_CARD_CATEGORY_ID, type EffectiveExpense } from '../../core/effectiveSpending';
import { DEFAULT_CATEGORIES } from '../../content/categories.seed';
import { ILS } from '../helpers';

const TODAY = '2026-08-07';

function expense(date: string, shekels: number, categoryId: string): EffectiveExpense {
  return {
    id: `${date}-${categoryId}-${shekels}`,
    date,
    amountAgorot: ILS(shekels),
    categoryId,
    merchant: 'x',
    source: categoryId === RETIRED_CARD_CATEGORY_ID ? 'card_retired' : 'bank',
  };
}

/** שלושה חודשים מלאים עם הוצאות יציבות. */
const STEADY = [
  expense('2026-05-10', 200, 'cat-food-out'),
  expense('2026-05-12', 100, 'cat-transport'),
  expense('2026-06-10', 200, 'cat-food-out'),
  expense('2026-06-12', 100, 'cat-transport'),
  expense('2026-07-10', 200, 'cat-food-out'),
  expense('2026-07-12', 100, 'cat-transport'),
];

describe('בניית תקציב מנתונים מפורטים', () => {
  it('התקציב מבוסס על החציון החודשי', () => {
    const result = buildCategoryBudget({
      expenses: STEADY,
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });

    const food = result.lines.find((l) => l.categoryId === 'cat-food-out')!;
    expect(food.typicalMonthlyAgorot).toBe(ILS(200));
    expect(food.plannedAgorot).toBe(ILS(200));
    expect(food.monthsUsed).toBe(3);
  });

  it('מסלול שמרני מקטין את התקציב', () => {
    const result = buildCategoryBudget({
      expenses: STEADY,
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 0.75,
    });
    expect(result.lines.find((l) => l.categoryId === 'cat-food-out')?.plannedAgorot).toBe(ILS(150));
  });

  it('השורות ממוינות מהגדולה לקטנה', () => {
    const result = buildCategoryBudget({
      expenses: STEADY,
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });
    expect(result.lines[0]?.categoryId).toBe('cat-food-out');
    expect(result.lines[1]?.categoryId).toBe('cat-transport');
  });

  it('⭐ חודש שבו הקטגוריה לא הופיעה נספר כאפס', () => {
    // בגדים: רכישה אחת ב-3 חודשים. החציון הוא 0 ולא 300 —
    // אחרת רכישה חד-פעמית הייתה הופכת לתקציב חודשי קבוע.
    // מוסיפים הוצאה בחודש הנוכחי כדי שהשורה תישאר בתצוגה.
    const result = buildCategoryBudget({
      expenses: [
        ...STEADY,
        expense('2026-06-15', 300, 'cat-clothes'),
        expense('2026-08-02', 20, 'cat-clothes'),
      ],
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });

    const clothes = result.lines.find((l) => l.categoryId === 'cat-clothes')!;
    expect(clothes.typicalMonthlyAgorot).toBe(0);
    expect(clothes.plannedAgorot).toBe(0);
    expect(clothes.spentAgorot).toBe(ILS(20));
  });

  it('קטגוריה בלי הוצאה כלל אינה שורה בתקציב', () => {
    const result = buildCategoryBudget({
      expenses: [...STEADY, expense('2026-06-15', 300, 'cat-clothes')],
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });
    // חציון 0 ואין הוצאה החודש → לא מציגים שורה ריקה
    expect(result.lines.some((l) => l.categoryId === 'cat-clothes')).toBe(false);
  });

  it('הוצאות החודש הנוכחי נספרות כ"כבר הוצא" ולא בחציון', () => {
    const result = buildCategoryBudget({
      expenses: [...STEADY, expense('2026-08-03', 90, 'cat-food-out')],
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });
    const food = result.lines.find((l) => l.categoryId === 'cat-food-out')!;
    expect(food.typicalMonthlyAgorot).toBe(ILS(200));
    expect(food.spentAgorot).toBe(ILS(90));
    expect(food.remainingAgorot).toBe(ILS(110));
  });
});

describe('⭐ הכרטיס הישן לא מעוות את התקציב', () => {
  const WITH_RETIRED = [
    ...STEADY,
    expense('2026-05-20', 900, RETIRED_CARD_CATEGORY_ID),
    expense('2026-06-20', 900, RETIRED_CARD_CATEGORY_ID),
    expense('2026-07-20', 900, RETIRED_CARD_CATEGORY_ID),
  ];

  it('התקציב הקטגוריאלי זהה עם ובלי הכרטיס הישן', () => {
    const without = buildCategoryBudget({
      expenses: STEADY,
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });
    const withRetired = buildCategoryBudget({
      expenses: WITH_RETIRED,
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });

    expect(withRetired.totalPlannedAgorot).toBe(without.totalPlannedAgorot);
    expect(withRetired.lines.find((l) => l.categoryId === 'cat-food-out')?.plannedAgorot).toBe(
      ILS(200),
    );
  });

  it('⭐ אין שורת תקציב לכרטיס הישן', () => {
    const result = buildCategoryBudget({
      expenses: WITH_RETIRED,
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });
    expect(result.lines.some((l) => l.categoryId === RETIRED_CARD_CATEGORY_ID)).toBe(false);
  });

  it('הסכום האטום מדווח בנפרד ונכלל בסך הכולל', () => {
    const result = buildCategoryBudget({
      expenses: WITH_RETIRED,
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });

    expect(result.opaqueMonthlyAgorot).toBe(ILS(900));
    expect(result.totalPlannedAgorot).toBe(ILS(300));
    expect(result.grandTotalAgorot).toBe(ILS(1200));
  });

  it('מוצגת הסתייגות', () => {
    const result = buildCategoryBudget({
      expenses: WITH_RETIRED,
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });
    expect(result.noteHe).toContain('כרטיס ישן ללא פירוט');
  });

  it('בלי הוצאות אטומות אין הסתייגות', () => {
    const result = buildCategoryBudget({
      expenses: STEADY,
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });
    expect(result.noteHe).toBeNull();
    expect(result.opaqueMonthlyAgorot).toBe(0);
  });

  it('⭐ חודש אטום לגמרי לא תורם לחציון הקטגוריאלי', () => {
    // מאי אטום לגמרי; יוני ויולי מפורטים
    const result = buildCategoryBudget({
      expenses: [
        expense('2026-05-20', 900, RETIRED_CARD_CATEGORY_ID),
        expense('2026-06-10', 200, 'cat-food-out'),
        expense('2026-07-10', 200, 'cat-food-out'),
      ],
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });

    expect(result.monthsAnalyzed).toBe(2);
    expect(result.lines.find((l) => l.categoryId === 'cat-food-out')?.typicalMonthlyAgorot).toBe(
      ILS(200),
    );
  });
});

describe('⭐ המלצות צמצום', () => {
  it('רק קטגוריות הנאה או ניתנות לצמצום', () => {
    const result = buildCategoryBudget({
      expenses: STEADY,
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });
    const reducible = reducibleLines(result);

    expect(reducible.some((l) => l.categoryId === 'cat-food-out')).toBe(true); // fun
    expect(reducible.some((l) => l.categoryId === 'cat-transport')).toBe(false); // essential
  });

  it('⭐ לעולם לא מציעים לצמצם קטגוריה אטומה', () => {
    const result = buildCategoryBudget({
      expenses: [...STEADY, expense('2026-06-20', 900, RETIRED_CARD_CATEGORY_ID)],
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });
    expect(reducibleLines(result).some((l) => l.categoryId === RETIRED_CARD_CATEGORY_ID)).toBe(
      false,
    );
  });
});

describe('מקרי קצה', () => {
  it('בלי הוצאות בכלל', () => {
    const result = buildCategoryBudget({
      expenses: [],
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });
    expect(result.lines).toEqual([]);
    expect(result.grandTotalAgorot).toBe(0);
    expect(result.noteHe).toContain('אין מספיק נתונים');
  });

  it('רק החודש הנוכחי — אין חודשים מלאים לניתוח', () => {
    const result = buildCategoryBudget({
      expenses: [expense('2026-08-03', 90, 'cat-food-out')],
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });
    expect(result.monthsAnalyzed).toBe(0);
    // השורה עדיין מופיעה כי יש בה הוצאה בפועל
    expect(result.lines.find((l) => l.categoryId === 'cat-food-out')?.spentAgorot).toBe(ILS(90));
  });

  it('חלון ההסתכלות ניתן להגבלה', () => {
    const result = buildCategoryBudget({
      expenses: STEADY,
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
      lookbackMonths: 2,
    });
    expect(result.monthsAnalyzed).toBe(2);
  });

  it('קטגוריה שנמחקה מקבלת שם ברירת מחדל', () => {
    const result = buildCategoryBudget({
      expenses: [expense('2026-06-10', 50, 'cat-deleted'), expense('2026-07-10', 50, 'cat-deleted')],
      categories: DEFAULT_CATEGORIES,
      today: TODAY,
      planRatio: 1,
    });
    expect(result.lines[0]?.categoryName).toBe('לא ידוע');
  });
});
