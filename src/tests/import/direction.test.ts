/**
 * ⭐ בדיקות כיוון העסקה.
 *
 * הכלל שנבדק כאן: **המערכת לא מנחשת כיוון.** טעות בכיוון מזיזה את
 * היתרה בכפליים מהסכום ובכיוון ההפוך — ובניגוד לקטגוריה שגויה, היא
 * מסתתרת מאחורי מספר שנראה סביר.
 */

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { readTable } from '../../import/tabular';
import { detectMapping } from '../../import/columnMapping';
import { parseRows } from '../../import/rows';
import {
  applyDirectionRule,
  findDirectionCandidates,
  resolveDirection,
  suggestIncomeValue,
} from '../../import/direction';
import { buildImportPreview } from '../../import/pipeline';
import { DEFAULT_CATEGORIES } from '../../content/categories.seed';
import type { DirectionRule } from '../../import/types';
import { DEBIT_CREDIT_CSV, SIMPLE_CSV, textFile } from './fixtures';

/** כל הסכומים חיוביים, בלי עמודת חובה/זכות — המקרה המסוכן. */
const ALL_POSITIVE_CSV = `תאריך,תיאור,סכום
01/08/2026,העברת שכר,2400.00
03/08/2026,ארומה,64.00
04/08/2026,רמי לוי,152.50
05/08/2026,רב קו,30.00
06/08/2026,ספוטיפיי,21.90
`;

/** אותו דבר, אבל עם עמודת "סוג פעולה" שמאפשרת הכרעה. */
const ALL_POSITIVE_WITH_TYPE_CSV = `תאריך,תיאור,סוג פעולה,סכום
01/08/2026,העברת שכר,זכות,2400.00
03/08/2026,ארומה,חובה,64.00
04/08/2026,רמי לוי,חובה,152.50
05/08/2026,רב קו,חובה,30.00
06/08/2026,ספוטיפיי,חובה,21.90
`;

const context = { merchantRules: [], categories: DEFAULT_CATEGORIES };

function preview(csv: string, directionRule?: DirectionRule) {
  return buildImportPreview({
    file: textFile('bank.csv', csv),
    accountId: 'acc-bank',
    existing: [],
    context,
    ...(directionRule ? { directionRule } : {}),
  });
}

describe('⭐ כיוון לא מוכרע — המערכת עוצרת', () => {
  it('קובץ עם סכומים חיוביים בלבד נחסם לקליטה', () => {
    const result = preview(ALL_POSITIVE_CSV);

    expect(result.direction.confidence).toBe('unresolved');
    expect(result.blockedReason).toBe('unresolved_direction');
    expect(result.direction.messageHe).toContain(
      'לא הצלחתי לזהות בוודאות אילו עסקאות הן הכנסות ואילו הוצאות',
    );
  });

  it('⭐ המשכורת לא נקלטת בשקט כהוצאה', () => {
    // ההתנהגות הקודמת סימנה את הכל כהוצאה. עם 2,400 של משכורת,
    // זו הייתה טעות של 4,800 ש״ח ביתרה.
    const result = preview(ALL_POSITIVE_CSV);
    expect(result.blockedReason).not.toBeNull();
  });

  it('יש לפחות 5 שורות לדוגמה להצגה לפני ההכרעה', () => {
    expect(preview(ALL_POSITIVE_CSV).rows.length).toBeGreaterThanOrEqual(5);
  });
});

describe('כיוון מוכרע מהקובץ — בלי לשאול', () => {
  it('עמודות חובה/זכות מכריעות לבד', () => {
    const result = preview(DEBIT_CREDIT_CSV);
    expect(result.direction.confidence).toBe('resolved');
    expect(result.direction.sourceHe).toBe('עמודות חובה וזכות');
    expect(result.blockedReason).toBeNull();
    expect(result.counts.income).toBe(1);
    expect(result.counts.expense).toBe(2);
  });

  it('סימן מינוס ולו באחת השורות מכריע לבד', () => {
    const result = preview(SIMPLE_CSV);
    expect(result.direction.confidence).toBe('resolved');
    expect(result.direction.sourceHe).toBe('סימן הסכום');
    expect(result.blockedReason).toBeNull();
  });
});

