/**
 * זיהוי סוג הדוח: חשבון בנק או פירוט כרטיס אשראי.
 *
 * ⚠️ למה זה קריטי — סכנת ספירה כפולה.
 *
 * בדוח העו״ש מופיעה שורה אחת מרוכזת: "חיוב כרטיס אשראי 3483 — ₪450".
 * בפירוט הכרטיס מופיעות אותן רכישות בנפרד: ₪80, ₪143.52, ₪8.90 וכן הלאה.
 * ייבוא שני הקבצים לאותו חשבון יספור כל רכישה **פעמיים** — פעם כרכישה
 * ופעם כחיוב המרוכז.
 *
 * זיהוי הכפילות הרגיל לא יתפוס את זה: הסכומים שונים, התאריכים שונים
 * והתיאורים שונים. שום דבר לא ייראה חשוד — היתרה פשוט תהיה שגויה.
 *
 * לכן קובץ כרטיס אשראי נחסם מייבוא לחשבון בנק, עד שתיבנה תמיכה נכונה
 * בכרטיסי אשראי כחשבון נפרד.
 */

export type StatementKind = 'bank' | 'credit_card' | 'unknown';

export interface StatementKindResult {
  kind: StatementKind;
  confidence: number;
  reasonHe: string;
  signals: { bank: string[]; creditCard: string[] };
}

/** רמזים לפירוט כרטיס אשראי. */
const CREDIT_CARD_SIGNALS: { pattern: RegExp; label: string }[] = [
  { pattern: /סכום\s*חיוב/, label: 'עמודת "סכום חיוב"' },
  { pattern: /סכום\s*עסקה/, label: 'עמודת "סכום עסקה"' },
  { pattern: /מועד\s*חיוב/, label: 'עמודת "מועד חיוב"' },
  { pattern: /^\s*ענף\s*$/m, label: 'עמודת "ענף"' },
  { pattern: /תשלומים/, label: 'עמודת תשלומים' },
  { pattern: /מספר\s*כרטיס|4\s*ספרות/, label: 'מספר כרטיס' },
  { pattern: /שם\s*בית\s*עסק/, label: 'עמודת "שם בית עסק"' },
];

/** רמזים לדוח חשבון בנק. */
const BANK_SIGNALS: { pattern: RegExp; label: string }[] = [
  { pattern: /יתרה/, label: 'עמודת יתרה' },
  { pattern: /אסמכתה|אסמכתא/, label: 'עמודת אסמכתה' },
  { pattern: /ערוץ\s*ביצוע/, label: 'עמודת "ערוץ ביצוע"' },
  { pattern: /יום\s*ערך/, label: 'עמודת "יום ערך"' },
  { pattern: /זכות\s*\/?\s*חובה/, label: 'עמודת "זכות/חובה"' },
];

export interface DetectKindInput {
  /** תאי שורת הכותרת. */
  headerCells: readonly string[];
  /** האם זוהתה עמודת יתרה רצה. */
  hasBalanceColumn: boolean;
}

/**
 * המבחן החזק ביותר הוא **עמודת היתרה**: לחשבון בנק יש יתרה רצה,
 * לפירוט כרטיס אשראי אין — כי אין לו יתרה, יש לו רק חיובים.
 */
export function detectStatementKind(input: DetectKindInput): StatementKindResult {
  // רווחים ושורות חדשות בתוך תאי כותרת נפוצים בייצוא מ-Excel
  const text = input.headerCells.join(' | ').replace(/\s+/g, ' ');

  const creditCard = CREDIT_CARD_SIGNALS.filter((s) => s.pattern.test(text)).map((s) => s.label);
  const bank = BANK_SIGNALS.filter((s) => s.pattern.test(text)).map((s) => s.label);

  const signals = { bank, creditCard };

  if (input.hasBalanceColumn && bank.length >= 2) {
    return {
      kind: 'bank',
      confidence: 0.95,
      reasonHe: 'יש עמודת יתרה רצה — זה דוח חשבון בנק.',
      signals,
    };
  }

  if (!input.hasBalanceColumn && creditCard.length >= 2) {
    return {
      kind: 'credit_card',
      confidence: 0.9,
      reasonHe: 'אין עמודת יתרה, ויש עמודות חיוב אופייניות — זה פירוט כרטיס אשראי.',
      signals,
    };
  }

  if (bank.length > creditCard.length) {
    return { kind: 'bank', confidence: 0.6, reasonHe: 'נראה כמו דוח בנק.', signals };
  }
  if (creditCard.length > bank.length) {
    return {
      kind: 'credit_card',
      confidence: 0.6,
      reasonHe: 'נראה כמו פירוט כרטיס אשראי.',
      signals,
    };
  }

  return { kind: 'unknown', confidence: 0, reasonHe: 'לא הצלחנו לזהות את סוג הדוח.', signals };
}

/**
 * מסתיר רצפי ספרות שנראים כמו מספר חשבון או כרטיס.
 *
 * שם הגיליון בקובצי בנק מכיל לא פעם את מספר החשבון המלא. הוא מוצג
 * בממשק ונשמר בתיעוד הייבוא — ולכן הוא מנוקה כאן, לפני שהוא מגיע
 * לשני המקומות. שומרים 4 ספרות אחרונות כדי שעדיין יהיה אפשר להבחין
 * בין שני חשבונות.
 */
export function redactAccountNumbers(value: string): string {
  return value.replace(/\d[\d-]{5,}\d/g, (match) => {
    const digits = match.replace(/\D/g, '');
    return `•••${digits.slice(-4)}`;
  });
}
