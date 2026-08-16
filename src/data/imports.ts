/**
 * קליטת ייבוא וביטולו.
 *
 * שני עקרונות:
 *  1. **הכל או כלום** — הקליטה מתבצעת בטרנזקציה אחת. ייבוא שנכשל
 *     באמצע ומשאיר חצי חודש בפנים גרוע מייבוא שנכשל לגמרי.
 *  2. **ייבוא רק מוסיף** — עסקאות קיימות לא משתנות ולא נמחקות לעולם.
 *     לכן ביטול הוא פעולה בטוחה ומדויקת.
 */

import { TABLE_SCHEMAS } from './schema';
import { allTables, type FinanceDatabase } from './db';
import { newId, saveSettings } from './repositories';
import { learnFromCorrection } from '../import/classify';
import type { ClassifiedRow, ColumnMapping, ImportPreview } from '../import/types';
import type { ImportSession, Transaction, UUID } from '../core/types';

export interface CommitImportInput {
  preview: ImportPreview;
  accountId: UUID;
  /** מזהי השורות שהמשתמש בחר לקלוט, לפי `dedupeKey` + מיקום. */
  selectedLines: ReadonlySet<number>;
  now?: Date;
}

export interface CommitImportResult {
  sessionId: UUID;
  imported: number;
  skipped: number;
}

function toTransaction(
  row: ClassifiedRow,
  accountId: UUID,
  sessionId: UUID,
  stamp: string,
): Transaction {
  const transaction: Transaction = {
    id: newId(),
    accountId,
    date: row.date,
    amountAgorot: row.amountAgorot,
    type: row.type,
    merchant: row.merchant,
    merchantNormalized: row.merchantNormalized,
    categoryId: row.categoryId,
    paymentMethod: '',
    recurrence: 'one_time',
    planned: false,
    source: 'file',
    importSessionId: sessionId,
    classificationConfidence: row.categoryConfidence,
    userCorrected: false,
    status: 'actual',
    kind: 'normal',
    importHash: row.dedupeKey,
    createdAt: stamp,
    updatedAt: stamp,
  };
  TABLE_SCHEMAS.transactions.parse(transaction);
  return transaction;
}

export async function commitImport(
  db: FinanceDatabase,
  input: CommitImportInput,
): Promise<CommitImportResult> {
  const { preview, accountId, selectedLines } = input;

  // ⚠️ שכבת הגנה אחרונה. הממשק כבר חוסם את הכפתור, אבל קליטה עם כיוון
  // לא מוכרע הייתה משנה את היתרה בכיוון ההפוך — ולכן היא נחסמת גם כאן.
  if (preview.blockedReason === 'unresolved_direction') {
    throw new Error('אי אפשר לקלוט לפני שנקבע מה הכנסה ומה הוצאה');
  }
  if (preview.blockedReason === 'credit_card_file') {
    throw new Error('פירוט כרטיס אשראי לא נקלט לחשבון בנק — זה היה סופר כל רכישה פעמיים');
  }
  const now = input.now ?? new Date();
  const stamp = now.toISOString();
  const sessionId = newId();

  const chosen = preview.rows.filter((row) => selectedLines.has(row.sourceLine));
  const transactions = chosen.map((row) => toTransaction(row, accountId, sessionId, stamp));

  const session: ImportSession = {
    id: sessionId,
    fileName: preview.fileName,
    // מזהה את הקובץ בלי לשמור את תוכנו
    fileHash: `${preview.format}:${preview.counts.total}:${preview.dateRange?.from ?? '-'}:${preview.dateRange?.to ?? '-'}`,
    importedAt: stamp,
    rowsTotal: preview.counts.total,
    rowsImported: transactions.length,
    rowsDuplicate: preview.counts.exactDuplicates,
    rowsFailed: preview.counts.failed,
    failures: JSON.stringify(preview.failures.slice(0, 100)),
    columnMapping: JSON.stringify(preview.mapping),
    undone: false,
  };
  TABLE_SCHEMAS.importSessions.parse(session);

  const tables = allTables(db);
  await db.transaction('rw', [tables.transactions, tables.importSessions], async () => {
    await tables.importSessions.put(session);
    if (transactions.length > 0) await tables.transactions.bulkPut(transactions);
  });

  await saveSettings(db, { lastAccountId: accountId });

  return {
    sessionId,
    imported: transactions.length,
    skipped: preview.rows.length - transactions.length,
  };
}

