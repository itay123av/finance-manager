/**
 * "האם השתנה כאן משהו מאז הסנכרון האחרון?"
 *
 * ⚠️ התשובה נמדדת מ**תוכן** ולא מחותמת זמן, וזו החלטה מכוונת.
 *
 * הדרך המקובלת היא לעדכן `updatedAt` בכל כתיבה. הבעיה: מספיק מסלול
 * כתיבה אחד ששוכח לעדכן — ייבוא, ביטול ייבוא, שחזור — כדי שהמערכת
 * תחשוב "לא השתנה כלום", תמשוך מהענן ותדרוס נתונים אמיתיים. טביעת
 * אצבע של התוכן לא יכולה לשכוח.
 *
 * המחיר: חישוב hash על כל הנתונים. במידה של אלפי עסקאות זה אלפיות
 * שנייה, והוא רץ רק כשבודקים סנכרון — לא בכל רינדור.
 *
 * טעות לכיוון "השתנה" (למשל סדר שורות שונה) גורמת להעלאה מיותרת.
 * טעות לכיוון "לא השתנה" הייתה גורמת לאובדן נתונים. ההטיה כאן היא
 * לכיוון הבטוח.
 */

import { collectBackupData } from '../backup';
import { SYNC_STATE_ID, type FinanceDatabase, type SyncStateRow } from '../db';
import type { SyncState } from '../../core/syncDecision';

const EMPTY_STATE: SyncStateRow = {
  id: SYNC_STATE_ID,
  enabled: false,
  lastSyncedRemoteAt: null,
  lastSyncedLocalHash: null,
  lastSyncedAt: null,
};

export async function readSyncState(db: FinanceDatabase): Promise<SyncStateRow> {
  return (await db.syncState.get(SYNC_STATE_ID)) ?? EMPTY_STATE;
}

export async function writeSyncState(
  db: FinanceDatabase,
  patch: Partial<Omit<SyncStateRow, 'id'>>,
): Promise<SyncStateRow> {
  const next: SyncStateRow = { ...(await readSyncState(db)), ...patch, id: SYNC_STATE_ID };
  await db.syncState.put(next);
  return next;
}

/** מכבה סנכרון ומוחק את נקודת הייחוס. הנתונים עצמם לא נוגעים. */
export async function disableSync(db: FinanceDatabase): Promise<void> {
  await db.syncState.put({ ...EMPTY_STATE });
}

// ---------------------------------------------------------------------------
// טביעת אצבע
// ---------------------------------------------------------------------------

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface LocalFingerprint {
  hash: string;
  /** `true` כשאין שום נתונים — לא רק "לא השתנה". */
  empty: boolean;
}

/**
 * טביעת אצבע של כל הנתונים המקומיים.
 *
 * ⚠️ חד־כיוונית. ה-hash נשמר במכשיר בלבד ואינו נשלח לענן — אחרת
 * שני מכשירים עם אותם נתונים היו חושפים לשרת שהם זהים.
 */
export async function localFingerprint(db: FinanceDatabase): Promise<LocalFingerprint> {
  const data = await collectBackupData(db);
  const total = Object.values(data).reduce((sum, rows) => sum + (rows as unknown[]).length, 0);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data)));
  return { hash: toHex(digest), empty: total === 0 };
}

/**
 * מתרגם את מצב המכשיר לקלט של `decideSync`.
 *
 * ⚠️ אין כאן שעון מקומי בכוונה. השאלה "האם השתנה כאן משהו" נענית
 * בהשוואת טביעות אצבע בלבד, ולכן שעון מכשיר שמפגר או ממהר אינו
 * יכול להשפיע על ההחלטה. ראה ההסבר ב-`core/syncDecision`.
 */
export async function buildSyncInput(
  db: FinanceDatabase,
  remoteUpdatedAt: string | null,
): Promise<{ state: SyncState; fingerprint: LocalFingerprint }> {
  const stored = await readSyncState(db);
  const fingerprint = await localFingerprint(db);

  const unchanged =
    stored.lastSyncedLocalHash !== null && stored.lastSyncedLocalHash === fingerprint.hash;

  return {
    state: {
      hasLocalData: !fingerprint.empty,
      localChanged: !unchanged,
      remoteUpdatedAt,
      lastSyncedRemoteAt: stored.lastSyncedRemoteAt,
    },
    fingerprint,
  };
}

/** רושם סנכרון מוצלח. מכאן ואילך זו נקודת הייחוס. */
export async function recordSyncSuccess(
  db: FinanceDatabase,
  remoteUpdatedAt: string,
  now: Date = new Date(),
): Promise<void> {
  // ⚠️ ה-hash נמדד **אחרי** הפעולה: במשיכה הנתונים המקומיים זה עתה
  // הוחלפו, ושמירת ה-hash שלפניה הייתה מסמנת אותם כ"שונים" מיד.
  const { hash } = await localFingerprint(db);
  await writeSyncState(db, {
    enabled: true,
    lastSyncedRemoteAt: remoteUpdatedAt,
    lastSyncedLocalHash: hash,
    lastSyncedAt: now.toISOString(),
  });
}
