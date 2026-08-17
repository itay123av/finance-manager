/**
 * טביעת האצבע המקומית.
 *
 * ⚠️ הסכנה שהקובץ הזה מגן מפניה: מסלול כתיבה שלא מסמן "השתנה".
 * אם ייבוא, ביטול ייבוא או שחזור לא מזיזים את טביעת האצבע, המערכת
 * תחשוב שלא השתנה כלום, תמשוך מהענן — ותדרוס נתונים אמיתיים.
 *
 * לכן כל בדיקה כאן משנה נתונים במסלול אחר ודורשת שהטביעה תזוז.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { FinanceDatabase, SYNC_STATE_ID, wipeAllData } from '../../data/db';
import {
  buildSyncInput,
  disableSync,
  localFingerprint,
  readSyncState,
  recordSyncSuccess,
  writeSyncState,
} from '../../data/sync/state';
import {
  addTransaction,
  completeOnboarding,
  updateTransaction,
  deleteTransaction,
  BANK_ACCOUNT_ID,
} from '../../data/repositories';
import { fromShekels } from '../../core/money';

const NOW = new Date('2026-08-17T09:00:00Z');

let db: FinanceDatabase;
let dbCounter = 0;

beforeEach(async () => {
  db = new FinanceDatabase(`test-syncstate-${++dbCounter}`);
  await db.open();
});

async function seed(): Promise<void> {
  await completeOnboarding(db, {
    bankBalanceAgorot: fromShekels(4200),
    cashBalanceAgorot: fromShekels(180),
    safetyBufferAgorot: fromShekels(500),
    targetAgorot: fromShekels(5000),
    milestones: [fromShekels(2500)],
    estimatedMonthlySpendAgorot: fromShekels(700),
    openingDate: '2026-08-01',
  });
}

describe('מצב התחלתי', () => {
  it('בלי שורה שמורה — סנכרון כבוי ואין נקודת ייחוס', async () => {
    const state = await readSyncState(db);
    expect(state.enabled).toBe(false);
    expect(state.lastSyncedRemoteAt).toBeNull();
    expect(state.lastSyncedLocalHash).toBeNull();
  });

  it('בסיס ריק מסומן כריק', async () => {
    const { empty } = await localFingerprint(db);
    expect(empty).toBe(true);
  });
});

describe('⭐ הטביעה זזה בכל מסלול כתיבה', () => {
  it('הוספת עסקה מזיזה', async () => {
    await seed();
    const before = await localFingerprint(db);

    await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date: '2026-08-05',
      amountAgorot: fromShekels(64),
      type: 'expense',
      merchant: 'חנות לדוגמה',
      categoryId: 'food',
    });

    expect((await localFingerprint(db)).hash).not.toBe(before.hash);
  });

  it('⭐ עריכת עסקה קיימת מזיזה — לא רק הוספה', async () => {
    await seed();
    const t = await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date: '2026-08-05',
      amountAgorot: fromShekels(64),
      type: 'expense',
      merchant: 'חנות לדוגמה',
      categoryId: 'food',
    });
    const before = await localFingerprint(db);

    await updateTransaction(db, t.id, { amountAgorot: fromShekels(70) });

    expect((await localFingerprint(db)).hash).not.toBe(before.hash);
  });

  it('⭐ מחיקת עסקה מזיזה — אחרת מחיקה לא הייתה מסונכרנת', async () => {
    await seed();
    const t = await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date: '2026-08-05',
      amountAgorot: fromShekels(64),
      type: 'expense',
      merchant: 'חנות לדוגמה',
      categoryId: 'food',
    });
    const before = await localFingerprint(db);

    await deleteTransaction(db, t.id);

    expect((await localFingerprint(db)).hash).not.toBe(before.hash);
  });

  it('מחיקת הכל מזיזה ומחזירה למצב ריק', async () => {
    await seed();
    const before = await localFingerprint(db);

    await wipeAllData(db);

    const after = await localFingerprint(db);
    expect(after.hash).not.toBe(before.hash);
    expect(after.empty).toBe(true);
  });

  it('קריאה פעמיים בלי שינוי מחזירה אותה טביעה', async () => {
    await seed();
    const a = await localFingerprint(db);
    const b = await localFingerprint(db);
    expect(a.hash).toBe(b.hash);
  });

  it('הטביעה אינה מכילה נתונים קריאים', async () => {
    await seed();
    const { hash } = await localFingerprint(db);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('⭐ תרגום לקלט של decideSync', () => {
  it('אחרי סנכרון מוצלח בלי שינוי — המכשיר מדווח "לא זזתי"', async () => {
    await seed();
    await recordSyncSuccess(db, '2026-08-17T09:00:00Z', NOW);

    const { state } = await buildSyncInput(db, '2026-08-17T09:00:00Z');
    expect(state.localChanged).toBe(false);
    expect(state.hasLocalData).toBe(true);
  });

  /**
   * ⭐ אחרי שינוי מקומי, המכשיר חייב לדווח "זזתי" — אחרת משיכה
   * מהענן הייתה מוחקת את מה שהוזן.
   */
  it('⭐ אחרי שינוי מקומי — המכשיר מדווח "זזתי"', async () => {
    await seed();
    await recordSyncSuccess(db, '2026-08-17T09:00:00Z', NOW);

    await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date: '2026-08-17',
      amountAgorot: fromShekels(30),
      type: 'expense',
      merchant: 'חנות לדוגמה',
      categoryId: 'food',
    });

    const { state } = await buildSyncInput(db, '2026-08-17T09:00:00Z');
    expect(state.localChanged).toBe(true);
  });

  /**
   * ⭐ הדיווח אינו תלוי בשעון המכשיר.
   *
   * זו הייתה הגרסה הראשונה של הקוד: המכשיר דיווח "השתניתי ב-{עכשיו}",
   * וההשוואה בוצעה מול חותמת משעון השרת. מכשיר שהשעון שלו מפגר דיווח
   * בטעות "לא השתניתי" — ומשיכה מהענן הייתה מוחקת את מה שהוזן.
   */
  it('⭐ הדיווח זהה גם כששעון המכשיר מפגר בשנה מהענן', async () => {
    await seed();
    await recordSyncSuccess(db, '2027-01-01T00:00:00Z', NOW);
    await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date: '2026-08-17',
      amountAgorot: fromShekels(30),
      type: 'expense',
      merchant: 'חנות לדוגמה',
      categoryId: 'food',
    });

    const { state } = await buildSyncInput(db, '2027-01-01T00:00:00Z');
    expect(state.localChanged).toBe(true);
  });

  it('בסיס ריק מדווח על היעדר נתונים מקומיים', async () => {
    const { state } = await buildSyncInput(db, '2026-08-17T09:00:00Z');
    expect(state.hasLocalData).toBe(false);
  });

  /**
   * ⭐ `recordSyncSuccess` מודד את הטביעה **אחרי** הפעולה. במשיכה
   * הנתונים זה עתה הוחלפו, ומדידה מוקדמת הייתה מסמנת אותם כשונים
   * מיד — כלומר התנגשות מדומה בפתיחה הבאה.
   */
  it('⭐ רישום הצלחה משקף את המצב שאחרי הפעולה', async () => {
    await seed();
    await recordSyncSuccess(db, '2026-08-17T09:00:00Z', NOW);
    const stored = await readSyncState(db);
    const actual = await localFingerprint(db);

    expect(stored.lastSyncedLocalHash).toBe(actual.hash);
    expect(stored.enabled).toBe(true);
  });
});

