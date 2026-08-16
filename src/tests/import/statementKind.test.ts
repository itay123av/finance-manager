/**
 * ⭐ בדיקות זיהוי סוג הדוח — ההגנה מפני ספירה כפולה.
 *
 * התרחיש: בדוח העו״ש יש שורה אחת "חיוב כרטיס אשראי — ₪450".
 * בפירוט הכרטיס אותן רכישות מופיעות בנפרד. ייבוא שניהם לאותו חשבון
 * סופר כל רכישה פעמיים.
 *
 * מה שהופך את זה למסוכן במיוחד: זיהוי הכפילויות הרגיל **לא יתפוס**
 * את זה. הסכומים, התאריכים והתיאורים שונים לגמרי. שום דבר לא ייראה
 * חשוד — היתרה פשוט תהיה שגויה.
 */

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { detectStatementKind, redactAccountNumbers } from '../../import/statementKind';
import { buildImportPreview } from '../../import/pipeline';
import { commitImport } from '../../data/imports';
import { DEFAULT_CATEGORIES } from '../../content/categories.seed';
import { textFile } from './fixtures';

/** מבנה פירוט כרטיס אשראי — בלי עמודת יתרה. שמות וסכומים מומצאים. */
const CREDIT_CARD_CSV = `תאריך עסקה,שם בית עסק,סכום עסקה,סכום חיוב,סוג עסקה,ענף
09/06/2026,חנות בדיונית,80.00,80.00,רגילה,מזון
12/06/2026,עוד חנות,143.52,143.52,רגילה,פנאי
`;

/** מבנה דוח בנק — עם עמודת יתרה. */
const BANK_CSV = `תאריך,יום ערך,תיאור התנועה,זכות/חובה ₪,יתרה ₪,אסמכתה,ערוץ ביצוע
06/08/2026,06/08/2026,הפקדה,1200.00,3183.50,110045,אינטרנט
04/08/2026,04/08/2026,קנייה,-18.50,1983.50,110044,כרטיס
`;

describe('⭐ זיהוי פירוט כרטיס אשראי', () => {
  it('מזוהה לפי היעדר עמודת יתרה ועמודות חיוב אופייניות', () => {
    const result = detectStatementKind({
      headerCells: ['תאריך עסקה', 'שם בית עסק', 'סכום עסקה', 'סכום חיוב', 'סוג עסקה', 'ענף'],
      hasBalanceColumn: false,
    });

    expect(result.kind).toBe('credit_card');
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.signals.creditCard.length).toBeGreaterThanOrEqual(2);
  });

  it('עובד גם כשיש שורות חדשות בתוך תאי הכותרת — כמו בייצוא אמיתי מ-Excel', () => {
    const result = detectStatementKind({
      headerCells: ['תאריך\nעסקה', 'שם בית עסק', 'סכום\nעסקה', 'סכום\nחיוב', 'ענף'],
      hasBalanceColumn: false,
    });
    expect(result.kind).toBe('credit_card');
  });
});

describe('זיהוי דוח בנק', () => {
  it('עמודת יתרה רצה היא הסימן החזק ביותר', () => {
    const result = detectStatementKind({
      headerCells: ['תאריך', 'יום ערך', 'תיאור התנועה', 'זכות/חובה ₪', 'יתרה ₪', 'אסמכתה'],
      hasBalanceColumn: true,
    });
    expect(result.kind).toBe('bank');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('כותרת ריקה אינה מזוהה כשום דבר', () => {
    expect(detectStatementKind({ headerCells: [], hasBalanceColumn: false }).kind).toBe('unknown');
  });
});

describe('⭐ החסימה בפועל', () => {
  const context = { merchantRules: [], categories: DEFAULT_CATEGORIES };

  function preview(csv: string) {
    return buildImportPreview({
      file: textFile('statement.csv', csv),
      accountId: 'acc-bank',
      existing: [],
      context,
    });
  }

  it('קובץ כרטיס אשראי נחסם', () => {
    const result = preview(CREDIT_CARD_CSV);
    expect(result.statementKind.kind).toBe('credit_card');
    expect(result.blockedReason).toBe('credit_card_file');
  });

  it('קובץ בנק אינו נחסם', () => {
    const result = preview(BANK_CSV);
    expect(result.statementKind.kind).toBe('bank');
    expect(result.blockedReason).toBeNull();
  });

  it('⭐ הקליטה נדחית גם אם עוקפים את הממשק', async () => {
    const result = preview(CREDIT_CARD_CSV);
    await expect(
      commitImport({} as never, {
        preview: result,
        accountId: 'acc-bank',
        selectedLines: new Set(result.rows.map((r) => r.sourceLine)),
      }),
    ).rejects.toThrow('סופר כל רכישה פעמיים');
  });
});

describe('⭐ ניקוי מספרי חשבון', () => {
  it('מסתיר מספר חשבון מלא ומשאיר 4 ספרות', () => {
    // ⚠️ מספר בדוי במבנה של שם גיליון אמיתי. אין כאן מספר חשבון של איש.
    expect(redactAccountNumbers('בנק בדיוני 111-222333444')).toBe('בנק בדיוני •••3444');
    expect(redactAccountNumbers('חשבון 12-345678')).toBe('חשבון •••5678');
  });

  it('לא נוגע במספרים קצרים כמו שנים או 4 ספרות אחרונות', () => {
    expect(redactAccountNumbers('כרטיס 3483')).toBe('כרטיס 3483');
    expect(redactAccountNumbers('אוגוסט 2026')).toBe('אוגוסט 2026');
  });

  it('⭐ שם הגיליון בתצוגה המקדימה כבר מנוקה', () => {
    const result = buildImportPreview({
      file: textFile('bank.csv', BANK_CSV),
      accountId: 'acc-bank',
      existing: [],
      context: { merchantRules: [], categories: DEFAULT_CATEGORIES },
    });
    // ל-CSV אין גיליון, אבל הנתיב מוודא שאין מספר חשבון בשדה
    expect(result.sheetName).toBeNull();
  });
});
