import { describe, expect, it } from 'vitest';
import {
  accountBalance,
  countsTowardBalance,
  reconciliationGap,
  signedAmount,
  totalBalance,
} from '../../core/balance';
import { ILS, account, income, tx } from '../helpers';

const bank = account({ id: 'acc-bank', openingBalanceAgorot: ILS(1000), openingDate: '2026-01-01' });
const cash = account({
  id: 'acc-cash',
  name: 'מזומן',
  type: 'cash',
  openingBalanceAgorot: ILS(200),
  openingDate: '2026-01-01',
});

describe('מקור אמת יחיד — היתרה תמיד נגזרת', () => {
  it('יתרה = פתיחה + הכנסות − הוצאות', () => {
    const transactions = [
      income({ date: '2026-02-01', shekels: 500 }),
      tx({ date: '2026-02-05', shekels: 120 }),
      tx({ date: '2026-02-10', shekels: 80 }),
    ];
    expect(accountBalance(bank, transactions, '2026-08-07').balanceAgorot).toBe(ILS(1300));
  });

  it('בלי עסקאות — היתרה היא יתרת הפתיחה בדיוק', () => {
    expect(accountBalance(bank, [], '2026-08-07').balanceAgorot).toBe(ILS(1000));
  });

  it('signedAmount — פלוס להכנסה, מינוס להוצאה', () => {
    expect(signedAmount(income({ shekels: 100 }))).toBe(ILS(100));
    expect(signedAmount(tx({ shekels: 100 }))).toBe(ILS(-100));
  });
});

describe('שלושת כללי ההדרה', () => {
  it('עסקאות לפני openingDate מוחרגות — מונע ספירה כפולה בייבוא היסטורי', () => {
    const transactions = [
      tx({ date: '2025-12-25', shekels: 300 }), // לפני הפתיחה
      tx({ date: '2026-01-01', shekels: 100 }), // ביום הפתיחה — נספרת
    ];
    const result = accountBalance(bank, transactions, '2026-08-07');
    expect(result.balanceAgorot).toBe(ILS(900));
    expect(result.countedTransactions).toBe(1);
  });

  it('עסקאות אחרי asOf מוחרגות', () => {
    const transactions = [
      tx({ date: '2026-02-01', shekels: 100 }),
      tx({ date: '2026-09-01', shekels: 500 }),
    ];
    expect(accountBalance(bank, transactions, '2026-08-07').balanceAgorot).toBe(ILS(900));
  });

  it('עסקאות pending לא נספרות', () => {
    const transactions = [
      tx({ date: '2026-02-01', shekels: 100, status: 'pending' }),
      tx({ date: '2026-02-02', shekels: 50 }),
    ];
    expect(accountBalance(bank, transactions, '2026-08-07').balanceAgorot).toBe(ILS(950));
  });

  it('countsTowardBalance משקף את שלושת הכללים', () => {
    const asOf = '2026-08-07';
    expect(countsTowardBalance(tx({ date: '2026-02-01' }), bank, asOf)).toBe(true);
    expect(countsTowardBalance(tx({ date: '2025-12-01' }), bank, asOf)).toBe(false);
    expect(countsTowardBalance(tx({ date: '2026-09-01' }), bank, asOf)).toBe(false);
    expect(countsTowardBalance(tx({ status: 'pending', date: '2026-02-01' }), bank, asOf)).toBe(false);
    expect(countsTowardBalance(tx({ accountId: 'acc-other', date: '2026-02-01' }), bank, asOf)).toBe(false);
  });
});

