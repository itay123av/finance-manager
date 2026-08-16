/**
 * בדיקות הליטוש — מה שנוסף בשלב 7.
 *
 * ⚠️ הבדיקות כאן לא בודקות עיצוב. הן בודקות את ההתנהגויות שקל לשבור
 * בלי לשים לב: נעילה שנפתחת בלי קוד, ביטול שלא מחזיר, תזכורת שחוזרת
 * אחרי שנדחתה, ומסך שמסתובב לנצח במקום להגיד שאין נתונים.
 */

// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../ui/App';
import { db, wipeAllData } from '../../data/db';
import { addTransaction, completeOnboarding, saveSettings, BANK_ACCOUNT_ID } from '../../data/repositories';
import { createLock } from '../../data/appLock';
import { fromShekels } from '../../core/money';

beforeEach(async () => {
  await db.open();
  await wipeAllData(db);
  // ⚠️ HashRouter קורא מ-`location`, וה-hash שורד בין בדיקות באותו
  // מסמך jsdom. בלי האיפוס, בדיקה שניווטה משאירה את הבאה אחריה
  // במסך אחר — והכישלון נראה כמו באג במסך הבית.
  window.location.hash = '';
});

async function onboard() {
  await completeOnboarding(db, {
    bankBalanceAgorot: fromShekels(1090),
    cashBalanceAgorot: fromShekels(150),
    safetyBufferAgorot: fromShekels(500),
    targetAgorot: fromShekels(5000),
    milestones: [fromShekels(1000), fromShekels(2500), fromShekels(5000)],
    estimatedMonthlySpendAgorot: fromShekels(400),
    openingDate: '2026-08-01',
  });
}

async function seedTransaction(merchant = 'דוכן') {
  return addTransaction(db, {
    accountId: BANK_ACCOUNT_ID,
    date: '2026-08-05',
    amountAgorot: fromShekels(64),
    type: 'expense',
    categoryId: 'cat-food-out',
    merchant,
  });
}

// ---------------------------------------------------------------------------

