/**
 * נעילת האפליקציה.
 *
 * ⚠️ הבדיקה החשובה כאן היא לא "האם הקוד הנכון פותח" אלא **שהקוד עצמו
 * לא נשמר**. אם מישהו יחליף אי פעם את ה-verifier בשמירה של הקוד, שתי
 * הבדיקות הראשונות ייפלו.
 */

import { describe, expect, it } from 'vitest';
import {
  createLock,
  isValidPin,
  LOCK_PBKDF2_ITERATIONS,
  MAX_PIN_LENGTH,
  MIN_PIN_LENGTH,
  verifyPin,
} from '../../data/appLock';
import { appLockSchema } from '../../data/schema';

const PIN = '482913';

describe('קוד נעילה', () => {
  it('⭐ הקוד עצמו לא מופיע במה שנשמר', async () => {
    const lock = await createLock(PIN, 5);
    const serialized = JSON.stringify(lock);

    expect(serialized).not.toContain(PIN);
    // גם לא בקידוד הפשוט ביותר
    expect(serialized).not.toContain(btoa(PIN));
    expect(Object.keys(lock).sort()).toEqual([
      'autoLockMinutes',
      'iterations',
      'salt',
      'verifier',
    ]);
  });

  it('⭐ אותו קוד מייצר verifier שונה בכל פעם', async () => {
    // salt אקראי — בלעדיו אפשר היה לזהות שני משתמשים עם אותו קוד,
    // ולבנות טבלה אחת שפותחת את כולם.
    const a = await createLock(PIN, 1);
    const b = await createLock(PIN, 1);
    expect(a.salt).not.toBe(b.salt);
    expect(a.verifier).not.toBe(b.verifier);
  });

  it('הקוד הנכון פותח, כל קוד אחר לא', async () => {
    const lock = await createLock(PIN, 1);
    expect(await verifyPin(lock, PIN)).toBe(true);
    expect(await verifyPin(lock, '482914')).toBe(false);
    expect(await verifyPin(lock, '48291')).toBe(false);
    expect(await verifyPin(lock, '')).toBe(false);
  });

  it('שני קודים זהים מאומתים מול ה-verifier שלהם בלבד', async () => {
    const mine = await createLock('1234', 0);
    const other = await createLock('1234', 0);
    // אותו קוד, salt שונה — האימות עדיין עובר בשניהם
    expect(await verifyPin(mine, '1234')).toBe(true);
    expect(await verifyPin(other, '1234')).toBe(true);
  });

  it(`אורך חוקי: ${MIN_PIN_LENGTH}–${MAX_PIN_LENGTH} ספרות בלבד`, () => {
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('12 4')).toBe(false);
  });

  it('קוד לא חוקי נדחה כבר ביצירה', async () => {
    await expect(createLock('12', 1)).rejects.toThrow();
    await expect(createLock('abcd', 1)).rejects.toThrow();
  });

  it('הנשמר עומד בסכמה, כולל מספר האיטרציות', async () => {
    const lock = await createLock(PIN, 15);
    expect(() => appLockSchema.parse(lock)).not.toThrow();
    expect(lock.iterations).toBe(LOCK_PBKDF2_ITERATIONS);
    expect(lock.autoLockMinutes).toBe(15);
  });

  it('⭐ אימות מול קוד באורך לא חוקי לא גוזר מפתח בכלל', async () => {
    // חשוב לביצועים במסך הנעילה: כל הקלדה בודקת, ואין סיבה להריץ
    // 150,000 איטרציות על קלט שממילא פסול.
    const lock = await createLock(PIN, 1);
    const before = performance.now();
    expect(await verifyPin(lock, '1')).toBe(false);
    expect(performance.now() - before).toBeLessThan(50);
  });
});
