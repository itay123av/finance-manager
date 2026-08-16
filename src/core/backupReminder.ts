/**
 * תזכורת גיבוי.
 *
 * בארכיטקטורה מקומית לחלוטין, אובדן המכשיר הוא נקודת הכשל היחידה.
 * iOS גם מוחק IndexedDB של אתר שלא הותקן ולא נפתח שבוע. לכן צריכה
 * להיות תזכורת — אבל תזכורת שמופיעה בכל פתיחה נלמדת כרעש ונסגרת
 * אוטומטית, וכשהיא באמת חשובה כבר לא רואים אותה.
 *
 * לכן שלושה כללים:
 *
 * 1. **לא מזכירים למי שאין לו מה לאבד.** בלי עסקאות אין גיבוי לעשות.
 * 2. **דחייה נשמרת.** "לא עכשיו" שקט לכמה ימים, לא עד הרענון הבא.
 * 3. **הטון רגוע.** זו תזכורת, לא אזהרה — לא קרה שום דבר רע.
 */

import { addDays, diffDays } from './dates';
import type { ISODate } from './types';

/** מעל זה מזכירים. שבועיים — קצר מספיק כדי להגן, ארוך מספיק לא להציק. */
export const BACKUP_REMINDER_DAYS = 14;

/** כמה זמן שקט אחרי "לא עכשיו". */
export const BACKUP_DISMISS_DAYS = 3;

export interface BackupReminderInput {
  today: ISODate;
  /** תאריך הגיבוי האחרון, או `null` אם מעולם לא נוצר גיבוי. */
  lastBackupDate: ISODate | null;
  /** עד מתי המשתמש ביקש שקט. */
  dismissedUntil: ISODate | null;
  /** מספר העסקאות השמורות — בלי נתונים אין על מה להזכיר. */
  transactionCount: number;
}

export interface BackupReminderState {
  show: boolean;
  /** ימים מאז הגיבוי האחרון. `null` כשמעולם לא גובה. */
  daysSinceBackup: number | null;
  titleHe: string;
  bodyHe: string;
}

export function backupReminder(input: BackupReminderInput): BackupReminderState {
  const daysSinceBackup =
    input.lastBackupDate === null ? null : Math.max(0, diffDays(input.lastBackupDate, input.today));

  const hidden: BackupReminderState = {
    show: false,
    daysSinceBackup,
    titleHe: '',
    bodyHe: '',
  };

  if (input.transactionCount === 0) return hidden;
  if (input.dismissedUntil !== null && input.today < input.dismissedUntil) return hidden;

  if (daysSinceBackup === null) {
    return {
      show: true,
      daysSinceBackup: null,
      titleHe: 'עוד לא גיבית את הנתונים',
      bodyHe: 'הכל שמור רק במכשיר הזה. גיבוי לוקח כמה שניות ומגן על ההיסטוריה שלך.',
    };
  }

  if (daysSinceBackup < BACKUP_REMINDER_DAYS) return hidden;

  return {
    show: true,
    daysSinceBackup,
    titleHe: `לא גיבית את הנתונים כבר ${daysSinceBackup} יום`,
    bodyHe: 'הכל שמור רק במכשיר הזה. גיבוי לוקח כמה שניות.',
  };
}

/** התאריך שעד אליו התזכורת שקטה אחרי "לא עכשיו". */
export function dismissUntil(today: ISODate): ISODate {
  return addDays(today, BACKUP_DISMISS_DAYS);
}
