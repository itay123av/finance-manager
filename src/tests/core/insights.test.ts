/**
 * ⭐ בדיקות שער התובנות.
 *
 * הכלל המרכזי: תובנה שדורשת פילוח אמין נחסמת כשהביטחון הקטגוריאלי
 * נמוך — אבל עובדות על עסקאות מפורטות, ותובנות ברמת הסכום הכולל,
 * ממשיכות לעבוד.
 */

import { describe, expect, it } from 'vitest';
import { buildInsights, insightsByBasis, type InsightsInput } from '../../core/insights';
import { RETIRED_CARD_CATEGORY_ID, type EffectiveExpense } from '../../core/effectiveSpending';
import type { SpendingConfidence } from '../../core/spendingConfidence';
import { DEFAULT_CATEGORIES } from '../../content/categories.seed';
import { ILS } from '../helpers';

const TODAY = '2026-08-07';

function confidence(overrides: Partial<SpendingConfidence> = {}): SpendingConfidence {
  return {
    total: 'high',
    category: 'none',
    detailedShare: 0.25,
    detailedAgorot: ILS(947),
    opaqueAgorot: ILS(2842),
    totalAgorot: ILS(3789),
    categoryAdviceAllowed: false,
    disclaimerHe: 'חלק מההוצאות ההיסטוריות שייכות לכרטיס ישן ללא פירוט…',
    ...overrides,
  };
}

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

/** מנוי + חודשים אטומים — בדיוק המצב האמיתי. */
const MIXED: EffectiveExpense[] = [
  expense('2026-05-28', 74.9, 'שירות ענן'),
  expense('2026-06-28', 74.9, 'שירות ענן'),
  expense('2026-07-28', 74.9, 'שירות ענן'),
  expense('2026-06-15', 900, 'חיוב כרטיס ישן', RETIRED_CARD_CATEGORY_ID),
  expense('2026-07-15', 900, 'חיוב כרטיס ישן', RETIRED_CARD_CATEGORY_ID),
];

function input(overrides: Partial<InsightsInput> = {}): InsightsInput {
  return {
    today: TODAY,
    expenses: MIXED,
    categories: DEFAULT_CATEGORIES,
    confidence: confidence(),
    negativeMonths: 5,
    totalMonths: 7,
    reservedForFutureMonthsAgorot: ILS(3481),
    monthlyAllowanceAgorot: ILS(360),
    summerIncomeAgorot: ILS(3773),
    yearIncomeAgorot: ILS(5462),
    ...overrides,
  };
}

describe('⭐ השער: מה מותר לומר', () => {
  it('תובנות עובדתיות עוברות גם בביטחון קטגוריאלי נמוך', () => {
    const result = buildInsights(input());
    const byBasis = insightsByBasis(result.insights);

    expect(byBasis.detailed.length).toBeGreaterThan(0);
    expect(byBasis.total.length).toBeGreaterThan(0);
  });

  it('⭐ תובנה קטגוריאלית נחסמת', () => {
    const result = buildInsights(input());
    expect(result.insights.every((i) => i.basis !== 'category')).toBe(true);
  });

  it('⭐ אותה תובנה כן מוצגת כשהפילוח אמין', () => {
    // הוצאות עם עלייה אמיתית בקטגוריה בין שני החודשים האחרונים
    const withDrift = [
      ...MIXED,
      expense('2026-07-10', 50, 'מסעדה', 'cat-food-out'),
      expense('2026-08-10', 200, 'מסעדה', 'cat-food-out'),
    ];

    const blocked = buildInsights(input({ expenses: withDrift }));
    const allowed = buildInsights(
      input({
        expenses: withDrift,
        confidence: confidence({ category: 'high', detailedShare: 0.95, categoryAdviceAllowed: true }),
      }),
    );

    expect(blocked.insights.some((i) => i.basis === 'category')).toBe(false);
    expect(allowed.insights.some((i) => i.basis === 'category')).toBe(true);
    expect(allowed.insights.length).toBe(blocked.insights.length + blocked.suppressedCount);
    expect(allowed.suppressedCount).toBe(0);
  });

  it('נספר כמה תובנות הוסתרו, ומוצג הסבר', () => {
    const result = buildInsights(
      input({
        expenses: [
          ...MIXED,
          expense('2026-07-10', 50, 'מסעדה', 'cat-food-out'),
          expense('2026-08-10', 200, 'מסעדה', 'cat-food-out'),
        ],
      }),
    );
    expect(result.suppressedCount).toBeGreaterThan(0);
    expect(result.suppressionNoteHe).toContain('כרטיס ישן ללא פירוט');
  });

  it('בלי הסתרות — אין הערה', () => {
    const result = buildInsights(
      input({
        expenses: [expense('2026-08-01', 50, 'חנות')],
        confidence: confidence({ categoryAdviceAllowed: true, category: 'high' }),
      }),
    );
    expect(result.suppressionNoteHe).toBeNull();
  });

  it('⭐ אף תובנה לא אומרת "אתה מוציא יותר מדי"', () => {
    const result = buildInsights(
      input({ confidence: confidence({ categoryAdviceAllowed: true, category: 'high' }) }),
    );
    for (const insight of result.insights) {
      expect(insight.bodyHe).not.toContain('יותר מדי');
      expect(insight.titleHe).not.toContain('יותר מדי');
      expect(insight.bodyHe).not.toContain('צמצם');
    }
  });

  it('לכל תובנה יש ראיה מוצגת', () => {
    for (const insight of buildInsights(input()).insights) {
      expect(insight.evidenceHe.length).toBeGreaterThan(0);
    }
  });
});

