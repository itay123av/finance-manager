/**
 * מה באמת עוזב את המכשיר.
 *
 * ⚠️ הבדיקה המרכזית כאן אינה "ההצפנה עובדת" אלא **"טקסט גלוי לא
 * נשלח"**. באג שמבליע את הסיסמה בדרך מייצר בלוב שנראה תקין לחלוטין,
 * נשלח בהצלחה, ורק תוכנו הוא כל ההיסטוריה הפיננסית בטקסט קריא על
 * שרת. לכן בודקים את התוצר עצמו, לא את הכוונה.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildVault,
  openVault,
  isValidSyncPassphrase,
  VaultError,
  MIN_SYNC_PASSPHRASE_LENGTH,
} from '../../data/sync/vault';
import { FinanceDatabase } from '../../data/db';
import {
  addTransaction,
  completeOnboarding,
  BANK_ACCOUNT_ID,
  loadSnapshot,
} from '../../data/repositories';
import { restoreBackup } from '../../data/backup';
import { fromShekels } from '../../core/money';

const NOW = new Date('2026-08-17T09:00:00Z');
const PASSPHRASE = 'סיסמת-סנכרון-ארוכה-1';

let db: FinanceDatabase;
let dbCounter = 0;

beforeEach(async () => {
  db = new FinanceDatabase(`test-vault-${++dbCounter}`);
  await db.open();
});

/** ⚠️ שמות פיקטיביים בלבד — אין בית עסק אמיתי בבדיקות. */
async function seed(): Promise<void> {
  await completeOnboarding(db, {
    bankBalanceAgorot: fromShekels(4200),
    cashBalanceAgorot: fromShekels(180),
    safetyBufferAgorot: fromShekels(500),
    targetAgorot: fromShekels(5000),
    milestones: [fromShekels(1000), fromShekels(2500)],
    estimatedMonthlySpendAgorot: fromShekels(700),
    openingDate: '2026-08-01',
  });
  await addTransaction(db, {
    accountId: BANK_ACCOUNT_ID,
    date: '2026-08-05',
    amountAgorot: fromShekels(64),
    type: 'expense',
    merchant: 'חנות לדוגמה',
    categoryId: 'food',
  });
}

describe('חוזק הסיסמה', () => {
  it('סיסמה קצרה נדחית', () => {
    expect(isValidSyncPassphrase('קצרה')).toBe(false);
    expect(isValidSyncPassphrase('a'.repeat(MIN_SYNC_PASSPHRASE_LENGTH - 1))).toBe(false);
  });

  it('רווחים בלבד אינם ממלאים את האורך', () => {
    expect(isValidSyncPassphrase(' '.repeat(30))).toBe(false);
  });

  it('סיסמה תקינה מתקבלת', () => {
    expect(isValidSyncPassphrase(PASSPHRASE)).toBe(true);
  });

  it('⭐ אריזה עם סיסמה חלשה נכשלת — לא מייצרת בלוב', async () => {
    await seed();
    await expect(buildVault(db, 'קצרה', NOW)).rejects.toMatchObject({
      name: 'VaultError',
      reason: 'weak_passphrase',
    });
  });

  it('⭐ סיסמה ריקה לא מייצרת בלוב גלוי', async () => {
    await seed();
    // זה המקרה המסוכן: `serializeBackup` ללא סיסמה מחזיר JSON קריא.
    await expect(buildVault(db, '', NOW)).rejects.toBeInstanceOf(VaultError);
  });
});

describe('⭐ מה שנשלח אטום', () => {
  it('הבלוב מסומן כמוצפן ואין בו שדה נתונים', async () => {
    await seed();
    const vault = await buildVault(db, PASSPHRASE, NOW);
    const parsed = JSON.parse(vault.ciphertext) as Record<string, unknown>;

    expect(parsed.encrypted).toBe(true);
    expect(parsed).not.toHaveProperty('data');
    expect(typeof parsed.payload).toBe('string');
  });

  /**
   * ⭐ הבדיקה החשובה בקובץ: חיפוש טקסט גלוי בתוך מה שנשלח.
   *
   * לא בודקים דגלים אלא את המחרוזת עצמה — בדיוק כפי שמי שיסתכל
   * במסד הנתונים יראה אותה.
   */
  it('⭐ אין שם בית עסק, סכום או שם טבלה בטקסט גלוי', async () => {
    await seed();
    const { ciphertext } = await buildVault(db, PASSPHRASE, NOW);

    for (const leak of ['חנות לדוגמה', 'merchant', 'transactions', 'amountAgorot', '420000']) {
      expect(ciphertext).not.toContain(leak);
    }
  });

  it('הסיסמה עצמה לא נמצאת בבלוב', async () => {
    await seed();
    const { ciphertext } = await buildVault(db, PASSPHRASE, NOW);
    expect(ciphertext).not.toContain(PASSPHRASE);
  });

  it('שתי אריזות של אותם נתונים אינן זהות', async () => {
    await seed();
    const a = await buildVault(db, PASSPHRASE, NOW);
    const b = await buildVault(db, PASSPHRASE, NOW);
    // salt ו-IV אקראיים בכל פעם — אחרת אפשר להסיק מהענן ששום דבר לא השתנה.
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});

describe('פתיחה', () => {
  it('⭐ מחזור מלא: אריזה → פתיחה → שחזור מחזיר את אותם נתונים', async () => {
    await seed();
    const before = await loadSnapshot(db, NOW);
    const { ciphertext } = await buildVault(db, PASSPHRASE, NOW);

    const data = await openVault(ciphertext, PASSPHRASE);
    await restoreBackup(db, data);

    const after = await loadSnapshot(db, NOW);
    expect(after).toEqual(before);
  });

  it('⭐ סיסמה שגויה נכשלת ולא מחזירה נתונים חלקיים', async () => {
    await seed();
    const { ciphertext } = await buildVault(db, PASSPHRASE, NOW);

    await expect(openVault(ciphertext, 'סיסמה-אחרת-לגמרי-9')).rejects.toMatchObject({
      name: 'VaultError',
      reason: 'bad_passphrase',
    });
  });

  it('⭐ בלוב שהשתנה בענן נדחה — AES-GCM מאמת', async () => {
    await seed();
    const { ciphertext } = await buildVault(db, PASSPHRASE, NOW);
    const parsed = JSON.parse(ciphertext) as { payload: string };
    // שינוי תו אחד ב-payload. בלי אימות זה היה מפוענח לזבל.
    const flipped = parsed.payload[0] === 'A' ? 'B' : 'A';
    const tampered = JSON.stringify({
      ...parsed,
      payload: flipped + parsed.payload.slice(1),
    });

    await expect(openVault(tampered, PASSPHRASE)).rejects.toBeInstanceOf(VaultError);
  });

  it('טקסט שאינו בלוב נדחה בהודעה ברורה', async () => {
    await expect(openVault('לא JSON בכלל', PASSPHRASE)).rejects.toMatchObject({
      name: 'VaultError',
    });
  });
});

describe('מטא־נתונים', () => {
  it('מספר הרשומות תואם את מה שנארז', async () => {
    await seed();
    const vault = await buildVault(db, PASSPHRASE, NOW);
    expect(vault.totalRecords).toBeGreaterThan(0);
    expect(vault.schemaVersion).toBeGreaterThan(0);
  });
});
