/**
 * "יש משהו לסנכרן" בלוח הבקרה.
 *
 * ⚠️ **הבאנר בודק ולא פועל.** הוא שולח שאילתה אחת שמחזירה חותמת זמן,
 * ואם יש פער — מפנה למסך הסנכרון. הוא לא מוריד, לא מפענח ולא כותב.
 *
 * למה לא סנכרון אוטומטי מלא: סיסמת ההצפנה קיימת בזיכרון בלבד ונעלמת
 * בכל רענון, ולכן ברגע פתיחת האפליקציה אין במה לפענח. אפשר היה לשמור
 * אותה — וזה בדיוק מה שהופך הצפנה מקצה לקצה לחסרת ערך. העדפנו לחיצה
 * אחת ביום על פני הצפנה למראית עין.
 *
 * ⚠️ כשהסנכרון כבוי או שאין חשבון, הרכיב לא מרנדר כלום ולא נוגע ברשת.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { checkSync } from '../../data/sync/sync';
import { readSyncState } from '../../data/sync/state';
import type { SyncAction } from '../../core/syncDecision';
import { Banner, buttonClass } from './ui';

interface Nudge {
  title: string;
  body: string;
  tone: 'info' | 'caution';
}

const NUDGES: Partial<Record<SyncAction, Nudge>> = {
  push: {
    title: 'יש שינויים שלא הועלו',
    body: 'הזנת נתונים מאז הסנכרון האחרון. הם עדיין רק במכשיר הזה.',
    tone: 'info',
  },
  pull: {
    title: 'יש עדכון בענן',
    body: 'מכשיר אחר עדכן נתונים. כאן עדיין רואים את הגרסה הקודמת.',
    tone: 'info',
  },
  conflict: {
    title: 'התנגשות בין המכשירים',
    body: 'גם כאן וגם בענן השתנו נתונים. צריך לבחור איזה צד לשמור — אנחנו לא נבחר במקומך.',
    tone: 'caution',
  },
};

export function SyncBanner() {
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // ⚠️ יציאה מוקדמת בלי רשת: מי שלא הפעיל סנכרון לא ישלח שום בקשה.
      const state = await readSyncState(db);
      if (!state.enabled) return;

      try {
        const status = await checkSync(db);
        if (cancelled || !status.signedIn) return;
        setNudge(NUDGES[status.decision.action] ?? null);
      } catch {
        // ⚠️ בשקט. אין רשת או שהשרת נפל — זה לא אמור להפריע לשימוש
        // באפליקציה, שעובדת מקומית ממילא.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!nudge || dismissed) return null;

  return (
    <Banner
      tone={nudge.tone}
      title={nudge.title}
      body={nudge.body}
      action={
        <Link to="/sync" className={buttonClass('primary')}>
          למסך הסנכרון
        </Link>
      }
      onDismiss={() => setDismissed(true)}
    />
  );
}
