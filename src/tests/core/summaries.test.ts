import { describe, expect, it } from 'vitest';
import { monthlySummary, summarizableMonths, weeklySummary } from '../../core/summaries';
import { goalProgress } from '../../core/goal';
import { safeToSpend } from '../../core/safeToSpend';
import { DEFAULT_CATEGORIES } from '../../content/categories.seed';
import { ILS, goal, income, tx } from '../helpers';

const TODAY = '2026-08-07';

const sts = safeToSpend({
  today: TODAY,
  currentBalanceAgorot: ILS(1240),
  safetyBufferAgorot: ILS(500),
  plannedExpenses: [],
  recurringTransactions: [],
  expectedIncomes: [],
  reservedForFutureMonthsAgorot: 0,
  goalContributionAgorot: 0,
  goalSavedSoFarThisMonthAgorot: 0,
  plannedDiscretionarySpendAgorot: 0,
});

describe('סיכום שבועי', () => {
  const transactions = [
    income({ date: '2026-08-03', shekels: 200 }),
    tx({ date: '2026-08-04', shekels: 60, categoryId: 'cat-food-out' }),
    tx({ date: '2026-08-05', shekels: 90, categoryId: 'cat-friends' }),
    tx({ date: '2026-07-20', shekels: 999 }), // מחוץ לשבוע
  ];

  it('מסכם את השבוע הנוכחי בלבד', () => {
    const s = weeklySummary(transactions, DEFAULT_CATEGORIES, TODAY, null, sts);
    expect(s.from).toBe('2026-08-02');
    expect(s.to).toBe('2026-08-08');
    expect(s.incomeAgorot).toBe(ILS(200));
    expect(s.expenseAgorot).toBe(ILS(150));
    expect(s.netAgorot).toBe(ILS(50));
  });

  it('מציג את הקטגוריות הבולטות', () => {
    const s = weeklySummary(transactions, DEFAULT_CATEGORIES, TODAY, null, sts);
    expect(s.topCategories[0]?.categoryName).toBe('יציאות עם חברים');
    expect(s.topCategories.length).toBeLessThanOrEqual(3);
  });

  it('מעביר את ההקצאה לשבוע הבא מ-safeToSpend', () => {
    const s = weeklySummary(transactions, DEFAULT_CATEGORIES, TODAY, null, sts);
    expect(s.safeToSpendNextWeekAgorot).toBe(sts.weekAgorot);
  });

  it('כשחורגים מהקצב — ההצעה מתייחסת לזה', () => {
    const s = weeklySummary(transactions, DEFAULT_CATEGORIES, TODAY, {
      month: '2026-08',
      plannedAgorot: ILS(400),
      spentAgorot: ILS(350),
      remainingAgorot: ILS(50),
      spentSharePct: 87,
      monthElapsedPct: 22,
      isAheadOfPace: true,
      isOverBudget: false,
    }, sts);
    expect(s.metBudget).toBe(false);
    expect(s.suggestedActionHe).toContain('לתכנן את השבוע הבא');
  });

  it('שבוע במינוס מנוסח בלי האשמה', () => {
    const s = weeklySummary(
      [tx({ date: '2026-08-04', shekels: 200, categoryId: 'cat-food-out' })],
      DEFAULT_CATEGORIES,
      TODAY,
      null,
      sts,
    );
    expect(s.netAgorot).toBe(ILS(-200));
    expect(s.headlineHe).toContain('יצא ₪200');
    expect(s.headlineHe).not.toMatch(/בזבזת|מיותר/);
  });

  it('שבוע ריק — הודעה מתאימה ולא שגיאה', () => {
    const s = weeklySummary([], DEFAULT_CATEGORIES, TODAY, null, sts);
    expect(s.expenseAgorot).toBe(0);
    expect(s.topCategories).toEqual([]);
    expect(s.suggestedActionHe).toContain('שבוע רגוע');
  });

  it('הטון לא שיפוטי', () => {
    const s = weeklySummary(transactions, DEFAULT_CATEGORIES, TODAY, null, sts);
    expect(`${s.headlineHe} ${s.suggestedActionHe}`).not.toMatch(/בזבזת|מיותר|תפסיק/);
  });
});

