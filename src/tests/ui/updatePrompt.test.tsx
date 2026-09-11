/**
 * עדכון גרסה.
 *
 * ⚠️ הקובץ הזה נכתב אחרי שמשתמש נתקע על גרסה ישנה בלי שום סימן.
 *
 * בסימולציה מול האתר החי: הגרסה החדשה הייתה מותקנת וממתינה, והבאנר
 * לא הופיע — כי הדפדפן התחיל להתקין אותה לפני שהקומפוננטה עלתה, ושני
 * מסלולי הזיהוי פספסו. הבדיקות כאן מריצות את המרוץ הזה במפורש.
 *
 * ⚠️ הסדר בקובץ חשוב: המצב "המשתמש כבר נגע במשהו" נשמר ברמת המודול,
 * ולכן הבדיקה שמדמה אינטראקציה נמצאת אחרונה.
 */

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { UpdatePrompt } from '../../ui/components/UpdatePrompt';

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = 'installing';
  postMessage = vi.fn();
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  update = vi.fn(async () => undefined);
}

function installFakeServiceWorker({
  hasController = true,
  waiting = null,
  installing = null,
}: {
  hasController?: boolean;
  waiting?: FakeWorker | null;
  installing?: FakeWorker | null;
} = {}) {
  const registration = new FakeRegistration();
  registration.waiting = waiting;
  registration.installing = installing;

  const container = Object.assign(new EventTarget(), {
    controller: hasController ? {} : null,
    getRegistration: async () => registration,
    ready: Promise.resolve(registration),
  });

  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });
  return { container, registration };
}

/** נותן ל-`getRegistration` להסתיים ול-watch להתחבר. */
const settle = () => act(async () => {});

afterEach(() => {
  delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
});

describe('גרסה חדשה', () => {
  it('⭐ השתלטות בעלייה — נטען מחדש מיד, בלי לשאול', async () => {
    const { container } = installFakeServiceWorker();
    const reload = vi.fn();
    render(<UpdatePrompt reload={reload} />);
    await settle();

    act(() => {
      container.dispatchEvent(new Event('controllerchange'));
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('טעינה מחדש פעם אחת בלבד, גם אם האירוע מגיע פעמיים', async () => {
    const { container } = installFakeServiceWorker();
    const reload = vi.fn();
    render(<UpdatePrompt reload={reload} />);
    await settle();

    act(() => {
      container.dispatchEvent(new Event('controllerchange'));
      container.dispatchEvent(new Event('controllerchange'));
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('⭐ ביקור ראשון (בלי גרסה קודמת) אינו "עדכון"', async () => {
    const { container } = installFakeServiceWorker({ hasController: false });
    const reload = vi.fn();
    render(<UpdatePrompt reload={reload} />);
    await settle();

    act(() => {
      container.dispatchEvent(new Event('controllerchange'));
    });

    expect(reload).not.toHaveBeenCalled();
    expect(screen.queryByText('האפליקציה עודכנה')).toBeNull();
  });

  it('עובד ממתין מבנייה ישנה מתבקש להשתלט', async () => {
    const waiting = new FakeWorker();
    installFakeServiceWorker({ waiting });
    render(<UpdatePrompt reload={vi.fn()} />);
    await settle();

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  /**
   * ⭐ המרוץ שגרם לתקלה אצל המשתמש: כשהקומפוננטה עלתה, העובד החדש
   * כבר היה באמצע התקנה — לא "ממתין", ו-`updatefound` שלו כבר עבר.
   * הקוד הקודם לא ראה אותו אף פעם.
   */
  it('⭐ עובד שכבר באמצע התקנה ברגע העלייה — נתפס', async () => {
    const installing = new FakeWorker();
    installFakeServiceWorker({ installing });
    render(<UpdatePrompt reload={vi.fn()} />);
    await settle();

    installing.state = 'installed';
    installing.dispatchEvent(new Event('statechange'));

    expect(installing.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('עדכון שמתגלה אחרי העלייה — נתפס דרך updatefound', async () => {
    const { registration } = installFakeServiceWorker();
    render(<UpdatePrompt reload={vi.fn()} />);
    await settle();

    const incoming = new FakeWorker();
    registration.installing = incoming;
    registration.dispatchEvent(new Event('updatefound'));
    incoming.state = 'installed';
    incoming.dispatchEvent(new Event('statechange'));

    expect(incoming.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  /**
   * ⭐ אחרונה בקובץ: אחרי אינטראקציה, המצב נשאר "באמצע שימוש" לכל
   * שאר הבדיקות במודול.
   */
  it('⭐ באמצע שימוש — לא טוענים בכוח; מציעים לרענן', async () => {
    const { container } = installFakeServiceWorker();
    const reload = vi.fn();
    render(<UpdatePrompt reload={reload} />);
    await settle();

    fireEvent.pointerDown(window);
    act(() => {
      container.dispatchEvent(new Event('controllerchange'));
    });

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText('האפליקציה עודכנה')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'לרענן' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
