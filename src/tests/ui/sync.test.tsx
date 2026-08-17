/**
 * מסך הסנכרון.
 *
 * ⚠️ הבדיקות כאן שומרות על הבטחות שנאמרות למשתמש במסך עצמו. הבטחה
 * שנשברת בשקט גרועה מהבטחה שלא ניתנה:
 *
 * - סיסמת ההצפנה לא נשמרת בשום מקום.
 * - דריסה לא קורית בלי מסך אישור שמראה מספרים.
 * - בהתנגשות אין כפתור ראשי שמכריע במקום המשתמש.
 * - כשהסנכרון כבוי — אין שום פנייה לרשת.
 */

// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import type * as ClientModule from '../../data/sync/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fakeServer: {
  session: { user: { id: string; email: string } } | null;
  row: { ciphertext: string; schemaVersion: number; updatedAt: string; deviceLabel: string | null } | null;
  networkCalls: number;
} = { session: null, row: null, networkCalls: 0 };

vi.mock('../../data/sync/client', async () => {
  const actual = await vi.importActual<typeof ClientModule>('../../data/sync/client');
  return {
    ...actual,
    currentSession: async () => fakeServer.session,
    fetchRemoteTimestamp: async () => {
      fakeServer.networkCalls += 1;
      return fakeServer.row?.updatedAt ?? null;
    },
    fetchRemoteVault: async () => {
      fakeServer.networkCalls += 1;
      return fakeServer.row;
    },
    pushVault: async (input: { ciphertext: string; schemaVersion: number }) => {
      fakeServer.networkCalls += 1;
      const updatedAt = new Date(Date.UTC(2026, 7, 17, 10)).toISOString();
      fakeServer.row = { ...input, updatedAt, deviceLabel: null };
      return updatedAt;
    },
    signIn: async () => {
      fakeServer.session = { user: { id: 'u1', email: 'me@example.invalid' } };
      return fakeServer.session;
    },
    signOut: async () => {
      fakeServer.session = null;
    },
  };
});

import { Sync } from '../../ui/screens/Sync';
import { SyncBanner } from '../../ui/components/SyncBanner';
import { ToastProvider } from '../../ui/Toast';
import { db, wipeAllData } from '../../data/db';
import { addTransaction, completeOnboarding, BANK_ACCOUNT_ID } from '../../data/repositories';
import { fromShekels } from '../../core/money';
import { buildVault } from '../../data/sync/vault';
import { recordSyncSuccess, readSyncState } from '../../data/sync/state';
import { MemoryRouter } from 'react-router-dom';

const PASSPHRASE = 'סיסמת-סנכרון-ארוכה-1';

