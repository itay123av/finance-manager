/**
 * המרת קובץ למטריצת תאים.
 *
 * שלושה פורמטים, לפי מה שבנקים ישראליים באמת מייצאים:
 *  1. CSV — הנפוץ ביותר, לא פעם ב-windows-1255.
 *  2. XLSX/XLS אמיתי — קובץ בינארי.
 *  3. "‎.xls" שהוא בעצם טבלת HTML — מלכודת ותיקה של אתרי בנקים.
 *     קובץ כזה ייכשל בכל ספריית Excel, ולכן הוא מטופל כאן ישירות.
 *
 * זיהוי הפורמט נעשה לפי **תוכן** ולא לפי סיומת, כי הסיומת משקרת.
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { decodeBytes, stripInvisibles } from './encoding';
import { ImportError, MAX_ROWS, type RawTable, type SourceFile, type SourceFormat } from './types';

const ZIP_MAGIC = [0x50, 0x4b]; // "PK" — XLSX הוא ארכיון ZIP
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // XLS בינארי ישן

function hasMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((byte, i) => bytes[i] === byte);
}

export function detectFormat(file: SourceFile): SourceFormat {
  const { bytes, name } = file;
  if (bytes.length === 0) return 'unknown';
  if (hasMagic(bytes, ZIP_MAGIC)) return 'xlsx';
  if (hasMagic(bytes, OLE2_MAGIC)) return 'xls';

  // מציצים רק בהתחלה — מספיק כדי להבחין בין HTML לטקסט מופרד
  const head = decodeBytes(bytes.subarray(0, 2048)).text.trimStart().toLowerCase();
  if (/^(<!doctype html|<html|<table|<meta|<\?xml)/.test(head)) return 'html-table';
  if (head.includes('<table')) return 'html-table';

  if (/\.(csv|txt)$/i.test(name)) return 'csv';
  // ברירת מחדל לטקסט: מנסים CSV. גרוע מזה זה לוותר מראש.
  return 'csv';
}

// ---------------------------------------------------------------------------

function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return stripInvisibles(String(value)).trim();
}

function trimTable(rows: string[][]): string[][] {
  // מסירים שורות ריקות לחלוטין — קובצי בנק מרופדים בהן
  const nonEmpty = rows.filter((row) => row.some((cell) => cell !== ''));
  if (nonEmpty.length === 0) return [];

  // ומסירים עמודות שריקות בכל השורות
  const width = Math.max(...nonEmpty.map((r) => r.length));
  const keep: number[] = [];
  for (let col = 0; col < width; col++) {
    if (nonEmpty.some((row) => (row[col] ?? '') !== '')) keep.push(col);
  }
  return nonEmpty.map((row) => keep.map((col) => row[col] ?? ''));
}

function guardRowCount(rows: string[][]): void {
  if (rows.length > MAX_ROWS) {
    throw new ImportError(
      `הקובץ מכיל יותר מ-${MAX_ROWS.toLocaleString('en-US')} שורות. אפשר לייצא טווח תאריכים קצר יותר.`,
      'too_many_rows',
    );
  }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function readCsv(file: SourceFile): RawTable {
  const { text, encoding } = decodeBytes(file.bytes);
  const result = Papa.parse<string[]>(text, {
    // מזהה לבד פסיק / נקודה-פסיק / טאב — כל השלושה נפוצים
    delimiter: '',
    skipEmptyLines: 'greedy',
    header: false,
  });

  const rows = (result.data as unknown[][]).map((row) => row.map(cleanCell));
  guardRowCount(rows);
  return { format: 'csv', encoding, sheetName: null, rows: trimTable(rows) };
}

// ---------------------------------------------------------------------------
// טבלת HTML שמתחזה ל-Excel
// ---------------------------------------------------------------------------

export function readHtmlTable(file: SourceFile): RawTable {
  const { text, encoding } = decodeBytes(file.bytes);

  // DOMParser אינו מריץ סקריפטים ואינו טוען משאבים — הקובץ מטופל כטקסט בלבד
  const document = new DOMParser().parseFromString(text, 'text/html');
  const tables = [...document.querySelectorAll('table')];
  if (tables.length === 0) {
    throw new ImportError('לא נמצאה טבלה בקובץ.', 'no_columns');
  }

  // הטבלה עם הכי הרבה שורות היא הנתונים; השאר הן בדרך כלל כותרות ועיצוב
  const table = tables.reduce((best, current) =>
    current.rows.length > best.rows.length ? current : best,
  );

  const rows = [...table.rows].map((row) => [...row.cells].map((cell) => cleanCell(cell.textContent)));
  guardRowCount(rows);
  return { format: 'html-table', encoding, sheetName: null, rows: trimTable(rows) };
}

// ---------------------------------------------------------------------------
// Excel בינארי
// ---------------------------------------------------------------------------

export function readWorkbook(file: SourceFile, format: SourceFormat): RawTable {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(file.bytes, { type: 'array', cellDates: false, raw: false });
  } catch {
    throw new ImportError('לא הצלחנו לקרוא את קובץ ה-Excel.', 'unreadable');
  }

  // לא בהכרח הגיליון הראשון: ייצוא מבנק מגיע לא פעם עם גיליון שער
  // או גיליון הסברים לפני הנתונים. נבחר את זה עם הכי הרבה שורות.
  let bestName: string | null = null;
  let bestRows: string[][] = [];

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    });
    const rows = raw.map((row) => (Array.isArray(row) ? row.map(cleanCell) : []));
    if (rows.length > bestRows.length) {
      bestRows = rows;
      bestName = name;
    }
  }

  if (bestName === null) throw new ImportError('הקובץ לא מכיל גיליון עם נתונים.', 'empty');

  guardRowCount(bestRows);
  return { format, encoding: 'binary', sheetName: bestName, rows: trimTable(bestRows) };
}

// ---------------------------------------------------------------------------

export function readTable(file: SourceFile): RawTable {
  if (file.bytes.length === 0) {
    throw new ImportError('הקובץ ריק.', 'empty');
  }

  const format = detectFormat(file);
  const table =
    format === 'html-table'
      ? readHtmlTable(file)
      : format === 'xlsx' || format === 'xls'
        ? readWorkbook(file, format)
        : readCsv(file);

  if (table.rows.length === 0) {
    throw new ImportError('לא נמצאו שורות בקובץ.', 'empty');
  }
  return table;
}
