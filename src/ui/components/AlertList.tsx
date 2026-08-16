/**
 * רצועת ההתראות בלוח הבקרה.
 *
 * ⚠️ שני כללי תצוגה שנובעים מהתוכן ולא מהעיצוב:
 *
 * 1. **מעט בכל פעם.** רשימה של שבע התראות אינה נקראת — היא נגללת.
 *    לכן מוצגות שלוש, והשאר מאחורי כפתור.
 * 2. **אזהרה נראית אחרת מידיעה.** אם הכל צהוב, שום דבר לא דחוף.
 *
 * הטון מגיע מ-`core/alerts.ts` ולא משתנה כאן: מדווח, לא נוזף.
 */

import { useState } from 'react';
import type { Alert } from '../../core/alerts';
import { Icon } from './icons';

const VISIBLE_BY_DEFAULT = 3;

/**
 * ההתראות כבר ממוינות לפי דחיפות ב-`core/alerts.ts`, ולכן "החשובה
 * ביותר" היא פשוט הראשונה.
 */
export function topAlerts(alerts: readonly Alert[], count: number): Alert[] {
  return alerts.slice(0, count);
}

function AlertRow({ alert }: { alert: Alert }) {
  const warn = alert.severity === 'warn';
  return (
    <li
      className={`rounded-xl border p-3 ${
        warn ? 'border-caution-300 bg-caution-100/50' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <p className={`text-sm font-semibold ${warn ? 'text-caution-700' : 'text-slate-700'}`}>
        <Icon name={warn ? 'alert-triangle' : 'info'} className="size-4" />
        {alert.titleHe}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{alert.bodyHe}</p>
    </li>
  );
}

export function AlertList({ alerts }: { alerts: readonly Alert[] }) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const shown = expanded ? alerts : alerts.slice(0, VISIBLE_BY_DEFAULT);
  const hidden = alerts.length - shown.length;

  return (
    <section aria-label="התראות">
      <ul className="space-y-2">
        {shown.map((alert) => (
          <AlertRow key={alert.id} alert={alert} />
        ))}
      </ul>

      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 min-h-11 px-1 text-sm font-semibold text-accent"
        >
          עוד {hidden} ←
        </button>
      ) : null}
    </section>
  );
}
