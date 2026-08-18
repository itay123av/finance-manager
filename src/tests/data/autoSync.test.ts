/**
 * הכללים של הסנכרון האוטומטי.
 *
 * ⚠️ סנכרון שרץ לבד הוא הדבר המסוכן ביותר במערכת: אין משתמש שיעצור
 * אותו באמצע. לכן הכלל היחיד שהוא לא שובר הוא **פעולה אוטומטית
 * יכולה להוסיף נתונים, לעולם לא להרוס אותם.**
 *
 * הבדיקות כאן מריצות את ההיגיון שהמנוע ב-`ui/SyncEngine` מסתמך עליו,
 * ומוודאות שהוא עוצר בדיוק במקומות שבהם הוא חייב לעצור.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { decideSync, isSafeToAutoSync } from '../../core/syncDecision';
import { FinanceDatabase } from '../../data/db';
import {
  buildSyncInput,
  readSyncState,
  recordSyncSuccess,
  rememberPassphrase,
  forgetPassphrase,
  disableSync,
} from '../../data/sync/state';
import { addTransaction, completeOnboarding, BANK_ACCOUNT_ID } from '../../data/repositories';
import { fromShekels } from '../../core/money';

const PASSPHRASE = 'סיסמת-סנכרון-ארוכה-1';
const NOW = new Date('2026-08-17T09:00:00Z');

let db: FinanceDatabase;
let counter = 0;

beforeEach(async () => {
  db = new FinanceDatabase(`test-autosync-${++counter}`);
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

/** ⚠️ שם פיקטיבי. */
async function spend(shekels: number, date = '2026-08-10'): Promise<void> {
  await addTransaction(db, {
    accountId: BANK_ACCOUNT_ID,
    date,
    amountAgorot: fromShekels(shekels),
    type: 'expense',
    categoryId: 'cat-food-out',
    merchant: 'חנות לדוגמה',
  });
}

describe('ברירות מחדל', () => {
  it('⭐ משתמש חדש מקבל זכירה דלוקה — אחרת הסנכרון לא מתחיל לבד', async () => {
    expect((await readSyncState(db)).rememberEnabled).toBe(true);
  });

  it('⭐ עדיין אין סיסמה שמורה עד שהמשתמש בוחר אחת', async () => {
    expect((await readSyncState(db)).rememberedPassphrase).toBeNull();
  });
});

describe('זכירת הסיסמה', () => {
  it('נשמרת ונקראת', async () => {
    await rememberPassphrase(db, PASSPHRASE);
    const state = await readSyncState(db);
    expect(state.rememberedPassphrase).toBe(PASSPHRASE);
    expect(state.rememberEnabled).toBe(true);
  });

  it('⭐ ביטול מוחק את הסיסמה **וגם** מכבה את ההעדפה', async () => {
    await rememberPassphrase(db, PASSPHRASE);
    await forgetPassphrase(db);

    const state = await readSyncState(db);
    expect(state.rememberedPassphrase).toBeNull();
    // ⚠️ בלי זה, הקלדה הבאה הייתה שומרת שוב ומבטלת את הבחירה.
    expect(state.rememberEnabled).toBe(false);
  });

  it('⭐ כיבוי סנכרון מוחק את הסיסמה', async () => {
    await seed();
    await rememberPassphrase(db, PASSPHRASE);
    await disableSync(db);

    expect((await readSyncState(db)).rememberedPassphrase).toBeNull();
    // הנתונים עצמם לא נגעו
    expect(await db.transactions.count()).toBe(0);
  });

  it('⭐ מחיקת כל הנתונים מוחקת גם את הסיסמה השמורה', async () => {
    const { wipeAllData } = await import('../../data/db');
    await seed();
    await rememberPassphrase(db, PASSPHRASE);

    await wipeAllData(db);

    expect((await readSyncState(db)).rememberedPassphrase).toBeNull();
  });
});

describe('⭐ מה מותר לעשות לבד', () => {
  async function decisionFor(remoteUpdatedAt: string | null) {
    const { state } = await buildSyncInput(db, remoteUpdatedAt);
    return decideSync(state);
  }

  it('⭐ שינוי מקומי בלבד → העלאה, ומותר אוטומטית', async () => {
    await seed();
    await recordSyncSuccess(db, '2026-08-16T10:00:00Z', NOW);
    await spend(45, '2026-08-17');

    const decision = await decisionFor('2026-08-16T10:00:00Z');
    expect(decision.action).toBe('push');
    expect(isSafeToAutoSync(decision)).toBe(true);
  });

  /**
   * ⭐ משיכה אוטומטית מותרת רק כשלא השתנה כאן דבר. במצב הזה הנתונים
   * המקומיים זהים למה שכבר סונכרן, ולכן אין מה לדרוס.
   */
  it('⭐ הענן זז והמכשיר לא → משיכה, ומותר אוטומטית', async () => {
    await seed();
    await recordSyncSuccess(db, '2026-08-16T10:00:00Z', NOW);

    const decision = await decisionFor('2026-08-17T10:00:00Z');
    expect(decision.action).toBe('pull');
    expect(isSafeToAutoSync(decision)).toBe(true);
  });

  /**
   * ⭐ הבדיקה החשובה בקובץ. שני הצדדים זזו — פעולה אוטומטית כאן
   * הייתה מוחקת עסקאות אמיתיות בלי שאיש יראה.
   */
  it('⭐ שני הצדדים זזו → אסור לגעת אוטומטית', async () => {
    await seed();
    await recordSyncSuccess(db, '2026-08-16T10:00:00Z', NOW);
    await spend(45, '2026-08-17');

    const decision = await decisionFor('2026-08-17T11:00:00Z');
    expect(decision.action).toBe('conflict');
    expect(decision.automatic).toBe(false);
    expect(isSafeToAutoSync(decision)).toBe(false);
  });

  it('⭐ הכל מסונכרן → אין פעולה, ואין בקשה מיותרת', async () => {
    await seed();
    await recordSyncSuccess(db, '2026-08-16T10:00:00Z', NOW);

    const decision = await decisionFor('2026-08-16T10:00:00Z');
    expect(decision.action).toBe('in_sync');
    expect(isSafeToAutoSync(decision)).toBe(false);
  });

  /**
   * ⭐ מכשיר חדש לגמרי מול ענן קיים: משיכה בטוחה, כי אין נתונים
   * מקומיים שאפשר לאבד.
   */
  it('⭐ מכשיר ריק מול ענן קיים → משיכה ראשונה מותרת', async () => {
    const decision = await decisionFor('2026-08-17T10:00:00Z');
    expect(decision.action).toBe('pull_initial');
    expect(isSafeToAutoSync(decision)).toBe(true);
  });
});
