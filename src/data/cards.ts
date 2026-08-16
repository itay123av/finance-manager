/**
 * קליטת פירוט כרטיס אשראי.
 *
 * ⚠️ שלוש הבטחות שהמודול הזה חייב לקיים:
 *
 *  1. **יתרת הבנק לא משתנה.** פירוט הכרטיס נכתב לטבלה נפרדת ואינו
 *     נוגע ב-`transactions`. הכסף כבר ירד מהחשבון בחיוב המרוכז.
 *  2. **אין ספירה כפולה.** כל עסקה מקושרת לחיוב הבנק שלה, ושכבת
 *     `effectiveSpending` מחליפה את החיוב בפירוט — לא מוסיפה אליו.
 *  3. **הכל הפיך.** לכל קליטה יש `ImportSession`, וביטול מוחק בדיוק
 *     את מה שנקלט ומנתק את הקישורים.
 */

import { TABLE_SCHEMAS } from './schema';
import { allTables, type FinanceDatabase } from './db';
import { newId } from './repositories';
import { parseCardFile, type ParsedCardFile, type ParsedCardRow } from '../import/cardFile';
import { classifyMerchant, learnFromCorrection } from '../import/classify';
import { categoryForIssuerBranch } from '../content/issuerCategories';
import { matchCardTransactionsToCharges, type ChargeMatch } from '../core/cardCharges';
import type { SourceFile } from '../import/types';
import type {
  CardTransaction,
  Category,
  CreditCard,
  ImportSession,
  MerchantRule,
  UUID,
} from '../core/types';

/** ביטחון הסיווג כשהוא מגיע מענף חברת האשראי. */
const ISSUER_BRANCH_CONFIDENCE = 0.85;

// ---------------------------------------------------------------------------
// כרטיסים
// ---------------------------------------------------------------------------

export async function ensureCard(
  db: FinanceDatabase,
  input: { last4: string; issuer: string; nickname?: string },
): Promise<CreditCard> {
  const existing = await db.cards.where('last4').equals(input.last4).first();
  if (existing) return existing;

  const card: CreditCard = {
    id: newId(),
    nickname: input.nickname ?? `כרטיס ${input.last4}`,
    last4: input.last4,
    issuer: input.issuer,
    // כברירת מחדל דביט — זה מה שהנתונים בפועל מראים. ניתן לשינוי.
    chargeMode: 'immediate',
    active: true,
  };
  TABLE_SCHEMAS.cards.parse(card);
  await db.cards.put(card);
  return card;
}

// ---------------------------------------------------------------------------
// סיווג עסקת כרטיס
// ---------------------------------------------------------------------------

export interface CardClassification {
  categoryId: UUID;
  confidence: number;
  sourceHe: string;
}

/**
 * מסווג עסקת כרטיס.
 *
 * סדר העדיפויות: תיקון ידני קודם → ענף חברת האשראי → מילות מפתח.
 * הענף מגיע חינם עם הקובץ והוא סיווג מקצועי, ולכן הוא גובר על ניחוש
 * לפי שם בית העסק — אבל נסוג מפני החלטה מפורשת של המשתמש.
 */
export function classifyCardRow(
  row: ParsedCardRow,
  context: { merchantRules: readonly MerchantRule[]; categories: readonly Category[] },
): CardClassification {
  const learned = context.merchantRules.find(
    (rule) => rule.matchType === 'exact' && rule.merchantNormalized === row.merchantNormalized,
  );
  if (learned) {
    return {
      categoryId: learned.categoryId,
      confidence: Math.min(0.99, 0.6 + 0.1 * learned.correctionCount),
      sourceHe: 'לפי תיקון קודם שלך',
    };
  }

  const fromBranch = categoryForIssuerBranch(row.issuerCategory);
  if (fromBranch && context.categories.some((c) => c.id === fromBranch && !c.archivedAt)) {
    return {
      categoryId: fromBranch,
      confidence: ISSUER_BRANCH_CONFIDENCE,
      sourceHe: `לפי ענף "${row.issuerCategory}" מחברת האשראי`,
    };
  }

  const byKeyword = classifyMerchant(row.merchantNormalized, 'expense', context);
  return {
    categoryId: byKeyword.categoryId,
    confidence: byKeyword.confidence,
    sourceHe: byKeyword.sourceHe,
  };
}

// ---------------------------------------------------------------------------
// תצוגה מקדימה
// ---------------------------------------------------------------------------

export interface CardImportPreview {
  file: ParsedCardFile;
  cardLast4: string | null;
  /** עסקאות אחרי סיווג, לפני כתיבה. */
  rows: (ParsedCardRow & CardClassification & { isDuplicate: boolean })[];
  counts: {
    total: number;
    fresh: number;
    duplicates: number;
    refunds: number;
    installments: number;
    pending: number;
    foreignCurrency: number;
    needsReview: number;
    failed: number;
  };
  totalBilledAgorot: number;
  declaredTotalAgorot: number | null;
  declaredMatches: boolean;
  blockedReason: 'no_card_number' | null;
}

