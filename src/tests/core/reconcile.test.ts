/**
 * בדיקות התאמת יתרה.
 *
 * ⭐ העיקרון: עמודת היתרה בקובץ היא **כלי אבחון**, לא מקור אמת.
 * המערכת מדווחת על פער ומסבירה אותו — היא לא סוגרת אותו לבד.
 */

import { describe, expect, it } from 'vitest';
import {
  adjustmentAmountAgorot,
  adjustmentDirection,
  reconcile,
  type ReconcileInput,
} from '../../core/reconcile';
import { ILS } from '../helpers';

function input(overrides: Partial<ReconcileInput> = {}): ReconcileInput {
  return {
    openingBalanceAgorot: ILS(1000),
    openingDate: '2026-08-01',
    importedIncomeAgorot: ILS(2400),
    importedExpenseAgorot: ILS(268.4),
    statementClosingBalanceAgorot: ILS(3131.6),
    existingNetInRangeAgorot: 0,
    rowsFailed: 0,
    duplicatesSkipped: 0,
    dateRange: { from: '2026-08-01', to: '2026-08-07' },
    ...overrides,
  };
}

describe('התאמה מוצלחת', () => {
  it('כשהמספרים מסתדרים, אין פער ואין סיבות', () => {
    const result = reconcile(input());
    expect(result.possible).toBe(true);
    expect(result.matches).toBe(true);
    expect(result.differenceAgorot).toBe(0);
    expect(result.causes).toEqual([]);
    expect(result.summaryHe).toContain('תואמת');
  });

  it('הנוסחה היא פתיחה + הכנסות − הוצאות', () => {
    const result = reconcile(input({ statementClosingBalanceAgorot: null }));
    expect(result.expectedAgorot).toBe(ILS(1000) + ILS(2400) - ILS(268.4));
  });

  it('סטייה של אגורה נחשבת עיגול ולא פער', () => {
    const result = reconcile(input({ statementClosingBalanceAgorot: ILS(3131.6) + 1 }));
    expect(result.matches).toBe(true);
  });

  it('עסקאות שכבר היו במערכת נספרות בחישוב', () => {
    const result = reconcile(
      input({
        existingNetInRangeAgorot: ILS(-100),
        statementClosingBalanceAgorot: ILS(3031.6),
      }),
    );
    expect(result.matches).toBe(true);
  });
});

describe('בלי עמודת יתרה', () => {
  it('אי אפשר להשוות, ונאמר את זה במפורש', () => {
    const result = reconcile(input({ statementClosingBalanceAgorot: null }));
    expect(result.possible).toBe(false);
    expect(result.matches).toBe(false);
    expect(result.summaryHe).toContain('אין עמודת יתרה');
    expect(result.causes).toEqual([]);
  });
});

describe('⭐ פער — הסבר במקום תיקון אוטומטי', () => {
  it('שורות שנכשלו מוצגות כסיבה אפשרית', () => {
    const result = reconcile(
      input({ rowsFailed: 3, statementClosingBalanceAgorot: ILS(3000) }),
    );
    expect(result.matches).toBe(false);
    expect(result.causes.map((c) => c.cause)).toContain('rows_failed');
    expect(result.causes[0]?.explanationHe).toContain('3 שורות');
  });

  it('כפילויות שדולגו מוצגות כסיבה אפשרית', () => {
    const result = reconcile(
      input({ duplicatesSkipped: 2, statementClosingBalanceAgorot: ILS(3000) }),
    );
    expect(result.causes.map((c) => c.cause)).toContain('duplicates_skipped');
  });

  it('⭐ קובץ שמתחיל לפני תאריך הפתיחה מסומן במפורש', () => {
    const result = reconcile(
      input({
        dateRange: { from: '2026-07-15', to: '2026-08-07' },
        statementClosingBalanceAgorot: ILS(3000),
      }),
    );
    expect(result.mayBeMissingEarlierTransactions).toBe(true);
    expect(result.causes.map((c) => c.cause)).toContain('transactions_before_opening');
    expect(result.causes.find((c) => c.cause === 'transactions_before_opening')?.explanationHe)
      .toContain('2026-07-15');
  });

  it('טווח חלקי אחרי תאריך הפתיחה מסומן בנפרד', () => {
    const result = reconcile(
      input({
        dateRange: { from: '2026-08-04', to: '2026-08-07' },
        statementClosingBalanceAgorot: ILS(3000),
      }),
    );
    expect(result.causes.map((c) => c.cause)).toContain('partial_date_range');
    expect(result.mayBeMissingEarlierTransactions).toBe(false);
  });

  it('פער בלי סיבה מזוהה מקבל הסבר כללי והפניה ליתרת הפתיחה', () => {
    const result = reconcile(input({ statementClosingBalanceAgorot: ILS(3000) }));
    expect(result.causes.map((c) => c.cause)).toEqual(['unknown']);
    expect(result.causes[0]?.explanationHe).toContain('יתרת הפתיחה');
  });

  it('כיוון הפער מוסבר נכון בשני הכיוונים', () => {
    const tooMuch = reconcile(input({ statementClosingBalanceAgorot: ILS(3000) }));
    expect(tooMuch.differenceAgorot).toBeGreaterThan(0);
    expect(tooMuch.summaryHe).toContain('יותר');

    const tooLittle = reconcile(input({ statementClosingBalanceAgorot: ILS(3300) }));
    expect(tooLittle.differenceAgorot).toBeLessThan(0);
    expect(tooLittle.summaryHe).toContain('פחות');
  });
});

describe('עסקת ההתאמה — מחושבת אבל לא נוצרת', () => {
  it('הסכום הוא הערך המוחלט של הפער', () => {
    const result = reconcile(input({ statementClosingBalanceAgorot: ILS(3000) }));
    expect(adjustmentAmountAgorot(result)).toBe(Math.abs(result.differenceAgorot));
  });

  it('עודף במערכת מתוקן בהוצאה, וחוסר בהכנסה', () => {
    expect(adjustmentDirection(reconcile(input({ statementClosingBalanceAgorot: ILS(3000) })))).toBe(
      'expense',
    );
    expect(adjustmentDirection(reconcile(input({ statementClosingBalanceAgorot: ILS(3300) })))).toBe(
      'income',
    );
  });
});
