/**
 * זיהוי מה כל עמודה אומרת.
 *
 * אין תקן לייצוא עסקאות מבנק ישראלי. לכן הזיהוי האוטומטי הוא ניחוש
 * מושכל בלבד, והמשתמש תמיד יכול לתקן אותו במסך הייבוא. המיפוי נשמר
 * לפי חתימת הכותרות, כך שהקובץ הבא מאותו בנק ימופה לבד.
 *
 * המקרה שמפיל מימושים נאיביים: **חובה וזכות בשתי עמודות נפרדות**.
 * זה נפוץ מאוד בישראל, ובלי טיפול מפורש כל ההכנסות נקלטות כהוצאות.
 */

import type { ColumnMapping, ColumnRole } from './types';

/** ביטויים לכל תפקיד, מהספציפי לכללי. הסדר קובע — ראשון שמתאים מנצח. */
const HEADER_PATTERNS: { role: ColumnRole; patterns: RegExp[] }[] = [
  {
    role: 'debit',
    patterns: [/^חובה$/, /חיוב/, /סכום\s*חובה/, /יצא/, /משיכה/, /^debit$/i, /withdrawal/i],
  },
  {
    role: 'credit',
    patterns: [/^זכות$/, /זיכוי/, /סכום\s*זכות/, /נכנס/, /הפקדה/, /^credit$/i, /deposit/i],
  },
  {
    role: 'balance',
    patterns: [/יתרה/, /^balance$/i, /יתרה\s*לאחר/],
  },
  {
    role: 'date',
    patterns: [
      /תאריך\s*ערך/,
      /תאריך\s*חיוב/,
      /תאריך\s*עסקה/,
      /^ת\.?\s*עסקה/,
      /^תאריך/,
      /^date$/i,
      /value\s*date/i,
    ],
  },
  {
    role: 'merchant',
    patterns: [
      // ⚠️ "סוג פעולה" אינו תיאור אלא עמודת **כיוון** (חובה/זכות).
      // מיפוי שלו לתיאור היה גונב אותו מזיהוי הכיוון, ובדיוק אותה
      // עמודה היא לרוב הדרך היחידה לדעת מה הכנסה ומה הוצאה.
      /שם\s*בית\s*(ה)?עסק/,
      /בית\s*עסק/,
      /תיאור/,
      /פירוט/,
      /^פרטים/,
      /^description$/i,
      /^merchant$/i,
      /^details$/i,
    ],
  },
  {
    role: 'amount',
    patterns: [/סכום\s*ה?עסקה/, /^סכום/, /^amount$/i, /^sum$/i],
  },
  {
    role: 'reference',
    patterns: [/אסמכתא/, /מספר\s*שובר/, /^reference$/i],
  },
];

function roleForHeader(header: string): ColumnRole {
  const clean = header.trim().replace(/["'׳״]/g, '').replace(/\s+/g, ' ');
  if (clean === '') return 'ignore';
  for (const { role, patterns } of HEADER_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(clean))) return role;
  }
  return 'ignore';
}

/** נראה כמו תאריך? משמש לזיהוי שורת הכותרת ולזיהוי עמודות בלי כותרת. */
export function looksLikeDate(value: string): boolean {
  return /^\s*\d{1,4}[./-]\d{1,2}[./-]\d{2,4}\s*$/.test(value);
}

/** נראה כמו סכום? מקבל פסיקים, מטבע, סוגריים לשליליים ומינוס בסוף. */
export function looksLikeAmount(value: string): boolean {
  const clean = value.replace(/[₪,\s]/g, '');
  if (clean === '') return false;
  return /^[-+(]?\d+(\.\d+)?\)?-?$/.test(clean);
}

/**
 * מוצא את שורת הכותרת: השורה עם הכי הרבה תאים שזוהו כתפקיד ידוע,
 * מבין 10 השורות הראשונות. בנקים מקדימים לנתונים כותרות, לוגו ותאריכי הפקה.
 */
function findHeaderRow(rows: string[][]): number | null {
  let best: { index: number; score: number } | null = null;

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (!row) continue;
    const roles = row.map(roleForHeader);
    const score = roles.filter((r) => r !== 'ignore').length;
    // כותרת אמיתית מזהה לפחות שני תפקידים, ואינה מכילה תאריכים
    if (score >= 2 && !row.some(looksLikeDate) && (!best || score > best.score)) {
      best = { index: i, score };
    }
  }
  return best?.index ?? null;
}

/**
 * כשאין כותרת מזוהה — מנחשים לפי התוכן עצמו: העמודה שרוב ערכיה
 * נראים כתאריך היא התאריך, וכן הלאה.
 */
