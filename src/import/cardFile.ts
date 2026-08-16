/**
 * פענוח קובץ פירוט כרטיס אשראי.
 *
 * המבנה שנתמך (כאל / מרכנתיל דיסקונט, וקרוב לו אצל אחרים):
 *
 *   [0] פירוט עסקאות לחשבון ... לכרטיס ויזה ... המסתיים ב-3483
 *   [1] עסקאות בחיוב מיידי 591.52 ₪
 *   [2] תאריך עסקה | שם בית עסק | סכום עסקה | סכום חיוב | סוג עסקה | ענף | הערות
 *   [3…] העסקאות
 *   [n] שורת הסבר בסוף
 *
 * ⚠️ ההבחנה החשובה: **סכום עסקה** מול **סכום חיוב**.
 * בעסקת מט״ח הראשון הוא ‎$20.00 והשני ₪61.82. הכסף שיצא הוא השני;
 * הראשון נשמר למידע בלבד. בלבול ביניהם היה מכניס דולרים לחישוב שקלי.
 */

import { readTable } from './tabular';
import { parseAmountCell, parseDateCell } from './rows';
import { normalizeMerchant } from '../data/normalize';
import { redactAccountNumbers } from './statementKind';
import { ImportError, type SourceFile } from './types';
import type { Agorot, CardTransactionStatus, ISODate } from '../core/types';

export interface ParsedCardRow {
  sourceLine: number;
  purchaseDate: ISODate;
  merchant: string;
  merchantNormalized: string;
  /** הסכום שחויב בשקלים — זה מה שמשפיע על הכסף. */
  amountAgorot: Agorot;
  currency: string;
  originalAmountAgorot?: Agorot;
  originalCurrency?: string;
  issuerCategory?: string;
  transactionType?: string;
  installmentNumber?: number;
  installmentCount?: number;
  isRefund: boolean;
  status: CardTransactionStatus;
  notes?: string;
}

export interface ParsedCardFile {
  /** ארבע ספרות אחרונות. ⚠️ מספר כרטיס מלא לעולם אינו נשמר. */
  cardLast4: string | null;
  issuer: string | null;
  /** הסכום המוצהר בכותרת הקובץ, לאימות. */
  declaredTotalAgorot: Agorot | null;
  rows: ParsedCardRow[];
  failures: { sourceLine: number; reason: string; preview: string }[];
  encoding: string;
  sheetName: string | null;
  dateRange: { from: ISODate; to: ISODate } | null;
}

const HEADER_MARKERS = ['תאריך עסקה', 'שם בית עסק', 'סכום עסקה', 'סכום חיוב'];

/** מזהה מטבע מתוך תא סכום: "‎$ 20.00" או "₪ 61.82". */
function detectCurrency(cell: string): string {
  if (cell.includes('$')) return 'USD';
  if (cell.includes('€')) return 'EUR';
  if (cell.includes('£')) return 'GBP';
  return 'ILS';
}

/** "1 מתוך 6" / "תשלום 2/6" → מספר תשלום וסך תשלומים. */
export function parseInstallments(
  value: string,
): { number: number; count: number } | null {
  const clean = value.replace(/\s+/g, ' ');
  const of = clean.match(/(\d{1,2})\s*(?:מתוך|\/|מ־|מ-)\s*(\d{1,2})/);
  if (!of) return null;
  const number = Number(of[1]);
  const count = Number(of[2]);
  if (!Number.isFinite(number) || !Number.isFinite(count) || count < 2 || number > count) {
    return null;
  }
  return { number, count };
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    // ⚠️ תאי כותרת בייצוא אמיתי מכילים שורות חדשות: "תאריך\nעסקה".
    // בלי כיווץ הרווחים, החיפוש אחרי "תאריך עסקה" לא מוצא כלום.
    const joined = (rows[i] ?? []).join(' ').replace(/\s+/g, ' ');
    const hits = HEADER_MARKERS.filter((marker) => joined.includes(marker)).length;
    if (hits >= 2) return i;
  }
  return -1;
}

