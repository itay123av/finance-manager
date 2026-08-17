/**
 * הרכבת הסנכרון: החלטה → הצפנה → רשת → רישום.
 *
 * ⚠️ שלושה כללים שכל הקובץ הזה בנוי סביבם:
 *
 * 1. **משיכה לעולם לא כותבת בלי אישור.** `preparePull` מפענח ומחזיר
 *    תצוגה מקדימה; `applyPull` הוא זה שדורס — ורק אחרי שהמשתמש ראה
 *    כמה רשומות עומדות להיכנס במקום מה שיש לו.
 * 2. **לפני דריסה נוצר גיבוי מקומי.** אם המשיכה תתברר כטעות, יש ממה
 *    לחזור. גיבוי שנוצר אחרי הדריסה הוא חסר ערך.
 * 3. **התנגשות לא נפתרת מעצמה.** `autoSync` מבצע רק את מה
 *    ש-`isSafeToAutoSync` מאשר, ועוצר בכל מקרה אחר.
 */

import { decideSync, isSafeToAutoSync, type SyncDecision } from '../../core/syncDecision';
import { createBackup, restoreBackup } from '../backup';
import type { BackupData } from '../schema';
import type { FinanceDatabase } from '../db';
import { buildVault, openVault } from './vault';
import {
  fetchRemoteTimestamp,
  fetchRemoteVault,
  pushVault,
  currentSession,
  SyncError,
} from './client';
import { buildSyncInput, readSyncState, recordSyncSuccess } from './state';

export interface SyncStatus {
  decision: SyncDecision;
  remoteUpdatedAt: string | null;
  lastSyncedAt: string | null;
  enabled: boolean;
  signedIn: boolean;
}

/**
 * בודק מה המצב — **בלי להוריד את הבלוב ובלי לפענח כלום.**
 *
 * זו הפעולה שרצה בפתיחת האפליקציה, ולכן היא זולה בכוונה: שאילתה
 * אחת שמחזירה חותמת זמן.
 *
 * ⚠️ אין כאן פרמטר `now` בכוונה. ההחלטה אינה תלויה בשעון המכשיר,
 * ומי שיוסיף שעון לכאן יחזיר את באג הפגור־שעון שתואר ב-`syncDecision`.
 */
export async function checkSync(db: FinanceDatabase): Promise<SyncStatus> {
  const stored = await readSyncState(db);
  const session = await currentSession();

  if (!session) {
    return {
      decision: { action: 'nothing', automatic: false, reasonHe: 'לא מחובר לחשבון סנכרון.' },
      remoteUpdatedAt: null,
      lastSyncedAt: stored.lastSyncedAt,
      enabled: stored.enabled,
      signedIn: false,
    };
  }

  const remoteUpdatedAt = await fetchRemoteTimestamp();
  const { state } = await buildSyncInput(db, remoteUpdatedAt);

  return {
    decision: decideSync(state),
    remoteUpdatedAt,
    lastSyncedAt: stored.lastSyncedAt,
    enabled: stored.enabled,
    signedIn: true,
  };
}

// ---------------------------------------------------------------------------
// העלאה
// ---------------------------------------------------------------------------

export interface PushResult {
  remoteUpdatedAt: string;
  totalRecords: number;
}

/**
 * מעלה את המצב המקומי לענן.
 *
 * ⚠️ מעלה **מצב מלא**, לא שינויים. זה מייקר את ההעלאה, אבל מונע את
 * מחלקת הבאגים הגרועה ביותר בסנכרון: שינוי שאבד בדרך ומשאיר את שני
 * הצדדים בטוחים שהם מסונכרנים.
 */
export async function push(
  db: FinanceDatabase,
  passphrase: string,
  options: { deviceLabel?: string; now?: Date } = {},
): Promise<PushResult> {
  const now = options.now ?? new Date();
  const vault = await buildVault(db, passphrase, now);

  const remoteUpdatedAt = await pushVault({
    ciphertext: vault.ciphertext,
    schemaVersion: vault.schemaVersion,
    ...(options.deviceLabel ? { deviceLabel: options.deviceLabel } : {}),
  });

  await recordSyncSuccess(db, remoteUpdatedAt, now);
  return { remoteUpdatedAt, totalRecords: vault.totalRecords };
}

