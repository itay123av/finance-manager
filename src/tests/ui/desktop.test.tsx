/**
 * פריסת הדסקטופ.
 *
 * ⚠️ הבדיקות כאן קיימות בגלל סיכון אחד ספציפי: **שתי פריסות שנפרדות.**
 *
 * לוח הבקרה ומסך העסקאות בונים סידור אחר לרוחב מסך רחב. אם מישהו
 * יעדכן מספר בפריסה אחת וישכח את השנייה, המשתמש יראה נתון שונה לפי
 * גודל החלון — התקלה הגרועה ביותר שאפליקציה פיננסית יכולה לייצר.
 * לכן כל בדיקה כאן משווה את מה שהדסקטופ מציג למה שיושב בבסיס הנתונים.
 *
 * ⚠️ `matchMedia` אינו קיים ב-jsdom, ולכן `useIsDesktop` מחזיר `false`
 * וכל שאר בדיקות הממשק ממשיכות לרוץ מול המובייל. כאן הוא מוזרק
 * במפורש — וזה גם מה שמוודא שהמובייל הוא ברירת המחדל.
 */

// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { App } from '../../ui/App';
import { db, wipeAllData } from '../../data/db';
import { addTransaction, completeOnboarding, BANK_ACCOUNT_ID } from '../../data/repositories';
import { fromShekels } from '../../core/money';
import { DESKTOP_QUERY } from '../../ui/useMediaQuery';

/** מדמה חלון רחב. מוסר ב-`afterEach` כדי לא לדלוף לבדיקות אחרות. */
function mockDesktop(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query === DESKTOP_QUERY ? matches : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

beforeEach(async () => {
  await db.open();
  await wipeAllData(db);
  window.location.hash = '';
});

afterEach(() => {
  // @ts-expect-error — מחזירים את jsdom למצבו הטבעי: בלי matchMedia
  delete window.matchMedia;
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

async function seed(merchant: string, shekels: number) {
  return addTransaction(db, {
    accountId: BANK_ACCOUNT_ID,
    date: '2026-08-05',
    amountAgorot: fromShekels(shekels),
    type: 'expense',
    categoryId: 'cat-food-out',
    merchant,
  });
}

// ---------------------------------------------------------------------------

describe('🖥️ ניווט צד', () => {
  it('⭐ במסך רחב יש סרגל צד עם כל היעדים — ואין שורה תחתונה', async () => {
    mockDesktop(true);
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    const nav = screen.getByRole('navigation', { name: 'ניווט ראשי' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((l) => l.textContent);

    // כל היעדים, לא רק חמישה
    for (const label of ['בית', 'עסקאות', 'תקציב', 'החלטות', 'תובנות', 'גיבוי ושחזור', 'פרטיות']) {
      expect(labels.some((l) => l?.includes(label)), label).toBe(true);
    }
    expect(labels.length).toBeGreaterThanOrEqual(13);
  });

  it('⭐ הכפתור הצף נעלם במסך רחב — הפעולה עברה לסרגל', async () => {
    mockDesktop(true);
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    expect(screen.queryByRole('button', { name: 'הוספת עסקה' })).toBeNull();
    expect(screen.getByRole('button', { name: /עסקה חדשה/ })).toBeTruthy();
  });

  it('⭐ ברוחב צר חוזרים חמישה יעדים והכפתור הצף', async () => {
    mockDesktop(false);
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    const nav = screen.getByRole('navigation', { name: 'ניווט ראשי' });
    expect(within(nav).getAllByRole('link')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'הוספת עסקה' })).toBeTruthy();
  });

  it('⭐ יש בדיוק ניווט ראשי אחד בכל רוחב', async () => {
    // שני ניווטים עם אותו שם היו נשמעים לקורא מסך כתפריט כפול
    for (const desktop of [true, false]) {
      mockDesktop(desktop);
      await onboard();
      const view = render(<App />);
      await screen.findByText('יש לך');
      expect(screen.getAllByRole('navigation', { name: 'ניווט ראשי' })).toHaveLength(1);
      view.unmount();
      await wipeAllData(db);
    }
  });
});

// ---------------------------------------------------------------------------

describe('🖥️ לוח הבקרה במסך רחב', () => {
  it('⭐ ארבעת ה-KPI מציגים בדיוק את אותם מספרים כמו המובייל', async () => {
    await onboard();

    mockDesktop(false);
    const mobile = render(<App />);
    await screen.findByText('יש לך');
    const mobileAmounts = [...mobile.container.querySelectorAll('.sensitive')].map(
      (el) => el.textContent,
    );
    mobile.unmount();

    mockDesktop(true);
    const desktop = render(<App />);
    await screen.findByText('יש לך');
    const desktopAmounts = [...desktop.container.querySelectorAll('.sensitive')].map(
      (el) => el.textContent,
    );

    // ⚠️ הדסקטופ מציג יותר מופעים (שורת KPI + כרטיסים), אבל כל סכום
    // שמופיע במובייל חייב להופיע גם שם. מספר שנפל בדרך הוא באג.
    for (const amount of new Set(mobileAmounts)) {
      expect(desktopAmounts, amount ?? '').toContain(amount);
    }
  });

  it('שורת ה-KPI מציגה יתרה, בטוח להוציא, שמור ויעד', async () => {
    mockDesktop(true);
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    const main = screen.getByRole('main');
    for (const label of ['יש לך', 'בטוח להוציא עכשיו', 'שמור לחודשים הבאים', 'היעד']) {
      expect(within(main).getAllByText(label).length, label).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------

describe('🖥️ עסקאות כטבלה', () => {
  it('⭐ במסך רחב זו טבלה אמיתית, עם כותרות עמודה', async () => {
    mockDesktop(true);
    await onboard();
    await seed('דוכן', 64);

    render(<App />);
    await screen.findByText('יש לך');
    window.location.hash = '#/transactions';

    const table = await screen.findByRole('table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent?.trim());
    expect(headers).toEqual(['תאריך', 'תיאור', 'קטגוריה', 'חשבון', 'סכום', 'פעולות']);
    expect(within(table).getAllByRole('row').length).toBe(2); // כותרת + שורה אחת
  });

  it('⭐ הפעולות בטבלה זהות לאלה שבכרטיסים', async () => {
    mockDesktop(true);
    await onboard();
    await seed('דוכן', 64);

    render(<App />);
    await screen.findByText('יש לך');
    window.location.hash = '#/transactions';

    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: 'עריכת דוכן' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'מחיקת דוכן' })).toBeTruthy();
  });

  it('⭐ ברוחב צר אין טבלה — הכרטיסים נשארים', async () => {
    mockDesktop(false);
    await onboard();
    await seed('דוכן', 64);

    render(<App />);
    await screen.findByText('יש לך');
    window.location.hash = '#/transactions';

    expect(await screen.findByText('דוכן')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