describe('⭐ מנויים — הערך המרכזי של הפירוט', () => {
  it('מזוהים ומסוכמים לסכום שנתי', () => {
    const result = buildInsights(input());
    const subs = result.insights.find((i) => i.kind === 'subscriptions_total');

    expect(subs).toBeDefined();
    expect(subs?.basis).toBe('detailed');
    expect(subs?.bodyHe).toContain('₪75');
    expect(subs?.bodyHe).toContain('₪899'); // 74.90 × 12
    expect(result.subscriptionsMonthlyAgorot).toBe(ILS(74.9));
  });

  it('מנוי שנעלם מסומן לבדיקה', () => {
    const result = buildInsights(
      input({
        expenses: [
          expense('2026-02-28', 40, 'מנוי ישן'),
          expense('2026-03-28', 40, 'מנוי ישן'),
        ],
      }),
    );
    const stale = result.insights.find((i) => i.kind === 'subscription_stale');
    expect(stale?.titleHe).toContain('מנוי ישן');
    expect(stale?.tone).toBe('caution');
  });

  it('בלי מנויים — אין תובנה', () => {
    const result = buildInsights(input({ expenses: [expense('2026-08-01', 50, 'חד פעמי')] }));
    expect(result.insights.some((i) => i.kind === 'subscriptions_total')).toBe(false);
  });
});

describe('תובנות ברמת הסכום הכולל', () => {
  it('⭐ חודשים שליליים — מדווח בלי להאשים', () => {
    const insight = buildInsights(input()).insights.find((i) => i.kind === 'negative_months');
    expect(insight?.basis).toBe('total');
    expect(insight?.titleHe).toContain('5 מתוך 7');
    expect(insight?.bodyHe).toContain('לא בהכרח בעיה');
  });

  it('רוב החודשים חיוביים — אין תובנה', () => {
    expect(
      buildInsights(input({ negativeMonths: 1, totalMonths: 7 })).insights.some(
        (i) => i.kind === 'negative_months',
      ),
    ).toBe(false);
  });

  it('פחות משלושה חודשים — אין מספיק כדי לדבר על מגמה', () => {
    expect(
      buildInsights(input({ negativeMonths: 2, totalMonths: 2 })).insights.some(
        (i) => i.kind === 'negative_months',
      ),
    ).toBe(false);
  });

  it('תלות בקיץ מדווחת עם אחוז', () => {
    const insight = buildInsights(input()).insights.find((i) => i.kind === 'summer_dependency');
    expect(insight?.titleHe).toContain('69%');
    expect(insight?.basis).toBe('total');
  });

  it('הכנסה מפוזרת — אין תובנת קיץ', () => {
    expect(
      buildInsights(
        input({ summerIncomeAgorot: ILS(1000), yearIncomeAgorot: ILS(5000) }),
      ).insights.some((i) => i.kind === 'summer_dependency'),
    ).toBe(false);
  });

  it('בלי הכנסה בכלל — אין חלוקה באפס', () => {
    expect(() =>
      buildInsights(input({ summerIncomeAgorot: 0, yearIncomeAgorot: 0 })),
    ).not.toThrow();
  });

  it('רזרבה שמתקרבת לסופה', () => {
    const insight = buildInsights(
      input({ reservedForFutureMonthsAgorot: ILS(700), monthlyAllowanceAgorot: ILS(360) }),
    ).insights.find((i) => i.kind === 'reserve_depletion');
    expect(insight?.titleHe).toContain('1 חודשים');
  });

  it('רזרבה גדולה — אין אזהרה', () => {
    expect(
      buildInsights(
        input({ reservedForFutureMonthsAgorot: ILS(5000), monthlyAllowanceAgorot: ILS(360) }),
      ).insights.some((i) => i.kind === 'reserve_depletion'),
    ).toBe(false);
  });

  it('בלי הקצבה חודשית — אין חלוקה באפס', () => {
    expect(() =>
      buildInsights(input({ monthlyAllowanceAgorot: 0 })),
    ).not.toThrow();
  });
});