/** מפתח זיהוי כפילות לעסקת כרטיס. */
export function cardDedupeKey(row: {
  purchaseDate: string;
  amountAgorot: number;
  merchantNormalized: string;
}): string {
  return `${row.purchaseDate}|${row.amountAgorot}|${row.merchantNormalized}`;
}

export async function buildCardImportPreview(
  db: FinanceDatabase,
  file: SourceFile,
): Promise<CardImportPreview> {
  const parsed = parseCardFile(file);
  const [categories, merchantRules, existing] = await Promise.all([
    db.categories.toArray(),
    db.merchantRules.toArray(),
    db.cardTransactions.toArray(),
  ]);

  // ספירת מופעים קיימים — שתי קניות זהות באמת אינן כפילות
  const existingCounts = new Map<string, number>();
  for (const transaction of existing) {
    const key = cardDedupeKey(transaction);
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
  }
  const consumed = new Map<string, number>();

  const rows = parsed.rows.map((row) => {
    const key = cardDedupeKey(row);
    const available = (existingCounts.get(key) ?? 0) - (consumed.get(key) ?? 0);
    const isDuplicate = available > 0;
    if (isDuplicate) consumed.set(key, (consumed.get(key) ?? 0) + 1);

    return { ...row, ...classifyCardRow(row, { merchantRules, categories }), isDuplicate };
  });

  const billed = rows.filter((r) => !r.isDuplicate && r.status === 'billed');
  const totalBilled = billed.reduce(
    (sum, r) => sum + (r.isRefund ? -r.amountAgorot : r.amountAgorot),
    0,
  );

  return {
    file: parsed,
    cardLast4: parsed.cardLast4,
    rows,
    counts: {
      total: rows.length,
      fresh: rows.filter((r) => !r.isDuplicate).length,
      duplicates: rows.filter((r) => r.isDuplicate).length,
      refunds: rows.filter((r) => r.isRefund).length,
      installments: rows.filter((r) => r.installmentCount !== undefined).length,
      pending: rows.filter((r) => r.status === 'pending').length,
      foreignCurrency: rows.filter((r) => r.originalCurrency !== undefined).length,
      needsReview: rows.filter((r) => r.confidence < 0.7).length,
      failed: parsed.failures.length,
    },
    totalBilledAgorot: totalBilled,
    declaredTotalAgorot: parsed.declaredTotalAgorot,
    declaredMatches:
      parsed.declaredTotalAgorot === null ||
      Math.abs(parsed.declaredTotalAgorot - totalBilled) <= 1,
    // בלי מספר כרטיס אי אפשר לקשר לחיוב הנכון
    blockedReason: parsed.cardLast4 === null ? 'no_card_number' : null,
  };
}

// ---------------------------------------------------------------------------
// קליטה
// ---------------------------------------------------------------------------

export interface CommitCardImportResult {
  sessionId: UUID;
  cardId: UUID;
  imported: number;
  skipped: number;
  linked: number;
  matches: ChargeMatch[];
}

