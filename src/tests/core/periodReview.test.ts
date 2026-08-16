/**
 * ⭐ בדיקות סיכום שבועי וחודשי.
 *
 * העיקרון: הסכומים תמיד מוצגים (הם נגזרים מהבנק), הפילוח רק כשהוא
 * אמין. סיכום שמראה "הכי הרבה הוצאת על: אחר" גרוע מסיכום בלי פילוח.
 */

import { describe, expect, it } from 'vitest';
import {
  opaqueInPeriod,
  reserveUsedInPeriod,
  reviewMonth,
  reviewWeek,
} from '../../core/periodReview';
import { RETIRED_CARD_CATEGORY_ID, type EffectiveExpense } from '../../core/effectiveSpending';
import type { SpendingConfidence } from '../../core/spendingConfidence';
import { DEFAULT_CATEGORIES } from '../../content/categories.seed';
import { ILS, tx } from '../helpers';

const TODAY = '2026-08-07'; // יום שישי

function confidence(allowed: boolean): SpendingConfidence {
  return {
    total: 'high',
    category: allowed ? 'high' : 'none',
    detailedShare: allowed ? 0.95 : 0.25,
    detailedAgorot: ILS(100),
    opaqueAgorot: ILS(100),
    totalAgorot: ILS(200),
    categoryAdviceAllowed: allowed,
    disclaimerHe: null,
  };
}

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

/** שבוע נוכחי (2–8 באוגוסט) ושבוע קודם. */
const TRANSACTIONS = [
  tx({ date: '2026-07-28', shekels: 100, categoryId: 'cat-food-out' }),
  tx({ date: '2026-07-30', shekels: 100, categoryId: 'cat-food-out' }),
  tx({ date: '2026-08-03', shekels: 150, categoryId: 'cat-food-out' }),
  tx({ date: '2026-08-05', shekels: 50, categoryId: 'cat-transport' }),
  tx({ date: '2026-08-04', shekels: 300, type: 'income', categoryId: 'cat-work' }),
];

const EXPENSES = [
  expense('2026-08-03', 150, 'cat-food-out'),
  expense('2026-08-05', 50, 'cat-transport'),
];

function weekInput(allowed = true) {
  return {
    transactions: TRANSACTIONS,
    expenses: EXPENSES,
    categories: DEFAULT_CATEGORIES,
    confidence: confidence(allowed),
    today: TODAY,
    budgetAgorot: ILS(400),
    reserveUsedAgorot: 0,
  };
}

describe('סיכום שבועי', () => {
  it('הסכומים מוצגים תמיד', () => {
    const review = reviewWeek(weekInput());
    expect(review.incomeAgorot).toBe(ILS(300));
    expect(review.expenseAgorot).toBe(ILS(200));
    expect(review.netAgorot).toBe(ILS(100));
  });

  it('השבוע מוגדר ראשון עד שבת', () => {
    const review = reviewWeek(weekInput());
    expect(review.from).toBe('2026-08-02');
    expect(review.to).toBe('2026-08-08');
  });

  it('השוואה לשבוע הקודם', () => {
    const review = reviewWeek(weekInput());
    // שבוע קודם: 26/07–01/08 → ‎₪100 בלבד (28/07); 30/07 גם בטווח
    expect(review.comparison.previousExpenseAgorot).toBe(ILS(200));
    expect(review.comparison.expenseChangeAgorot).toBe(0);
    expect(review.comparison.directionHe).toBe('כמו');
  });

  it('⭐ פילוח מוצג כשהביטחון מאפשר', () => {
    const review = reviewWeek(weekInput(true));
    expect(review.topCategories.length).toBeGreaterThan(0);
    expect(review.topCategories[0]?.categoryName).toBe('אוכל בחוץ');
    expect(review.categoriesHiddenReasonHe).toBeNull();
  });

  it('⭐ פילוח נחסם כשהביטחון נמוך, עם הסבר', () => {
    const review = reviewWeek(weekInput(false));
    expect(review.topCategories).toEqual([]);
    expect(review.categoriesHiddenReasonHe).toContain('לא מפורטות');
  });

  it('שימוש ברזרבה מסומן', () => {
    const review = reviewWeek({ ...weekInput(), reserveUsedAgorot: ILS(80) });
    expect(review.usedReserve).toBe(true);
    expect(review.usedReserveAgorot).toBe(ILS(80));
  });

  it('בלי שימוש ברזרבה', () => {
    expect(reviewWeek(weekInput()).usedReserve).toBe(false);
  });

  it('קטגוריה אטומה מסומנת ככזו בפילוח', () => {
    const review = reviewWeek({
      ...weekInput(true),
      expenses: [expense('2026-08-03', 900, RETIRED_CARD_CATEGORY_ID)],
    });
    expect(review.topCategories[0]?.opaque).toBe(true);
  });
});

