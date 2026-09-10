/**
 * ניווט צד — דסקטופ בלבד.
 *
 * ⚠️ למה שתי מערכות ניווט ולא אחת שמסתגלת:
 *
 * בטלפון, שורה תחתונה של חמישה יעדים היא הדפוס הנכון — האגודל מגיע
 * אליה, והיא לא גוזלת גובה. במסך רחב היא בזבוז: 1400 פיקסלים של
 * רוחב, וחמישה יעדים דחוסים בתחתית תוך הסתרת השאר מאחורי "עוד".
 *
 * לכן מ-1024 ומעלה מופיע סרגל צד שמציג את **כל** היעדים בבת אחת.
 * מסך "עוד" נשאר קיים לניווט ישיר, אבל אף אחד לא צריך לעבור דרכו.
 *
 * ⚠️ RTL: הסרגל הוא הילד הראשון ב-flex, ולכן ב-`dir="rtl"` הוא נוחת
 * בצד ימין — הצד שממנו מתחילים לקרוא. אין כאן `left`/`right` קשיחים.
 */

import { Link, useLocation } from 'react-router-dom';
import { APP_VERSION } from '../../version';
import { Icon, type IconName } from './icons';
import { BrandMark, buttonClass } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

interface NavGroup {
  title: string | null;
  items: NavItem[];
}

export const SIDEBAR_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      { to: '/', label: 'בית', icon: 'home' },
      { to: '/transactions', label: 'עסקאות', icon: 'receipt' },
      { to: '/budget', label: 'תקציב', icon: 'target' },
      { to: '/forecast', label: 'החלטות', icon: 'trending-up' },
    ],
  },
  {
    title: 'להבין',
    items: [
      { to: '/insights', label: 'תובנות', icon: 'lightbulb' },
      { to: '/review', label: 'סיכום תקופה', icon: 'calendar' },
    ],
  },
  {
    title: 'לתכנן',
    items: [
      { to: '/expected-income', label: 'הכנסות צפויות', icon: 'wallet' },
      { to: '/income-ideas', label: 'רעיונות להכנסה', icon: 'sprout' },
    ],
  },
  {
    title: 'נתונים',
    items: [
      { to: '/import', label: 'ייבוא קובץ', icon: 'download' },
      { to: '/categories', label: 'קטגוריות', icon: 'tag' },
      { to: '/backup', label: 'גיבוי ושחזור', icon: 'save' },
      { to: '/sync', label: 'סנכרון', icon: 'cloud' },
    ],
  },
  {
    title: 'המערכת',
    items: [
      { to: '/settings', label: 'הגדרות', icon: 'settings' },
      { to: '/privacy', label: 'פרטיות', icon: 'lock' },
    ],
  },
];

export function Sidebar({ onAddTransaction }: { onAddTransaction: () => void }) {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="ניווט ראשי"
      className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-e border-slate-200/70 bg-surface px-4 py-6 lg:flex 2xl:w-72"
    >
      <div className="mb-7 flex items-center gap-3 px-2">
        <BrandMark />
        <span className="text-base font-bold tracking-tight text-slate-900">ניהול כספים</span>
      </div>

      <button type="button" onClick={onAddTransaction} className={`mb-7 ${buttonClass('primary', true)}`}>
        <Icon name="plus" className="size-[1.125rem]" />
        עסקה חדשה
      </button>

      <div className="flex-1 space-y-6">
        {SIDEBAR_GROUPS.map((group, index) => (
          <div key={group.title ?? `group-${index}`}>
            {group.title ? (
              <p className="mb-1.5 px-3 text-xs font-semibold text-slate-500">{group.title}</p>
            ) : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.to;
                return (
                  <li key={item.to}>
                    {/* ⚠️ הפריט הפעיל מסומן גם ברקע וגם במשקל — לא בצבע בלבד. */}
                    <Link
                      to={item.to}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition ${
                        active
                          ? 'bg-brand-50 font-semibold text-accent-strong'
                          : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Icon
                        name={item.icon}
                        className={`size-5 ${active ? 'text-accent' : 'text-slate-500'}`}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-6 px-3 text-xs text-slate-500">
        <span className="num">v{APP_VERSION}</span>
      </p>
    </nav>
  );
}
