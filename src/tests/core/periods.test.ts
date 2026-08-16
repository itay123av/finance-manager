import { describe, expect, it } from 'vitest';
import {
  expenseByCategory,
  expenseInCategory,
  expenseInPeriod,
  incomeInPeriod,
  monthSummary,
  periodSummary,
  spentSoFarThisMonth,
  transactionsInPeriod,
  weekSummary,
} from '../../core/periods';
import { DEFAULT_CATEGORIES } from '../../content/categories.seed';
import { ILS, income, tx } from '../helpers';

describe('סיכומי תקופה', () => {
  const transactions = [
    income({ date: '2026-08-01', shekels: 400 }),
    tx({ date: '2026-08-03', shekels: 60 }),
    tx({ date: '2026-08-31', shekels: 40 }),
    tx({ date: '2026-07-31', shekels: 999 }), // מחוץ לטווח
    tx({ date: '2026-09-01', shekels: 999 }), // מחוץ לטווח
  ];

  it('הטווח כולל את שני הקצוות', () => {
    const summary = periodSummary(transactions, '2026-08-01', '2026-08-31');
    expect(summary.incomeAgorot).toBe(ILS(400));
    expect(summary.expenseAgorot).toBe(ILS(100));
    expect(summary.netAgorot).toBe(ILS(300));
    expect(summary.transactionCount).toBe(3);
  });

  it('תקופה ריקה מחזירה אפסים ולא NaN', () => {
    const summary = periodSummary([], '2026-08-01', '2026-08-31');
    expect(summary).toMatchObject({ incomeAgorot: 0, expenseAgorot: 0, netAgorot: 0, transactionCount: 0 });
  });

  it('נטו שלילי כשההוצאות גדולות מההכנסות', () => {
    const summary = periodSummary(
      [tx({ date: '2026-08-05', shekels: 300 })],
      '2026-08-01',
      '2026-08-31',
    );
    expect(summary.netAgorot).toBe(ILS(-300));
  });

  it('incomeInPeriod ו-expenseInPeriod', () => {
    expect(incomeInPeriod(transactions, '2026-08-01', '2026-08-31')).toBe(ILS(400));
    expect(expenseInPeriod(transactions, '2026-08-01', '2026-08-31')).toBe(ILS(100));
  });

  it('monthSummary ו-weekSummary נגזרים מהתאריך', () => {
    expect(monthSummary(transactions, '2026-08-15').expenseAgorot).toBe(ILS(100));
    // השבוע של 2026-08-03 הוא 02/08 עד 08/08
    expect(weekSummary(transactions, '2026-08-03').expenseAgorot).toBe(ILS(60));
  });

  it('spentSoFarThisMonth סופר רק עד היום', () => {
    expect(spentSoFarThisMonth(transactions, '2026-08-10')).toBe(ILS(60));
    expect(spentSoFarThisMonth(transactions, '2026-08-31')).toBe(ILS(100));
  });
});

describe('⚠️ תיקוני התאמה מוחרגים מהכנסות והוצאות', () => {
  it('balance_adjustment לא נספר בסיכום התקופה', () => {
    const transactions = [
      tx({ date: '2026-08-05', shekels: 100 }),
      tx({ date: '2026-08-06', shekels: 500, kind: 'balance_adjustment' }),
      income({ date: '2026-08-07', shekels: 300, kind: 'balance_adjustment' }),
    ];
    const summary = periodSummary(transactions, '2026-08-01', '2026-08-31');
    expect(summary.expenseAgorot).toBe(ILS(100));
    expect(summary.incomeAgorot).toBe(0);
    expect(summary.transactionCount).toBe(1);
  });

  it('עסקאות pending לא נספרות', () => {
    const transactions = [
      tx({ date: '2026-08-05', shekels: 100 }),
      tx({ date: '2026-08-06', shekels: 200, status: 'pending' }),
    ];
    expect(expenseInPeriod(transactions, '2026-08-01', '2026-08-31')).toBe(ILS(100));
  });

  it('transactionsInPeriod מחזיר רק עסקאות רגילות בפועל', () => {
    const transactions = [
      tx({ date: '2026-08-05' }),
      tx({ date: '2026-08-06', status: 'pending' }),
      tx({ date: '2026-08-07', kind: 'balance_adjustment' }),
    ];
    expect(transactionsInPeriod(transactions, '2026-08-01', '2026-08-31')).toHaveLength(1);
  });
});

describe('פירוט לפי קטגוריה', () => {
  const transactions = [
    tx({ date: '2026-08-02', shekels: 145, categoryId: 'cat-food-out' }),
    tx({ date: '2026-08-03', shekels: 90, categoryId: 'cat-friends' }),
    tx({ date: '2026-08-04', shekels: 65, categoryId: 'cat-transport' }),
    income({ date: '2026-08-05', shekels: 500 }),
  ];

  it('ממוין מהגדולה לקטנה ומחשב אחוזים', () => {
    const rows = expenseByCategory(transactions, DEFAULT_CATEGORIES, '2026-08-01', '2026-08-31');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.categoryName).toBe('אוכל בחוץ');
    expect(rows[0]?.amountAgorot).toBe(ILS(145));
    expect(rows[0]?.sharePct).toBe(48.3); // 145/300
    expect(rows.reduce((s, r) => s + r.amountAgorot, 0)).toBe(ILS(300));
  });

  it('הכנסות לא מופיעות בפירוט ההוצאות', () => {
    const rows = expenseByCategory(transactions, DEFAULT_CATEGORIES, '2026-08-01', '2026-08-31');
    expect(rows.some((r) => r.categoryId === 'cat-work')).toBe(false);
  });

  it('קטגוריה שנמחקה מוצגת כ"לא ידוע" ולא מפילה את החישוב', () => {
    const rows = expenseByCategory(
      [tx({ date: '2026-08-02', shekels: 50, categoryId: 'cat-deleted' })],
      DEFAULT_CATEGORIES,
      '2026-08-01',
      '2026-08-31',
    );
    expect(rows[0]?.categoryName).toBe('לא ידוע');
  });

  it('תקופה בלי הוצאות מחזירה מערך ריק בלי חלוקה באפס', () => {
    expect(expenseByCategory([], DEFAULT_CATEGORIES, '2026-08-01', '2026-08-31')).toEqual([]);
  });

  it('expenseInCategory מסנן לקטגוריה אחת', () => {
    expect(expenseInCategory(transactions, 'cat-food-out', '2026-08-01', '2026-08-31')).toBe(ILS(145));
    expect(expenseInCategory(transactions, 'cat-nothing', '2026-08-01', '2026-08-31')).toBe(0);
  });
});
