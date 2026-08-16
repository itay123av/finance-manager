/**
 * מסך הנעילה.
 *
 * ⚠️ מה שהמסך הזה עושה ומה שהוא לא — ראה `src/data/appLock.ts`.
 * בקצרה: הוא מונע מבט מזדמן. הוא **אינו** מצפין את בסיס הנתונים.
 *
 * שלוש החלטות:
 *
 * 1. **טעינת דף נועלת תמיד.** לא שומרים "נפתח" ב-localStorage —
 *    זה היה הופך את הנעילה לדקורטיבית מול מי שסוגר ופותח את הכרטיסייה.
 * 2. **נעילה חוזרת לפי זמן שהיה ברקע**, לא לפי טיימר שרץ ברקע.
 *    טיימרים בטלפון קופאים כשהאפליקציה לא בחזית; השוואת חותמות זמן
 *    עובדת גם כשהמכשיר ישן.
 * 3. **השהיה גוברת אחרי כישלונות.** לא נעילה לצמיתות — אין כאן מה
 *    לגנוב מרחוק, ומשתמש שנחסם מהנתונים של עצמו הוא נזק ודאי מול
 *    סיכון תיאורטי.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAppData } from './AppData';
import { verifyPin } from '../data/appLock';
import { db, wipeAllData } from '../data/db';
import { Button, Card, ConfirmDialog } from './components/ui';
import { Icon } from './components/icons';

/** אחרי כמה ניסיונות מתחילה השהיה, וכמה שניות לכל ניסיון נוסף. */
const FREE_ATTEMPTS = 5;
const DELAY_STEP_SECONDS = 5;

export function AppLockGate({ children }: { children: ReactNode }) {
  const { settings } = useAppData();
  const lock = settings?.lock;

  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [resetting, setResetting] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const relock = useCallback(() => {
    setUnlocked(false);
    setPin('');
    setError(null);
  }, []);

  // ── נעילה חוזרת ─────────────────────────────────────────────────
  useEffect(() => {
    if (!lock || !unlocked) return;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        // "מיד" = לנעול ברגע שעוזבים, בלי לחכות לחזרה
        if (lock.autoLockMinutes === 0) relock();
        return;
      }
      const away = hiddenAt.current === null ? 0 : Date.now() - hiddenAt.current;
      hiddenAt.current = null;
      if (away >= lock.autoLockMinutes * 60_000) relock();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [lock, unlocked, relock]);

  useEffect(() => {
    if (!unlocked) inputRef.current?.focus();
  }, [unlocked]);

  if (!lock || unlocked) return <>{children}</>;

  const waitSeconds = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));

  async function submit() {
    if (checking || waitSeconds > 0) return;
    setChecking(true);
    setError(null);
    try {
      if (await verifyPin(lock!, pin)) {
        setAttempts(0);
        setUnlocked(true);
        setPin('');
        return;
      }
      const next = attempts + 1;
      setAttempts(next);
      setPin('');
      setError('הקוד שגוי.');
      if (next >= FREE_ATTEMPTS) {
        setBlockedUntil(Date.now() + (next - FREE_ATTEMPTS + 1) * DELAY_STEP_SECONDS * 1000);
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <div className="text-center">
        <Icon name="lock" className="mx-auto size-10 text-slate-500" />
        <h1 className="mt-3 text-2xl font-bold text-slate-900">האפליקציה נעולה</h1>
        <p className="mt-1 text-sm text-slate-500">הזן את קוד הנעילה כדי להמשיך.</p>
      </div>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-3"
        >
          <label htmlFor="lock-pin" className="block text-sm font-medium text-slate-700">
            קוד נעילה
          </label>
          <input
            ref={inputRef}
            id="lock-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            aria-describedby={error ? 'lock-error' : undefined}
            aria-invalid={error !== null}
            className="min-h-14 w-full rounded-xl border border-slate-300 bg-surface px-3 text-center text-2xl tracking-[0.5em] tabular-nums"
          />
          {error ? (
            <p id="lock-error" role="alert" className="text-sm font-medium text-danger">
              {error}
              {waitSeconds > 0 ? ` אפשר לנסות שוב בעוד ${waitSeconds} שניות.` : ''}
            </p>
          ) : null}
          <Button type="submit" full disabled={checking || pin.length < 4 || waitSeconds > 0}>
            {checking ? 'בודק…' : 'לפתוח'}
          </Button>
        </form>
      </Card>

      {/* ⚠️ האיפוס היחיד שאינו סותר את עצמו.
          "שכחתי" שמסיר את הנעילה ומשאיר את הנתונים קריאים היה הופך את
          הנעילה לכפתור. הקוד עצמו לא נשמר, ולכן אין דרך להוכיח זהות —
          מלבד החזקה בקובץ הגיבוי. לכן: מוחקים, ומשחזרים מגיבוי. */}
      <div className="text-center">
        <Button variant="ghost" onClick={() => setResetting(true)}>
          שכחתי את הקוד
        </Button>
      </div>

      <ConfirmDialog
        open={resetting}
        title="שכחת את הקוד"
        body={
          <>
            <p>הקוד עצמו לא נשמר בשום מקום, ולכן אי אפשר לשחזר אותו ואי אפשר לעקוף אותו.</p>
            <p className="mt-2">
              הדרך היחידה להיכנס בלעדיו היא <strong>למחוק את הנתונים שבמכשיר</strong> ואז לשחזר
              אותם מקובץ גיבוי.
            </p>
            <p className="mt-2 font-medium text-slate-800">
              אם אין לך גיבוי — ההיסטוריה תאבד. במקרה כזה עדיף לנסות להיזכר.
            </p>
          </>
        }
        confirmLabel="למחוק ולהתחיל מחדש"
        confirmWord="מחק"
        destructive
        onCancel={() => setResetting(false)}
        onConfirm={async () => {
          await wipeAllData(db);
          setResetting(false);
          setUnlocked(true);
        }}
      />
    </main>
  );
}