export function parseCardFile(file: SourceFile): ParsedCardFile {
  const table = readTable(file);
  const headerIndex = findHeaderRow(table.rows);

  if (headerIndex < 0) {
    throw new ImportError(
      'לא זיהינו כותרת של פירוט כרטיס אשראי. ודא שזה קובץ פירוט עסקאות.',
      'no_columns',
    );
  }

  const header = table.rows[headerIndex] ?? [];
  const columnOf = (...markers: string[]) =>
    header.findIndex((cell) => markers.some((marker) => cell.replace(/\s+/g, ' ').includes(marker)));

  const dateCol = columnOf('תאריך עסקה', 'תאריך');
  const merchantCol = columnOf('שם בית עסק', 'בית עסק');
  const originalCol = columnOf('סכום עסקה');
  const billedCol = columnOf('סכום חיוב');
  const typeCol = columnOf('סוג עסקה');
  const branchCol = columnOf('ענף');
  const notesCol = columnOf('הערות');

  if (dateCol < 0 || billedCol < 0) {
    throw new ImportError('חסרה עמודת תאריך או עמודת סכום חיוב.', 'no_columns');
  }

  // ── מטא-נתונים מהכותרת ─────────────────────────────────────────────
  const preamble = table.rows.slice(0, headerIndex).map((r) => r.join(' ')).join(' ');
  const cardLast4 = preamble.match(/המסתיים\s*ב\s*-?\s*(\d{4})/)?.[1] ?? null;
  const issuer =
    preamble.match(/לחשבון\s+([^\d]+?)\s+\d/)?.[1]?.trim() ??
    (table.sheetName === null ? null : redactAccountNumbers(table.sheetName));
  const declaredTotalAgorot = parseAmountCell(
    preamble.match(/([\d,]+\.\d{2})\s*₪/)?.[1] ?? '',
  );

  const rows: ParsedCardRow[] = [];
  const failures: ParsedCardFile['failures'] = [];

  table.rows.slice(headerIndex + 1).forEach((row, index) => {
    const sourceLine = headerIndex + 2 + index;
    const preview = row.filter((c) => c !== '').join(' | ').slice(0, 100);
    if (row.every((c) => c === '')) return;

    const purchaseDate = parseDateCell(row[dateCol] ?? '');
    if (!purchaseDate) {
      // שורות הסבר בתחתית הקובץ אינן עסקאות ואינן שגיאות
      const looksLikeFooter = (row[dateCol] ?? '').length > 30 || row.filter((c) => c !== '').length <= 1;
      if (!looksLikeFooter) {
        failures.push({ sourceLine, reason: 'תאריך לא תקין', preview });
      }
      return;
    }

    const billedCell = row[billedCol] ?? '';
    const billed = parseAmountCell(billedCell);
    if (billed === null) {
      failures.push({ sourceLine, reason: 'סכום חיוב לא תקין', preview });
      return;
    }

    const originalCell = originalCol >= 0 ? (row[originalCol] ?? '') : '';
    const originalCurrency = detectCurrency(originalCell);
    const originalAmount = parseAmountCell(originalCell);

    const typeCell = typeCol >= 0 ? (row[typeCol] ?? '') : '';
    const notesCell = notesCol >= 0 ? (row[notesCol] ?? '') : '';
    const branch = branchCol >= 0 ? (row[branchCol] ?? '').trim() : '';
    const merchant = merchantCol >= 0 ? (row[merchantCol] ?? '').trim() : '';

    const installments = parseInstallments(`${typeCell} ${notesCell}`);
    // סכום שלילי או ניסוח מפורש = זיכוי
    const isRefund = billed < 0 || /זיכוי|ביטול/.test(`${typeCell} ${notesCell}`);
    const status: CardTransactionStatus = /טרם\s*חויב|לא\s*חויב|עתידי/.test(
      `${typeCell} ${notesCell}`,
    )
      ? 'pending'
      : 'billed';

    rows.push({
      sourceLine,
      purchaseDate,
      merchant,
      merchantNormalized: normalizeMerchant(merchant),
      amountAgorot: Math.abs(billed),
      currency: 'ILS',
      ...(originalCurrency !== 'ILS' && originalAmount !== null
        ? { originalAmountAgorot: Math.abs(originalAmount), originalCurrency }
        : {}),
      ...(branch ? { issuerCategory: branch } : {}),
      ...(typeCell ? { transactionType: typeCell.trim() } : {}),
      ...(installments
        ? { installmentNumber: installments.number, installmentCount: installments.count }
        : {}),
      isRefund,
      status,
      ...(notesCell ? { notes: notesCell.trim() } : {}),
    });
  });

  const dates = rows.map((r) => r.purchaseDate).sort();

  return {
    cardLast4,
    issuer,
    declaredTotalAgorot,
    rows,
    failures,
    encoding: table.encoding,
    sheetName: table.sheetName === null ? null : redactAccountNumbers(table.sheetName),
    dateRange: dates.length > 0 ? { from: dates[0]!, to: dates.at(-1)! } : null,
  };
}