describe('הכרעה על ידי המשתמש', () => {
  it('"הכל הוצאות" משחרר את החסימה', () => {
    const result = preview(ALL_POSITIVE_CSV, { kind: 'all_expense' });
    expect(result.blockedReason).toBeNull();
    expect(result.direction.sourceHe).toBe('בחירה שלך: הכל הוצאות');
    expect(result.counts.expense).toBe(5);
    expect(result.counts.income).toBe(0);
  });

  it('"הכל הכנסות" עובד באותו אופן', () => {
    const result = preview(ALL_POSITIVE_CSV, { kind: 'all_income' });
    expect(result.blockedReason).toBeNull();
    expect(result.counts.income).toBe(5);
  });

  it('⭐ בחירת עמודה מפרידה נכון בין הכנסות להוצאות', () => {
    const result = preview(ALL_POSITIVE_WITH_TYPE_CSV, {
      kind: 'by_column',
      columnIndex: 2,
      incomeValue: 'זכות',
    });

    expect(result.blockedReason).toBeNull();
    expect(result.direction.sourceHe).toBe('עמודה שבחרת');
    expect(result.counts.income).toBe(1);
    expect(result.counts.expense).toBe(4);

    const salary = result.rows.find((r) => r.merchant.includes('שכר'));
    expect(salary?.type).toBe('income');
    expect(salary?.amountAgorot).toBe(240_000);
  });
});

describe('איתור עמודות שיכולות להכריע', () => {
  it('מוצא עמודת "סוג פעולה" ומציע את הערך שמסמן הכנסה', () => {
    const table = readTable(textFile('bank.csv', ALL_POSITIVE_WITH_TYPE_CSV));
    const mapping = detectMapping(table.rows);
    const candidates = findDirectionCandidates(
      table.rows,
      mapping,
      table.rows[mapping.headerRowIndex ?? 0] ?? null,
    );

    expect(candidates.length).toBeGreaterThan(0);
    const typeColumn = candidates[0]!;
    expect(typeColumn.distinctValues).toContain('זכות');
    expect(suggestIncomeValue(typeColumn)).toBe('זכות');
  });

  it('לא מציע עמודות של תאריך או סכום', () => {
    const table = readTable(textFile('bank.csv', ALL_POSITIVE_WITH_TYPE_CSV));
    const mapping = detectMapping(table.rows);
    const candidates = findDirectionCandidates(table.rows, mapping, null);

    for (const candidate of candidates) {
      expect(mapping.roles[candidate.columnIndex]).not.toBe('date');
      expect(mapping.roles[candidate.columnIndex]).not.toBe('amount');
    }
  });

  it('עמודת תיאור חופשי אינה מועמדת — יותר מדי ערכים ייחודיים', () => {
    const table = readTable(textFile('bank.csv', ALL_POSITIVE_CSV));
    const mapping = detectMapping(table.rows);
    const candidates = findDirectionCandidates(table.rows, mapping, null);
    const merchantCol = mapping.roles.indexOf('merchant');
    expect(candidates.map((c) => c.columnIndex)).not.toContain(merchantCol);
  });
});

describe('החלת הכלל על שורה בודדת', () => {
  it('לפי עמודה — התאמה חלקית מספיקה', () => {
    const rule: DirectionRule = { kind: 'by_column', columnIndex: 1, incomeValue: 'זכות' };
    expect(applyDirectionRule(rule, ['x', 'זכות בחשבון'])).toBe('income');
    expect(applyDirectionRule(rule, ['x', 'חובה'])).toBe('expense');
  });

  it('ערך ריק בכלל לא מחיל כלום', () => {
    const rule: DirectionRule = { kind: 'by_column', columnIndex: 1, incomeValue: '  ' };
    expect(applyDirectionRule(rule, ['x', 'זכות'])).toBeNull();
  });

  it('כלל auto לא משנה כלום', () => {
    expect(applyDirectionRule({ kind: 'auto' }, ['x'])).toBeNull();
  });
});

describe('הכרעה כשאין שורות בכלל', () => {
  it('קובץ בלי עסקאות אינו נחסם — אין מה להכריע', () => {
    const state = resolveDirection({
      hasDebitCredit: false,
      sawNegativeAmount: false,
      hasRows: false,
      rule: { kind: 'auto' },
      candidates: [],
    });
    expect(state.confidence).toBe('resolved');
  });
});

describe('הכלל עובר דרך פענוח השורות', () => {
  it('כלל עמודה משנה את הכיוון של השורות עצמן', () => {
    const table = readTable(textFile('bank.csv', ALL_POSITIVE_WITH_TYPE_CSV));
    const mapping = detectMapping(table.rows);
    const withoutRule = parseRows(table.rows, mapping);
    const withRule = parseRows(table.rows, mapping, {
      directionRule: { kind: 'by_column', columnIndex: 2, incomeValue: 'זכות' },
    });

    // בלי כלל, כל הסכומים חיוביים ולכן נראים כהכנסות
    expect(withoutRule.rows.every((r) => r.type === 'income')).toBe(true);
    expect(withRule.rows.filter((r) => r.type === 'income')).toHaveLength(1);
  });
});
