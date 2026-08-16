/**
 * ייצוא CSV.
 *
 * ⚠️ הבדיקה המרכזית כאן היא **formula injection**. שמות בתי העסק
 * מגיעים מקובץ בנק — קלט חיצוני לכל דבר — וגיליון מריץ תא שמתחיל
 * ב-`=` כנוסחה. שורה אחת כזו הופכת "ייצוא לקריאה אישית" לווקטור
 * תקיפה על מי שפותח את הקובץ.
 *
 * ⚠️ אין כאן שמות בתי עסק אמיתיים. כל המחרוזות מומצאות.
 */

import { describe, expect, it } from 'vitest';
import { csvCell, csvFileName, transactionsToCsv } from '../../data/csvExport';
import { ILS, tx, income } from '../helpers';
import type { Category } from '../../core/types';

const categories: Category[] = [
  {
    id: 'cat-food-out',
    name: 'אוכל בחוץ',
    kind: 'expense',
    nature: 'fun',
    color: '#000',
    isSystem: false,
    sortOrder: 10,
  },
  {
    id: 'cat-work',
    name: 'עבודה',
    kind: 'income',
    nature: 'system',
    color: '#000',
    isSystem: false,
    sortOrder: 20,
  },
];

describe('נטרול תאים', () => {
  it('⭐ תא שמתחיל בתו נוסחה מנוטרל', () => {
    for (const dangerous of ['=1+1', '+SUM(A1)', '-2+3', '@import', '\tfoo']) {
      expect(csvCell(dangerous).startsWith("'")).toBe(true);
    }
  });

  it('טקסט רגיל אינו נוגע', () => {
    expect(csvCell('קפה בפינה')).toBe('קפה בפינה');
    expect(csvCell('123')).toBe('123');
  });

  it('פסיק, גרשיים ושורה חדשה מצוטטים כראוי', () => {
    expect(csvCell('א,ב')).toBe('"א,ב"');
    expect(csvCell('אמר "שלום"')).toBe('"אמר ""שלום"""');
    expect(csvCell('שורה\nשנייה')).toBe('"שורה\nשנייה"');
  });

  it('⭐ נוסחה שגם מכילה פסיק — מנוטרלת וגם מצוטטת', () => {
    expect(csvCell('=HYPERLINK(a,b)')).toBe('"\'=HYPERLINK(a,b)"');
  });
});

describe('קובץ הייצוא', () => {
  const transactions = [
    tx({ date: '2026-08-05', shekels: 64, merchant: 'דוכן פלאפל', categoryId: 'cat-food-out' }),
    income({ date: '2026-08-01', shekels: 300, merchant: 'משמרת' }),
  ];

  it('מתחיל ב-BOM כדי ש-Excel יציג עברית', () => {
    const csv = transactionsToCsv({ transactions, categories });
    expect(csv.codePointAt(0)).toBe(0xfeff);
  });

  it('כותרות בעברית, ושורה לכל עסקה', () => {
    const lines = transactionsToCsv({ transactions, categories }).trim().split('\r\n');
    expect(lines[0]).toContain('תאריך');
    expect(lines[0]).toContain('סכום');
    expect(lines).toHaveLength(3);
  });

  it('⭐ הסכומים תמיד חיוביים, והכיוון בעמודה נפרדת', () => {
    // סכום שלילי היה מתחיל במינוס, המינוס היה דורש נטרול בגרשון,
    // והתוצאה הייתה עמודה שאי אפשר לסכם בגיליון.
    const csv = transactionsToCsv({ transactions, categories });
    expect(csv).not.toContain(',-');
    expect(csv).toContain(',הוצאה,64.00,');
    expect(csv).toContain(',הכנסה,300.00,');
  });

  it('ממוין מהישן לחדש', () => {
    const lines = transactionsToCsv({ transactions, categories }).trim().split('\r\n');
    expect(lines[1]?.startsWith('2026-08-01')).toBe(true);
    expect(lines[2]?.startsWith('2026-08-05')).toBe(true);
  });

  it('קטגוריה שנמחקה אינה שוברת את הקובץ', () => {
    const csv = transactionsToCsv({
      transactions: [tx({ categoryId: 'cat-missing' })],
      categories,
    });
    expect(csv).toContain('ללא קטגוריה');
  });

  it('⭐ שם בית עסק עוין מנוטרל בקובץ עצמו', () => {
    const csv = transactionsToCsv({
      transactions: [tx({ merchant: '=cmd|calc' })],
      categories,
    });
    expect(csv).toContain("'=cmd|calc");
    expect(csv).not.toMatch(/,=cmd/);
  });

  it('סכומים גדולים נשמרים בשלמותם', () => {
    const csv = transactionsToCsv({
      transactions: [tx({ amountAgorot: ILS(12_345.67) })],
      categories,
    });
    expect(csv).toContain('12345.67');
  });

  it('שם הקובץ כולל תאריך', () => {
    expect(csvFileName(new Date('2026-08-15T10:00:00Z'))).toBe('transactions-2026-08-15.csv');
  });
});
