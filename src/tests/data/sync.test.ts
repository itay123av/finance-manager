/**
 * הסנכרון כמכלול, מול שרת מדומה.
 *
 * ⚠️ הבדיקות כאן מריצות את התרחיש שבגללו כל התכנון הזה נבנה: שני
 * מכשירים, אותו חשבון, ושינויים בשניהם. כישלון כאן פירושו עסקאות
 * שנמחקות בשקט.
 *
 * השרת המדומה מחזיק בדיוק מה שהאמיתי מחזיק — מחרוזת אטומה וחותמת
 * זמן. הוא אינו יודע לפענח כלום, וזה בדיוק העניין.
 */

import 'fake-indexeddb/auto';
import type * as ClientModule from '../../data/sync/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// שרת מדומה
// ---------------------------------------------------------------------------

interface FakeRow {
  ciphertext: string;
  schemaVersion: number;
  updatedAt: string;
  deviceLabel: string | null;
}

const server: { row: FakeRow | null; signedIn: boolean; clock: number } = {
  row: null,
  signedIn: true,
  clock: 0,
};

function nextStamp(): string {
  server.clock += 1;
  return new Date(Date.UTC(2026, 7, 17, 9, server.clock)).toISOString();
}

vi.mock('../../data/sync/client', async () => {
  const actual = await vi.importActual<typeof ClientModule>('../../data/sync/client');
  return {
    ...actual,
    currentSession: async () => (server.signedIn ? { user: { id: 'user-1' } } : null),
    fetchRemoteTimestamp: async () => server.row?.updatedAt ?? null,
    fetchRemoteVault: async () => server.row,
    pushVault: async (input: {
      ciphertext: string;
      schemaVersion: number;
      deviceLabel?: string;
    }) => {
      const updatedAt = nextStamp();
      server.row = {
        ciphertext: input.ciphertext,
        schemaVersion: input.schemaVersion,
        updatedAt,
        deviceLabel: input.deviceLabel ?? null,
      };
      return updatedAt;
    },
    deleteRemoteVault: async () => {
      server.row = null;
    },
  };
});

import { FinanceDatabase } from '../../data/db';
import { applyPull, autoSync, checkSync, preparePull, push } from '../../data/sync/sync';
import {
  addTransaction,
  completeOnboarding,
  loadSnapshot,
  BANK_ACCOUNT_ID,
} from '../../data/repositories';
import { fromShekels } from '../../core/money';

const PASSPHRASE = 'סיסמת-סנכרון-ארוכה-1';
const NOW = new Date('2026-08-17T09:00:00Z');

let phone: FinanceDatabase;
let laptop: FinanceDatabase;
let counter = 0;

beforeEach(async () => {
  server.row = null;
  server.signedIn = true;
  server.clock = 0;
  counter += 1;
  phone = new FinanceDatabase(`test-sync-phone-${counter}`);
  laptop = new FinanceDatabase(`test-sync-laptop-${counter}`);
  await phone.open();
  await laptop.open();
});

