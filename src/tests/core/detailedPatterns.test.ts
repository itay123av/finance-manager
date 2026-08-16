/**
 * ⭐ בדיקות דפוסים מהפירוט.
 *
 * המנוע הקודם עבד על תנועות הבנק, שם 39 מתוך 51 הן "חיוב לכרטיס"
 * בלי שם בית עסק — כלומר הוא היה עיוור בדיוק במקום שיש בו מידע.
 * כאן העבודה היא על ההוצאות האפקטיביות, אחרי מיזוג הפירוט.
 *
 * ⚠️ כל השמות והסכומים בקובץ הזה מומצאים.
 */

import { describe, expect, it } from 'vitest';
import {
  MIN_OCCURRENCES_FOR_SUBSCRIPTION,
  SUBSCRIPTION_STALE_DAYS,
  detectSubscriptions,
  monthOutliers,
  monthlyTotals,
  repeatMerchants,
  subscriptionsMonthlyTotal,
} from '../../core/detailedPatterns';
import { RETIRED_CARD_CATEGORY_ID } from '../../core/effectiveSpending';
import type { EffectiveExpense } from '../../core/effectiveSpending';
import { ILS } from '../helpers';

const TODAY = '2026-08-07';

function expense(
  date: string,
  shekels: number,
  merchant: string,
  categoryId = 'cat-phone',
): EffectiveExpense {
  return {
    id: `${date}-${merchant}-${shekels}`,
    date,
    amountAgorot: ILS(shekels),
    categoryId,
    merchant,
    source: categoryId === RETIRED_CARD_CATEGORY_ID ? 'card_retired' : 'card',
  };
}