describe('כותרות', () => {
  it('עלייה משמעותית מדווחת באחוזים', () => {
    const review = reviewWeek({
      ...weekInput(),
      transactions: [
        tx({ date: '2026-07-28', shekels: 100, categoryId: 'cat-food-out' }),
        tx({ date: '2026-08-03', shekels: 200, categoryId: 'cat-food-out' }),
      ],
    });
    expect(review.headlineHe).toContain('100% יותר');
  });

  it('ירידה משמעותית', () => {
    const review = reviewWeek({
      ...weekInput(),
      transactions: [
        tx({ date: '2026-07-28', shekels: 200, categoryId: 'cat-food-out' }),
        tx({ date: '2026-08-03', shekels: 50, categoryId: 'cat-food-out' }),
      ],
    });
    expect(review.headlineHe).toContain('פחות');
  });

  it('שינוי קטן — בלי דרמה', () => {
    const review = reviewWeek({
      ...weekInput(),
      transactions: [
        tx({ date: '2026-07-28', shekels: 100, categoryId: 'cat-food-out' }),
        tx({ date: '2026-08-03', shekels: 105, categoryId: 'cat-food-out' }),
      ],
    });
    expect(review.headlineHe).toContain('בערך כמו');
  });

  it('⭐ תקופה בלי הוצאות אינה "ירידה של 100%"', () => {
    // שבוע שרק התחיל אינו הישג. מחמאה על כלום מלמדת להתעלם מהכותרת.
    const review = reviewWeek({
      ...weekInput(),
      transactions: [tx({ date: '2026-07-28', shekels: 200, categoryId: 'cat-food-out' })],
    });
    expect(review.expenseAgorot).toBe(0);
    expect(review.headlineHe).toBe('עדיין לא נרשמו הוצאות בתקופה הזו.');
    expect(review.headlineHe).not.toContain('100%');
  });

  it('בלי נתונים בכלל — כותרת ניטרלית', () => {
    const review = reviewWeek({ ...weekInput(), transactions: [] });
    expect(review.headlineHe).toBe('אין עדיין נתונים לתקופה הזו.');
  });

  it('בלי תקופה קודמת', () => {
    const review = reviewWeek({
      ...weekInput(),
      transactions: [tx({ date: '2026-08-03', shekels: 100, categoryId: 'cat-food-out' })],
    });
    expect(review.comparison.changeSharePct).toBeNull();
    expect(review.headlineHe).toContain('יצא יותר');
  });
});

describe('סיכום חודשי', () => {
  const monthInput = {
    transactions: TRANSACTIONS,
    expenses: EXPENSES,
    categories: DEFAULT_CATEGORIES,
    confidence: confidence(true),
    month: '2026-08',
    budgetAgorot: ILS(400),
    reserveUsedAgorot: 0,
    openingBalanceAgorot: ILS(4000),
    closingBalanceAgorot: ILS(4100),
  };

  it('יתרת פתיחה וסיום', () => {
    const review = reviewMonth(monthInput);
    expect(review.openingBalanceAgorot).toBe(ILS(4000));
    expect(review.closingBalanceAgorot).toBe(ILS(4100));
    expect(review.from).toBe('2026-08-01');
    expect(review.to).toBe('2026-08-31');
  });

  it('עמידה בתקציב', () => {
    const review = reviewMonth(monthInput);
    expect(review.metBudget).toBe(true);
    expect(review.budgetUsedPct).toBe(50);
  });

  it('חריגה מתקציב', () => {
    const review = reviewMonth({ ...monthInput, budgetAgorot: ILS(100) });
    expect(review.metBudget).toBe(false);
    expect(review.budgetUsedPct).toBe(200);
  });

  it('בלי תקציב — אין קביעה', () => {
    const review = reviewMonth({ ...monthInput, budgetAgorot: null });
    expect(review.metBudget).toBeNull();
    expect(review.budgetUsedPct).toBeNull();
  });

  it('תקציב אפס לא יוצר חלוקה באפס', () => {
    expect(reviewMonth({ ...monthInput, budgetAgorot: 0 }).budgetUsedPct).toBeNull();
  });

  it('משווה לחודש הקודם', () => {
    const review = reviewMonth(monthInput);
    // יולי: 100 + 100
    expect(review.comparison.previousExpenseAgorot).toBe(ILS(200));
  });
});

describe('רזרבה והוצאות אטומות', () => {
  it('חריגה מעבר להקצבה נספרת כשימוש ברזרבה', () => {
    const used = reserveUsedInPeriod(
      [tx({ date: '2026-08-03', shekels: 500, categoryId: 'cat-food-out' })],
      '2026-08-01',
      '2026-08-30',
      ILS(300),
    );
    expect(used).toBe(ILS(200));
  });

  it('הוצאה בתוך ההקצבה אינה נוגעת ברזרבה', () => {
    expect(
      reserveUsedInPeriod(
        [tx({ date: '2026-08-03', shekels: 100, categoryId: 'cat-food-out' })],
        '2026-08-01',
        '2026-08-30',
        ILS(300),
      ),
    ).toBe(0);
  });

  it('הכנסה מקזזת', () => {
    expect(
      reserveUsedInPeriod(
        [
          tx({ date: '2026-08-03', shekels: 500, categoryId: 'cat-food-out' }),
          tx({ date: '2026-08-04', shekels: 400, type: 'income', categoryId: 'cat-work' }),
        ],
        '2026-08-01',
        '2026-08-30',
        ILS(300),
      ),
    ).toBe(0);
  });

  it('סך ההוצאות האטומות בתקופה', () => {
    expect(
      opaqueInPeriod(
        [
          expense('2026-08-03', 900, RETIRED_CARD_CATEGORY_ID),
          expense('2026-08-04', 100, 'cat-food-out'),
        ],
        '2026-08-01',
        '2026-08-31',
      ),
    ).toBe(ILS(900));
  });
});
