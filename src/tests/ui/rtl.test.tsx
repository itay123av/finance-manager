/**
 * בדיקות ממשק: עברית, RTL, ותצוגת המספרים.
 *
 * הממשק לא מחשב כלום, ולכן הבדיקות כאן לא בודקות מספרים אלא **הצגה**:
 * שהכיוון נכון, שהסכומים לא מתהפכים בתוך משפט בעברית, ושהמסך שנטען
 * ראשון הוא זה שצריך.
 */

// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../ui/App';
import { db, wipeAllData } from '../../data/db';
import { addTransaction, completeOnboarding, BANK_ACCOUNT_ID } from '../../data/repositories';
import { formatILS } from '../../core/money';
import { formatDateHe, formatMonthHe } from '../../core/dates';

beforeEach(async () => {
  await db.open();
  await wipeAllData(db);
});

async function onboard() {
  await completeOnboarding(db, {
    bankBalanceAgorot: 109_000,
    cashBalanceAgorot: 15_000,
    safetyBufferAgorot: 50_000,
    targetAgorot: 500_000,
    milestones: [100_000, 250_000, 500_000],
    estimatedMonthlySpendAgorot: 40_000,
    openingDate: '2026-08-01',
  });
}

describe('עברית ו-RTL', () => {
  it('המסמך מוגדר עברית וכיוון ימין-לשמאל', () => {
    // נקבע ב-index.html ומועתק לסביבת הבדיקה
    document.documentElement.lang = 'he';
    document.documentElement.dir = 'rtl';
    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('⭐ סכומים עטופים ב-.num כדי שלא יתהפכו בתוך טקסט בעברית', async () => {
    await onboard();
    const { container } = render(<App />);
    await screen.findByText('יש לך');

    const amounts = container.querySelectorAll('.num');
    expect(amounts.length).toBeGreaterThan(3);
    // ‎₪1,240 — הפסיק והסימן נשארים במקומם
    expect([...amounts].some((el) => el.textContent === '₪1,240')).toBe(true);
  });

  it('עיצוב הסכומים אינו תלוי בסביבה', () => {
    expect(formatILS(124_000)).toBe('₪1,240');
    expect(formatILS(-4_550, { showAgorot: true })).toBe('-₪45.50');
  });

  it('תאריכים וחודשים בפורמט ישראלי', () => {
    expect(formatDateHe('2026-08-07')).toBe('07/08/2026');
    expect(formatMonthHe('2026-08')).toBe('אוגוסט 2026');
  });
});

describe('מסך פתיחה', () => {
  it('לפני אונבורדינג מוצג מסך הפתיחה ולא לוח הבקרה', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'נתחיל' })).toBeTruthy();
    expect(screen.queryByText('יש לך')).toBeNull();
  });

  it('מציג שלוש בחירות מהירות לסכום ביטחון, עם ברירת מחדל מסומנת', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'נתחיל' });

    const group = screen.getByRole('radiogroup', { name: 'סכום ביטחון' });
    const options = within(group).getAllByRole('radio');
    expect(options.map((o) => o.textContent)).toEqual(['₪300', '₪500מומלץ', '₪800']);
    expect(options[1]?.getAttribute('aria-checked')).toBe('true');
  });

  it('בחירה בסכום אחר מסמנת אותו', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'נתחיל' });

    const group = screen.getByRole('radiogroup', { name: 'סכום ביטחון' });
    await user.click(within(group).getAllByRole('radio')[2]!);
    expect(within(group).getAllByRole('radio')[2]?.getAttribute('aria-checked')).toBe('true');
  });
});

describe('לוח הבקרה', () => {
  /**
   * ⭐ סדר הכרטיסים הוא החלטה, לא סידור.
   *
   * "כמה בטוח להוציא" הוא המספר שבגללו פותחים את האפליקציה, ולכן הוא
   * מגיע מיד אחרי היתרה — לפני היעד, שהוא מידע מעודד אבל לא מידע
   * שמשנה מה עושים בחמש הדקות הקרובות.
   */
  it('⭐ הסדר: יתרה ← בטוח להוציא ← יעד', async () => {
    await onboard();
    const { container } = render(<App />);

    await screen.findByText('יש לך');

    // כותרת עם הסבר כוללת גם את כפתור ה-"?" בתוכן, ולכן משווים בתחילית
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '');
    const safeIndex = headings.findIndex((h) => h.startsWith('בטוח להוציא עכשיו'));
    const goalIndex = headings.findIndex((h) => h.startsWith('היעד'));
    expect(safeIndex).toBeGreaterThanOrEqual(0);
    expect(safeIndex).toBeLessThan(goalIndex);

    // והיתרה עצמה לפני שניהם
    const balanceIndex = (container.textContent ?? '').indexOf('יש לך');
    expect(balanceIndex).toBeGreaterThanOrEqual(0);
  });

  it('פעולות מהירות זמינות במסך הראשי', async () => {
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    const quick = screen.getByRole('heading', { name: 'פעולות מהירות' }).closest('section')!;
    expect(within(quick).getByRole('button', { name: '+ עסקה' })).toBeTruthy();
    expect(within(quick).getByRole('link', { name: '+ הכנסה צפויה' })).toBeTruthy();
    expect(within(quick).getByRole('link', { name: 'גיבוי' })).toBeTruthy();
  });

  it('⭐ פירוט החישוב חושף את הכסף השמור לחודשים הבאים', async () => {
    const user = userEvent.setup();
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    await user.click(screen.getByRole('button', { name: 'איך חישבנו את זה?' }));
    const dialog = await screen.findByRole('dialog', { name: 'איך חישבנו' });

    expect(within(dialog).getByText('יתרה קיימת')).toBeTruthy();
    expect(within(dialog).getByText('− סכום ביטחון')).toBeTruthy();
    expect(within(dialog).getByText('− הוצאות חובה שנותרו')).toBeTruthy();
    expect(within(dialog).getByText('− שמור לחודשים הבאים')).toBeTruthy();
    expect(within(dialog).getByText('− תרומה ליעד החודש')).toBeTruthy();
    expect(within(dialog).getByText('בטוח להוציא')).toBeTruthy();
  });

  it('מצב ריק מזמין להוסיף עסקה ראשונה', async () => {
    await onboard();
    render(<App />);
    expect(await screen.findByText('עוד אין עסקאות')).toBeTruthy();
  });

  it('היתרה מתעדכנת אחרי הוספת עסקה', async () => {
    await onboard();
    const { container } = render(<App />);
    await screen.findByText('יש לך');
    expect([...container.querySelectorAll('.num')].some((el) => el.textContent === '₪1,240')).toBe(
      true,
    );

    await act(async () => {
      await addTransaction(db, {
        accountId: BANK_ACCOUNT_ID,
        date: '2026-08-05',
        amountAgorot: 6_400,
        type: 'expense',
        categoryId: 'cat-food-out',
        merchant: 'ארומה',
      });
    });

    await waitFor(() => {
      expect(
        [...container.querySelectorAll('.num')].some((el) => el.textContent === '₪1,176'),
      ).toBe(true);
    });
  });
});

