/**
 * ⭐ בדיקות מול המבנה של קובץ בנק ישראלי אמיתי.
 *
 * ה-fixture כאן **פיקטיבי לחלוטין** — שמות וסכומים מומצאים. מה שנשמר
 * ממנו הוא רק המבנה, וזה בדיוק מה שהפיל את הקוד בפעם הראשונה:
 *
 *  · קידוד **UTF-16LE** עם BOM — ולא UTF-8 ולא windows-1255.
 *  · מפריד **טאב**, למרות סיומת `.csv`.
 *  · סדר שורות **מהחדש לישן**.
 *  · עמודת סכום אחת עם סימן ("זכות/חובה ₪").
 *  · עמודת יתרה רצה, ועמודות נוספות (אסמכתה, עמלה, ערוץ ביצוע).
 */

// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readTable } from '../../import/tabular';
import { detectMapping } from '../../import/columnMapping';
import { parseRows } from '../../import/rows';
import { buildImportPreview } from '../../import/pipeline';
import { walkStatement } from '../../core/reconcile';
import { DEFAULT_CATEGORIES } from '../../content/categories.seed';
import { ILS } from '../helpers';

const FIXTURE = join(
  process.cwd(),
  'src/tests/fixtures/bank-utf16-tab-newest-first.csv',
);

function file() {
  return { name: 'bank.csv', bytes: new Uint8Array(readFileSync(FIXTURE)) };
}

describe('⭐ קידוד UTF-16LE ומפריד טאב', () => {
  it('מזוהה נכון למרות הסיומת csv', () => {
    const table = readTable(file());
    expect(table.encoding).toBe('utf-16le');
    expect(table.format).toBe('csv');
    expect(table.rows).toHaveLength(6);
  });

  it('הטקסט העברי נקרא כראוי', () => {
    const table = readTable(file());
    expect(table.rows[0]).toContain('תיאור התנועה');
    expect(table.rows[0]).toContain('יתרה ₪');
  });
});

describe('מיפוי העמודות של הפורמט הזה', () => {
  it('מזהה תאריך, תיאור, סכום ויתרה — ומתעלם מהשאר', () => {
    const table = readTable(file());
    const mapping = detectMapping(table.rows);

    expect(mapping.headerRowIndex).toBe(0);
    expect(mapping.roles[0]).toBe('date');
    expect(mapping.roles[2]).toBe('merchant');
    expect(mapping.roles[3]).toBe('amount');
    expect(mapping.roles[4]).toBe('balance');
    // אסמכתה / עמלה / ערוץ ביצוע אינם עסקה
    expect(mapping.roles[6]).toBe('ignore');
    expect(mapping.roles[7]).toBe('ignore');
  });

  it('הכיוון נקבע מסימן הסכום, בלי לשאול', () => {
    const preview = buildImportPreview({
      file: file(),
      accountId: 'acc-bank',
      existing: [],
      context: { merchantRules: [], categories: DEFAULT_CATEGORIES },
    });
    expect(preview.direction.confidence).toBe('resolved');
    expect(preview.direction.sourceHe).toBe('סימן הסכום');
    expect(preview.blockedReason).toBeNull();
  });
});

describe('פענוח השורות', () => {
  it('סכומים עם פסיק אלפים ומינוס מפוענחים נכון', () => {
    const table = readTable(file());
    const { rows } = parseRows(table.rows, detectMapping(table.rows));

    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ amountAgorot: ILS(1200), type: 'income' });
    expect(rows[1]).toMatchObject({ amountAgorot: ILS(18.5), type: 'expense' });
  });

  it('תאריכים בפורמט ישראלי', () => {
    const table = readTable(file());
    const { rows } = parseRows(table.rows, detectMapping(table.rows));
    expect(rows[0]?.date).toBe('2026-08-06');
    expect(rows[4]?.date).toBe('2026-02-16');
  });
});

describe('⭐ סדר מהחדש לישן — הבאג שנתפס בקובץ האמיתי', () => {
  it('הקובץ אכן מסודר מהחדש לישן', () => {
    const preview = buildImportPreview({
      file: file(),
      accountId: 'acc-bank',
      existing: [],
      context: { merchantRules: [], categories: DEFAULT_CATEGORIES },
    });
    expect(preview.rows[0]!.date > preview.rows[4]!.date).toBe(true);
  });

  it('⭐ יתרת הסיום היא הכרונולוגית, לא של השורה האחרונה בקובץ', () => {
    const preview = buildImportPreview({
      file: file(),
      accountId: 'acc-bank',
      existing: [],
      context: { merchantRules: [], categories: DEFAULT_CATEGORIES },
    });

    // השורה האחרונה בקובץ היא העסקה הישנה ביותר, ויתרתה ₪2,040
    expect(preview.rows.at(-1)!.statementBalanceAgorot).toBe(ILS(2040));
    // יתרת הסיום האמיתית היא של 06/08
    expect(preview.statementClosingBalanceAgorot).toBe(ILS(3183.5));
  });

  it('יתרת הפתיחה נגזרת מהקובץ ולא נדרשת מהמשתמש', () => {
    const preview = buildImportPreview({
      file: file(),
      accountId: 'acc-bank',
      existing: [],
      context: { merchantRules: [], categories: DEFAULT_CATEGORIES },
    });

    // ₪2,040 היתרה אחרי העסקה הראשונה, שהייתה ‎-₪40
    expect(preview.inferredOpeningBalanceAgorot).toBe(ILS(2080));
    expect(preview.inferredOpeningDate).toBe('2026-02-16');
  });

  it('⭐ שרשרת היתרות מתחברת — הוכחה שכל הפענוח נכון', () => {
    const preview = buildImportPreview({
      file: file(),
      accountId: 'acc-bank',
      existing: [],
      context: { merchantRules: [], categories: DEFAULT_CATEGORIES },
    });
    expect(preview.ledgerConsistent).toBe(true);

    // ואימות עצמאי: פתיחה + הכנסות − הוצאות = סיום
    const income = preview.rows
      .filter((r) => r.type === 'income')
      .reduce((s, r) => s + r.amountAgorot, 0);
    const expense = preview.rows
      .filter((r) => r.type === 'expense')
      .reduce((s, r) => s + r.amountAgorot, 0);

    expect(preview.inferredOpeningBalanceAgorot! + income - expense).toBe(
      preview.statementClosingBalanceAgorot,
    );
  });

  it('הליכה ישירה על הדוח מגיעה לאותה תוצאה', () => {
    const table = readTable(file());
    const { rows } = parseRows(table.rows, detectMapping(table.rows));
    const walk = walkStatement(
      rows.map((r) => ({
        date: r.date,
        signedAmountAgorot: r.type === 'income' ? r.amountAgorot : -r.amountAgorot,
        statementBalanceAgorot: r.statementBalanceAgorot!,
      })),
    );

    expect(walk.chronological).toBe(false);
    expect(walk.consistent).toBe(true);
    expect(walk.inferredOpeningBalanceAgorot).toBe(ILS(2080));
    expect(walk.closingBalanceAgorot).toBe(ILS(3183.5));
  });
});