describe('כיבוי', () => {
  it('כיבוי מוחק את נקודת הייחוס ולא את הנתונים', async () => {
    await seed();
    await recordSyncSuccess(db, '2026-08-17T09:00:00Z', NOW);

    await disableSync(db);

    const state = await readSyncState(db);
    expect(state.enabled).toBe(false);
    expect(state.lastSyncedRemoteAt).toBeNull();
    expect((await localFingerprint(db)).empty).toBe(false);
  });

  it('עדכון חלקי לא מוחק שדות אחרים', async () => {
    await writeSyncState(db, { lastSyncedRemoteAt: '2026-08-17T09:00:00Z' });
    await writeSyncState(db, { enabled: true });

    const state = await readSyncState(db);
    expect(state.lastSyncedRemoteAt).toBe('2026-08-17T09:00:00Z');
    expect(state.enabled).toBe(true);
    expect(state.id).toBe(SYNC_STATE_ID);
  });

  /**
   * ⭐ מחיקת כל הנתונים חייבת למחוק גם את מצב הסנכרון. אחרת המכשיר
   * נשאר עם "סונכרנתי מול הבלוב הזה" מול בסיס ריק — וזה נראה בדיוק
   * כמו "מחקתי הכל בכוונה", כלומר מחיקה שתועלה לענן.
   */
  it('⭐ מחיקת הכל מוחקת גם את מצב הסנכרון', async () => {
    await seed();
    await recordSyncSuccess(db, '2026-08-17T09:00:00Z', NOW);

    await wipeAllData(db);

    const state = await readSyncState(db);
    expect(state.lastSyncedRemoteAt).toBeNull();
    expect(state.lastSyncedLocalHash).toBeNull();
  });
});