beforeEach(async () => {
  await db.open();
  await wipeAllData(db);
  fakeServer.session = null;
  fakeServer.row = null;
  fakeServer.networkCalls = 0;
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

describe('לפני התחברות', () => {
  it('מסביר מה נשלח לפני שמבקש פרטים', async () => {
    renderSync();
    expect(await screen.findByText(/מה זה נותן/)).toBeTruthy();
    expect(screen.getByText(/בלוב אחד מוצפן/)).toBeTruthy();
  });

  it('⭐ מבהיר שסיסמת החשבון אינה מפתח ההצפנה', async () => {
    renderSync();
    expect(await screen.findByText(/אינה מפתח ההצפנה/)).toBeTruthy();
  });
});

describe('אחרי התחברות', () => {
  beforeEach(() => {
    fakeServer.session = { user: { id: 'u1', email: 'me@example.invalid' } };
  });

  it('⭐ מזהיר שאין שחזור לסיסמת ההצפנה — לפני שבוחרים אותה', async () => {
    await onboard();
    renderSync();
    expect(await screen.findByText(/אין שחזור לסיסמה הזו/)).toBeTruthy();
  });

  it('⭐ בלי סיסמת הצפנה אי אפשר להעלות', async () => {
    await onboard();
    renderSync();
    const upload = await screen.findByRole('button', { name: /להעלות/ });
    expect(upload.hasAttribute('disabled')).toBe(true);
  });

  it('⭐ סיסמה קצרה מדי לא מפעילה את הכפתור', async () => {
    await onboard();
    renderSync();
    const input = await screen.findByLabelText('סיסמה');
    await userEvent.type(input, 'קצרה');
    expect((await screen.findByRole('button', { name: /להעלות/ })).hasAttribute('disabled')).toBe(
      true,
    );
  });

  /**
   * ⭐ ההבטחה המרכזית של המסך: הסיסמה חיה בזיכרון בלבד.
   *
   * נבדק מול המקום היחיד שבו היא הייתה יכולה לשרוד — בסיס הנתונים
   * ואחסון הדפדפן.
   */
  it('⭐ סיסמת ההצפנה לא נשמרת בבסיס הנתונים ולא ב-localStorage', async () => {
    await onboard();
    await spend(64);
    renderSync();

    await userEvent.type(await screen.findByLabelText('סיסמה'), PASSPHRASE);
    await userEvent.click(await screen.findByRole('button', { name: /להעלות/ }));

    await waitFor(async () => expect((await readSyncState(db)).lastSyncedRemoteAt).not.toBeNull());

    const settings = JSON.stringify(await db.settings.toArray());
    expect(settings).not.toContain(PASSPHRASE);
    expect(JSON.stringify(await db.syncState.toArray())).not.toContain(PASSPHRASE);
    expect(JSON.stringify({ ...localStorage })).not.toContain(PASSPHRASE);
  });

  it('⭐ מה שנשלח לשרת אינו מכיל טקסט גלוי', async () => {
    await onboard();
    await spend(64);
    renderSync();

    await userEvent.type(await screen.findByLabelText('סיסמה'), PASSPHRASE);
    await userEvent.click(await screen.findByRole('button', { name: /להעלות/ }));

    await waitFor(() => expect(fakeServer.row).not.toBeNull());
    expect(fakeServer.row!.ciphertext).not.toContain('חנות לדוגמה');
    expect(fakeServer.row!.ciphertext).not.toContain(PASSPHRASE);
  });
});

describe('⭐ התנגשות', () => {
  beforeEach(async () => {
    fakeServer.session = { user: { id: 'u1', email: 'me@example.invalid' } };

    // הענן מחזיק מצב אחר, ונקודת הייחוס ישנה משניהם.
    await onboard();
    await spend(120, '2026-08-15');
    const remote = await buildVault(db, PASSPHRASE, new Date('2026-08-15T10:00:00Z'));
    fakeServer.row = {
      ciphertext: remote.ciphertext,
      schemaVersion: remote.schemaVersion,
      updatedAt: '2026-08-16T10:00:00Z',
      deviceLabel: 'מחשב',
    };
    await recordSyncSuccess(db, '2026-08-14T10:00:00Z', new Date('2026-08-14T10:00:00Z'));
    await spend(45, '2026-08-16');
  });

  it('⭐ מוצגת התנגשות, ושתי האפשרויות אומרות מה נמחק', async () => {
    renderSync();
    expect(await screen.findByText(/שני הצדדים השתנו/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /ולדרוס את הענן/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ולדרוס את המכשיר/ })).toBeTruthy();
  });

  /**
   * ⭐ אין ברירת מחדל ויזואלית. שני הכפתורים באותו משקל, כדי שהבחירה
   * תהיה בחירה ולא לחיצה על מה שבולט.
   */
  it('⭐ אף אחת משתי האפשרויות אינה כפתור ראשי', async () => {
    renderSync();
    const keepLocal = await screen.findByRole('button', { name: /ולדרוס את הענן/ });
    const keepRemote = screen.getByRole('button', { name: /ולדרוס את המכשיר/ });
    expect(keepLocal.className).toBe(keepRemote.className);
  });

  it('⭐ בחירה בענן לא כותבת מיד — קודם מוצגת תצוגה מקדימה', async () => {
    renderSync();
    await userEvent.type(await screen.findByLabelText('סיסמה'), PASSPHRASE);
    await userEvent.click(screen.getByRole('button', { name: /ולדרוס את המכשיר/ }));

    expect(await screen.findByText(/מה עומד להיכנס/)).toBeTruthy();
    expect(screen.getByText(/עדיין לא נכתבו/)).toBeTruthy();

    // ⭐ העסקה המקומית עדיין קיימת — שום דבר לא נדרס.
    expect(await db.transactions.count()).toBe(2);
  });
});

describe('⭐ הבאנר בלוח הבקרה', () => {
  it('⭐ כשהסנכרון כבוי — אין רכיב ואין אף פנייה לרשת', async () => {
    await onboard();
    render(
      <MemoryRouter>
        <SyncBanner />
      </MemoryRouter>,
    );

    await waitFor(() => expect(fakeServer.networkCalls).toBe(0));
    expect(screen.queryByText(/סנכרון/)).toBeNull();
  });

  it('מציג התראה כשיש שינויים שלא הועלו', async () => {
    fakeServer.session = { user: { id: 'u1', email: 'me@example.invalid' } };
    await onboard();
    await recordSyncSuccess(db, '2026-08-14T10:00:00Z', new Date('2026-08-14T10:00:00Z'));
    fakeServer.row = {
      ciphertext: 'x',
      schemaVersion: 1,
      updatedAt: '2026-08-14T10:00:00Z',
      deviceLabel: null,
    };
    await spend(45, '2026-08-16');

    render(
      <MemoryRouter>
        <SyncBanner />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/יש שינויים שלא הועלו/)).toBeTruthy();
  });
});
