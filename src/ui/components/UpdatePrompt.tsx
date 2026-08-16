/**
 * "גרסה חדשה זמינה".
 *
 * ⚠️ למה לא עדכון אוטומטי:
 *
 * החלפת הקוד מתחת לידיים של המשתמש טוענת מחדש את הדף. אם זה קורה
 * באמצע הזנת עסקה או מיפוי עמודות בייבוא — מה שהוקלד נעלם, והמשתמש
 * לא מבין למה. עדכון הוא רגע שהוא בוחר, לא אירוע שקורה לו.
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

export function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;

    const watch = (registration: ServiceWorkerRegistration) => {
      if (cancelled) return;

      // גרסה חדשה שכבר ממתינה — למשל אחרי שהמשתמש דחה קודם
      if (registration.waiting && navigator.serviceWorker.controller) {
        setWaiting(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // `controller` קיים רק כשכבר רצה גרסה קודמת. בהתקנה ראשונה
          // אין "עדכון" — יש התקנה, ואין על מה להודיע.
          if (installing.state === 'installed' && navigator.serviceWorker.controller && !cancelled) {
            setWaiting(installing);
          }
        });
      });
    };

    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration) {
        watch(registration);
        return;
      }

      // `injectRegister: auto` מבצע register רק באירוע `load`. בריצה
      // הראשונה הקומפוננטה עולה לפניו, ולכן getRegistration מחזיר undefined.
      // `ready` סוגר את המרוץ ומשאיר watcher מחובר לעדכון הבא.
      void navigator.serviceWorker.ready.then(watch);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-24 z-50 mx-auto flex w-[min(28rem,calc(100%-2rem))] items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 shadow-lg"
    >
      <div>
        <p className="text-sm font-semibold text-accent-strong">גרסה חדשה זמינה</p>
        <p className="text-xs text-accent">הנתונים שלך לא מושפעים.</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" onClick={() => setWaiting(null)}>
          אחר כך
        </Button>
        <Button
          onClick={() => {
            // הדף נטען מחדש כשהעובד החדש משתלט — לא לפני
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