describe('⭐ זיהוי מנויים', () => {
  it('חיוב חודשי באותו סכום מזוהה כמנוי', () => {
    const subs = detectSubscriptions({
      // חיוב ב-28 לחודש, שלושה חודשים ברצף
      expenses: [
        expense('2026-05-28', 74.9, 'שירות ענן'),
        expense('2026-06-28', 74.9, 'שירות ענן'),
        expense('2026-07-28', 74.9, 'שירות ענן'),
      ],
      today: TODAY,
    });

    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({
      merchant: 'שירות ענן',
      typicalAmountAgorot: ILS(74.9),
      occurrences: 3,
      possiblyStale: false,
    });
    expect(subs[0]?.yearlyAgorot).toBe(ILS(74.9) * 12);
  });

  it('⭐ שני מופעים מספיקים — קובץ כרטיס מכסה חודש-חודשיים', () => {
    const subs = detectSubscriptions({
      expenses: [
        expense('2026-07-05', 30, 'מנוי'),
        expense('2026-08-04', 30, 'מנוי'),
      ],
      today: TODAY,
    });
    expect(subs).toHaveLength(1);
    expect(MIN_OCCURRENCES_FOR_SUBSCRIPTION).toBe(2);
  });

  it('סכום שמשתנה מעט עדיין נחשב — שער מט״ח זז', () => {
    const subs = detectSubscriptions({
      expenses: [
        expense('2026-06-26', 61.82, 'שירות בחו״ל'),
        expense('2026-07-26', 62.62, 'שירות בחו״ל'),
      ],
      today: TODAY,
    });
    expect(subs).toHaveLength(1);
  });

  it('סכום שקופץ משמעותית אינו מנוי', () => {
    const subs = detectSubscriptions({
      expenses: [
        expense('2026-06-26', 30, 'חנות'),
        expense('2026-07-26', 200, 'חנות'),
      ],
      today: TODAY,
    });
    expect(subs).toEqual([]);
  });

  it('מרווח שאינו חודשי אינו מנוי', () => {
    const subs = detectSubscriptions({
      expenses: [
        expense('2026-08-01', 30, 'קיוסק'),
        expense('2026-08-05', 30, 'קיוסק'),
      ],
      today: TODAY,
    });
    expect(subs).toEqual([]);
  });

  it('⭐ חודש חסר שובר את הרצף — בכוונה', () => {
    // ‎06-28 ואז 08-28: ייתכן שקובץ יולי לא יובא, וייתכן שהמנוי הופסק.
    // עדיף לא לזהות מאשר לומר למשתמש שיש לו חיוב חוזר שאין לו.
    const subs = detectSubscriptions({
      expenses: [expense('2026-06-28', 40, 'מנוי'), expense('2026-08-28', 40, 'מנוי')],
      today: '2026-09-01',
    });
    expect(subs).toEqual([]);
  });

  it('⭐ מנוי שלא הופיע זמן רב מסומן — ולא נספר בסך החודשי', () => {
    const subs = detectSubscriptions({
      expenses: [
        expense('2026-03-01', 40, 'מנוי ישן'),
        expense('2026-04-01', 40, 'מנוי ישן'),
      ],
      today: TODAY,
    });

    expect(subs[0]?.possiblyStale).toBe(true);
    expect(subs[0]?.daysSinceLast).toBeGreaterThan(SUBSCRIPTION_STALE_DAYS);
    expect(subscriptionsMonthlyTotal(subs)).toBe(0);
  });

  it('סך המנויים הפעילים', () => {
    const subs = detectSubscriptions({
      expenses: [
        expense('2026-07-05', 74.9, 'א'),
        expense('2026-08-04', 74.9, 'א'),
        expense('2026-07-06', 22, 'ב'),
        expense('2026-08-05', 22, 'ב'),
      ],
      today: TODAY,
    });
    expect(subscriptionsMonthlyTotal(subs)).toBe(ILS(96.9));
  });

  it('⭐ חיוב כרטיס אטום לא מזוהה כמנוי', () => {
    // "חיוב לכרטיס ויזה" חוזר כל חודש באותו סכום בערך —
    // אבל אין לו שם בית עסק, ולכן אין ממה לזהות מנוי
    const subs = detectSubscriptions({
      expenses: [
        expense('2026-06-28', 100, 'חיוב לכרטיס', RETIRED_CARD_CATEGORY_ID),
        expense('2026-07-28', 100, 'חיוב לכרטיס', RETIRED_CARD_CATEGORY_ID),
      ],
      today: TODAY,
    });
    expect(subs).toEqual([]);
  });

  it('זיכוי אינו מנוי', () => {
    const subs = detectSubscriptions({
      expenses: [
        { ...expense('2026-07-05', 30, 'החזר'), amountAgorot: ILS(-30) },
        { ...expense('2026-08-04', 30, 'החזר'), amountAgorot: ILS(-30) },
      ],
      today: TODAY,
    });
    expect(subs).toEqual([]);
  });

  it('בית עסק בלי שם מדולג', () => {
    const subs = detectSubscriptions({
      expenses: [expense('2026-07-05', 30, '  '), expense('2026-08-04', 30, '  ')],
      today: TODAY,
    });
    expect(subs).toEqual([]);
  });

  it('רשימה ריקה', () => {
    expect(detectSubscriptions({ expenses: [], today: TODAY })).toEqual([]);
    expect(subscriptionsMonthlyTotal([])).toBe(0);
  });
});

describe('בתי עסק חוזרים', () => {
  it('⭐ סכומים קטנים שחוזרים מצטברים', () => {
    const repeats = repeatMerchants([
      expense('2026-08-01', 6, 'מכונה', 'cat-food-out'),
      expense('2026-08-02', 6, 'מכונה', 'cat-food-out'),
      expense('2026-08-03', 6, 'מכונה', 'cat-food-out'),
      expense('2026-08-04', 6, 'מכונה', 'cat-food-out'),
      expense('2026-08-05', 6, 'מכונה', 'cat-food-out'),
    ]);

    expect(repeats[0]).toMatchObject({
      merchant: 'מכונה',
      visits: 5,
      totalAgorot: ILS(30),
      averageAgorot: ILS(6),
    });
  });

  it('פחות מהמינימום — לא מופיע', () => {
    expect(
      repeatMerchants([expense('2026-08-01', 6, 'א'), expense('2026-08-02', 6, 'א')], 3),
    ).toEqual([]);
  });

  it('ממוין לפי סך ההוצאה', () => {
    const repeats = repeatMerchants([
      ...Array.from({ length: 3 }, (_, i) => expense(`2026-08-0${i + 1}`, 5, 'קטן')),
      ...Array.from({ length: 3 }, (_, i) => expense(`2026-08-0${i + 4}`, 50, 'גדול')),
    ]);
    expect(repeats[0]?.merchant).toBe('גדול');
  });

  it('חיובים אטומים מוחרגים', () => {
    expect(
      repeatMerchants([
        expense('2026-08-01', 6, 'כרטיס', RETIRED_CARD_CATEGORY_ID),
        expense('2026-08-02', 6, 'כרטיס', RETIRED_CARD_CATEGORY_ID),
        expense('2026-08-03', 6, 'כרטיס', RETIRED_CARD_CATEGORY_ID),
      ]),
    ).toEqual([]);
  });
});

