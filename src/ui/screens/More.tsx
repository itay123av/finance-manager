/**
 * מסך "עוד".
 *
 * ⚠️ למה הוא קיים: הניווט התחתון גדל לשישה פריטים, וכל אחד מהם ירד
 * לרוחב של פחות מ-60 פיקסלים בטלפון קטן. חמישה יעדים קבועים ומגירה
 * אחת מחזירים למקום שאפשר ללחוץ עליו — ומשאירים את מה שלא נכנסים
 * אליו כל יום נגיש בלחיצה אחת, לא מוסתר.
 *
 * ⚠️ **v3 — אריחים במקום רשימה.** כל כלי הוא אריח עם מדליון, ובמסך
 * רחב שניים בשורה. הכרטיס הראשון עולה על הבאנר כמו בכל מסך.
 */

import { Page } from '../components/layout';
import { Link } from 'react-router-dom';
import { APP_VERSION } from '../../version';
import { Card, CardTitle, Medallion, type MedallionTone } from '../components/ui';
import { Icon, type IconName } from '../components/icons';

interface Item {
  to: string;
  icon: IconName;
  label: string;
  note: string;
}

const SECTIONS: { title: string; icon: IconName; tone: MedallionTone; items: Item[] }[] = [
  {
    title: 'להבין',
    icon: 'lightbulb',
    tone: 'brand',
    items: [
      { to: '/insights', icon: 'lightbulb', label: 'תובנות', note: 'דפוסים, מנויים וחודשים חריגים' },
      { to: '/review', icon: 'calendar', label: 'סיכום תקופה', note: 'מה קרה השבוע ומה קרה החודש' },
    ],
  },
  {
    title: 'לתכנן',
    icon: 'target',
    tone: 'brand',
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
    icon: 'save',
    tone: 'neutral',
    items: [
      { to: '/import', icon: 'download', label: 'ייבוא קובץ', note: 'עו״ש או פירוט כרטיס אשראי' },
      { to: '/categories', icon: 'tag', label: 'קטגוריות', note: 'לערוך, להוסיף, לארכב' },
      { to: '/backup', icon: 'save', label: 'גיבוי ושחזור', note: 'ההגנה היחידה מאובדן המכשיר' },
      { to: '/sync', icon: 'cloud', label: 'סנכרון', note: 'אותם נתונים בטלפון ובמחשב, מוצפנים' },
    ],
  },
  {
    title: 'המערכת',
    icon: 'settings',
    tone: 'neutral',
    items: [
      { to: '/settings', icon: 'settings', label: 'הגדרות', note: 'סכום ביטחון, יעד, נעילה, תצוגה' },
      { to: '/privacy', icon: 'lock', label: 'פרטיות', note: 'מה נשמר, מה לא, ומה המגבלה' },
    ],
  },
];

export function More() {
  return (
    <Page title="עוד" icon="more" subtitle="כל שאר הכלים במקום אחד" width="reading" overlap>
      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardTitle icon={section.icon} iconTone={section.tone}>
            {section.title}
          </CardTitle>
          <ul className="grid gap-2 sm:grid-cols-2">
            {section.items.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="group flex h-full min-h-[4.5rem] items-center gap-3.5 rounded-2xl bg-slate-50 p-3.5 transition duration-200 hover:bg-slate-100 active:scale-[0.98]"
                >
                  <Medallion
                    icon={item.icon}
                    tone={section.tone}
                    className="size-11"
                    iconClassName="size-5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-600">
                      {item.note}
                    </span>
                  </span>
                  <Icon
                    name="chevron-inline"
                    className="size-4 shrink-0 text-slate-400 transition group-hover:-translate-x-0.5"
                  />
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
