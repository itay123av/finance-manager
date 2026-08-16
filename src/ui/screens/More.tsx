/**
 * מסך "עוד".
 *
 * ⚠️ למה הוא קיים: הניווט התחתון גדל לשישה פריטים, וכל אחד מהם ירד
 * לרוחב של פחות מ-60 פיקסלים בטלפון קטן. חמישה יעדים קבועים ומגירה
 * אחת מחזירים למקום שאפשר ללחוץ עליו — ומשאירים את מה שלא נכנסים
 * אליו כל יום נגיש בלחיצה אחת, לא מוסתר.
 */

import { Page } from '../components/layout';
import { Link } from 'react-router-dom';
import { APP_VERSION } from '../../version';
import { Card, CardTitle } from '../components/ui';
import { Icon, type IconName } from '../components/icons';

interface Item {
  to: string;
  icon: IconName;
  label: string;
  note: string;
}

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'להבין',
    items: [
      { to: '/insights', icon: 'lightbulb', label: 'תובנות', note: 'דפוסים, מנויים וחודשים חריגים' },
      { to: '/review', icon: 'calendar', label: 'סיכום תקופה', note: 'מה קרה השבוע ומה קרה החודש' },
    ],
  },
  {
    title: 'לתכנן',
    items: [
      {
        to: '/expected-income',
        icon: 'wallet',
        label: 'הכנסות צפויות',
        note: 'כסף בדרך — ולמה הוא לא נספר עדיין',
      },
      {
        to: '/income-ideas',
        icon: 'sprout',
        label: 'רעיונות להכנסה',
        note: 'עשר דרכים מציאותיות בגיל שלך',
      },
    ],
  },
  {
    title: 'נתונים',
    items: [
      { to: '/import', icon: 'download', label: 'ייבוא קובץ', note: 'עו״ש או פירוט כרטיס אשראי' },
      { to: '/categories', icon: 'tag', label: 'קטגוריות', note: 'לערוך, להוסיף, לארכב' },
      { to: '/backup', icon: 'save', label: 'גיבוי ושחזור', note: 'ההגנה היחידה מאובדן המכשיר' },
    ],
  },
  {
    title: 'המערכת',
    items: [
      { to: '/settings', icon: 'settings', label: 'הגדרות', note: 'סכום ביטחון, יעד, נעילה, תצוגה' },
      { to: '/privacy', icon: 'lock', label: 'פרטיות', note: 'מה נשמר, מה לא, ומה המגבלה' },
    ],
  },
];

export function More() {
  return (
    <Page title="עוד" width="reading">

      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardTitle>{section.title}</CardTitle>
          <ul>
            {section.items.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="flex min-h-14 items-center gap-3 border-b border-slate-100 py-2 last:border-0"
                >
                  <Icon name={item.icon} className="size-5 text-slate-500" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-slate-800">{item.label}</span>
                    <span className="block text-xs text-slate-500">{item.note}</span>
                  </span>
                  <Icon name="chevron-inline" className="size-4 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <p className="pb-4 text-center text-xs text-slate-500">
        ניהול כספים <span className="num">v{APP_VERSION}</span>
      </p>
    </Page>
  );
}