describe('ריבוי חשבונות', () => {
  const transactions = [
    income({ accountId: 'acc-bank', date: '2026-02-01', shekels: 400 }),
    tx({ accountId: 'acc-bank', date: '2026-02-05', shekels: 100 }),
    tx({ accountId: 'acc-cash', date: '2026-02-06', shekels: 50 }),
  ];

  it('מסכם על פני כל החשבונות', () => {
    const result = totalBalance([bank, cash], transactions, '2026-08-07');
    expect(result.totalAgorot).toBe(ILS(1450)); // 1000+400-100 + 200-50
    expect(result.byAccount).toHaveLength(2);
    expect(result.byAccount[0]?.balanceAgorot).toBe(ILS(1300));
    expect(result.byAccount[1]?.balanceAgorot).toBe(ILS(150));
  });

  it('מתעלם מעסקאות של חשבון שלא קיים', () => {
    const withOrphan = [...transactions, tx({ accountId: 'acc-ghost', shekels: 9999 })];
    expect(totalBalance([bank, cash], withOrphan, '2026-08-07').totalAgorot).toBe(ILS(1450));
  });
});

describe('הזהות שהממשק מציג — total = פתיחה + הכנסות − הוצאות + תיקונים', () => {
  it('מתקיימת תמיד', () => {
    const transactions = [
      income({ accountId: 'acc-bank', date: '2026-02-01', shekels: 400 }),
      tx({ accountId: 'acc-bank', date: '2026-02-05', shekels: 100 }),
      tx({ accountId: 'acc-cash', date: '2026-02-06', shekels: 50 }),
      tx({ accountId: 'acc-bank', date: '2026-03-01', shekels: 35, kind: 'balance_adjustment' }),
      income({ accountId: 'acc-bank', date: '2026-03-02', shekels: 12, kind: 'balance_adjustment' }),
      tx({ accountId: 'acc-bank', date: '2025-11-01', shekels: 999 }), // מוחרגת
      tx({ accountId: 'acc-bank', date: '2026-02-07', shekels: 77, status: 'pending' }), // מוחרגת
    ];
    const { totalAgorot, breakdown } = totalBalance([bank, cash], transactions, '2026-08-07');

    expect(
      breakdown.openingTotalAgorot +
        breakdown.incomeTotalAgorot -
        breakdown.expenseTotalAgorot +
        breakdown.adjustmentsNetAgorot,
    ).toBe(totalAgorot);

    expect(breakdown.ignoredBeforeOpening).toBe(1);
    expect(breakdown.ignoredPending).toBe(1);
    expect(breakdown.countedTransactions).toBe(5);
  });

  it('סופר עסקאות עתידיות בנפרד', () => {
    const { breakdown } = totalBalance(
      [bank],
      [tx({ date: '2026-12-01', shekels: 10 }), tx({ date: '2026-02-01', shekels: 10 })],
      '2026-08-07',
    );
    expect(breakdown.ignoredAfterAsOf).toBe(1);
  });
});

describe('התאמת יתרה', () => {
  it('תיקון התאמה נספר ביתרה אך מופרד מהכנסות והוצאות', () => {
    const transactions = [income({ date: '2026-02-01', shekels: 100 })];
    const withAdjustment = [
      ...transactions,
      income({ date: '2026-02-02', shekels: 40, kind: 'balance_adjustment' }),
    ];

    const before = totalBalance([bank], transactions, '2026-08-07');
    const after = totalBalance([bank], withAdjustment, '2026-08-07');

    expect(after.totalAgorot - before.totalAgorot).toBe(ILS(40));
    // ההכנסות "האמיתיות" לא השתנו — התיקון לא מזהם את ניתוח ההתנהגות
    expect(after.breakdown.incomeTotalAgorot).toBe(before.breakdown.incomeTotalAgorot);
    expect(after.breakdown.adjustmentsNetAgorot).toBe(ILS(40));
  });

  it('reconciliationGap מחשב את הפער מול הבנק', () => {
    expect(reconciliationGap(ILS(1200), ILS(1250))).toBe(ILS(50));
    expect(reconciliationGap(ILS(1200), ILS(1150))).toBe(ILS(-50));
    expect(reconciliationGap(ILS(1200), ILS(1200))).toBe(0);
  });
});
