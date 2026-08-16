/**
 * טיפוסי שכבת הייבוא.
 *
 * ⚠️ נקודת ההרחבה העתידית: `TransactionSource`.
 *
 * הממשק הזה מפריד בין "מאיפה הגיעו השורות" לבין כל מה שקורה אחריהן —
 * מיפוי, נירמול, זיהוי כפילויות, סיווג וקליטה. זה אומר שמקור חדש
 * (למשל חיבור בנקאי רשמי בגיל 18) יצטרך לספק רק `RawTable`, ושאר
 * הצנרת תמשיך לעבוד כמות שהיא.
 *
 * זו הפרדה אמיתית אבל חלקית: חיבור בנקאי אמיתי ידרוש גם גוף מורשה
 * וגם רכיב שרת שיחזיק טוקנים. הממשק חוסך את שכבת העיבוד, לא את זה.
 */

import type { Agorot, ISODate, TransactionType, UUID } from '../core/types';
import type { StatementKindResult } from './statementKind';

/** קובץ גולמי כפי שהתקבל מהמשתמש. */
export interface SourceFile {
  name: string;
  bytes: Uint8Array;
}

export type SourceFormat = 'csv' | 'xlsx' | 'xls' | 'html-table' | 'unknown';

/** מטריצת תאים אחרי פענוח הפורמט, לפני שיודעים מה כל עמודה אומרת. */
export interface RawTable {
  format: SourceFormat;
  encoding: string;
  /** הגיליון שנבחר — רלוונטי ל-Excel בלבד. */
  sheetName: string | null;
  /** כל השורות, כולל שורות כותרת ושורות זבל שיסוננו בהמשך. */
  rows: string[][];
}

export interface TransactionSource {
  readonly id: string;
  readonly labelHe: string;
  read(file: SourceFile): Promise<RawTable>;
}

// ---------------------------------------------------------------------------
// מיפוי עמודות
// ---------------------------------------------------------------------------

export type ColumnRole =
  | 'date'
  | 'merchant'
  /** עמודת סכום אחת, שהסימן שלה קובע את הכיוון. */
  | 'amount'
  /** בנקים ישראליים רבים מפצלים לשתי עמודות. */
  | 'debit'
  | 'credit'
  | 'balance'
  | 'reference'
  | 'ignore';

export interface ColumnMapping {
  /** אינדקס השורה שהיא הכותרת, או `null` כשאין כותרת. */
  headerRowIndex: number | null;
  /** תפקיד לכל אינדקס עמודה. */
  roles: ColumnRole[];
  /** נשמר כדי שהקובץ הבא מאותו בנק ימופה לבד. */
  signature: string;
}

// ---------------------------------------------------------------------------
// שורות מפוענחות
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// כיוון העסקה
// ---------------------------------------------------------------------------

/**
 * `unresolved` — אי אפשר לקבוע מהקובץ מה הכנסה ומה הוצאה.
 *
 * זה קורה כשיש עמודת סכום אחת שכל ערכיה חיוביים ואין שום רמז אחר.
 * ניחוש כאן משנה את היתרה בכיוון ההפוך, בכפליים מהסכום — ולכן
 * המערכת **עוצרת** ומבקשת הכרעה במקום להניח.
 */
export type DirectionConfidence = 'resolved' | 'unresolved';

export type DirectionSourceHe =
  | 'עמודות חובה וזכות'
  | 'סימן הסכום'
  | 'בחירה שלך: הכל הוצאות'
  | 'בחירה שלך: הכל הכנסות'
  | 'עמודה שבחרת'
  | 'לא הוכרע';

/** כלל שהמשתמש בוחר כשהקובץ לא מספיק ברור. */
export type DirectionRule =
  | { kind: 'auto' }
  | { kind: 'all_expense' }
  | { kind: 'all_income' }
  | { kind: 'by_column'; columnIndex: number; incomeValue: string };

/** עמודה שיכולה לשמש לקביעת הכיוון — למשל "סוג פעולה". */
export interface DirectionCandidate {
  columnIndex: number;
  header: string;
  /** ערכים ייחודיים לדוגמה, כדי שהמשתמש יזהה מה מסמן הכנסה. */
  distinctValues: string[];
}

