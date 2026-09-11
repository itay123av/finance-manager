/**
 * עדכון לגרסה חדשה.
 *
 * ⚠️ **מה היה שבור — נמצא בבדיקה ישירה מול האתר החי, לא בתיאוריה.**
 *
 * משתמש דיווח ש"זה נראה אותו הדבר" אחרי עדכון עיצוב. בסימולציה של
 * הטלפון שלו: הדף טען את הקוד הישן, הגרסה החדשה הייתה מותקנת
 * ו**ממתינה** — והבאנר "גרסה חדשה זמינה" **לא הופיע בכלל**.
 *
 * הסיבה: מרוץ. הדפדפן מתחיל להתקין את הגרסה החדשה עוד לפני שהקומפוננטה
 * הזו עולה. כשהיא בדקה, העובד החדש עוד לא היה "ממתין" — ואירוע
 * `updatefound` כבר עבר. שני מסלולי הזיהוי פספסו, והמשתמש נשאר על
 * הגרסה הישנה בכל פתיחה, בלי שום סימן.
 *
 * ⚠️ **התיקון בשתי שכבות:**
 *
 * 1. **הגרסה החדשה לא ממתינה יותר** (`registerType: 'autoUpdate'` ב-
 *    `vite.config.ts` → skipWaiting + clientsClaim). היא משתלטת ברגע
 *    שהותקנה, בלי תלות בקוד הדף. זה מה שמציל גם דף שרץ עם הקוד הישן
 *    והשבור: הפתיחה הבאה שלו כבר מגיעה מהגרסה החדשה.
 *
 * 2. **הדף מגיב להשתלטות** — `controllerchange`, שנשלח לדף עצמו:
 *    - **בעלייה**, לפני שהמשתמש נגע במשהו → נטען מחדש מיד. אין מה לאבד.
 *    - **באמצע שימוש** → באנר קטן. טעינה מחדש בכוח באמצע הזנת עסקה
 *      הייתה מוחקת את מה שהוקלד.
 *
 * ⚠️ מה שעדיין אפשרי: השתלטות שקרתה עוד לפני שהקומפוננטה עלתה לא
 * תיתפס כאן. במקרה הזה הדף הנוכחי נשאר על הקוד הישן — אבל הגרסה החדשה
 * כבר פעילה, ולכן הפתיחה הבאה מגיעה ממנה. אין יותר "תקוע לתמיד".
 *
 * ⚠️ חזרה לאפליקציה בודקת אם יצאה גרסה חדשה. אפליקציה מותקנת כמעט אף
 * פעם לא "נסגרת" באמת, ובלי הבדיקה הזו עדכון היה מתגלה רק לעיתים רחוקות.
 *
 * ⚠️ מדובר בקוד האפליקציה בלבד. הנתונים ב-IndexedDB אינם מושפעים.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from './ui';

/** כמה זמן אחרי הטעינה עוד נחשב "עלייה", כל עוד לא הייתה אינטראקציה. */
const STARTUP_WINDOW_MS = 12_000;

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

export function UpdatePrompt({
  reload = () => window.location.reload(),
}: {
  /** מוזרק בבדיקות. בפועל — טעינה מחדש של הדף. */
  reload?: () => void;
}) {
  const [updated, setUpdated] = useState(false);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const container = navigator.serviceWorker;

    let cancelled = false;
    let reloading = false;
    let lastCheck = 0;
    let registrationRef: ServiceWorkerRegistration | null = null;

    // ⚠️ בביקור הראשון אין controller, וההשתלטות הראשונה היא התקנה ולא
    // עדכון. רק החלפה של controller שכבר היה נחשבת "גרסה חדשה".
    const hadController = Boolean(container.controller);

    const onControllerChange = () => {
      if (cancelled || reloading || !hadController) return;
      if (isStartup()) {
        reloading = true;
        reloadRef.current();
      } else {
        setUpdated(true);
      }
    };

    /**
     * עובד ממתין מבנייה ישנה, מלפני skipWaiting — מבקשים ממנו להשתלט.
     * ההשתלטות עצמה מגיעה חזרה כ-`controllerchange` ומטופלת למעלה.
     */
    const nudge = (worker: ServiceWorker | null | undefined) => {
      if (worker && container.controller) worker.postMessage({ type: 'SKIP_WAITING' });
    };

    const track = (worker: ServiceWorker | null | undefined) => {
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') nudge(worker);
      });
    };

    const watch = (registration: ServiceWorkerRegistration) => {
      if (cancelled) return;
      registrationRef = registration;
      nudge(registration.waiting);
      // ⚠️ המרוץ שגרם לתקלה: עובד שכבר באמצע התקנה ברגע שהגענו לכאן.
      // `updatefound` שלו כבר עבר, ולכן עוקבים אחריו ישירות.
      track(registration.installing);
      registration.addEventListener('updatefound', () => track(registration.installing));
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !registrationRef) return;
      const now = performance.now();
      if (now - lastCheck < RECHECK_INTERVAL_MS) return;
      lastCheck = now;
      // בלי רשת זה פשוט נכשל — והאפליקציה ממשיכה לעבוד מהמטמון.
      registrationRef.update().catch(() => undefined);
    };

    container.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisible);

    void container.getRegistration().then((registration) => {
      if (registration) {
        watch(registration);
        return;
      }
      // `injectRegister: auto` מבצע register רק באירוע `load`. בריצה
      // הראשונה הקומפוננטה עולה לפניו, ולכן getRegistration מחזיר undefined.
      void container.ready.then(watch);
    });

    return () => {
      cancelled = true;
      container.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!updated) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-24 z-50 mx-auto flex w-[min(28rem,calc(100%-2rem))] animate-sheet-in items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-surface px-4 py-3 elev-3 lg:bottom-8"
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">האפליקציה עודכנה</p>
        <p className="text-xs text-slate-600">רענון יציג את הגרסה החדשה. הנתונים לא מושפעים.</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" onClick={() => setUpdated(false)}>
          אחר כך
        </Button>
        <Button onClick={() => reloadRef.current()}>לרענן</Button>
      </div>
    </div>
  );
}