/**
 * מבטל ייבוא.
 *
 * מוחק **בדיוק** את העסקאות של אותו ייבוא, לפי `importSessionId`.
 * עסקאות שהוזנו ידנית או הגיעו מייבוא אחר לא נוגעים בהן.
 */
export async function undoImport(
  db: FinanceDatabase,
  sessionId: UUID,
): Promise<{ removed: number }> {
  const tables = allTables(db);
  let removed = 0;

  await db.transaction('rw', [tables.transactions, tables.importSessions], async () => {
    const session = await tables.importSessions.get(sessionId);
    if (!session) throw new Error('הייבוא לא נמצא');
    if (session.undone) return;

    removed = await tables.transactions.where('importSessionId').equals(sessionId).delete();
    await tables.importSessions.put({ ...session, undone: true });
  });

  return { removed };
}

export async function listImportSessions(db: FinanceDatabase): Promise<ImportSession[]> {
  const sessions = await db.importSessions.toArray();
  return sessions.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

// ---------------------------------------------------------------------------
// זיכרון מיפוי העמודות
// ---------------------------------------------------------------------------

/**
 * שולף מיפוי שנשמר לקובץ עם אותה חתימת כותרות, כדי שהקובץ הבא
 * מאותו בנק לא ידרוש מיפוי ידני שוב.
 */
export async function findSavedMapping(
  db: FinanceDatabase,
  signature: string,
): Promise<ColumnMapping | null> {
  const sessions = await listImportSessions(db);
  for (const session of sessions) {
    try {
      const mapping = JSON.parse(session.columnMapping) as ColumnMapping;
      if (mapping.signature === signature) return mapping;
    } catch {
      // מיפוי פגום מייבוא ישן — מדלגים ומנסים את הבא
      continue;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// תיקון קטגוריה + למידה
// ---------------------------------------------------------------------------

/**
 * מתקן קטגוריה של עסקה **ולומד מזה**.
 *
 * זו הפעולה שהופכת את הסיווג האוטומטי לשימושי: אחרי שני-שלושה
 * תיקונים לאותו בית עסק, כל עסקה עתידית ממנו כבר תסווג נכון.
 */
export async function correctCategoryAndLearn(
  db: FinanceDatabase,
  transactionId: UUID,
  categoryId: UUID,
  now: Date = new Date(),
): Promise<{ learned: boolean }> {
  const tables = allTables(db);
  let learned = false;

  await db.transaction('rw', [tables.transactions, tables.merchantRules], async () => {
    const transaction = await tables.transactions.get(transactionId);
    if (!transaction) throw new Error('העסקה לא נמצאה');

    await tables.transactions.put({
      ...transaction,
      categoryId,
      userCorrected: true,
      classificationConfidence: 1,
      updatedAt: now.toISOString(),
    });

    const existing = await tables.merchantRules.toArray();
    const result = learnFromCorrection(existing, {
      merchantNormalized: transaction.merchantNormalized,
      categoryId,
      now: now.toISOString(),
      newId,
    });
    if (result) {
      TABLE_SCHEMAS.merchantRules.parse(result.rule);
      await tables.merchantRules.put(result.rule);
      learned = true;
    }
  });

  return { learned };
}

/** עסקאות שהסיווג שלהן לא בטוח — הרשימה ש"כדאי לעבור עליה". */
export async function countNeedingReview(db: FinanceDatabase): Promise<number> {
  return db.transactions.filter((t) => !t.userCorrected && t.classificationConfidence < 0.7).count();
}
