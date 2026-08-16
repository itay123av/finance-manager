import { describe, expect, it } from 'vitest';
import {
  categoryMonthlyAverage,
  completeMonths,
  monthlyExpenseAverage,
  monthlyIncomeAverage,
  monthlyNetAverage,
  runRateThisMonth,
} from '../../core/averages';
import { ILS, income, tx } from '../helpers';

const TODAY = '2026-08-07';

describe('אילו חודשים נספרים', () => {
  it('החודש הנוכחי מוחרג — הוא חלקי ויטה כל ממוצע כלפי מטה', () => {
    const transactions = [
      tx({ date: '2026-06-10' }),
      tx({ date: '2026-07-10' }),
      tx({ date: '2026-08-03' }),
    ];
    expect(completeMonths(transactions, TODAY)).toEqual(['2026-06', '2026-07']);
  });

  it('חודש בלי שום עסקה אינו נספר — נתון חסר, לא חודש של אפס הוצאות', () => {
    const transactions = [tx({ date: '2026-05-10' }), tx({ date: '2026-07-10' })];
    // יוני חסר לגמרי ולכן לא נכנס לרשימה
    expect(completeMonths(transactions, TODAY)).toEqual(['2026-05', '2026-07']);
  });

  it('עסקאות pending ותיקוני התאמה לא יוצרים חודש', () => {
    const transactions = [
      tx({ date: '2026-06-10', status: 'pending' }),
      tx({ date: '2026-07-10', kind: 'balance_adjustment' }),
      tx({ date: '2026-05-10' }),
    ];
    expect(completeMonths(transactions, TODAY)).toEqual(['2026-05']);
  });
});

describe('שיטת החישוב לפי כמות הנתונים', () => {
  it('בלי נתונים — null ו-none, בלי מספר מומצא', () => {
    const avg = monthlyExpenseAverage([], TODAY);
    expect(avg.agorot).toBeNull();
    expect(avg.confidence).toBe('none');
    expect(avg.method).toBe('none');
    expect(avg.rangeAgorot).toBeNull();
  });

  it('חודש-חודשיים — ממוצע, ביטחון נמוך', () => {
    const transactions = [
      tx({ date: '2026-06-10', shekels: 300 }),
      tx({ date: '2026-07-10', shekels: 500 }),
    ];
    const avg = monthlyExpenseAverage(transactions, TODAY);
    expect(avg.method).toBe('mean');
    expect(avg.agorot).toBe(ILS(400));
    expect(avg.confidence).toBe('low');
    expect(avg.monthsUsed).toBe(2);
  });

  it('שלושה חודשים ומעלה — חציון, ביטחון בינוני', () => {
    const transactions = [
      tx({ date: '2026-05-10', shekels: 300 }),
      tx({ date: '2026-06-10', shekels: 320 }),
      tx({ date: '2026-07-10', shekels: 310 }),
    ];
    const avg = monthlyExpenseAverage(transactions, TODAY);
    expect(avg.method).toBe('median');
    expect(avg.agorot).toBe(ILS(310));
    expect(avg.confidence).toBe('medium');
  });

  it('שישה חודשים — ביטחון גבוה', () => {
    const transactions = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].map(
      (m) => tx({ date: `${m}-10`, shekels: 300 }),
    );
    expect(monthlyExpenseAverage(transactions, TODAY).confidence).toBe('high');
  });

  it('מגביל את החלון לחודשים האחרונים', () => {
    const transactions = [
      tx({ date: '2025-01-10', shekels: 9999 }),
      tx({ date: '2026-05-10', shekels: 300 }),
      tx({ date: '2026-06-10', shekels: 300 }),
      tx({ date: '2026-07-10', shekels: 300 }),
    ];
    const avg = monthlyExpenseAverage(transactions, TODAY, { lookbackMonths: 3 });
    expect(avg.monthsUsed).toBe(3);
    expect(avg.agorot).toBe(ILS(300));
  });
});

describe('⭐ עמידות לרכישה גדולה חד-פעמית', () => {
  it('רכישה של ₪380 בחודש אחד כמעט לא מזיזה את החציון', () => {
    const normal = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].map((m) =>
      tx({ date: `${m}-10`, shekels: 300 }),
    );
    const withBigPurchase = [...normal, tx({ date: '2026-04-14', shekels: 380 })];

    const before = monthlyExpenseAverage(normal, TODAY).agorot;
    const after = monthlyExpenseAverage(withBigPurchase, TODAY).agorot;

    expect(before).toBe(ILS(300));
    expect(after).toBe(ILS(300)); // החציון לא זז בכלל
    // הטווח כן מראה שהיה חודש חריג
    expect(monthlyExpenseAverage(withBigPurchase, TODAY).rangeAgorot?.maxAgorot).toBe(ILS(680));
  });
});

