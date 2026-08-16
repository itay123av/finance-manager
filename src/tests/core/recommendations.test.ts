import { describe, expect, it } from 'vitest';
import {
  buildRecommendations,
  goalImpactOfMonthlySaving,
  topActions,
  type RecommendationInput,
} from '../../core/recommendations';
import type { GoalSimulationInput } from '../../core/goal';
import type { CategoryDrift } from '../../core/patterns';
import { DEFAULT_CATEGORIES } from '../../content/categories.seed';
import { ILS } from '../helpers';

const goal: GoalSimulationInput = {
  today: '2026-08-07',
  currentBalanceAgorot: ILS(1240),
  targetAgorot: ILS(5000),
  regularMonthlyNetAgorot: ILS(200),
  summerTotalNetAgorot: 0,
  historicalConfidence: 'high',
};

function drift(overrides: Partial<CategoryDrift> = {}): CategoryDrift {
  return {
    categoryId: 'cat-food-out',
    categoryName: 'אוכל בחוץ',
    thisMonthAgorot: ILS(280),
    typicalMonthlyAgorot: ILS(100),
    deltaAgorot: ILS(180),
    deltaPct: 180,
    direction: 'up',
    messageHe: 'החודש הוצאת ₪180 יותר מהרגיל על אוכל בחוץ.',
    ...overrides,
  };
}

function input(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    goal,
    categories: DEFAULT_CATEGORIES,
    categoryDrifts: [],
    smallPurchases: null,
    subscriptions: [],
    staleRecurring: [],
    budgetProgress: null,
    funBudget: null,
    unclassifiedCount: 0,
    ...overrides,
  };
}

describe('השפעת חיסכון על היעד', () => {
  it('חיסכון חודשי מקצר את הדרך ליעד', () => {
    // פער ₪3,760. בנטו ₪200 לחודש → 19 חודשים; בנטו ₪400 → 10 חודשים.
    expect(goalImpactOfMonthlySaving(goal, ILS(200))).toBe(9);
  });

  it('חיסכון אפס או שלילי — אין השפעה לחשב', () => {
    expect(goalImpactOfMonthlySaving(goal, 0)).toBeNull();
    expect(goalImpactOfMonthlySaving(goal, ILS(-50))).toBeNull();
  });

  it('כשלא מגיעים ליעד ממילא — null', () => {
    expect(
      goalImpactOfMonthlySaving({ ...goal, regularMonthlyNetAgorot: ILS(-500) }, ILS(10)),
    ).toBeNull();
  });
});

