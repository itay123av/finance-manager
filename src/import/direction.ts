/**
 * קביעת כיוון העסקה — הכנסה או הוצאה.
 *
 * ⚠️ זה החלק המסוכן ביותר בייבוא.
 *
 * טעות בכיוון מזיזה את היתרה **בכפליים מהסכום** ובכיוון ההפוך: הכנסה
 * של ₪2,400 שנקלטה כהוצאה יוצרת פער של ₪4,800. בניגוד לקטגוריה שגויה,
 * שרואים מיד ברשימה, טעות כזו מסתתרת מאחורי מספר שנראה סביר.
 *
 * לכן הכלל כאן: **לא מנחשים.** אם הקובץ לא אומר במפורש מה הכיוון,
 * המערכת עוצרת ומבקשת הכרעה מהמשתמש — היא לא מניחה "כנראה הוצאה".
 */

// אין כאן ייבוא מ-`rows.ts` בכוונה: `rows.ts` מייבא מכאן, ותלות
// הדדית בין שני המודולים האלה היא בדיוק סוג הדבר שנשבר בשקט בבנייה.
import { looksLikeAmount, looksLikeDate } from './columnMapping';
import type {
  ColumnMapping,
  DirectionCandidate,
  DirectionRule,
  DirectionState,
} from './types';

/** כמה ערכים ייחודיים לכל היותר עדיין נחשבים "עמודת סוג" ולא טקסט חופשי. */
const MAX_DISTINCT_FOR_CANDIDATE = 8;

/** מילים שמסגירות עמודה שמציינת כיוון. */
const DIRECTION_HINTS = [
  'זכות',
  'חובה',
  'הפקדה',
  'משיכה',
  'זיכוי',
  'חיוב',
  'סוג',
  'פעולה',
  'סוג פעולה',
  'סוג תנועה',
  'credit',
  'debit',
  'type',
];

/** ערכים שמשמעותם "זו הכנסה". */
export const INCOME_MARKERS = ['זכות', 'הפקדה', 'זיכוי', 'הכנסה', 'credit', 'deposit'];

/**
 * מאתר עמודות שיכולות לשמש לקביעת הכיוון.
 *
 * הקריטריון: עמודה שאינה תאריך ואינה סכום, עם מעט ערכים ייחודיים —
 * בדיוק כמו עמודת "סוג פעולה" שמכילה "חובה"/"זכות" וחוזר חלילה.
 */
export function findDirectionCandidates(
  rows: string[][],
  mapping: ColumnMapping,
  headerRow: string[] | null,
): DirectionCandidate[] {
  const dataRows = rows.slice(mapping.headerRowIndex === null ? 0 : mapping.headerRowIndex + 1);
  const width = Math.max(...rows.map((r) => r.length), 0);
  const candidates: DirectionCandidate[] = [];

  for (let col = 0; col < width; col++) {
    const role = mapping.roles[col];
    if (role === 'date' || role === 'amount' || role === 'debit' || role === 'credit') continue;

    const values = dataRows.map((row) => (row[col] ?? '').trim()).filter((v) => v !== '');
    if (values.length === 0) continue;
    if (values.some((v) => looksLikeDate(v) || looksLikeAmount(v))) continue;

    const distinct = [...new Set(values)];
    if (distinct.length > MAX_DISTINCT_FOR_CANDIDATE) continue;

    const header = headerRow?.[col] ?? '';
    const looksRelevant =
      DIRECTION_HINTS.some((hint) => header.toLowerCase().includes(hint)) ||
      distinct.some((value) =>
        INCOME_MARKERS.some((marker) => value.toLowerCase().includes(marker)),
      );

    // המבחן האמיתי אינו כמה ערכים יש, אלא האם הם **חוזרים**: עמודת
    // סוג פעולה מכילה את אותם שניים-שלושה ערכים שוב ושוב, בעוד
    // שעמודת תיאור כמעט לא חוזרת על עצמה. בלי זה, קובץ קצר היה גורם
    // לעמודת התיאור להיראות כמו עמודת כיוון.
    const repeatsEnough = distinct.length * 2 <= values.length;
    if (!repeatsEnough && !looksRelevant) continue;

    candidates.push({
      columnIndex: col,
      header: header || `עמודה ${col + 1}`,
      distinctValues: distinct.slice(0, 6),
    });

    // עמודה שנראית רלוונטית עולה לראש הרשימה
    if (looksRelevant) {
      const last = candidates.pop()!;
      candidates.unshift(last);
    }
  }

  return candidates;
}

