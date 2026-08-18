/**
 * הסנכרון שרץ לבד.
 *
 * ⚠️ **הכלל היחיד שהמנוע הזה לא שובר: פעולה אוטומטית יכולה להוסיף
 * נתונים, לעולם לא להרוס אותם.**
 *
 * מכאן נגזר הכל:
 *
 * - **העלאה** אוטומטית תמיד. היא רק מוסיפה עותק בענן, ואי אפשר
 *   לאבד ממנה כלום.
 * - **הורדה** אוטומטית רק כשלא השתנה כאן דבר מאז הסנכרון האחרון.
 *   במצב הזה אין מה לדרוס — הנתונים המקומיים זהים למה שכבר סונכרן.
 * - **התנגשות** לעולם לא אוטומטית. שני הצדדים זזו, ורק המשתמש יודע
 *   איזה מהם נכון.
 *
 * ⚠️ המנוע לא מרנדר כלום. הוא יושב מתחת ל-`AppDataProvider` ומגיב
 * לשינויים בנתונים דרך אותו `useLiveQuery` שמזין את המסכים — כלומר
 * כל מסלול כתיבה מכוסה, גם ייבוא וגם ביטול ייבוא, בלי שאף מסך
 * צריך "לזכור" לקרוא לסנכרון.
 */

import { useEffect, useRef } from 'react';
import { db } from '../data/db';
import { useAppData } from './AppData';
import { readSyncState } from '../data/sync/state';
import { currentSession } from '../data/sync/client';
import { applyPull, checkSync, preparePull, push } from '../data/sync/sync';

/**
 * כמה להמתין אחרי שינוי לפני העלאה.
 *
 * ⚠️ הזנת עסקה היא רצף של שינויים (סכום, קטגוריה, הערה). העלאה על
 * כל אחד מהם הייתה מייצרת עשר בקשות במקום אחת. חמש שניות מספיקות
 * כדי שהרצף ייגמר, וקצרות מספיק כדי שסגירת הטאב מיד אחרי לא תפספס
 * את הרוב.
 */
const PUSH_DELAY_MS = 5_000;

function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'מכשיר';
  return /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'טלפון' : 'מחשב';
}

export function SyncEngine() {
  const { snapshot } = useAppData();

  /** מונע שתי פעולות במקביל — במיוחד העלאה בזמן הורדה. */
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** המשיכה בפתיחה רצה פעם אחת, לא בכל שינוי בנתונים. */
  const openedRef = useRef(false);

  useEffect(() => {
    if (!snapshot) return;

    const runSafely = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const state = await readSyncState(db);
        const passphrase = state.rememberedPassphrase;
        if (!state.enabled || !passphrase) return;
        if (!(await currentSession())) return;

        const status = await checkSync(db);
        const { action } = status.decision;

        // ⚠️ התנגשות: לא נוגעים. הבאנר בלוח הבקרה כבר מפנה למסך
        // ההכרעה, וכל פעולה כאן הייתה מוחקת צד אחד בשקט.
        if (action === 'conflict') return;

        if (action === 'push' || action === 'push_initial') {
          await push(db, passphrase, { deviceLabel: deviceLabel() });
          return;
        }

        // ⚠️ הורדה אוטומטית רק אם המצב המקומי לא זז מאז הסנכרון
        // האחרון. `pull` נגזר בדיוק מהמצב הזה, ולכן אין מה לאבד —
        // ובכל זאת נוצר גיבוי לפני הכתיבה.
        if (action === 'pull' || action === 'pull_initial') {
          const pending = await preparePull(passphrase);
          await applyPull(db, pending);
        }
      } catch {
        // ⚠️ בשקט ובלי לשבור את האפליקציה. אין רשת, השרת מושהה או
        // הסיסמה כבר לא מתאימה — הנתונים המקומיים שלמים, וזה מה
        // שחשוב. המשתמש יראה את המצב במסך הסנכרון.
      } finally {
        running.current = false;
      }
    };

    // בפתיחה: בדיקה מיידית, כדי לקלוט מה שנעשה במכשיר אחר.
    if (!openedRef.current) {
      openedRef.current = true;
      void runSafely();
      return;
    }

    // אחרי שינוי בנתונים: העלאה מושהית.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void runSafely(), PUSH_DELAY_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [snapshot]);

  return null;
}
