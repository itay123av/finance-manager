/**
 * תזכורת הגיבוי.
 *
 * הבדיקות כאן עוסקות פחות ב"מתי להזכיר" ויותר ב**מתי לשתוק**. תזכורת
 * שמופיעה כשאין מה לגבות, או שחוזרת אחרי שנדחתה, נלמדת כרעש — ואז
 * היא לא עובדת גם כשהיא חשובה.
 */

import { describe, expect, it } from 'vitest';
import {
  BACKUP_DISMISS_DAYS,
  BACKUP_REMINDER_DAYS,
  backupReminder,
  dismissUntil,
} from '../../core/backupReminder';

const TODAY = '2026-08-15';

const base = {
  today: TODAY,
  lastBackupDate: null,
  dismissedUntil: null,
  transactionCount: 40,
};

describe('תזכורת גיבוי', () => {
  it('⭐ לא מזכירה למי שאין לו מה לגבות', () => {
    expect(backupReminder({ ...base, transactionCount: 0 }).show).toBe(false);
  });

  it('מזכירה כשמעולם לא נוצר גיבוי ויש נתונים', () => {
    const state = backupReminder(base);
    expect(state.show).toBe(true);
    expect(state.daysSinceBackup).toBeNull();
    expect(state.titleHe).toContain('עוד לא גיבית');
  });

  it('שותקת כשהגיבוי טרי', () => {
    expect(backupReminder({ ...base, lastBackupDate: '2026-08-10' }).show).toBe(false);
  });

  it(`מזכירה בדיוק אחרי ${BACKUP_REMINDER_DAYS} יום, ולא יום לפני`, () => {
    const dayBefore = backupReminder({ ...base, lastBackupDate: '2026-08-02' }); // 13 ימים
    const onTime = backupReminder({ ...base, lastBackupDate: '2026-08-01' }); // 14 ימים

    expect(dayBefore.show).toBe(false);
    expect(onTime.show).toBe(true);
    expect(onTime.daysSinceBackup).toBe(BACKUP_REMINDER_DAYS);
    expect(onTime.titleHe).toContain('14');
  });

  it('⭐ דחייה משתיקה, ופגה מעצמה', () => {
    const stale = { ...base, lastBackupDate: '2026-07-01' };

    expect(backupReminder({ ...stale, dismissedUntil: '2026-08-18' }).show).toBe(false);
    // ביום שבו הדחייה פגה — התזכורת חוזרת
    expect(backupReminder({ ...stale, dismissedUntil: TODAY }).show).toBe(true);
    expect(backupReminder({ ...stale, dismissedUntil: '2026-08-01' }).show).toBe(true);
  });

  it('⭐ דחייה היא זמנית ולא ביטול', () => {
    expect(dismissUntil(TODAY)).toBe('2026-08-18');
    expect(BACKUP_DISMISS_DAYS).toBeLessThan(BACKUP_REMINDER_DAYS);
  });

  it('הטון מדווח, לא מאשים', () => {
    const state = backupReminder({ ...base, lastBackupDate: '2026-06-01' });
    const text = `${state.titleHe} ${state.bodyHe}`;
    for (const word of ['היית צריך', 'הזנחת', 'אשם', 'סכנה', 'תיזהר']) {
      expect(text).not.toContain(word);
    }
  });

  it('תאריך גיבוי עתידי (שעון שהוזז) אינו מייצר ימים שליליים', () => {
    const state = backupReminder({ ...base, lastBackupDate: '2026-09-01' });
    expect(state.daysSinceBackup).toBe(0);
    expect(state.show).toBe(false);
  });
});