describe('🔒 נעילת האפליקציה', () => {
  it('⭐ עם נעילה פעילה, שום נתון פיננסי לא מוצג לפני הקוד', async () => {
    await onboard();
    await saveSettings(db, { lock: await createLock('4821', 5) });

    const { container } = render(<App />);
    expect(await screen.findByRole('heading', { name: 'האפליקציה נעולה' })).toBeTruthy();

    // לא היתרה, ולא סכום כלשהו
    expect(screen.queryByText('יש לך')).toBeNull();
    expect(container.querySelectorAll('.sensitive')).toHaveLength(0);
  });

  it('⭐ קוד שגוי לא פותח', async () => {
    const user = userEvent.setup();
    await onboard();
    await saveSettings(db, { lock: await createLock('4821', 5) });

    render(<App />);
    await screen.findByRole('heading', { name: 'האפליקציה נעולה' });

    await user.type(screen.getByLabelText('קוד נעילה'), '1111');
    await user.click(screen.getByRole('button', { name: 'לפתוח' }));

    expect((await screen.findByRole('alert')).textContent).toContain('הקוד שגוי');
    expect(screen.queryByText('יש לך')).toBeNull();
  });

  it('הקוד הנכון פותח את האפליקציה', async () => {
    const user = userEvent.setup();
    await onboard();
    await saveSettings(db, { lock: await createLock('4821', 5) });

    render(<App />);
    await screen.findByRole('heading', { name: 'האפליקציה נעולה' });

    await user.type(screen.getByLabelText('קוד נעילה'), '4821');
    await user.click(screen.getByRole('button', { name: 'לפתוח' }));

    expect(await screen.findByText('יש לך')).toBeTruthy();
  });

  it('בלי נעילה מוגדרת אין מסך נעילה', async () => {
    await onboard();
    render(<App />);
    expect(await screen.findByText('יש לך')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------

describe('👁 מצב דיסקרטי', () => {
  it('⭐ המתג מטשטש סכומים — ולא משנה נתונים', async () => {
    const user = userEvent.setup();
    await onboard();
    await seedTransaction();

    const { container } = render(<App />);
    await screen.findByText('יש לך');

    const balanceBefore = (await db.accounts.toArray()).map((a) => a.openingBalanceAgorot);
    expect(container.querySelector('.discreet')).toBeNull();

    await user.click(screen.getByRole('button', { name: /להסתיר סכומים/ }));

    await waitFor(() => expect(container.querySelector('.discreet')).not.toBeNull());
    // ⚠️ הסכומים עדיין ב-DOM — זו הסתרה ויזואלית, לא מחיקה. וכך גם
    // צריך להיות: קורא מסך חייב להמשיך לקרוא אותם.
    expect(container.querySelectorAll('.sensitive').length).toBeGreaterThan(3);
    expect((await db.accounts.toArray()).map((a) => a.openingBalanceAgorot)).toEqual(balanceBefore);
  });

  it('המתג משקף את המצב לקורא מסך', async () => {
    const user = userEvent.setup();
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    const toggle = screen.getByRole('button', { name: /להסתיר סכומים/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    await user.click(toggle);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /להציג סכומים/ }).getAttribute('aria-pressed'),
      ).toBe('true'),
    );
  });
});

// ---------------------------------------------------------------------------

describe('↩️ ביטול', () => {
  it('⭐ מחיקת עסקה מציעה ביטול, והביטול מחזיר את אותה רשומה', async () => {
    const user = userEvent.setup();
    await onboard();
    const original = await seedTransaction('דוכן');

    render(<App />);
    await screen.findByText('יש לך');

    await user.click(screen.getByRole('link', { name: 'עסקאות' }));
    await user.click(await screen.findByRole('button', { name: 'מחיקת דוכן' }));

    await waitFor(async () => expect(await db.transactions.count()).toBe(0));

    const toast = await screen.findByRole('status');
    expect(toast.textContent).toContain('העסקה נמחקה');

    await user.click(within(toast).getByRole('button', { name: 'ביטול' }));

    await waitFor(async () => expect(await db.transactions.count()).toBe(1));
    // ⚠️ **אותו** מזהה. רשומה חדשה הייתה שוברת קישור לפירוט כרטיס
    // ואת מניעת הכפילויות בייבוא.
    expect((await db.transactions.toArray())[0]).toEqual(original);
  });
});

// ---------------------------------------------------------------------------

describe('💾 תזכורת גיבוי', () => {
  it('⭐ מופיעה כשיש נתונים ואין גיבוי, ונעלמת אחרי דחייה', async () => {
    const user = userEvent.setup();
    await onboard();
    await seedTransaction();

    render(<App />);
    await screen.findByText('יש לך');

    const banner = await screen.findByRole('region', { name: /עוד לא גיבית/ });
    expect(within(banner).getByRole('link', { name: 'גיבוי עכשיו' })).toBeTruthy();

    await user.click(within(banner).getByRole('button', { name: 'לא עכשיו' }));

    await waitFor(() => expect(screen.queryByRole('region', { name: /עוד לא גיבית/ })).toBeNull());
    // הדחייה נשמרה — היא לא תחזור ברענון הבא
    expect((await db.settings.get('singleton'))?.backupReminderDismissedUntil).toBeDefined();
  });

  it('לא מופיעה כשאין בכלל עסקאות', async () => {
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');
    expect(screen.queryByRole('region', { name: /גיבית/ })).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('📭 מצבי ריק', () => {
  it('⭐ מסך התחזית אומר מה חסר במקום להסתובב לנצח', async () => {
    const user = userEvent.setup();
    await onboard();

    render(<App />);
    await screen.findByText('יש לך');

    await user.click(screen.getByRole('link', { name: 'החלטות' }));

    // ⚠️ מה שנבדק כאן הוא ש**משהו** מוצג — כותרת אמיתית ולא מסך
    // שמסתובב. בלי היסטוריה המסך עשוי להציג מצב ריק או תחזית זהירה
    // מהערכת האונבורדינג; שניהם תקינים. מה שאסור הוא "טוען…" לנצח.
    expect(await screen.findByRole('heading', { name: 'תחזית', level: 1 })).toBeTruthy();
    expect(screen.queryByText('טוען…')).toBeNull();
  });


  it('מסך "עוד" מוביל לכל מה שלא בשורת הניווט', async () => {
    const user = userEvent.setup();
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    await user.click(screen.getByRole('link', { name: 'עוד' }));

    for (const label of ['תובנות', 'הכנסות צפויות', 'רעיונות להכנסה', 'גיבוי ושחזור', 'הגדרות', 'פרטיות']) {
      expect(await screen.findByRole('link', { name: new RegExp(label) })).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------

describe('🌱 רעיונות להכנסה', () => {
  it('הרשימה מוצגת, עם אזהרה חוקית ובלי הבטחות רווח', async () => {
    const user = userEvent.setup();
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    await user.click(screen.getByRole('link', { name: 'עוד' }));
    await user.click(await screen.findByRole('link', { name: /רעיונות להכנסה/ }));

    const heading = await screen.findByRole('heading', { name: 'רעיונות להכנסה', level: 1 });
    expect(heading).toBeTruthy();
    expect(screen.getByText(/כל זכות/)).toBeTruthy();

    // ⚠️ נבדקת **רשימת הרעיונות** בלבד.
    //
    // הכותרת התחתונה של המסך אומרת במפורש "אין כאן המלצות השקעה,
    // מסחר או הלוואות" — וזו בדיוק ההצהרה שאנחנו רוצים שתישאר.
    // סריקה של המסך כולו הייתה נכשלת על המשפט שמגן עלינו.
    const list = heading.closest('main')!.querySelector('ul')!;
    for (const forbidden of ['הימור', 'קריפטו', 'מסחר', 'הלוואה', 'מובטח', 'בורסה']) {
      expect(list.textContent, forbidden).not.toContain(forbidden);
    }
    expect(list.textContent).toContain('שיעורים פרטיים');
  });
});