export async function commitCardImport(
  db: FinanceDatabase,
  preview: CardImportPreview,
  options: { fileName: string; now?: Date } = { fileName: 'card.xlsx' },
): Promise<CommitCardImportResult> {
  if (preview.blockedReason === 'no_card_number') {
    throw new Error('לא זוהה מספר כרטיס בקובץ — בלעדיו אי אפשר לקשר לחיוב בבנק');
  }

  const now = options.now ?? new Date();
  const stamp = now.toISOString();
  const sessionId = newId();

  const card = await ensureCard(db, {
    last4: preview.cardLast4!,
    issuer: preview.file.issuer ?? 'לא ידוע',
  });

  const fresh = preview.rows.filter((r) => !r.isDuplicate);
  const transactions: CardTransaction[] = fresh.map((row) => {
    const transaction: CardTransaction = {
      id: newId(),
      cardId: card.id,
      purchaseDate: row.purchaseDate,
      merchant: row.merchant,
      merchantNormalized: row.merchantNormalized,
      amountAgorot: row.amountAgorot,
      currency: row.currency,
      ...(row.originalAmountAgorot !== undefined
        ? { originalAmountAgorot: row.originalAmountAgorot }
        : {}),
      ...(row.originalCurrency !== undefined ? { originalCurrency: row.originalCurrency } : {}),
      categoryId: row.categoryId,
      ...(row.issuerCategory !== undefined ? { issuerCategory: row.issuerCategory } : {}),
      ...(row.installmentNumber !== undefined
        ? { installmentNumber: row.installmentNumber }
        : {}),
      ...(row.installmentCount !== undefined ? { installmentCount: row.installmentCount } : {}),
      isRefund: row.isRefund,
      status: row.status,
      sourceFile: options.fileName,
      importSessionId: sessionId,
      classificationConfidence: row.confidence,
      userCorrected: false,
      createdAt: stamp,
      updatedAt: stamp,
    };
    TABLE_SCHEMAS.cardTransactions.parse(transaction);
    return transaction;
  });

  const session: ImportSession = {
    id: sessionId,
    fileName: options.fileName,
    fileHash: `card:${preview.cardLast4}:${preview.file.dateRange?.from ?? '-'}:${preview.file.dateRange?.to ?? '-'}`,
    importedAt: stamp,
    rowsTotal: preview.counts.total,
    rowsImported: transactions.length,
    rowsDuplicate: preview.counts.duplicates,
    rowsFailed: preview.counts.failed,
    failures: JSON.stringify(preview.file.failures.slice(0, 50)),
    columnMapping: JSON.stringify({ kind: 'card', last4: preview.cardLast4 }),
    undone: false,
  };
  TABLE_SCHEMAS.importSessions.parse(session);

  const tables = allTables(db);
  await db.transaction('rw', [tables.cardTransactions, tables.importSessions], async () => {
    await tables.importSessions.put(session);
    if (transactions.length > 0) await tables.cardTransactions.bulkPut(transactions);
  });

  const { linked, matches } = await linkCardTransactions(db);

  return {
    sessionId,
    cardId: card.id,
    imported: transactions.length,
    skipped: preview.counts.duplicates,
    linked,
    matches,
  };
}

// ---------------------------------------------------------------------------
// קישור לחיובי הבנק
// ---------------------------------------------------------------------------

/**
 * מקשר עסקאות כרטיס לחיובים בבנק.
 *
 * מקשר רק כשהביטחון `high` או `medium`. במצב `low` יש יותר מצירוף
 * אחד אפשרי, וניחוש שם היה משייך הוצאה לחיוב הלא נכון — ולכן ההכרעה
 * נשארת למשתמש.
 */
export async function linkCardTransactions(
  db: FinanceDatabase,
): Promise<{ linked: number; matches: ChargeMatch[] }> {
  const [bankTransactions, cardTransactions, cards] = await Promise.all([
    db.transactions.toArray(),
    db.cardTransactions.toArray(),
    db.cards.toArray(),
  ]);

  const matches = matchCardTransactionsToCharges({ bankTransactions, cardTransactions, cards });
  const tables = allTables(db);
  let linked = 0;

  await db.transaction('rw', [tables.cardTransactions], async () => {
    for (const match of matches) {
      if (match.confidence !== 'high' && match.confidence !== 'medium') continue;
      for (const id of match.cardTransactionIds) {
        await tables.cardTransactions.update(id, {
          linkedBankTransactionId: match.bankTransactionId,
          billingDate: match.bankDate,
        });
        linked++;
      }
    }
  });

  return { linked, matches };
}

/** מנתק קישור — למשל לפני חישוב מחדש. */
export async function unlinkAll(db: FinanceDatabase): Promise<void> {
  const all = await db.cardTransactions.toArray();
  await db.cardTransactions.bulkPut(
    all.map((t) => {
      const next = { ...t };
      delete next.linkedBankTransactionId;
      delete next.billingDate;
      return next;
    }),
  );
}

// ---------------------------------------------------------------------------
// ביטול ותיקון
// ---------------------------------------------------------------------------

export async function undoCardImport(
  db: FinanceDatabase,
  sessionId: UUID,
): Promise<{ removed: number }> {
  const tables = allTables(db);
  let removed = 0;

  await db.transaction('rw', [tables.cardTransactions, tables.importSessions], async () => {
    const session = await tables.importSessions.get(sessionId);
    if (!session) throw new Error('הייבוא לא נמצא');
    if (session.undone) return;

    removed = await tables.cardTransactions.where('importSessionId').equals(sessionId).delete();
    await tables.importSessions.put({ ...session, undone: true });
  });

  return { removed };
}

/** תיקון קטגוריה של עסקת כרטיס — נלמד בדיוק כמו בעסקה רגילה. */
export async function correctCardCategory(
  db: FinanceDatabase,
  cardTransactionId: UUID,
  categoryId: UUID,
  now: Date = new Date(),
): Promise<{ learned: boolean }> {
  const tables = allTables(db);
  let learned = false;

  await db.transaction('rw', [tables.cardTransactions, tables.merchantRules], async () => {
    const transaction = await tables.cardTransactions.get(cardTransactionId);
    if (!transaction) throw new Error('עסקת הכרטיס לא נמצאה');

    await tables.cardTransactions.put({
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