describe('חודש חריג', () => {
  it('מזוהה ומוצג ברמת הסכום הכולל', () => {
    const insight = buildInsights(
      input({
        expenses: [
          expense('2026-05-10', 300, 'א', 'cat-food-out'),
          expense('2026-06-10', 300, 'ב', 'cat-food-out'),
          expense('2026-07-10', 300, 'ג', 'cat-food-out'),
          expense('2026-08-10', 900, 'ד', 'cat-food-out'),
        ],
      }),
    ).insights.find((i) => i.kind === 'month_outlier');

    expect(insight?.basis).toBe('total');
    expect(insight?.tone).toBe('caution');
    expect(insight?.titleHe).toContain('אוגוסט');
  });

  it('חודש חסכוני מקבל טון חיובי', () => {
    const insight = buildInsights(
      input({
        expenses: [
          expense('2026-05-10', 500, 'א', 'cat-food-out'),
          expense('2026-06-10', 500, 'ב', 'cat-food-out'),
          expense('2026-07-10', 500, 'ג', 'cat-food-out'),
          expense('2026-08-10', 50, 'ד', 'cat-food-out'),
        ],
      }),
    ).insights.find((i) => i.kind === 'month_outlier');
    expect(insight?.tone).toBe('positive');
  });
});

describe('בתי עסק חוזרים', () => {
  it('מוצג כעובדה על הפירוט', () => {
    const insight = buildInsights(
      input({
        expenses: Array.from({ length: 5 }, (_, i) =>
          expense(`2026-08-0${i + 1}`, 6, 'מכונה', 'cat-food-out'),
        ),
      }),
    ).insights.find((i) => i.kind === 'repeat_merchant');

    expect(insight?.basis).toBe('detailed');
    expect(insight?.titleHe).toContain('5 פעמים');
    expect(insight?.bodyHe).toContain('מצטברים');
  });

  it('מנוי לא נספר גם כבית עסק חוזר', () => {
    const result = buildInsights(input());
    expect(result.insights.some((i) => i.kind === 'repeat_merchant')).toBe(false);
  });
});

describe('מקרי קצה', () => {
  it('בלי הוצאות בכלל', () => {
    const result = buildInsights(input({ expenses: [] }));
    expect(result.subscriptions).toEqual([]);
    expect(result.subscriptionsMonthlyAgorot).toBe(0);
  });

  it('רק הוצאות אטומות — אין תובנות מפורטות', () => {
    const result = buildInsights(
      input({
        expenses: [
          expense('2026-06-15', 900, 'כרטיס', RETIRED_CARD_CATEGORY_ID),
          expense('2026-07-15', 900, 'כרטיס', RETIRED_CARD_CATEGORY_ID),
        ],
      }),
    );
    expect(insightsByBasis(result.insights).detailed).toEqual([]);
  });
});
