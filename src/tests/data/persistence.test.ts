/**
 * אחסון קבוע.
 *
 * ⚠️ הקובץ הזה נכתב אחרי אובדן נתונים אמיתי אצל משתמש.
 *
 * IndexedDB הוא אחסון זמני כברירת מחדל. בלי בקשה מפורשת הדפדפן
 * רשאי למחוק חודשי היסטוריה פיננסית בלי להודיע — וזה נראה למשתמש
 * בדיוק כמו "האפליקציה מחקה לי הכל".
 *
 * הבדיקות כאן מוודאות שהבקשה **באמת נשלחת**, ושכישלון שלה לא שובר
 * את עליית האפליקציה.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensurePersistentStorage,
  readStorageStatus,
  readStorageUsage,
} from '../../data/persistence';

const original = globalThis.navigator;

function mockStorage(value: unknown): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: value === undefined ? {} : { storage: value },
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: original });
});

describe('בקשת אחסון קבוע', () => {
  it('⭐ כשאין אחסון קבוע — נשלחת בקשה', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    mockStorage({ persisted: vi.fn().mockResolvedValue(false), persist });

    expect(await ensurePersistentStorage()).toBe('persistent');
    expect(persist).toHaveBeenCalledOnce();
  });

  it('⭐ כשכבר קבוע — לא מטרידים את המשתמש בבקשה נוספת', async () => {
    const persist = vi.fn();
    mockStorage({ persisted: vi.fn().mockResolvedValue(true), persist });

    expect(await ensurePersistentStorage()).toBe('persistent');
    expect(persist).not.toHaveBeenCalled();
  });

  /**
   * ⭐ דפדפן רשאי לסרב. התוצאה היא לא שגיאה אלא מצב ידוע שצריך
   * להציג למשתמש — כי הוא זה שיחליט לגבות.
   */
  it('⭐ סירוב מדווח כ-best_effort ולא כתקלה', async () => {
    mockStorage({ persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(false) });
    expect(await ensurePersistentStorage()).toBe('best_effort');
  });

  it('⭐ חריגה בממשק לא נזרקת החוצה — העלייה לא נשברת', async () => {
    mockStorage({
      persisted: vi.fn().mockRejectedValue(new Error('denied')),
      persist: vi.fn(),
    });
    await expect(ensurePersistentStorage()).resolves.toBe('unsupported');
  });

  it('דפדפן בלי הממשק מדווח unsupported ולא קורס', async () => {
    mockStorage(undefined);
    await expect(ensurePersistentStorage()).resolves.toBe('unsupported');
    await expect(readStorageStatus()).resolves.toBe('unsupported');
  });
});

describe('קריאת מצב לתצוגה', () => {
  it('⭐ קריאת מצב אינה מבקשת דבר', async () => {
    const persist = vi.fn();
    mockStorage({ persisted: vi.fn().mockResolvedValue(false), persist });

    expect(await readStorageStatus()).toBe('best_effort');
    expect(persist).not.toHaveBeenCalled();
  });

  it('שימוש ומכסה מוחזרים כשקיימים', async () => {
    mockStorage({ estimate: vi.fn().mockResolvedValue({ usage: 1234, quota: 99999 }) });
    expect(await readStorageUsage()).toEqual({ usedBytes: 1234, quotaBytes: 99999 });
  });

  it('בלי estimate מוחזר null ולא קריסה', async () => {
    mockStorage({});
    expect(await readStorageUsage()).toEqual({ usedBytes: null, quotaBytes: null });
  });
});