function inferRolesFromContent(rows: string[][]): ColumnRole[] {
  const width = Math.max(...rows.map((r) => r.length), 0);
  const sample = rows.slice(0, 40);
  const roles: ColumnRole[] = new Array(width).fill('ignore');

  const ratio = (col: number, test: (value: string) => boolean) => {
    const values = sample.map((row) => row[col] ?? '').filter((v) => v !== '');
    if (values.length === 0) return 0;
    return values.filter(test).length / values.length;
  };

  let dateCol = -1;
  let bestDate = 0;
  const amountCols: { col: number; score: number }[] = [];

  for (let col = 0; col < width; col++) {
    const dateScore = ratio(col, looksLikeDate);
    if (dateScore > 0.7 && dateScore > bestDate) {
      bestDate = dateScore;
      dateCol = col;
    }
    const amountScore = ratio(col, looksLikeAmount);
    if (amountScore > 0.7) amountCols.push({ col, score: amountScore });
  }

  if (dateCol >= 0) roles[dateCol] = 'date';

  // מבין העמודות המספריות, האחרונה היא בדרך כלל היתרה הרצה
  const numeric = amountCols.filter((c) => c.col !== dateCol);
  if (numeric.length > 0) {
    const amountCol = numeric[0];
    if (amountCol) roles[amountCol.col] = 'amount';
    if (numeric.length > 1) {
      const last = numeric[numeric.length - 1];
      if (last && last.col !== amountCol?.col) roles[last.col] = 'balance';
    }
  }

  // העמודה הטקסטואלית הארוכה ביותר היא התיאור
  let merchantCol = -1;
  let bestLength = 0;
  for (let col = 0; col < width; col++) {
    if (roles[col] !== 'ignore') continue;
    const values = sample.map((row) => row[col] ?? '').filter((v) => v !== '');
    if (values.length === 0) continue;
    const avg = values.reduce((sum, v) => sum + v.length, 0) / values.length;
    if (avg > bestLength) {
      bestLength = avg;
      merchantCol = col;
    }
  }
  if (merchantCol >= 0) roles[merchantCol] = 'merchant';

  return roles;
}

/** חתימה יציבה של מבנה הקובץ — המפתח לשמירת המיפוי. */
export function mappingSignature(headerRow: string[] | null, columnCount: number): string {
  if (!headerRow) return `positional:${columnCount}`;
  return headerRow
    .map((h) => h.trim().toLowerCase().replace(/\s+/g, ' '))
    .join('|')
    .slice(0, 300);
}

export function detectMapping(rows: string[][]): ColumnMapping {
  const headerRowIndex = findHeaderRow(rows);
  const headerRow = headerRowIndex === null ? null : (rows[headerRowIndex] ?? null);
  const dataRows = rows.slice(headerRowIndex === null ? 0 : headerRowIndex + 1);

  const roles = headerRow
    ? headerRow.map(roleForHeader)
    : inferRolesFromContent(dataRows.length > 0 ? dataRows : rows);

  // כותרת יכולה לזהות תאריך ותיאור אבל לפספס את הסכום — משלימים מהתוכן
  if (headerRow && !roles.includes('amount') && !roles.includes('debit') && !roles.includes('credit')) {
    const inferred = inferRolesFromContent(dataRows);
    for (let col = 0; col < roles.length; col++) {
      if (roles[col] === 'ignore' && inferred[col] === 'amount') roles[col] = 'amount';
    }
  }
  if (headerRow && !roles.includes('date')) {
    const inferred = inferRolesFromContent(dataRows);
    for (let col = 0; col < roles.length; col++) {
      if (roles[col] === 'ignore' && inferred[col] === 'date') roles[col] = 'date';
    }
  }

  return {
    headerRowIndex,
    roles,
    signature: mappingSignature(headerRow, Math.max(...rows.map((r) => r.length), 0)),
  };
}

/** האם המיפוי מספיק כדי לנסות לקלוט שורות. */
export function isMappingUsable(mapping: ColumnMapping): boolean {
  const hasDate = mapping.roles.includes('date');
  const hasValue =
    mapping.roles.includes('amount') ||
    mapping.roles.includes('debit') ||
    mapping.roles.includes('credit');
  return hasDate && hasValue;
}

export const COLUMN_ROLE_LABELS_HE: Record<ColumnRole, string> = {
  date: 'תאריך',
  merchant: 'שם / תיאור',
  amount: 'סכום',
  debit: 'חובה (יצא)',
  credit: 'זכות (נכנס)',
  balance: 'יתרה',
  reference: 'אסמכתא',
  ignore: 'להתעלם',
};