// ---------------------------------------------------------------------------
// משיכה
// ---------------------------------------------------------------------------

export interface PendingPull {
  data: BackupData;
  remoteUpdatedAt: string;
  /** מה עומד להיכנס — מוצג למשתמש לפני שהוא מאשר. */
  counts: Record<string, number>;
  totalRecords: number;
  deviceLabel: string | null;
}

/**
 * מוריד ומפענח — **בלי לגעת בבסיס הנתונים.**
 *
 * ⚠️ ההפרדה מ-`applyPull` היא מה שהופך סיסמה שגויה או בלוב פגום
 * לשגיאה בלתי מזיקה במקום לבסיס נתונים ריק.
 */
export async function preparePull(passphrase: string): Promise<PendingPull> {
  const remote = await fetchRemoteVault();
  if (!remote) throw new SyncError('אין נתונים בענן', 'server');

  const data = await openVault(remote.ciphertext, passphrase);
  const counts = Object.fromEntries(
    Object.entries(data).map(([table, rows]) => [table, (rows as unknown[]).length]),
  );

  return {
    data,
    remoteUpdatedAt: remote.updatedAt,
    counts,
    totalRecords: Object.values(counts).reduce((a, b) => a + b, 0),
    deviceLabel: remote.deviceLabel,
  };
}

export interface ApplyPullResult {
  restored: number;
  /** גיבוי המצב שנדרס, להורדה. `null` כשלא היה מה לגבות. */
  safetyBackup: { content: string; fileName: string } | null;
}

/**
 * דורס את המצב המקומי בנתוני הענן.
 *
 * ⚠️ **הפעולה ההרסנית היחידה בכל הסנכרון.** לכן קודם נוצר גיבוי של
 * מה שעומד להימחק, והוא מוחזר לקורא כדי שהמסך יציע להוריד אותו.
 */
export async function applyPull(
  db: FinanceDatabase,
  pending: PendingPull,
  options: { now?: Date; skipSafetyBackup?: boolean } = {},
): Promise<ApplyPullResult> {
  const now = options.now ?? new Date();

  let safetyBackup: ApplyPullResult['safetyBackup'] = null;
  if (!options.skipSafetyBackup) {
    const backup = await createBackup(db, { reason: 'pre_restore', now });
    safetyBackup = { content: backup.content, fileName: backup.fileName };
  }

  const { restored } = await restoreBackup(db, pending.data);
  await recordSyncSuccess(db, pending.remoteUpdatedAt, now);

  return { restored, safetyBackup };
}

// ---------------------------------------------------------------------------
// אוטומטי
// ---------------------------------------------------------------------------

export type AutoSyncOutcome =
  | { performed: 'push'; result: PushResult }
  | { performed: 'pull'; pending: PendingPull }
  | { performed: 'none'; status: SyncStatus };

/**
 * מבצע רק את מה שבטוח לבצע בלי לשאול.
 *
 * ⚠️ גם `pull` בטוחה אינה נכתבת כאן — היא מוחזרת כ-`PendingPull`
 * ומחכה לאישור במסך. ההבדל בין "בטוח לפעול" לבין "בטוח לדרוס בלי
 * שהמשתמש יראה" הוא בדיוק ההבדל שמפריד סנכרון תקין מאובדן נתונים.
 */
export async function autoSync(
  db: FinanceDatabase,
  passphrase: string,
  options: { deviceLabel?: string; now?: Date } = {},
): Promise<AutoSyncOutcome> {
  const now = options.now ?? new Date();
  const status = await checkSync(db);

  if (!status.signedIn || !isSafeToAutoSync(status.decision)) {
    return { performed: 'none', status };
  }

  const { action } = status.decision;

  if (action === 'push' || action === 'push_initial') {
    return {
      performed: 'push',
      result: await push(db, passphrase, {
        ...(options.deviceLabel ? { deviceLabel: options.deviceLabel } : {}),
        now,
      }),
    };
  }

  return { performed: 'pull', pending: await preparePull(passphrase) };
}