describe('⭐ חודשים בלי הכנסה', () => {
  it('חודש עם הוצאות ובלי הכנסה נספר, וההכנסה בו היא אפס', () => {
    const transactions = [
      income({ date: '2026-05-05', shekels: 600 }),
      tx({ date: '2026-05-10', shekels: 200 }),
      tx({ date: '2026-06-10', shekels: 200 }), // יוני: הוצאות בלבד
      tx({ date: '2026-07-10', shekels: 200 }), // יולי: הוצאות בלבד
    ];
    const avg = monthlyIncomeAverage(transactions, TODAY);
    expect(avg.monthsUsed).toBe(3);
    expect(avg.values.map((v) => v.agorot)).toEqual([ILS(600), 0, 0]);
    expect(avg.agorot).toBe(0); // חציון של [600, 0, 0]
  });

  it('שנה שלמה בלי שום הכנסה — ממוצע הכנסה אפס, לא שגיאה', () => {
    const transactions = [
      '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02',
    ].map((m) => tx({ date: `${m}-10`, shekels: 150 }));
    const avg = monthlyIncomeAverage(transactions, TODAY);
    expect(avg.agorot).toBe(0);
    expect(avg.confidence).toBe('high');
  });

  it('חודש עם 0 הכנסה וגם 0 הוצאה פשוט לא קיים בנתונים', () => {
    const transactions = [tx({ date: '2026-05-10', shekels: 100 }), tx({ date: '2026-07-10', shekels: 100 })];
    expect(completeMonths(transactions, TODAY)).not.toContain('2026-06');
  });
});

describe('⭐ חודש עם הכנסה גדולה — החרגת הקיץ', () => {
  const transactions = [
    income({ date: '2026-05-05', shekels: 150 }),
    tx({ date: '2026-05-10', shekels: 300 }),
    income({ date: '2026-06-05', shekels: 200 }),
    tx({ date: '2026-06-10', shekels: 300 }),
    income({ date: '2026-07-06', shekels: 2400 }), // הקיץ
    tx({ date: '2026-07-10', shekels: 300 }),
  ];

  it('בלי החרגה — הקיץ מנפח את הנטו החודשי', () => {
    const avg = monthlyNetAverage(transactions, TODAY);
    expect(avg.values.map((v) => v.agorot)).toEqual([ILS(-150), ILS(-100), ILS(2100)]);
    expect(avg.agorot).toBe(ILS(-100)); // חציון עמיד — כבר לא מתפתה
  });

  it('עם החרגת קיץ — נשארים רק החודשים הרגילים', () => {
    const avg = monthlyNetAverage(transactions, TODAY, { excludeSummer: true });
    expect(avg.monthsUsed).toBe(2);
    expect(avg.values.map((v) => v.month)).toEqual(['2026-05', '2026-06']);
    expect(avg.agorot).toBe(ILS(-125));
  });
});

describe('ממוצע לפי קטגוריה', () => {
  it('מחשב לכל קטגוריה בנפרד', () => {
    const transactions = [
      tx({ date: '2026-05-10', shekels: 100, categoryId: 'cat-food-out' }),
      tx({ date: '2026-06-10', shekels: 140, categoryId: 'cat-food-out' }),
      tx({ date: '2026-07-10', shekels: 120, categoryId: 'cat-food-out' }),
      tx({ date: '2026-05-11', shekels: 50, categoryId: 'cat-transport' }),
    ];
    expect(categoryMonthlyAverage(transactions, 'cat-food-out', TODAY).agorot).toBe(ILS(120));
    // תחבורה מופיעה רק בחודש אחד מתוך שלושה — בשאר החודשים ההוצאה בה היא 0
    const transport = categoryMonthlyAverage(transactions, 'cat-transport', TODAY);
    expect(transport.values.map((v) => v.agorot)).toEqual([ILS(50), 0, 0]);
  });

  it('קטגוריה בלי נתונים כלל', () => {
    const avg = categoryMonthlyAverage([], 'cat-food-out', TODAY);
    expect(avg.agorot).toBeNull();
    expect(avg.confidence).toBe('none');
  });
});

describe('קצב החודש הנוכחי', () => {
  it('מקרין את ההוצאה עד היום על חודש מלא', () => {
    const transactions = [
      tx({ date: '2026-08-01', shekels: 90 }),
      tx({ date: '2026-08-05', shekels: 90 }),
    ];
    const rate = runRateThisMonth(transactions, '2026-08-06');
    expect(rate.spentSoFarAgorot).toBe(ILS(180));
    expect(rate.dayOfMonth).toBe(6);
    expect(rate.daysInMonth).toBe(31);
    expect(rate.projectedMonthTotalAgorot).toBe(ILS(930)); // 180/6*31
  });

  it('חודש בלי הוצאות — קצב אפס, בלי חלוקה באפס', () => {
    const rate = runRateThisMonth([], '2026-08-01');
    expect(rate.projectedMonthTotalAgorot).toBe(0);
  });
});