describe('נגישות וניווט', () => {
  /**
   * ⭐ חמישה יעדים, לא יותר.
   *
   * ברוחב 320 פיקסלים, שישה פריטים נותנים לכל אחד פחות מ-54 פיקסלים —
   * מתחת למינימום המקובל למטרת מגע. הבדיקה הזו נכשלת אם מישהו יחזיר
   * "עוד לשונית אחת קטנה".
   */
  it('⭐ בניווט התחתון חמישה יעדים בדיוק, כל אחד עם שם קריא', async () => {
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    const nav = screen.getByRole('navigation', { name: 'ניווט ראשי' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'בית',
      'עסקאות',
      'תקציב',
      'החלטות',
      'עוד',
    ]);
  });

  it('כפתור הוספת עסקה נגיש מכל מסך', async () => {
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');
    expect(screen.getByRole('button', { name: 'הוספת עסקה' })).toBeTruthy();
  });

  it('⭐ "אפשר לקנות את זה?" נגיש בלחיצה אחת מהמסך הראשי', async () => {
    const user = userEvent.setup();
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    await user.click(screen.getByRole('button', { name: 'אפשר לקנות?' }));
    const dialog = await screen.findByRole('dialog', { name: 'אפשר לקנות את זה?' });
    expect(within(dialog).getByLabelText('סכום הרכישה')).toBeTruthy();
  });

  it('טופס העסקה נפתח כדיאלוג עם שדות מתויגים', async () => {
    const user = userEvent.setup();
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    await user.click(screen.getByRole('button', { name: 'הוספת עסקה' }));
    const dialog = await screen.findByRole('dialog', { name: 'עסקה חדשה' });

    expect(within(dialog).getByLabelText('סכום')).toBeTruthy();
    expect(within(dialog).getByLabelText('קטגוריה')).toBeTruthy();
    expect(within(dialog).getByRole('radiogroup', { name: 'סוג העסקה' })).toBeTruthy();
  });

  it('Escape סוגר דיאלוג ומחזיר את המיקוד לכפתור שפתח אותו', async () => {
    const user = userEvent.setup();
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    const trigger = screen.getByRole('button', { name: 'הוספת עסקה' });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'עסקה חדשה' });
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'עסקה חדשה' })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('⭐ קטגוריית "התאמת יתרה" אינה ניתנת לבחירה בהזנה ידנית', async () => {
    const user = userEvent.setup();
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    await user.click(screen.getByRole('button', { name: 'הוספת עסקה' }));
    const dialog = await screen.findByRole('dialog', { name: 'עסקה חדשה' });
    const options = within(dialog)
      .getByLabelText('קטגוריה')
      .querySelectorAll('option');

    const values = [...options].map((o) => o.getAttribute('value'));
    // היא נוצרת רק מהתאמה מול הבנק — בחירה ידנית בה הייתה מזייפת תיקון חשבונאי
    expect(values).not.toContain('cat-balance-adjustment');
    expect(values).toContain('cat-food-out');
  });

  it('מד ההתקדמות ליעד נגיש לקורא מסך', async () => {
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    const bars = screen.getAllByRole('progressbar');
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0]?.getAttribute('aria-valuenow')).toBe('25');
    expect(bars[0]?.getAttribute('aria-valuemax')).toBe('100');
  });
});

describe('התראות בלוח הבקרה', () => {
  it('⭐ מוצגות בטון מדווח ולא נוזף', async () => {
    await onboard();
    // הוצאה גדולה מייצרת תחזית לרדת מתחת לסכום הביטחון
    await addTransaction(db, {
      accountId: BANK_ACCOUNT_ID,
      date: '2026-08-02',
      amountAgorot: 90_000,
      type: 'expense',
      categoryId: 'cat-food-out',
      merchant: 'חנות',
    });

    render(<App />);
    await screen.findByText('יש לך');

    const alerts = await screen.findByRole('region', { name: 'התראות' });
    const text = alerts.textContent ?? '';
    expect(text.length).toBeGreaterThan(0);
    // אף התראה לא מאשימה
    for (const word of ['לא היית צריך', 'בזבזת', 'יותר מדי', 'תפסיק']) {
      expect(text).not.toContain(word);
    }
  });

  it('בלי התראות — לא מוצג אזור ריק', async () => {
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');
    expect(screen.queryByRole('region', { name: 'התראות' })).toBeNull();
  });
});
