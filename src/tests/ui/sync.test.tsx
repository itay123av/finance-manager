/**
 * מסך הסנכרון — זרימת קוד החיבור.
 *
 * ⚠️ הבדיקות כאן שומרות על ההבטחות שהמסך נותן:
 *
 * - במכשיר הראשון לא מקלידים כלום.
 * - קוד שגוי לא יוצר חשבון חדש בשקט.
 * - הקוד מוצג עם אזהרה ומוסתר כברירת מחדל.
 * - דריסה לא קורית בלי מסך שמראה מספרים.
 * - בהתנגשות אין כפתור ראשי שמכריע במקום המשתמש.
 */

// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import type * as ClientModule from '../../data/sync/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** שרת מדומה: חשבונות לפי אימייל, ושורת vault אחת. */
const fakeServer: {
  accounts: Map<string, string>;
  session: { user: { id: string; email: string } } | null;
  row: {
    ciphertext: string;
    schemaVersion: number;
    updatedAt: string;
    deviceLabel: string | null;
  } | null;
} = { accounts: new Map(), session: null, row: null };

vi.mock('../../data/sync/client', async () => {
  const actual = await vi.importActual<typeof ClientModule>('../../data/sync/client');
  const { SyncError } = actual;
  return {
    ...actual,
    currentSession: async () => fakeServer.session,
    signUp: async (email: string, password: string) => {
      if (fakeServer.accounts.has(email)) throw new SyncError('כבר קיים חשבון', 'auth');
      fakeServer.accounts.set(email, password);
      fakeServer.session = { user: { id: email, email } };
      return fakeServer.session;
    },
    signIn: async (email: string, password: string) => {
      if (fakeServer.accounts.get(email) !== password) {
        throw new SyncError('אימייל או סיסמה שגויים', 'auth');
      }
      fakeServer.session = { user: { id: email, email } };
      return fakeServer.session;
    },
    signOut: async () => {
      fakeServer.session = null;
    },
    fetchRemoteTimestamp: async () => fakeServer.row?.updatedAt ?? null,
    fetchRemoteVault: async () => fakeServer.row,
    pushVault: async (input: { ciphertext: string; schemaVersion: number }) => {
      const updatedAt = new Date(Date.UTC(2026, 7, 17, 10)).toISOString();
      fakeServer.row = { ...input, updatedAt, deviceLabel: null };
      return updatedAt;
    },
    deleteRemoteVault: async () => {
      fakeServer.row = null;
    },
  };
});

import { Sync } from '../../ui/screens/Sync';
import { SyncBanner } from '../../ui/components/SyncBanner';
import { ToastProvider } from '../../ui/Toast';
import { db, wipeAllData } from '../../data/db';
import { addTransaction, completeOnboarding, BANK_ACCOUNT_ID } from '../../data/repositories';
import { fromShekels } from '../../core/money';
import { readSyncState, recordSyncSuccess } from '../../data/sync/state';
import { deriveIdentity } from '../../data/sync/identity';
import { buildVault } from '../../data/sync/vault';
import { MemoryRouter } from 'react-router-dom';

beforeEach(async () => {
  await db.open();
  await wipeAllData(db);
  fakeServer.accounts = new Map();
  fakeServer.session = null;
  fakeServer.row = null;
});