describe('⭐ כל המלצה נושאת ראיה, חיסכון והשפעה', () => {
  it('המלצה לצמצום קטגוריה כוללת את שלושתם', () => {
    const recs = buildRecommendations(input({ categoryDrifts: [drift()] }));
    const reduce = recs.find((r) => r.type === 'reduce_category');
    expect(reduce).toBeDefined();
    expect(reduce!.evidence.length).toBeGreaterThanOrEqual(3);
    expect(reduce!.estimatedMonthlySavingAgorot).toBe(ILS(180));
    expect(reduce!.goalImpactMonths).not.toBeNull();
  });

  it('לכל המלצה יש כותרת, גוף וראיות', () => {
    const recs = buildRecommendations(
      input({
        categoryDrifts: [drift(), drift({ categoryId: 'cat-friends', categoryName: 'יציאות', direction: 'down', deltaAgorot: ILS(-50) })],
        smallPurchases: {
          fromDate: '2026-08-01',
          toDate: '2026-08-07',
          count: 5,
          totalAgorot: ILS(95),
          messageHe: '5 רכישות קטנות הצטברו ל-₪95.',
        },
        subscriptions: [
          {
            merchantNormalized: 'spotify',
            label: 'Spotify',
            monthlyAgorot: ILS(22),
            yearlyAgorot: ILS(264),
            occurrences: 6,
            lastSeenDate: '2026-07-12',
            messageHe: 'Spotify — ₪22 בחודש.',
          },
        ],
        staleRecurring: [
          {
            merchantNormalized: 'gym',
            label: 'חדר כושר',
            monthlyAgorot: ILS(60),
            yearlyAgorot: ILS(720),
            occurrences: 4,
            lastSeenDate: '2026-03-03',
            messageHe: 'חדר כושר לא חויב מאז 2026-03.',
          },
        ],
        unclassifiedCount: 4,
      }),
    );
    expect(recs.length).toBeGreaterThan(4);
    for (const r of recs) {
      expect(r.titleHe.length).toBeGreaterThan(0);
      expect(r.bodyHe.length).toBeGreaterThan(0);
      expect(r.evidence.length).toBeGreaterThan(0);
      for (const e of r.evidence) {
        expect(e.labelHe.length).toBeGreaterThan(0);
        expect(e.valueHe.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('⭐ לא ממליצים לבטל בילויים', () => {
  it('ההמלצה מציעה לחזור לרמה הרגילה, לא לאפס', () => {
    const recs = buildRecommendations(input({ categoryDrifts: [drift()] }));
    const reduce = recs.find((r) => r.type === 'reduce_category');
    // החיסכון המוצע הוא בדיוק החריגה — לא הקטגוריה כולה
    expect(reduce!.estimatedMonthlySavingAgorot).toBe(ILS(180));
    expect(reduce!.estimatedMonthlySavingAgorot).toBeLessThan(ILS(280));
    expect(reduce!.bodyHe).toContain('לא צריך לוותר');
  });

  it('אף המלצה לא משתמשת בשפה שיפוטית', () => {
    const recs = buildRecommendations(
      input({
        categoryDrifts: [drift()],
        smallPurchases: {
          fromDate: '2026-08-01',
          toDate: '2026-08-07',
          count: 5,
          totalAgorot: ILS(95),
          messageHe: '5 רכישות.',
        },
        unclassifiedCount: 3,
      }),
    );
    for (const r of recs) {
      expect(`${r.titleHe} ${r.bodyHe}`).not.toMatch(/בזבזת|מיותר|אסור|תפסיק|לא היית צריך/);
    }
  });

  it('קטגוריות חיוניות וחשובות לא מוצעות לצמצום', () => {
    const recs = buildRecommendations(
      input({
        categoryDrifts: [
          drift({ categoryId: 'cat-transport', categoryName: 'תחבורה' }),
          drift({ categoryId: 'cat-study', categoryName: 'לימודים' }),
          drift({ categoryId: 'cat-phone', categoryName: 'טלפון ומנויים' }),
        ],
      }),
    );
    expect(recs.filter((r) => r.type === 'reduce_category')).toHaveLength(0);
  });

  it('קטגוריות fun ו-reducible כן מוצעות', () => {
    const recs = buildRecommendations(
      input({
        categoryDrifts: [
          drift({ categoryId: 'cat-food-out' }),
          drift({ categoryId: 'cat-shopping', categoryName: 'קניות' }),
        ],
      }),
    );
    expect(recs.filter((r) => r.type === 'reduce_category')).toHaveLength(2);
  });

  it('קטגוריה שלא קיימת ברשימה לא מייצרת המלצה', () => {
    const recs = buildRecommendations(input({ categoryDrifts: [drift({ categoryId: 'cat-ghost' })] }));
    expect(recs.filter((r) => r.type === 'reduce_category')).toHaveLength(0);
  });
});

describe('חגיגת הצלחות — לא רק ביקורת', () => {
  it('קטגוריה שירדה מייצרת המלצת עידוד', () => {
    const recs = buildRecommendations(
      input({
        categoryDrifts: [drift({ direction: 'down', deltaAgorot: ILS(-80), thisMonthAgorot: ILS(20) })],
      }),
    );
    const celebrate = recs.find((r) => r.type === 'celebrate');
    expect(celebrate?.bodyHe).toContain('₪80');
    expect(celebrate?.bodyHe).toContain('מקרב את היעד');
  });
});

describe('מיון ותצוגה', () => {
  it('סיווג עסקאות ממתין מקבל עדיפות גבוהה — פעולה קטנה שמשפרת הכל', () => {
    const recs = buildRecommendations(input({ categoryDrifts: [drift()], unclassifiedCount: 4 }));
    expect(recs[0]?.type).toBe('categorize_pending');
  });

  it('חריגה מקצב התקציב מוצגת גבוה', () => {
    const recs = buildRecommendations(
      input({
        budgetProgress: {
          month: '2026-08',
          plannedAgorot: ILS(400),
          spentAgorot: ILS(350),
          remainingAgorot: ILS(50),
          spentSharePct: 87.5,
          monthElapsedPct: 22.6,
          isAheadOfPace: true,
          isOverBudget: false,
        },
        categoryDrifts: [drift()],
      }),
    );
    expect(recs[0]?.type).toBe('pace_warning');
  });

  it('topActions מחזיר את השתיים הראשונות', () => {
    const recs = buildRecommendations(input({ categoryDrifts: [drift()], unclassifiedCount: 4 }));
    expect(topActions(recs)).toHaveLength(2);
    expect(topActions(recs, 1)).toHaveLength(1);
  });

  it('בלי שום נתון — אין המלצות מומצאות', () => {
    expect(buildRecommendations(input())).toEqual([]);
  });
});
