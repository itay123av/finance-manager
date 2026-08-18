/**
 * "הדפדפן עלול למחוק את הנתונים".
 *
 * ⚠️ הבאנר הזה נוסף אחרי אובדן נתונים אמיתי.
 *
 * IndexedDB הוא אחסון זמני כברירת מחדל, והדפדפן רשאי לפנות אותו בלי
 * להודיע. עד עכשיו האפליקציה לא ביקשה אחסון קבוע ולא הציגה את
 * המצב — כלומר המשתמש גילה את הבעיה רק כשהנתונים כבר לא היו.
 *
 * ⚠️ מוצג רק כשהבקשה **נדחתה**. כשהאחסון קבוע אין כאן רעש.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ensurePersistentStorage, type StorageStatus } from '../../data/persistence';
import { Banner, buttonClass } from './ui';

export function StorageBanner() {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // ⚠️ קריאה חוזרת ולא רק קריאת מצב: דפדפנים מאשרים אחסון קבוע
    // אחרי שהאתר "מוכיח את עצמו" (ביקורים חוזרים, התקנה), ולכן בקשה
    // שנדחתה בפעם הראשונה עשויה להתקבל מאוחר יותר.
    void ensurePersistentStorage().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status !== 'best_effort' || dismissed) return null;

  return (
    <Banner
      tone="caution"
      title="הדפדפן עלול למחוק את הנתונים"
      body="הדפדפן לא התחייב לשמור את הנתונים במכשיר הזה — הוא רשאי לפנות אותם כשנגמר לו מקום, בלי להודיע. הוספה למסך הבית מקטינה את הסיכון, וגיבוי או סנכרון מבטלים אותו."
      action={
        <Link to="/backup" className={buttonClass('primary')}>
          לגבות עכשיו
        </Link>
      }
      onDismiss={() => setDismissed(true)}
    />
  );
}