export interface DirectionState {
  confidence: DirectionConfidence;
  rule: DirectionRule;
  sourceHe: DirectionSourceHe;
  candidates: DirectionCandidate[];
  messageHe: string;
}

export interface ParsedRow {
  /** מספר השורה בקובץ המקורי, לדיווח שגיאות מדויק. */
  sourceLine: number;
  date: ISODate;
  amountAgorot: Agorot;
  type: TransactionType;
  merchant: string;
  merchantNormalized: string;
  /** יתרה מהקובץ, כשקיימת — משמשת לאימות בלבד ולא נשמרת. */
  statementBalanceAgorot?: Agorot;
}

export type RowFailureReason =
  | 'missing_date'
  | 'invalid_date'
  | 'missing_amount'
  | 'invalid_amount'
  | 'zero_amount'
  | 'empty_row';

export interface RowFailure {
  sourceLine: number;
  reason: RowFailureReason;
  /** תוכן השורה כפי שהופיע — כדי שאפשר יהיה להבין מה קרה. */
  rawPreview: string;
}

// ---------------------------------------------------------------------------
// כפילויות
// ---------------------------------------------------------------------------

export type DuplicateVerdict = 'new' | 'exact_duplicate' | 'possible_duplicate';

export interface ClassifiedRow extends ParsedRow {
  verdict: DuplicateVerdict;
  /** מה גרם לחשד, בשפה שאפשר להציג. */
  duplicateReasonHe?: string;
  categoryId: UUID;
  categoryConfidence: number;
  classificationSourceHe: string;
  /** מפתח הזיהוי, נשמר על העסקה כדי שייבוא חוזר יזהה אותה. */
  dedupeKey: string;
  /** ברירת המחדל של הסימון בתצוגה המקדימה. */
  selected: boolean;
}

// ---------------------------------------------------------------------------
// תוצאת הצנרת
// ---------------------------------------------------------------------------

export interface ImportPreview {
  fileName: string;
  format: SourceFormat;
  encoding: string;
  /** שם הגיליון שנבחר — רלוונטי רק ל-Excel. מספרי חשבון מנוקים ממנו. */
  sheetName: string | null;
  /** בנק או כרטיס אשראי — קובע אם מותר לקלוט לחשבון בנק. */
  statementKind: StatementKindResult;
  mapping: ColumnMapping;
  direction: DirectionState;
  rows: ClassifiedRow[];
  failures: RowFailure[];
  counts: {
    total: number;
    parsed: number;
    income: number;
    expense: number;
    fresh: number;
    exactDuplicates: number;
    possibleDuplicates: number;
    failed: number;
    highConfidence: number;
    needsReview: number;
  };
  /** טווח התאריכים בקובץ — עוזר לזהות שהועלה החודש הלא נכון. */
  dateRange: { from: ISODate; to: ISODate } | null;
  /**
   * יתרת הסיום כפי שמופיעה בקובץ, לצורך התאמה בלבד.
   * נקבעת לפי הסדר הכרונולוגי האמיתי ולא לפי סדר השורות בקובץ.
   */
  statementClosingBalanceAgorot: Agorot | null;
  /** יתרת הפתיחה שנגזרה מעמודת היתרה — חוסכת מהמשתמש להזין אותה. */
  inferredOpeningBalanceAgorot: Agorot | null;
  inferredOpeningDate: ISODate | null;
  /** האם שרשרת היתרות בקובץ מתחברת — הוכחה שהפענוח נכון. */
  ledgerConsistent: boolean;
  /**
   * כשאינו `null` — אסור לקלוט. הממשק חייב לחסום את כפתור האישור
   * עד שהסיבה מטופלת.
   */
  blockedReason: 'unresolved_direction' | 'credit_card_file' | null;
}

export class ImportError extends Error {
  constructor(
    message: string,
    readonly reason:
      | 'too_large'
      | 'too_many_rows'
      | 'unsupported_format'
      | 'unreadable'
      | 'no_columns'
      | 'empty',
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

/** מגבלות קלט — הגנה מפני קובץ ענק שיתקע את הדפדפן. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 20_000;
export const PARSE_TIMEOUT_MS = 15_000;
