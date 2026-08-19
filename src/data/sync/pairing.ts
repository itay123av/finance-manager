/**
 * הפעלת סנכרון וחיבור מכשיר — בלי אימייל ובלי סיסמאות.
 *
 * שני מסלולים, ורק אחד מהם דורש הקלדה:
 *
 * - **`startSync`** — המכשיר הראשון. מגריל קוד, יוצר איתו חשבון
 *   ושומר אותו. המשתמש לא מקליד דבר; הוא רק מעתיק את הקוד למכשיר
 *   הבא כשהוא רוצה.
 * - **`connectWithCode`** — המכשיר השני. מקבל את הקוד ומגיע לאותו
 *   חשבון בדיוק ולאותו מפתח הצפנה.
 *
 * ⚠️ הקוד נשמר במכשיר כדי שאפשר יהיה להציג אותו שוב. בלי זה, מי
 * שיסגור את המסך לפני שהעתיק אותו יאבד את היכולת לחבר מכשיר נוסף
 * — והדרך היחידה חזרה הייתה למחוק את הענן ולהתחיל מחדש.
 */

import { generatePairingCode, isValidPairingCode, normalizePairingCode } from '../../core/pairingCode';
import { deriveIdentity } from './identity';
import { currentSession, signIn, signUp, SyncError } from './client';
import { readSyncState, rememberPassphrase, writeSyncState } from './state';
import type { FinanceDatabase } from '../db';

/**
 * מוודא שיש סשן פעיל, ומחדש אותו לבד מהקוד השמור.
 *
 * ⚠️ **בלי זה, פקיעת סשן נראית למשתמש כמו "האפליקציה שכחה אותי".**
 *
 * הקוד שמור במכשיר, כלומר כל מה שצריך כדי להתחבר מחדש כבר נמצא
 * כאן. לבקש מהמשתמש להדביק אותו שוב זה לבקש ממנו לעשות ידנית
 * משהו שהמכשיר יכול לעשות לבד — והתוצאה המעשית היא שהוא לא יעשה
 * את זה, והסנכרון ייפסק בשקט.
 *
 * מחזיר `false` כשאין קוד שמור (כלומר המכשיר באמת לא מחובר), או
 * כשההתחברות נכשלה — למשל בלי רשת. בשני המקרים אין שגיאה למשתמש:
 * הנתונים המקומיים שלמים והאפליקציה עובדת.
 */
export async function ensureSession(db: FinanceDatabase): Promise<boolean> {
  if (await currentSession()) return true;

  const { pairingCode } = await readSyncState(db);
  if (!pairingCode) return false;

  try {
    const identity = await deriveIdentity(pairingCode);
    await signIn(identity.email, identity.password);
    return true;
  } catch {
    return false;
  }
}

export class PairingError extends Error {
  constructor(
    message: string,
    readonly reason: 'invalid_code' | 'unknown_code' | 'network',
  ) {
    super(message);
    this.name = 'PairingError';
  }
}

async function persist(db: FinanceDatabase, code: string, passphrase: string): Promise<void> {
  await rememberPassphrase(db, passphrase);
  await writeSyncState(db, { enabled: true, pairingCode: code });
}

/**
 * מפעיל סנכרון במכשיר הראשון.
 *
 * ⚠️ אם כבר קיים חשבון לקוד שהוגרל — מקרה שהסיכוי לו זניח אבל לא
 * אפסי — פשוט מתחברים אליו. עדיף מלהיכשל בפני המשתמש על אירוע
 * שהוא לא גרם לו ולא יכול להבין.
 */
export async function startSync(db: FinanceDatabase): Promise<string> {
  const code = generatePairingCode(crypto.getRandomValues(new Uint8Array(32)));
  const identity = await deriveIdentity(code);

  try {
    await signUp(identity.email, identity.password);
  } catch (error) {
    if (error instanceof SyncError && error.reason === 'auth') {
      await signIn(identity.email, identity.password);
    } else {
      throw error;
    }
  }

  await persist(db, code, identity.passphrase);
  return code;
}

/**
 * מחבר מכשיר נוסף לחשבון קיים.
 *
 * ⚠️ קוד שאין לו חשבון נכשל במפורש ואינו יוצר חשבון חדש. אחרת
 * טעות הקלדה אחת הייתה מייצרת חשבון ריק, המשתמש היה רואה "סונכרן
 * בהצלחה" מול אפס עסקאות, ומסיק שהנתונים שלו נמחקו.
 */
export async function connectWithCode(db: FinanceDatabase, rawCode: string): Promise<void> {
  if (!isValidPairingCode(rawCode)) {
    throw new PairingError('הקוד אינו בפורמט הנכון', 'invalid_code');
  }

  const code = normalizePairingCode(rawCode);
  const identity = await deriveIdentity(code);

  try {
    await signIn(identity.email, identity.password);
  } catch (error) {
    if (error instanceof SyncError && error.reason === 'auth') {
      throw new PairingError('לא נמצא חשבון עם הקוד הזה. בדוק שהעתקת אותו נכון.', 'unknown_code');
    }
    throw error;
  }

  await persist(db, code, identity.passphrase);
}