export interface ResolveDirectionInput {
  /** האם הקובץ מפריד לעמודות חובה/זכות. */
  hasDebitCredit: boolean;
  /** האם נראה ולו סכום שלילי אחד. */
  sawNegativeAmount: boolean;
  /** האם בכלל נקלטו שורות. */
  hasRows: boolean;
  rule: DirectionRule;
  candidates: DirectionCandidate[];
}

/**
 * מכריע אם הכיוון ידוע, ומאיפה.
 *
 * הסדר: מידע מפורש מהקובץ קודם, ורק אחריו בחירה של המשתמש. אם אין
 * לא זה ולא זה — `unresolved`, והייבוא נעצר.
 */
export function resolveDirection(input: ResolveDirectionInput): DirectionState {
  const base = { rule: input.rule, candidates: input.candidates };

  if (input.hasDebitCredit) {
    return {
      ...base,
      confidence: 'resolved',
      sourceHe: 'עמודות חובה וזכות',
      messageHe: 'הכיוון נקבע לפי עמודות החובה והזכות שבקובץ.',
    };
  }

  if (input.sawNegativeAmount || !input.hasRows) {
    return {
      ...base,
      confidence: 'resolved',
      sourceHe: 'סימן הסכום',
      messageHe: 'הכיוון נקבע לפי הסימן של הסכום — מינוס הוא הוצאה.',
    };
  }

  // כל הסכומים חיוביים ואין עמודות חובה/זכות. בלי הכרעה של המשתמש
  // אין שום דרך אמינה לדעת.
  switch (input.rule.kind) {
    case 'all_expense':
      return {
        ...base,
        confidence: 'resolved',
        sourceHe: 'בחירה שלך: הכל הוצאות',
        messageHe: 'סימנת שכל השורות בקובץ הזה הן הוצאות.',
      };
    case 'all_income':
      return {
        ...base,
        confidence: 'resolved',
        sourceHe: 'בחירה שלך: הכל הכנסות',
        messageHe: 'סימנת שכל השורות בקובץ הזה הן הכנסות.',
      };
    case 'by_column':
      return {
        ...base,
        confidence: 'resolved',
        sourceHe: 'עמודה שבחרת',
        messageHe: `שורה תיחשב הכנסה כשהעמודה שבחרת מכילה "${input.rule.incomeValue}".`,
      };
    default:
      return {
        ...base,
        confidence: 'unresolved',
        sourceHe: 'לא הוכרע',
        messageHe:
          'לא הצלחתי לזהות בוודאות אילו עסקאות הן הכנסות ואילו הוצאות. ' +
          'בקובץ יש עמודת סכום אחת שכל הערכים בה חיוביים, ואין עמודת חובה/זכות. ' +
          'בחר כלל למטה — טעות בכיוון משנה את היתרה פי שניים מהסכום.',
      };
  }
}

/**
 * קובע כיוון לשורה בודדת לפי הכלל שנבחר.
 * מוחזר `null` כשהכלל אינו חל, והשורה נשארת כפי שפוענחה.
 */
export function applyDirectionRule(
  rule: DirectionRule,
  row: string[],
): 'income' | 'expense' | null {
  switch (rule.kind) {
    case 'all_expense':
      return 'expense';
    case 'all_income':
      return 'income';
    case 'by_column': {
      const cell = (row[rule.columnIndex] ?? '').trim().toLowerCase();
      const marker = rule.incomeValue.trim().toLowerCase();
      if (marker === '') return null;
      return cell.includes(marker) ? 'income' : 'expense';
    }
    default:
      return null;
  }
}

/** ניחוש ראשוני לערך שמסמן הכנסה, כדי לחסוך למשתמש הקלדה. */
export function suggestIncomeValue(candidate: DirectionCandidate): string {
  const match = candidate.distinctValues.find((value) =>
    INCOME_MARKERS.some((marker) => value.toLowerCase().includes(marker)),
  );
  return match ?? candidate.distinctValues[0] ?? '';
}
