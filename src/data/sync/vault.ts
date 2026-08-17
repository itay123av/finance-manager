/**
 * מה נשלח לענן.
 *
 * ⚠️ **השרת לעולם לא רואה נתונים פיננסיים.** הוא מקבל מחרוזת אחת
 * מוצפנת ואין לו את המפתח לפתוח אותה.
 *
 * הפורמט אינו חדש: זהו בדיוק קובץ הגיבוי המוצפן ש-`data/backup.ts`
 * כבר מייצר — AES-GCM עם מפתח שנגזר ב-PBKDF2. זו החלטה מכוונת:
 *
 * - הצפנה שכבר נבדקה ועובדת עדיפה על הצפנה שנייה שנכתבה במיוחד לסנכרון.
 * - מי שיוריד את הבלוב מהענן יכול לשמור אותו כקובץ ולשחזר ממנו — הענן
 *   לא כולא את הנתונים בפורמט שרק הוא יודע לפתוח.
 *
 * ⚠️ **סיסמת הסנכרון נפרדת מסיסמת ההתחברות.** אילו היו זהות, מי
 * ששולט בשרת ההתחברות היה שולט גם במפתח ההצפנה, וכל ההצפנה הייתה
 * הופכת לקישוט. הסיסמה הזו לא עוזבת את המכשיר ולא נשמרת — לא ב-
 * IndexedDB, לא ב-localStorage.
 *
 * ⚠️ **אין שחזור סיסמה.** בלעדיה הבלוב אבוד. זה המחיר של הצפנה
 * אמיתית, וחייבים לומר אותו למשתמש לפני שהוא בוחר סיסמה, לא אחרי.
 */

import { serializeBackup, readBackup, collectBackupData, BackupError } from '../backup';
import { CURRENT_SCHEMA_VERSION } from '../schema';
import type { BackupData } from '../schema';
import type { FinanceDatabase } from '../db';

/**
 * אורך מינימלי לסיסמת סנכרון.
 *
 * ארוך מ-PIN הנעילה (4–6 ספרות) בכוונה: ה-PIN מגן על מכשיר שנמצא
 * פיזית בידיים, וניחושים בו איטיים. הסיסמה הזו מגנה על בלוב שאפשר
 * להוריד ולתקוף אותו במעבדה, בקצב של מיליוני ניחושים.
 */
export const MIN_SYNC_PASSPHRASE_LENGTH = 10;

/**
 * תקרת גודל לבלוב, מתחת למגבלת העמודה במסד (20MB).
 *
 * ⚠️ עדיף להיכשל כאן עם הודעה בעברית מאשר לקבל שגיאת Postgres
 * באמצע העלאה ולא לדעת אם נשמר משהו.
 */
export const MAX_VAULT_BYTES = 15_000_000;

export class VaultError extends Error {
  constructor(
    message: string,
    readonly reason:
      | 'weak_passphrase'
      | 'not_encrypted'
      | 'too_large'
      | 'bad_passphrase'
      | 'malformed',
  ) {
    super(message);
    this.name = 'VaultError';
  }
}

export function isValidSyncPassphrase(passphrase: string): boolean {
  return passphrase.trim().length >= MIN_SYNC_PASSPHRASE_LENGTH;
}

/**
 * ⚠️ הבדיקה שמונעת את התקלה החמורה ביותר האפשרית כאן.
 *
 * `serializeBackup` מייצר קובץ **קריא** כשלא מועברת סיסמה. אם באג
 * עתידי יבליע את הסיסמה בדרך, התוצאה תיראה תקינה לחלוטין — מחרוזת
 * JSON שנשלחת בהצלחה — ורק תוכנה יהיה כל ההיסטוריה הפיננסית בטקסט
 * גלוי על שרת. לכן לא מסתמכים על כך שהקריאה נכונה, אלא בודקים את
 * התוצר עצמו לפני שהוא עוזב את המכשיר.
 */
function assertEncrypted(serialized: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new VaultError('הכנת הנתונים לסנכרון נכשלה', 'malformed');
  }

  const isEncrypted =
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { encrypted?: unknown }).encrypted === true &&
    typeof (parsed as { payload?: unknown }).payload === 'string';

  if (!isEncrypted) {
    throw new VaultError('הנתונים לא הוצפנו — הסנכרון בוטל', 'not_encrypted');
  }

  // גם אם הדגל אומר "מוצפן" — הנתונים הגולמיים לא אמורים להימצא כאן.
  if ('data' in (parsed as object)) {
    throw new VaultError('הנתונים לא הוצפנו — הסנכרון בוטל', 'not_encrypted');
  }
}

export interface VaultPayload {
  /** מה שנשלח לשרת. אטום מבחוץ. */
  ciphertext: string;
  schemaVersion: number;
  /** מספר הרשומות שנארזו — לתצוגה למשתמש, לא נשלח לשרת. */
  totalRecords: number;
}

/** אורז את כל בסיס הנתונים לבלוב מוצפן אחד. */
export async function buildVault(
  db: FinanceDatabase,
  passphrase: string,
  now: Date = new Date(),
): Promise<VaultPayload> {
  if (!isValidSyncPassphrase(passphrase)) {
    throw new VaultError(
      `סיסמת הסנכרון חייבת להיות באורך ${MIN_SYNC_PASSPHRASE_LENGTH} תווים לפחות`,
      'weak_passphrase',
    );
  }

  const data = await collectBackupData(db);
  const ciphertext = await serializeBackup(data, { password: passphrase, now });

  assertEncrypted(ciphertext);

  if (ciphertext.length > MAX_VAULT_BYTES) {
    throw new VaultError('הנתונים גדולים מדי לסנכרון. גבה לקובץ במקום.', 'too_large');
  }

  return {
    ciphertext,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    totalRecords: Object.values(data).reduce((sum, rows) => sum + (rows as unknown[]).length, 0),
  };
}

/**
 * פותח בלוב שהתקבל מהענן.
 *
 * ⚠️ מחזיר נתונים בלבד — **לא כותב לבסיס הנתונים.** הכתיבה נשארת
 * ב-`restoreBackup`, אחרי שהמשתמש ראה תצוגה מקדימה ואישר. פונקציה
 * שגם מפענחת וגם דורסת הייתה הופכת כל טעות בקריאה למחיקת נתונים.
 */
export async function openVault(ciphertext: string, passphrase: string): Promise<BackupData> {
  try {
    return await readBackup(ciphertext, passphrase);
  } catch (error) {
    if (error instanceof BackupError) {
      if (error.reason === 'bad_password') {
        throw new VaultError('סיסמת הסנכרון שגויה', 'bad_passphrase');
      }
      throw new VaultError(error.message, 'malformed');
    }
    throw error;
  }
}
