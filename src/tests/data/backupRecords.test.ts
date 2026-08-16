/**
 * יומן הגיבויים, ומחיקה שבאמת מוחקת.
 *
 * ⚠️ שתי סכנות שקטות שהבדיקות כאן חוסמות:
 *
 * 1. **גיבוי שנוצר ולא נרשם.** התזכורת הייתה ממשיכה לומר "לא גיבית",
 *    המשתמש היה לומד להתעלם ממנה, ובאמת לא היה מגבה.
 * 2. **שחזור שדורס את יומן הגיבויים.** כולל את הרישום של הגיבוי
 *    שנוצר רגע לפניו — כלומר מוחק את רשת הביטחון בדיוק כשצריך אותה.
 */

// ⚠️ jsdom — הבדיקה של "מחיקה מנקה גם את אחסון הדפדפן" זקוקה ל-
// `localStorage`, שאינו קיים בסביבת node.
// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBackup, lastBackupDate, readBackup, restoreFromText } from '../../data/backup';
import { allTables, FinanceDatabase, wipeAllData } from '../../data/db';
import { addTransaction, completeOnboarding, BANK_ACCOUNT_ID, loadSnapshot } from '../../data/repositories';
import { fromShekels } from '../../core/money';

const NOW = new Date('2026-08-15T09:00:00Z');
let db: FinanceDatabase;
let counter = 0;

beforeEach(async () => {
  db = new FinanceDatabase(`test-backup-records-${++counter}`);
  await db.open();
});

async function seed(): Promise<void> {
  await completeOnboarding(db, {
    bankBalanceAgorot: fromShekels(1200),
    cashBalanceAgorot: fromShekels(100),
    safetyBufferAgorot: fromShekels(500),
    targetAgorot: fromShekels(5000),
    milestones: [fromShekels(1000)],
    estimatedMonthlySpendAgorot: fromShekels(400),
    openingDate: '2026-06-01',
  });
  await addTransaction(db, {
    accountId: BANK_ACCOUNT_ID,
    date: '2026-07-10',
    amountAgorot: fromShekels(64),
    type: 'expense',
    categoryId: 'cat-food-out',
    merchant: 'דוכן',
  });
}

describe('יומן גיבויים', () => {
  it('⭐ כל גיבוי נרשם, עם ספירות ובלי נתונים פיננסיים', async () => {
    await seed();
    const { record } = await createBackup(db, { now: NOW });

    expect(record.reason).toBe('manual');
    expect(record.encrypted).toBe(false);
    expect(record.rowCounts.transactions).toBe(1);
    expect(record.rowCounts.accounts).toBe(2);

    // ⚠️ ביומן יש ספירות בלבד — לא סכומים, לא שמות, לא תאריכי עסקאות
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain('דוכן');
    expect(serialized).not.toContain('6400');
  });

  it('גיבוי מוצפן מסומן ככזה, והתוכן באמת מוצפן', async () => {
    await seed();
    const { content, record } = await createBackup(db, { password: 'סיסמה-ארוכה', now: NOW });

    expect(record.encrypted).toBe(true);
    expect(content).not.toContain('דוכן');
    expect(await readBackup(content, 'סיסמה-ארוכה')).toBeTruthy();
    await expect(readBackup(content, 'לא-נכון')).rejects.toThrow();
  });

  it('תאריך הגיבוי האחרון נגזר מהיומן', async () => {
    await seed();
    expect(await lastBackupDate(db)).toBeNull();

    await createBackup(db, { now: new Date('2026-08-01T10:00:00Z') });
    await createBackup(db, { now: new Date('2026-08-14T10:00:00Z') });

    expect(await lastBackupDate(db)).toBe('2026-08-14');
    expect((await loadSnapshot(db, NOW)).lastBackupDate).toBe('2026-08-14');
  });

  it('⭐ שחזור אינו דורס את יומן הגיבויים', async () => {
    await seed();
    // גיבוי ישן, ואז גיבוי אוטומטי לפני שחזור
    const { content } = await createBackup(db, { now: new Date('2026-07-01T10:00:00Z') });
    await createBackup(db, { reason: 'pre_restore', now: NOW });

    await restoreFromText(db, content);

    const records = await db.backupRecords.toArray();
    expect(records).toHaveLength(2);
    expect(records.some((r) => r.reason === 'pre_restore')).toBe(true);
    // ואחרי השחזור עדיין יודעים שגיבינו היום
    expect(await lastBackupDate(db)).toBe('2026-08-15');
  });

  it('גיבוי אוטומטי לפני שחזור מסומן בסיבה שלו', async () => {
    await seed();
    const { record } = await createBackup(db, { reason: 'pre_restore', now: NOW });
    expect(record.reason).toBe('pre_restore');
  });
});

describe('מחיקת כל הנתונים', () => {
  it('⭐ לא נשארת אף שורה באף טבלה — כולל יומן הגיבויים', async () => {
    await seed();
    await createBackup(db, { now: NOW });

    await wipeAllData(db);

    const counts = await Promise.all(
      [...Object.values(allTables(db)), db.backupRecords].map((t) => t.count()),
    );
    expect(counts.every((n) => n === 0)).toBe(true);
    expect(counts).toHaveLength(14);
  });

  it('⭐ אחרי מחיקה המערכת חוזרת למצב "לפני אונבורדינג"', async () => {
    await seed();
    await wipeAllData(db);

    const snapshot = await loadSnapshot(db, NOW);
    expect(snapshot.settings.onboardingCompletedAt).toBeUndefined();
    expect(snapshot.goal).toBeUndefined();
    expect(snapshot.accounts).toEqual([]);
    expect(snapshot.transactions).toEqual([]);
    expect(snapshot.lastBackupDate).toBeNull();
  });

  it('מחיקה מנקה גם את אחסון הדפדפן', async () => {
    // ⚠️ כרגע האפליקציה לא כותבת לשם. הבדיקה מגנה על היום שבו מישהו
    // יוסיף "רק דגל קטן" ל-localStorage ומחיקת הכל תפסיק להיות מלאה.
    localStorage.setItem('leftover', 'x');
    sessionStorage.setItem('leftover', 'x');

    await seed();
    await wipeAllData(db);

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