function renderSync() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <Sync />
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function onboard() {
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
async function spend(shekels: number, date = '2026-08-10') {
  await addTransaction(db, {
    accountId: BANK_ACCOUNT_ID,
    date,
    amountAgorot: fromShekels(shekels),
    type: 'expense',
    categoryId: 'cat-food-out',
    merchant: 'חנות לדוגמה',
  });
}

describe('לפני הפעלה', () => {
  it('⭐ אין שדה אימייל ואין שדה סיסמה', async () => {
    renderSync();
    await screen.findByText(/מה זה נותן/);

    expect(screen.queryByLabelText(/אימייל/)).toBeNull();
    expect(screen.queryByLabelText(/סיסמה/)).toBeNull();
    expect(screen.getByText(/אין הרשמה, אין אימייל ואין סיסמה/)).toBeTruthy();
  });

  it('⭐ הפעלה במכשיר הראשון היא לחיצה אחת, בלי הקלדה', async () => {
    await onboard();
    renderSync();

    await userEvent.click(await screen.findByRole('button', { name: 'להפעיל סנכרון' }));

    await waitFor(async () => {
      const state = await readSyncState(db);
      expect(state.enabled).toBe(true);
      expect(state.pairingCode).not.toBeNull();
      expect(state.rememberedPassphrase).not.toBeNull();
    });
  });
});

describe('חיבור מכשיר שני', () => {
  it('⭐ קוד לא שלם לא מאפשר לשלוח', async () => {
    renderSync();
    await userEvent.click(await screen.findByRole('button', { name: /יש לי קוד/ }));
    await userEvent.type(screen.getByLabelText('קוד חיבור'), 'ABCD');

    expect(screen.getByRole('button', { name: 'לחבר את המכשיר' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  /**
   * ⭐ קוד שאין לו חשבון חייב להיכשל במפורש. אילו היה יוצר חשבון
   * חדש, המשתמש היה רואה "סונכרן בהצלחה" מול אפס עסקאות ומסיק
   * שהנתונים שלו נמחקו.
   */
  it('⭐ קוד שגוי נכשל ולא יוצר חשבון חדש', async () => {
    renderSync();
    await userEvent.click(await screen.findByRole('button', { name: /יש לי קוד/ }));
    await userEvent.type(screen.getByLabelText('קוד חיבור'), 'ZZZZ2345EFGH6789');
    await userEvent.click(screen.getByRole('button', { name: 'לחבר את המכשיר' }));

    expect(await screen.findByText(/לא נמצא חשבון עם הקוד הזה/)).toBeTruthy();
    expect(fakeServer.accounts.size).toBe(0);
    expect((await readSyncState(db)).enabled).toBe(false);
  });

  it('⭐ קוד נכון מחבר לאותו חשבון בדיוק', async () => {
    const code = 'ABCD2345EFGH6789';
    const identity = await deriveIdentity(code);
    fakeServer.accounts.set(identity.email, identity.password);

    renderSync();
    await userEvent.click(await screen.findByRole('button', { name: /יש לי קוד/ }));
    await userEvent.type(screen.getByLabelText('קוד חיבור'), code);
    await userEvent.click(screen.getByRole('button', { name: 'לחבר את המכשיר' }));

    await waitFor(async () => {
      const state = await readSyncState(db);
      expect(state.enabled).toBe(true);
      // ⭐ אותו מפתח הצפנה בדיוק — זה מה שמאפשר לפענח את הבלוב
      expect(state.rememberedPassphrase).toBe(identity.passphrase);
    });
  });
});

describe('⭐ הקוד השמור', () => {
  async function connect() {
    const code = 'ABCD2345EFGH6789';
    const identity = await deriveIdentity(code);
    fakeServer.accounts.set(identity.email, identity.password);
    fakeServer.session = { user: { id: identity.email, email: identity.email } };
    const { rememberPassphrase, writeSyncState } = await import('../../data/sync/state');
    await rememberPassphrase(db, identity.passphrase);
    await writeSyncState(db, { enabled: true, pairingCode: code });
    return { code, identity };
  }

  it('⭐ מוסתר כברירת מחדל — הוא שווה ערך לגישה מלאה', async () => {
    await onboard();
    await connect();
    renderSync();

    expect(await screen.findByText('הקוד מוסתר')).toBeTruthy();
    expect(screen.queryByText('ABCD-2345-EFGH-6789')).toBeNull();
  });

  it('⭐ מוצג רק אחרי בקשה מפורשת, עם אזהרה', async () => {
    await onboard();
    await connect();
    renderSync();

    await userEvent.click(await screen.findByRole('button', { name: 'להציג את הקוד' }));

    expect(screen.getByText('ABCD-2345-EFGH-6789')).toBeTruthy();
    expect(screen.getByText(/הקוד הזה הוא המפתח לנתונים/)).toBeTruthy();
  });
});

describe('⭐ התנגשות', () => {
  beforeEach(async () => {
    const code = 'ABCD2345EFGH6789';
    const identity = await deriveIdentity(code);
    fakeServer.accounts.set(identity.email, identity.password);
    fakeServer.session = { user: { id: identity.email, email: identity.email } };

    await onboard();
    await spend(120, '2026-08-15');
    const remote = await buildVault(db, identity.passphrase, new Date('2026-08-15T10:00:00Z'));
    fakeServer.row = {
      ciphertext: remote.ciphertext,
      schemaVersion: remote.schemaVersion,
      updatedAt: '2026-08-16T10:00:00Z',
      deviceLabel: 'מחשב',
    };
    await recordSyncSuccess(db, '2026-08-14T10:00:00Z', new Date('2026-08-14T10:00:00Z'));

    const { rememberPassphrase, writeSyncState } = await import('../../data/sync/state');
    await rememberPassphrase(db, identity.passphrase);
    await writeSyncState(db, { enabled: true, pairingCode: code });

    await spend(45, '2026-08-16');
  });

  it('⭐ מוצגת התנגשות, ושתי האפשרויות אומרות מה נמחק', async () => {
    renderSync();
    expect(await screen.findByText(/שני הצדדים השתנו/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /ולדרוס את הענן/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ולדרוס את המכשיר/ })).toBeTruthy();
  });

  it('⭐ אף אחת משתי האפשרויות אינה כפתור ראשי', async () => {
    renderSync();
    const keepLocal = await screen.findByRole('button', { name: /ולדרוס את הענן/ });
    const keepRemote = screen.getByRole('button', { name: /ולדרוס את המכשיר/ });
    expect(keepLocal.className).toBe(keepRemote.className);
  });

  it('⭐ בחירה בענן לא כותבת מיד — קודם מוצגת תצוגה מקדימה', async () => {
    renderSync();
    await userEvent.click(await screen.findByRole('button', { name: /ולדרוס את המכשיר/ }));

    expect(await screen.findByText(/מה עומד להיכנס/)).toBeTruthy();
    expect(screen.getByText(/עדיין לא נכתבו/)).toBeTruthy();
    expect(await db.transactions.count()).toBe(2);
  });
});

describe('⭐ מה שנשלח', () => {
  it('⭐ הבלוב אטום ואינו מכיל את קוד החיבור', async () => {
    const code = 'ABCD2345EFGH6789';
    const identity = await deriveIdentity(code);
    fakeServer.accounts.set(identity.email, identity.password);
    fakeServer.session = { user: { id: identity.email, email: identity.email } };

    await onboard();
    await spend(64);
    const { rememberPassphrase, writeSyncState } = await import('../../data/sync/state');
    await rememberPassphrase(db, identity.passphrase);
    await writeSyncState(db, { enabled: true, pairingCode: code });

    renderSync();
    await userEvent.click(await screen.findByRole('button', { name: /להעלות/ }));

    await waitFor(() => expect(fakeServer.row).not.toBeNull());
    expect(fakeServer.row!.ciphertext).not.toContain('חנות לדוגמה');
    expect(fakeServer.row!.ciphertext).not.toContain(code);
    expect(fakeServer.row!.ciphertext).not.toContain(identity.passphrase);
  });
});

describe('⭐ מכשיר חדש לפני אונבורדינג', () => {
  it('⭐ מסך הסנכרון נגיש בלי חשבונות ובלי יעד', async () => {
    const { App } = await import('../../ui/App');
    window.location.hash = '#/sync';

    render(<App />);

    expect(await screen.findByText(/מה זה נותן/)).toBeTruthy();
    expect(screen.queryByText('נתחיל')).toBeNull();
  });

  it('⭐ האונבורדינג מציע שחזור לפני שהוא מבקש למלא טופס', async () => {
    const { App } = await import('../../ui/App');
    window.location.hash = '#/';

    render(<App />);

    expect(await screen.findByText(/כבר יש לך נתונים במכשיר אחר/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'שחזור מהענן' })).toBeTruthy();
  });
});

describe('⭐ הבאנר בלוח הבקרה', () => {
  it('⭐ כשהסנכרון כבוי — אין רכיב', async () => {
    await onboard();
    render(
      <MemoryRouter>
        <SyncBanner />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.queryByText(/יש שינויים/)).toBeNull());
  });
});
