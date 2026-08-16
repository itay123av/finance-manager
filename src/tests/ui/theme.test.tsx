/**
 * ערכת הצבעים.
 *
 * ⚠️ הבאג שהבדיקות האלה מגנות מפניו הוא לא "אין מצב כהה" אלא **מצב
 * חצי-כהה**: הגיליון הכריז `color-scheme: light dark` בזמן שיושם רק
 * בהיר, ולכן על מכשיר כהה הדפדפן צבע את הפקדים המובנים בכהה בעוד
 * שהכרטיסים נשארו לבנים.
 *
 * לכן שתי הבדיקות המרכזיות הן: שהערכה שנפתרת נכתבת כערך **מוחלט**
 * על `<html>`, ושהיא נשמרת בין הפעלות.
 */

// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../ui/App';
import { db, wipeAllData } from '../../data/db';
import { completeOnboarding } from '../../data/repositories';
import { fromShekels } from '../../core/money';
import { resolveTheme, DARK_QUERY } from '../../ui/useTheme';

function mockSystemDark(dark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query === DARK_QUERY ? dark : false,
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
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  // @ts-expect-error — מחזירים את jsdom למצבו הטבעי
  delete window.matchMedia;
});

async function onboard() {
  await completeOnboarding(db, {
    bankBalanceAgorot: fromShekels(1090),
    cashBalanceAgorot: fromShekels(150),
    safetyBufferAgorot: fromShekels(500),
    targetAgorot: fromShekels(5000),
    milestones: [fromShekels(1000)],
    estimatedMonthlySpendAgorot: fromShekels(400),
    openingDate: '2026-08-01',
  });
}

describe('פתרון ההעדפה', () => {
  it('בחירה מפורשת גוברת על הגדרת המכשיר', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('⭐ "לפי המכשיר" הולך אחרי המכשיר — וזו גם ברירת המחדל', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    // שדה חסר (גיבוי ישן, התקנה חדשה) מתנהג כמו `system`
    expect(resolveTheme(undefined, true)).toBe('dark');
    expect(resolveTheme(undefined, false)).toBe('light');
  });
});

describe('החלה על המסמך', () => {
  it('⭐ נכתב ערך מוחלט על <html> — לא "system"', async () => {
    mockSystemDark(true);
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');

    // ⚠️ גיליון הסגנונות מכיר שני מצבים בלבד. אילו היה נכתב כאן
    // `system`, אף כלל לא היה תופס והמסך היה נשאר בהיר.
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });

  it('הגדרת מכשיר בהירה נותנת ערכה בהירה', async () => {
    mockSystemDark(false);
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
  });

  it('⭐ בחירה מפורשת מנצחת מכשיר כהה', async () => {
    mockSystemDark(true);
    await onboard();
    await db.settings.update('singleton', { theme: 'light' });

    render(<App />);
    await screen.findByText('יש לך');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
  });
});

describe('הבחירה בהגדרות', () => {
  it('⭐ בחירת "כהה" נשמרת ומשנה את המסמך', async () => {
    const user = userEvent.setup();
    mockSystemDark(false);
    await onboard();

    render(<App />);
    await screen.findByText('יש לך');
    window.location.hash = '#/settings';

    const group = await screen.findByRole('radiogroup', { name: 'ערכת צבעים' });
    const options = within(group).getAllByRole('radio');
    expect(options.map((o) => o.textContent?.replace(/כרגע.*/, '').trim())).toEqual([
      'לפי המכשיר',
      'בהיר',
      'כהה',
    ]);

    await user.click(options[2]!);

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect((await db.settings.get('singleton'))?.theme).toBe('dark');
  });

  it('ברירת המחדל המסומנת היא "לפי המכשיר"', async () => {
    mockSystemDark(false);
    await onboard();
    render(<App />);
    await screen.findByText('יש לך');
    window.location.hash = '#/settings';

    const group = await screen.findByRole('radiogroup', { name: 'ערכת צבעים' });
    const checked = within(group)
      .getAllByRole('radio')
      .filter((o) => o.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0]?.textContent).toContain('לפי המכשיר');
  });
});
