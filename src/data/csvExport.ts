/**
 * ייצוא עסקאות ל-CSV — לקריאה אישית בלבד.
 *
 * ⚠️ **זה לא גיבוי.** הקובץ הזה לא כולל חשבונות, יעד, תקציב, כרטיסים,
 * כללי סיווג או הגדרות, ואי אפשר לשחזר ממנו את המערכת. הוא קיים כדי
 * שאפשר יהיה לפתוח את העסקאות בגיליון ולהסתכל עליהן. שחזור עובד רק
 * מקובץ הגיבוי המלא — ראה `backup.ts`.
 *
 * ⚠️ **CSV formula injection.** תא שמתחיל ב-`=`, `+`, `-`, `@` או תו
 * בקרה מתפרש בגיליון כנוסחה, ולא כטקסט. שם בית עסק שהגיע מקובץ בנק
 * הוא קלט חיצוני לכל דבר — ושורה אחת כזו יכולה להריץ נוסחה במחשב של
 * מי שפותח את הקובץ. לכן כל שדה טקסט מנוטרל כאן, גם כשהוא "בטח בסדר".
 *
 * הסכומים נכתבים תמיד חיוביים, וכיוון התנועה יושב בעמודה נפרדת. זה
 * לא קישוט: סכום שלילי מתחיל במינוס, המינוס דורש נטרול, והנטרול היה
 * הופך כל סכום למחרוזת שאי אפשר לסכם בגיליון.
 */

import { toShekels } from '../core/money';
import type { Category, Transaction } from '../core/types';

/** תווים שגיליון מפרש כתחילת נוסחה. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * מנטרל שדה יחיד.
 *
 * גרשון מוביל הופך את התא לטקסט בכל הגיליונות הנפוצים. אחריו מגיע
 * ציטוט רגיל של CSV — פסיק, גרשיים או שורה חדשה בתוך ערך.
 */
export function csvCell(value: string): string {
  const neutralized = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(neutralized) ? `"${neutralized.replace(/"/g, '""')}"` : neutralized;
}

const HEADERS = ['תאריך', 'סוג', 'סכום', 'קטגוריה', 'שם', 'אמצעי תשלום', 'הערה', 'מקור'] as const;

/** Byte Order Mark — בלעדיו Excel בווינדוס פותח עברית כג׳יבריש. */
const BOM = String.fromCodePoint(0xfeff);

export interface CsvExportInput {
  transactions: readonly Transaction[];
  categories: readonly Category[];
}

export function transactionsToCsv(input: CsvExportInput): string {
  const categoryName = new Map(input.categories.map((c) => [c.id, c.name]));

  const rows = [...input.transactions]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((t) =>
      [
        t.date,
        t.type === 'income' ? 'הכנסה' : 'הוצאה',
        // תמיד חיובי — הכיוון כבר בעמודה הקודמת
        toShekels(t.amountAgorot).toFixed(2),
        categoryName.get(t.categoryId) ?? 'ללא קטגוריה',
        t.merchant,
        t.paymentMethod,
        t.note ?? '',
        t.source === 'file' ? 'ייבוא' : 'ידני',
      ]
        .map(csvCell)
        .join(','),
    );

  return `${BOM}${[HEADERS.join(','), ...rows].join('\r\n')}\r\n`;
}

export function csvFileName(now: Date = new Date()): string {
  return `transactions-${now.toISOString().slice(0, 10)}.csv`;
}
