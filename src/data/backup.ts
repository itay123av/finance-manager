/**
 * גיבוי, שחזור ומחיקה.
 *
 * בארכיטקטורה מקומית לחלוטין, אובדן המכשיר הוא נקודת הכשל היחידה
 * האמיתית. לכן הגיבוי נבנה **לפני** שנוגעים בנתונים אמיתיים, ולא אחרי.
 *
 * ⚠️ קובץ גיבוי לא מוצפן מכיל את כל ההיסטוריה הפיננסית בטקסט קריא.
 * אם הוא נשמר בענן או נשלח באימייל, הוא עוזב את המכשיר. ההצפנה כאן
 * היא AES-GCM עם מפתח שנגזר מסיסמה ב-PBKDF2 — הסיסמה עצמה לעולם
 * אינה נשמרת בשום מקום, וללא הסיסמה הקובץ אינו ניתן לשחזור.
 */

import {
  BACKUP_FORMAT,
  CURRENT_SCHEMA_VERSION,
  backupDataSchema,
  backupFileSchema,
  backupRecordSchema,
  type BackupData,
  type BackupFile,
} from './schema';
import { allTables, type FinanceDatabase } from './db';
import type { BackupRecord, ISODate } from '../core/types';

export const PBKDF2_ITERATIONS = 600_000;

// ---------------------------------------------------------------------------
// קידוד
// ---------------------------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---------------------------------------------------------------------------
// ייצוא
// ---------------------------------------------------------------------------

export async function collectBackupData(db: FinanceDatabase): Promise<BackupData> {
  const tables = allTables(db);
  const [
    accounts,
    transactions,
    categories,
    goals,
    expectedIncomes,
    plannedExpenses,
    recurring,
    merchantRules,
    importSessions,
    budgets,
    settings,
  ] = await Promise.all([
    tables.accounts.toArray(),
    tables.transactions.toArray(),
    tables.categories.toArray(),
    tables.goals.toArray(),
    tables.expectedIncomes.toArray(),
    tables.plannedExpenses.toArray(),
    tables.recurring.toArray(),
    tables.merchantRules.toArray(),
    tables.importSessions.toArray(),
    tables.budgets.toArray(),
    tables.settings.toArray(),
  ]);

  return backupDataSchema.parse({
    accounts,
    transactions,
    categories,
    goals,
    expectedIncomes,
    plannedExpenses,
    recurring,
    merchantRules,
    importSessions,
    budgets,
    settings,
  });
}

export interface ExportOptions {
  /** כשמסופקת — הקובץ יוצפן ולא ניתן יהיה לפתוח אותו בלעדיה. */
  password?: string;
  now?: Date;
}

export async function exportBackup(
  db: FinanceDatabase,
  options: ExportOptions = {},
): Promise<string> {
  return serializeBackup(await collectBackupData(db), options);
}

/**
 * הופך נתונים שכבר נאספו לקובץ גיבוי.
 *
 * מופרד מ-`exportBackup` כדי ש-`createBackup` לא יקרא את כל בסיס
 * הנתונים פעמיים — על 20,000 עסקאות זה ההבדל בין מהיר לצורם.
 */
export async function serializeBackup(
  data: BackupData,
  options: ExportOptions = {},
): Promise<string> {
  const createdAt = (options.now ?? new Date()).toISOString();

  if (!options.password) {
    const file: BackupFile = {
      format: BACKUP_FORMAT,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt,
      encrypted: false,
      data,
    };
    return JSON.stringify(file, null, 2);
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(options.password, salt, PBKDF2_ITERATIONS);
  const cipherText = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(JSON.stringify(data)),
  );

  const file: BackupFile = {
    format: BACKUP_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt,
    encrypted: true,
    kdf: {
      name: 'PBKDF2',
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
      salt: toBase64(salt),
    },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    payload: toBase64(new Uint8Array(cipherText)),
  };
  return JSON.stringify(file, null, 2);
}

export function backupFileName(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `backup-${stamp}.json`;
}

// ---------------------------------------------------------------------------
// יומן גיבויים
// ---------------------------------------------------------------------------

export interface CreateBackupOptions {
  password?: string;
  reason?: BackupRecord['reason'];
  now?: Date;
}

export interface CreatedBackup {
  content: string;
  fileName: string;
  record: BackupRecord;
}

/**
 * מייצר גיבוי **ורושם אותו ביומן** — פעולה אחת, לא שתיים.
 *
 * ⚠️ הפרדה בין השתיים הייתה מייצרת את התקלה השקטה הגרועה ביותר כאן:
 * גיבוי שנוצר, ותזכורת שממשיכה לטעון שלא גיבית — עד שהמשתמש לומד
 * להתעלם ממנה.
 *
 * ⚠️ כשיש סיסמה, ה-plaintext קיים בזיכרון בלבד. שום שלב ביניים אינו
 * נכתב לדיסק: מה שחוזר מכאן הוא כבר הקובץ המוצפן.
 */