async function seed(db: FinanceDatabase): Promise<void> {
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

/** ⚠️ שם פיקטיבי. אין בית עסק אמיתי בבדיקות. */
async function spend(db: FinanceDatabase, shekels: number, date = '2026-08-10'): Promise<void> {
  await addTransaction(db, {
    accountId: BANK_ACCOUNT_ID,
    date,
    amountAgorot: fromShekels(shekels),
    type: 'expense',
    merchant: 'חנות לדוגמה',
    categoryId: 'food',
  });
}

describe('לא מחובר', () => {
  it('בלי חשבון אין החלטה ואין פעולה', async () => {
    server.signedIn = false;
    await seed(phone);

    const status = await checkSync(phone);
    expect(status.signedIn).toBe(false);
    expect(status.decision.action).toBe('nothing');

    const outcome = await autoSync(phone, PASSPHRASE, { now: NOW });
    expect(outcome.performed).toBe('none');
    expect(server.row).toBeNull();
  });
});

describe('מכשיר ראשון', () => {
  it('העלאה ראשונה מעלה בלוב אטום', async () => {
    await seed(phone);
    await spend(phone, 64);

    const outcome = await autoSync(phone, PASSPHRASE, { now: NOW });

    expect(outcome.performed).toBe('push');
    expect(server.row).not.toBeNull();
    expect(server.row!.ciphertext).not.toContain('חנות לדוגמה');
  });

  it('אחרי העלאה שני הצדדים מסונכרנים ואין פעולה נוספת', async () => {
    await seed(phone);
    await push(phone, PASSPHRASE, { now: NOW });

    const status = await checkSync(phone);
    expect(status.decision.action).toBe('in_sync');

    const outcome = await autoSync(phone, PASSPHRASE, { now: NOW });
    expect(outcome.performed).toBe('none');
  });
});

describe('מכשיר שני', () => {
  it('⭐ מכשיר ריק מקבל את הנתונים מהענן', async () => {
    await seed(phone);
    await spend(phone, 64);
    await push(phone, PASSPHRASE, { now: NOW });

    const status = await checkSync(laptop);
    expect(status.decision.action).toBe('pull_initial');

    const pending = await preparePull(PASSPHRASE);
    await applyPull(laptop, pending, { now: NOW, skipSafetyBackup: true });

    const phoneSnapshot = await loadSnapshot(phone, NOW);
    const laptopSnapshot = await loadSnapshot(laptop, NOW);
    expect(laptopSnapshot.transactions).toEqual(phoneSnapshot.transactions);
  });

  it('⭐ משיכה אוטומטית לא כותבת — היא מחזירה תצוגה מקדימה בלבד', async () => {
    await seed(phone);
    await spend(phone, 64);
    await push(phone, PASSPHRASE, { now: NOW });

    const outcome = await autoSync(laptop, PASSPHRASE, { now: NOW });

    expect(outcome.performed).toBe('pull');
    // בסיס הנתונים של המחשב עדיין ריק — שום דבר לא נכתב בלי אישור.
    expect(await laptop.transactions.count()).toBe(0);
  });
});

describe('⭐ שני מכשירים שזזו', () => {
  /**
   * ⭐ התרחיש המרכזי.
   *
   * הטלפון היה סגור. במחשב הוזנה עסקה והועלתה. בטלפון הוזנה עסקה
   * אחרת. "המאוחר מנצח" היה מוחק אחת מהן בשקט.
   */
  it('⭐ שינוי בשני הצדדים → התנגשות, ושום דבר לא נדרס', async () => {
    await seed(phone);
    await push(phone, PASSPHRASE, { now: NOW });

    // המחשב מקבל את המצב ההתחלתי.
    const initial = await preparePull(PASSPHRASE);
    await applyPull(laptop, initial, { now: NOW, skipSafetyBackup: true });

    // כל צד מזין עסקה משלו.
    await spend(laptop, 120, '2026-08-15');
    await push(laptop, PASSPHRASE, { now: NOW });
    await spend(phone, 45, '2026-08-16');

    const status = await checkSync(phone);
    expect(status.decision.action).toBe('conflict');
    expect(status.decision.automatic).toBe(false);

    const outcome = await autoSync(phone, PASSPHRASE, { now: NOW });
    expect(outcome.performed).toBe('none');

    // ⭐ העסקה של הטלפון עדיין קיימת.
    const phoneTransactions = await phone.transactions.toArray();
    expect(phoneTransactions).toHaveLength(1);
    expect(phoneTransactions[0]!.amountAgorot).toBe(fromShekels(45));

    // ⭐ והבלוב בענן עדיין זה של המחשב — הטלפון לא דרס אותו.
    const remote = await preparePull(PASSPHRASE);
    expect(remote.data.transactions).toHaveLength(1);
    expect(remote.data.transactions[0]!.amountAgorot).toBe(fromShekels(120));
  });

  it('⭐ הכרעה ידנית לטובת הענן יוצרת גיבוי של מה שנדרס', async () => {
    await seed(phone);
    await push(phone, PASSPHRASE, { now: NOW });
    const initial = await preparePull(PASSPHRASE);
    await applyPull(laptop, initial, { now: NOW, skipSafetyBackup: true });

    await spend(laptop, 120, '2026-08-15');
    await push(laptop, PASSPHRASE, { now: NOW });
    await spend(phone, 45, '2026-08-16');

    const pending = await preparePull(PASSPHRASE);
    const result = await applyPull(phone, pending, { now: NOW });

    // ⭐ הגיבוי נוצר לפני הדריסה, ולכן הוא מכיל את מה שהיה בטלפון.
    expect(result.safetyBackup).not.toBeNull();
    expect(result.safetyBackup!.content).toContain('45');

    const after = await phone.transactions.toArray();
    expect(after[0]!.amountAgorot).toBe(fromShekels(120));
  });

  it('⭐ הכרעה ידנית לטובת המכשיר מעלה ולא מאבדת', async () => {
    await seed(phone);
    await push(phone, PASSPHRASE, { now: NOW });
    const initial = await preparePull(PASSPHRASE);
    await applyPull(laptop, initial, { now: NOW, skipSafetyBackup: true });

    await spend(laptop, 120, '2026-08-15');
    await push(laptop, PASSPHRASE, { now: NOW });
    await spend(phone, 45, '2026-08-16');

    await push(phone, PASSPHRASE, { now: NOW });

    expect((await checkSync(phone)).decision.action).toBe('in_sync');
    const remote = await preparePull(PASSPHRASE);
    expect(remote.data.transactions[0]!.amountAgorot).toBe(fromShekels(45));
  });
});

describe('סיסמת הצפנה', () => {
  it('⭐ מכשיר עם סיסמה שגויה נכשל בפענוח ולא מוחק כלום', async () => {
    await seed(phone);
    await spend(phone, 64);
    await push(phone, PASSPHRASE, { now: NOW });

    await seed(laptop);
    const before = await laptop.transactions.count();

    await expect(preparePull('סיסמה-אחרת-לגמרי-9')).rejects.toMatchObject({
      name: 'VaultError',
      reason: 'bad_passphrase',
    });

    expect(await laptop.transactions.count()).toBe(before);
  });
});

describe('מחזור מלא', () => {
  it('⭐ העלאה → משיכה → העלאה שומרת על אותם נתונים', async () => {
    await seed(phone);
    await spend(phone, 64, '2026-08-05');
    await spend(phone, 120, '2026-08-09');
    const original = await loadSnapshot(phone, NOW);

    await push(phone, PASSPHRASE, { now: NOW });
    const pending = await preparePull(PASSPHRASE);
    await applyPull(laptop, pending, { now: NOW, skipSafetyBackup: true });
    await push(laptop, PASSPHRASE, { now: NOW });

    const roundTripped = await preparePull(PASSPHRASE);
    await applyPull(phone, roundTripped, { now: NOW, skipSafetyBackup: true });

    const final = await loadSnapshot(phone, NOW);
    expect(final.transactions).toEqual(original.transactions);
    expect(final.accounts).toEqual(original.accounts);
  });
});
