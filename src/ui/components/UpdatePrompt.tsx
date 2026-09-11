/**
 * עדכון לגרסה חדשה.
 *
 * ⚠️ **שני מסלולים, לפי הרגע שבו העדכון נמצא.**
 *
 * 1. **בעלייה — מוחל לבד.** גרסה שממתינה כשהאפליקציה רק נפתחה, לפני
 *    שהמשתמש נגע במשהו, מוחלת מיד: אין שום דבר מוקלד שאפשר לאבד.
 *
 *    בגרסאות קודמות גם זה חיכה ללחיצה על באנר. מי שפספס או דחה אותו
 *    נשאר על הגרסה הישנה בכל פתיחה — בלי שום סימן לכך. זה בדיוק מה
 *    שקרה: אחרי עדכון עיצוב, המשתמש דיווח ש"זה נראה אותו הדבר".
 *
 * 2. **באמצע שימוש — שואלים.** החלפת הקוד טוענת מחדש את הדף. באמצע
 *    הזנת עסקה או מיפוי עמודות בייבוא זה היה מוחק את מה שהוקלד, בלי
 *    שהמשתמש יבין למה. כאן העדכון נשאר רגע שהוא בוחר.
 *
 * ⚠️ חזרה לאפליקציה (למשל מאפליקציה אחרת בטלפון) בודקת אם יצאה גרסה
 * חדשה. אפליקציה מותקנת כמעט אף פעם לא "נסגרת" באמת, ובלי הבדיקה הזו
 * היא הייתה מגלה עדכון רק לעיתים רחוקות.
 *
 * ⚠️ מדובר בקוד האפליקציה בלבד. הנתונים יושבים ב-IndexedDB ואינם
 * מושפעים מהעדכון; מיגרציות סכמה מטופלות ב-`data/db.ts`.
 *
 * נכתב מול ה-API הגולמי של Service Worker ולא מול מודול וירטואלי של
 * תוסף הבנייה — כדי שהקומפוננטה תעבוד גם בבדיקות (שם אין `serviceWorker`
 * כלל) ולא תישבר בשדרוג התוסף.
 */

import { useEffect, useState } from 'react';
import { Button } from './ui';

/** כמה זמן אחרי הטעינה עוד נחשב "עלייה", כל עוד לא הייתה אינטראקציה. */
const STARTUP_WINDOW_MS = 12_000;

/** אם העובד החדש לא השתלט תוך הזמן הזה — מציגים באנר במקום לחכות לנצח. */
const APPLY_TIMEOUT_MS = 4_000;

/** לא לבדוק עדכון בכל מעבר טאב — פעם בדקה מספיקה. */
const RECHECK_INTERVAL_MS = 60_000;

const loadedAt = typeof performance !== 'undefined' ? performance.now() : 0;
let interacted = false;

if (typeof window !== 'undefined') {
  const mark = () => {
    interacted = true;
  };
  window.addEventListener('pointerdown', mark, { capture: true, once: true });
  window.addEventListener('keydown', mark, { capture: true, once: true });
}

function isStartup(): boolean {
  return !interacted && performance.now() - loadedAt < STARTUP_WINDOW_MS;
}

export function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;
    let lastCheck = 0;
    let registrationRef: ServiceWorkerRegistration | null = null;

    const apply = (worker: ServiceWorker) => {
      // הדף נטען מחדש רק כשהעובד החדש באמת משתלט — לא לפני.
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
        once: true,
      });
      worker.postMessage({ type: 'SKIP_WAITING' });

      // ⚠️ רשת ביטחון: אם משהו מנע את ההשתלטות, לא משאירים את המשתמש
      // על גרסה ישנה בשקט — מציגים את הבאנר.
      window.setTimeout(() => {
        if (!cancelled) setWaiting(worker);
      }, APPLY_TIMEOUT_MS);
    };

    const offer = (worker: ServiceWorker) => {
      if (cancelled) return;
      if (isStartup()) apply(worker);
      else setWaiting(worker);
    };

    const watch = (registration: ServiceWorkerRegistration) => {
      if (cancelled) return;
      registrationRef = registration;

      // גרסה שכבר ממתינה — למשל כזו שהורדה בפעם הקודמת ולא הוחלה
      if (registration.waiting && navigator.serviceWorker.controller) {
        offer(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // `controller` קיים רק כשכבר רצה גרסה קודמת. בהתקנה ראשונה
          // אין "עדכון" — יש התקנה, ואין על מה להודיע.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            offer(installing);
          }
        });
      });
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !registrationRef) return;
      const now = performance.now();
      if (now - lastCheck < RECHECK_INTERVAL_MS) return;
      lastCheck = now;
      // בלי רשת זה פשוט נכשל — והאפליקציה ממשיכה לעבוד מהמטמון.
      registrationRef.update().catch(() => undefined);
    };

    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration) {
        watch(registration);
        return;
      }
      // `injectRegister: auto` מבצע register רק באירוע `load`. בריצה
      // הראשונה הקומפוננטה עולה לפניו, ולכן getRegistration מחזיר undefined.
      void navigator.serviceWorker.ready.then(watch);
    });

    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-24 z-50 mx-auto flex w-[min(28rem,calc(100%-2rem))] animate-sheet-in items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-surface px-4 py-3 elev-3 lg:bottom-8"
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">גרסה חדשה זמינה</p>
        <p className="text-xs text-slate-600">הנתונים שלך לא מושפעים.</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" onClick={() => setWaiting(null)}>
          אחר כך
        </Button>
        <Button
          onClick={() => {
            navigator.serviceWorker.addEventListener(
              'controllerchange',
              () => window.location.reload(),
              { once: true },
            );
            waiting.postMessage({ type: 'SKIP_WAITING' });
          }}
        >
          עדכן עכשיו
        </Button>
      </div>
    </div>
  );
}