export async function createBackup(
  db: FinanceDatabase,
  options: CreateBackupOptions = {},
): Promise<CreatedBackup> {
  const now = options.now ?? new Date();
  const data = await collectBackupData(db);
  const encrypted = Boolean(options.password);

  const content = await serializeBackup(data, {
    ...(options.password ? { password: options.password } : {}),
    now,
  });

  const record = backupRecordSchema.parse({
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    rowCounts: Object.fromEntries(
      Object.entries(data).map(([table, rows]) => [table, (rows as unknown[]).length]),
    ),
    encrypted,
    reason: options.reason ?? 'manual',
  }) as BackupRecord;

  await db.backupRecords.put(record);
  return { content, fileName: backupFileName(now), record };
}

/** תאריך הגיבוי האחרון, או `null` אם אין. הקלט של תזכורת הגיבוי. */
export async function lastBackupDate(db: FinanceDatabase): Promise<ISODate | null> {
  const records = await db.backupRecords.toArray();
  return (
    records
      .map((r) => r.createdAt.slice(0, 10) as ISODate)
      .sort()
      .pop() ?? null
  );
}

// ---------------------------------------------------------------------------
// קריאה ותצוגה מקדימה
// ---------------------------------------------------------------------------

export class BackupError extends Error {
  constructor(
    message: string,
    readonly reason: 'malformed' | 'wrong_format' | 'unsupported_version' | 'bad_password',
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

export interface BackupPreview {
  createdAt: string;
  schemaVersion: number;
  encrypted: boolean;
  counts: Record<string, number>;
  totalRecords: number;
}

function parseFile(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('הקובץ אינו קובץ גיבוי תקין', 'malformed');
  }

  const parsed = backupFileSchema.safeParse(raw);
  if (!parsed.success) {
    const hasFormat =
      typeof raw === 'object' && raw !== null && 'format' in raw && raw.format === BACKUP_FORMAT;
    throw new BackupError(
      hasFormat ? 'מבנה הגיבוי אינו תקין' : 'זה לא נראה כמו קובץ גיבוי של המערכת',
      hasFormat ? 'malformed' : 'wrong_format',
    );
  }

  if (parsed.data.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new BackupError(
      `הגיבוי נוצר בגרסה חדשה יותר (${parsed.data.schemaVersion}). עדכן את האפליקציה ונסה שוב.`,
      'unsupported_version',
    );
  }
  return parsed.data;
}

/** קורא את הגיבוי ומחזיר את התוכן, בלי לגעת בבסיס הנתונים. */
export async function readBackup(text: string, password?: string): Promise<BackupData> {
  const file = parseFile(text);
  if (!file.encrypted) return file.data;

  if (!password) throw new BackupError('הגיבוי מוצפן — נדרשת סיסמה', 'bad_password');

  const key = await deriveKey(password, fromBase64(file.kdf.salt), file.kdf.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(file.cipher.iv) as BufferSource },
      key,
      fromBase64(file.payload) as BufferSource,
    );
  } catch {
    // AES-GCM מאמת את התוכן, ולכן סיסמה שגויה נכשלת כאן ולא מאוחר יותר.
    throw new BackupError('הסיסמה שגויה, או שהקובץ פגום', 'bad_password');
  }

  const decoded = backupDataSchema.safeParse(JSON.parse(new TextDecoder().decode(plain)));
  if (!decoded.success) throw new BackupError('תוכן הגיבוי אינו תקין', 'malformed');
  return decoded.data;
}

/** תצוגה מקדימה — המשתמש רואה מה עומד להשתחזר לפני שהוא מאשר. */
export async function previewBackup(text: string, password?: string): Promise<BackupPreview> {
  const file = parseFile(text);
  const data = await readBackup(text, password);
  const counts = Object.fromEntries(
    Object.entries(data).map(([table, rows]) => [table, (rows as unknown[]).length]),
  );
  return {
    createdAt: file.createdAt,
    schemaVersion: file.schemaVersion,
    encrypted: file.encrypted,
    counts,
    totalRecords: Object.values(counts).reduce((a, b) => a + b, 0),
  };
}

// ---------------------------------------------------------------------------
// שחזור
// ---------------------------------------------------------------------------

/**
 * מחליף את כל התוכן בנתוני הגיבוי.
 *
 * מתבצע בטרנזקציה אחת: אם משהו נכשל באמצע, שום דבר לא משתנה.
 * שחזור חלקי היה גרוע מכישלון — הוא היה נראה כמו הצלחה.
 */
export async function restoreBackup(
  db: FinanceDatabase,
  data: BackupData,
): Promise<{ restored: number }> {
  const tables = allTables(db);
  const list = Object.values(tables);

  let restored = 0;
  await db.transaction('rw', list, async () => {
    await Promise.all(list.map((t) => t.clear()));
    for (const [name, rows] of Object.entries(data)) {
      // הטבלאות הן איחוד של טיפוסים שונים; הרשומות כבר עברו ולידציית Zod
      // מול הסכמה של אותה טבלה, ולכן ההמרה כאן בטוחה.
      const table = tables[name as keyof typeof tables] as unknown as {
        bulkPut(records: unknown[]): Promise<unknown>;
      };
      const records = rows as unknown[];
      if (records.length > 0) {
        await table.bulkPut(records);
        restored += records.length;
      }
    }
  });
  return { restored };
}

export async function restoreFromText(
  db: FinanceDatabase,
  text: string,
  password?: string,
): Promise<{ restored: number }> {
  return restoreBackup(db, await readBackup(text, password));
}