describe('סיכום חודשי', () => {
  const transactions = [
    income({ date: '2026-07-06', shekels: 2400 }),
    tx({ date: '2026-07-10', shekels: 300, categoryId: 'cat-food-out' }),
    tx({ date: '2026-07-15', shekels: 120, categoryId: 'cat-friends' }),
    tx({ date: '2026-06-10', shekels: 500, categoryId: 'cat-food-out' }),
  ];

  const summary = monthlySummary({
    transactions,
    categories: DEFAULT_CATEGORIES,
    month: '2026-07',
    goalProgress: goalProgress(goal(), ILS(1240)),
    anomalies: [],
    suggestedNextMonthBudgetAgorot: ILS(400),
  });

  it('מסכם הכנסות, הוצאות ושינוי נטו', () => {
    expect(summary.incomeAgorot).toBe(ILS(2400));
    expect(summary.expenseAgorot).toBe(ILS(420));
    expect(summary.netAgorot).toBe(ILS(1980));
    expect(summary.balanceChangeAgorot).toBe(ILS(1980));
    expect(summary.monthLabelHe).toBe('יולי 2026');
  });

  it('⭐ מתחיל תמיד ממה שהלך טוב', () => {
    expect(summary.winsHe.length).toBeGreaterThan(0);
    expect(summary.winsHe[0]).toContain('פלוס');
  });

  it('משבח גם על עצם התיעוד', () => {
    expect(summary.winsHe.some((w) => w.includes('תיעדת'))).toBe(true);
  });

  it('מציין ירידה בהוצאות מול החודש הקודם', () => {
    expect(summary.winsHe.some((w) => w.includes('פחות מהחודש הקודם'))).toBe(true);
  });

  it('⭐ לכל היותר שני דברים לשיפור — רשימה ארוכה לא נקראת', () => {
    const heavy = monthlySummary({
      transactions: [
        tx({ date: '2026-07-10', shekels: 800, categoryId: 'cat-food-out' }),
        tx({ date: '2026-07-11', shekels: 50, categoryId: 'cat-friends' }),
      ],
      categories: DEFAULT_CATEGORIES,
      month: '2026-07',
      goalProgress: goalProgress(goal(), ILS(400)),
      anomalies: [
        {
          transactionId: 'tx-x',
          date: '2026-07-10',
          merchant: 'מסעדה',
          categoryId: 'cat-food-out',
          amountAgorot: ILS(800),
          typicalAgorot: ILS(45),
          method: 'robust',
          messageHe: '',
        },
      ],
      suggestedNextMonthBudgetAgorot: null,
    });
    expect(heavy.improvementsHe.length).toBeLessThanOrEqual(2);
    expect(heavy.improvementsHe.length).toBeGreaterThan(0);
  });

  it('חודש במינוס מנוסח בלי האשמה', () => {
    const negative = monthlySummary({
      transactions: [tx({ date: '2026-07-10', shekels: 500 })],
      categories: DEFAULT_CATEGORIES,
      month: '2026-07',
      goalProgress: goalProgress(goal(), ILS(700)),
      anomalies: [],
      suggestedNextMonthBudgetAgorot: null,
    });
    expect(negative.netAgorot).toBe(ILS(-500));
    expect(negative.improvementsHe[0]).toContain('בחודש עם הכנסה זה מתאזן');
    expect(`${negative.headlineHe} ${negative.improvementsHe.join(' ')}`).not.toMatch(/בזבזת|אשמתך/);
  });

  it('קטגוריה שתופסת נתח גדול מוזכרת — בלי לקרוא לה בעיה', () => {
    const dominant = monthlySummary({
      transactions: [
        tx({ date: '2026-07-10', shekels: 800, categoryId: 'cat-food-out' }),
        tx({ date: '2026-07-11', shekels: 50, categoryId: 'cat-friends' }),
      ],
      categories: DEFAULT_CATEGORIES,
      month: '2026-07',
      goalProgress: goalProgress(goal(), ILS(1240)),
      anomalies: [],
      suggestedNextMonthBudgetAgorot: null,
    });
    expect(dominant.improvementsHe.some((i) => i.includes('לא בהכרח בעיה'))).toBe(true);
  });

  it('מעביר תקציב מומלץ לחודש הבא', () => {
    expect(summary.suggestedNextMonthBudgetAgorot).toBe(ILS(400));
  });

  it('חודש ריק לא מפיל את החישוב', () => {
    const empty = monthlySummary({
      transactions: [],
      categories: DEFAULT_CATEGORIES,
      month: '2026-07',
      goalProgress: goalProgress(goal(), ILS(700)),
      anomalies: [],
      suggestedNextMonthBudgetAgorot: null,
    });
    expect(empty.incomeAgorot).toBe(0);
    expect(empty.topCategories).toEqual([]);
    expect(empty.improvementsHe).toEqual([]);
  });
});

describe('אילו חודשים ניתנים לסיכום', () => {
  it('רק חודשים מלאים עם נתונים', () => {
    const transactions = [
      tx({ date: '2026-06-10' }),
      tx({ date: '2026-07-10' }),
      tx({ date: '2026-08-03' }), // החודש הנוכחי
      tx({ date: '2026-05-10', status: 'pending' }),
    ];
    expect(summarizableMonths(transactions, TODAY)).toEqual(['2026-06', '2026-07']);
  });

  it('בלי נתונים — רשימה ריקה', () => {
    expect(summarizableMonths([], TODAY)).toEqual([]);
  });
});
