/**
 * התנועה — מסלול שאף בדיקה אחרת לא מריצה.
 *
 * ⚠️ למה הקובץ הזה קיים: בכל שאר בדיקות הממשק אין `matchMedia`, ולכן
 * התנועה כבויה והמספרים מופיעים סופיים מיד. גם חלונית הדפדפן שבה
 * העיצוב נבדק מדמה "הפחתת תנועה". כלומר מסלול האנימציה — בדיוק מה
 * שמשתמש רגיל רואה — לא נבדק בשום מקום. כאן הוא נבדק, מול שעון
 * מבוקר כדי שהתוצאה לא תלויה במהירות המחשב.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MOTION_OK_QUERY, stagger, useCountUp } from '../../ui/motion';
import { BudgetMeter, GoalRing } from '../../ui/components/visuals';

function mockMotion(allowed: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === MOTION_OK_QUERY ? allowed : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

function mockHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

/** שעון מבוקר: כל פריים מקדם אותו ב-16ms, בלי קשר לזמן האמיתי. */
let clock = 0;

beforeEach(() => {
  clock = 0;
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => {
      clock += 16;
      cb(clock);
    }, 16),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // @ts-expect-error — מחזירים את jsdom למצבו הטבעי: בלי matchMedia
  delete window.matchMedia;
  delete (document as unknown as { hidden?: boolean }).hidden;
});

function Probe({ target, seen }: { target: number; seen?: number[] }) {
  const value = Math.round(useCountUp(target, 200));
  seen?.push(value);
  return <span data-testid="value">{value}</span>;
}

const shown = () => screen.getByTestId('value').textContent;

describe('ספירה עד הערך', () => {
  it('⭐ מי שביקש פחות תנועה מקבל את הערך הסופי מיד', () => {
    mockMotion(false);
    render(<Probe target={500} />);
    expect(shown()).toBe('500');
  });

  it('⭐ עם תנועה — מתחיל מאפס ומגיע בדיוק לערך, לא בערך', () => {
    mockMotion(true);
    mockHidden(false);
    render(<Probe target={500} />);
    expect(shown()).toBe('0');

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(shown()).toBe('500');
  });

  /**
   * ⭐ טאב מוסתר לא מריץ פריימים. בלי הקפיצה, היתרה הייתה נשארת על
   * ₪0 עד שהמשתמש חוזר לאפליקציה.
   */
  it('⭐ בטאב מוסתר — קופץ לערך במקום להיתקע על 0', () => {
    mockMotion(true);
    mockHidden(true);
    render(<Probe target={500} />);
    expect(shown()).toBe('500');
  });

  /**
   * ⭐ הוספת עסקה משנה את היתרה. המספר צריך לנוע מהערך הקודם אל החדש,
   * ולא לצנוח לאפס ולספור מחדש — זה נראה כמו "הכסף נעלם לרגע".
   */
  it('⭐ שינוי ערך — נע מהערך הקודם, בלי לצנוח לאפס', () => {
    mockMotion(true);
    mockHidden(false);
    const seen: number[] = [];
    const { rerender } = render(<Probe target={500} seen={seen} />);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(shown()).toBe('500');

    seen.length = 0;
    rerender(<Probe target={800} seen={seen} />);
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(shown()).toBe('800');
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(500);
  });

  it('גם ירידה בערך נוחתת בדיוק על היעד', () => {
    mockMotion(true);
    mockHidden(false);
    const { rerender } = render(<Probe target={800} />);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    rerender(<Probe target={-130} />);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(shown()).toBe('-130');
  });
});

describe('מדים נגישים', () => {
  it('⭐ טבעת היעד מדווחת ערך מעוגל לקורא מסך', () => {
    mockMotion(false);
    render(<GoalRing pct={68.4} label="התקדמות ליעד" />);
    const ring = screen.getByRole('progressbar', { name: 'התקדמות ליעד' });
    expect(ring.getAttribute('aria-valuenow')).toBe('68');
    expect(ring.getAttribute('aria-valuemax')).toBe('100');
  });

  it('⭐ ערכים מחוץ לטווח נחתכים — טבעת לא "מתמלאת" מעבר ל-100%', () => {
    mockMotion(false);
    const { rerender } = render(<GoalRing pct={140} label="יעד" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
    rerender(<GoalRing pct={-5} label="יעד" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });

  it('מד התקציב נחתך ב-100% גם כשיש חריגה', () => {
    mockMotion(false);
    render(<BudgetMeter spentPct={104} elapsedPct={64} tone="caution" />);
    const meter = screen.getByRole('progressbar', { name: 'ניצול התקציב החודשי' });
    expect(meter.getAttribute('aria-valuenow')).toBe('100');
  });
});

describe('כניסה מדורגת', () => {
  it('⭐ ההשהיה נעצרת בשש מדרגות — אחרת מסך ארוך מרגיש איטי', () => {
    expect(stagger(10).animationDelay).toBe(stagger(6).animationDelay);
    expect(stagger(0).animationDelay).toBe('0ms');
  });
});