describe('סיכומים חודשיים', () => {
  const mixed = [
    expense('2026-06-10', 100, 'א', 'cat-food-out'),
    expense('2026-06-20', 900, 'כרטיס ישן', RETIRED_CARD_CATEGORY_ID),
    expense('2026-07-10', 200, 'ב', 'cat-food-out'),
  ];

  it('מפריד בין מפורט לאטום', () => {
    const totals = monthlyTotals(mixed);
    expect(totals[0]).toMatchObject({
      month: '2026-06',
      totalAgorot: ILS(1000),
      detailedAgorot: ILS(100),
      opaqueAgorot: ILS(900),
      count: 2,
    });
  });

  it('ממוין כרונולוגית', () => {
    expect(monthlyTotals(mixed).map((t) => t.month)).toEqual(['2026-06', '2026-07']);
  });

  it('רשימה ריקה', () => {
    expect(monthlyTotals([])).toEqual([]);
  });
});

describe('⭐ חודשים חריגים — ברמת הסכום הכולל', () => {
  it('מזהה חודש יקר במיוחד', () => {
    const totals = monthlyTotals([
      expense('2026-05-10', 300, 'א'),
      expense('2026-06-10', 300, 'ב'),
      expense('2026-07-10', 300, 'ג'),
      expense('2026-08-10', 900, 'ד'),
    ]);
    const outliers = monthOutliers(totals);

    expect(outliers[0]).toMatchObject({
      month: '2026-08',
      direction: 'higher',
      medianAgorot: ILS(300),
      differenceAgorot: ILS(600),
    });
  });

  it('מזהה גם חודש חסכוני', () => {
    const totals = monthlyTotals([
      expense('2026-05-10', 500, 'א'),
      expense('2026-06-10', 500, 'ב'),
      expense('2026-07-10', 500, 'ג'),
      expense('2026-08-10', 50, 'ד'),
    ]);
    expect(monthOutliers(totals)[0]?.direction).toBe('lower');
  });

  it('סטייה קטנה אינה חריגה', () => {
    const totals = monthlyTotals([
      expense('2026-05-10', 300, 'א'),
      expense('2026-06-10', 310, 'ב'),
      expense('2026-07-10', 305, 'ג'),
    ]);
    expect(monthOutliers(totals)).toEqual([]);
  });

  it('פחות משלושה חודשים — אין ממה להשוות', () => {
    const totals = monthlyTotals([
      expense('2026-07-10', 100, 'א'),
      expense('2026-08-10', 900, 'ב'),
    ]);
    expect(monthOutliers(totals)).toEqual([]);
  });

  it('חציון אפס אינו מייצר חריגות', () => {
    expect(monthOutliers([
      { month: '2026-06', totalAgorot: 0, detailedAgorot: 0, opaqueAgorot: 0, count: 0 },
      { month: '2026-07', totalAgorot: 0, detailedAgorot: 0, opaqueAgorot: 0, count: 0 },
      { month: '2026-08', totalAgorot: 0, detailedAgorot: 0, opaqueAgorot: 0, count: 0 },
    ])).toEqual([]);
  });
});
