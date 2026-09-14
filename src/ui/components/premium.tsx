/**
 * שפת העיצוב של לוח הבקרה, כרכיבים — כדי שכל מסך ידבר בה.
 *
 * ⚠️ **למה הקובץ הזה קיים.** אחרי שלוח הבקרה עוצב מחדש, המשתמש כתב:
 * "עשית רק כותרת גדולה בכל העמוד, אבל כל שאר העיצוב נשאר אותו הדבר".
 * הוא צדק. מה שהפך את לוח הבקרה לשונה לא היה הבאנר אלא המילים שמתחתיו:
 * מספר גדול שסופר, אריחים, גלולות, בקרה עם מחוון שגולש, וכרטיס מפתח עם
 * פס צבע. אלה חיו רק בתוך `Dashboard.tsx`, ולכן אף מסך אחר לא יכול היה
 * להשתמש בהם. עכשיו הם כאן.
 *
 * ⚠️ אף רכיב כאן לא מחשב מספר פיננסי. כולם מקבלים ערכים מוכנים.
 */

import type { ReactNode } from 'react';
import { Card, Medallion, type MedallionTone } from './ui';
import { Icon, type IconName } from './icons';

// ---------------------------------------------------------------------------
// כרטיס מפתח
// ---------------------------------------------------------------------------

/**
 * הכרטיס החשוב במסך — עם פס צבע בראשו וצל עמוק יותר.
 *
 * ⚠️ אחד למסך. שניים כאלה באותו מסך מבטלים זה את זה, בדיוק כמו שני
 * כפתורים ראשיים.
 */
export function FeatureCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <Card className={`relative overflow-hidden elev-2 ${className}`}>
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{
          background:
            'linear-gradient(to left, var(--color-brand-500), var(--color-brand-700) 60%, transparent)',
        }}
      />
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// מספרים
// ---------------------------------------------------------------------------

/** המספר הגדול של כרטיס. ספרות פרופורציוניות וריווח צפוף — ראה `.num-display`. */
export function BigNumber({
  children,
  tone = 'default',
  size = 'lg',
}: {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'caution';
  size?: 'lg' | 'md';
}) {
  const color = tone === 'accent' ? 'text-accent' : tone === 'caution' ? 'text-caution-600' : 'text-slate-900';
  const scale = size === 'lg' ? 'text-[2.75rem]' : 'text-[2rem]';
  return <p className={`num-display leading-none font-semibold ${scale} ${color}`}>{children}</p>;
}

export type Dot = 'brand' | 'slate' | 'caution' | 'danger';

const DOTS: Record<Dot, string> = {
  brand: 'bg-brand-500',
  slate: 'bg-slate-400',
  caution: 'bg-caution-600',
  danger: 'bg-alertred-600',
};

/**
 * אריח מספר — תווית קטנה ומספר.
 *
 * ⚠️ הנקודה הצבעונית היא קישוט (`aria-hidden`). המשמעות תמיד בתווית,
 * כי צבע לבדו אינו סימן (WCAG 1.4.1).
 */
export function StatTile({
  label,
  value,
  dot,
  sub,
  className = '',
}: {
  label: string;
  value: ReactNode;
  dot?: Dot;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-2xl bg-slate-50 px-3 py-3 ${className}`}>
      <p className="flex items-center gap-1.5 text-xs text-slate-600">
        {dot ? <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOTS[dot]}`} /> : null}
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1 truncate text-base font-semibold text-slate-900">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-xs text-slate-600">{sub}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// גלולות
// ---------------------------------------------------------------------------

export type PillTone = 'neutral' | 'brand' | 'caution' | 'danger';

/**
 * ⚠️ כל צירוף צבע כאן נמדד: טקסט ה-700 של כל גוון על רקע ה-100 שלו
 * עובר 4.5:1 בשתי הערכות. `danger` משתמש בטוקן הטקסט ולא ב-`alertred-600`,
 * שהוא צבע רקע של כפתור.
 */
const PILL_TONES: Record<PillTone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand-50 text-accent-strong',
  caution: 'bg-caution-100 text-caution-700',
  danger: 'bg-alertred-100 text-danger',
};

export function Pill({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode;
  tone?: PillTone;
  icon?: IconName;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${PILL_TONES[tone]}`}
    >
      {icon ? <Icon name={icon} className="size-3.5" /> : null}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// בקרה מקוטעת
// ---------------------------------------------------------------------------

/**
 * בחירה בין כמה אפשרויות, עם מחוון שגולש אל הנבחרת.
 *
 * ⚠️ **התפקיד נשמר לפי ההקשר.** בחירת ערך (סוג עסקה, סינון) היא
 * `radiogroup`; מעבר בין תצוגות (שבוע/חודש) הוא `tablist`. קורא מסך
 * מכריז עליהם אחרת, ויש בדיקות שנשענות על התפקיד.
 *
 * ⚠️ המחוון ממוקם ב-`inset-inline-start` ולא ב-`translateX`, ולכן הוא
 * נכון ב-RTL בלי שום היפוך סימן.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  role = 'radiogroup',
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  role?: 'radiogroup' | 'tablist';
}) {
  const count = options.length;
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <div role={role} aria-label={ariaLabel} className="relative flex rounded-2xl bg-slate-100 p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 rounded-xl bg-surface elev-1 transition-[inset-inline-start] duration-300 ease-out"
        style={{
          width: `calc((100% - 0.5rem) / ${count})`,
          insetInlineStart: `calc(0.25rem + (100% - 0.5rem) / ${count} * ${index})`,
        }}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role={role === 'tablist' ? 'tab' : 'radio'}
            {...(role === 'tablist' ? { 'aria-selected': selected } : { 'aria-checked': selected })}
            onClick={() => onChange(option.value)}
            className={`relative min-h-10 flex-1 rounded-xl px-3 text-sm font-semibold transition-colors ${
              selected ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// כפתור אייקון
// ---------------------------------------------------------------------------

/**
 * ⚠️ 36 פיקסלים ולא 44. ברשימת עסקאות בטלפון שני כפתורים של 44 גזלו
 * 88 פיקסלים משם העסקה, והשם נחתך. 36 עומד בסף של WCAG 2.2 AA (24).
 */
export function IconButton({
  icon,
  label,
  onClick,
  tone = 'neutral',
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition active:scale-90 ${
        tone === 'danger' ? 'hover:bg-alertred-100 hover:text-danger' : 'hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <Icon name={icon} className="size-[1.125rem]" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// מתג
// ---------------------------------------------------------------------------

/**
 * מתג הפעלה/כיבוי — במקום תיבת סימון.
 *
 * ⚠️ מתחת לציור זה עדיין `<input type="checkbox">` אמיתי עם
 * `role="switch"`: מקלדת, קורא מסך ולחיצה על התווית עובדים בלי שורת
 * JavaScript. הקלט שקוף ומכסה את המתג, ולכן גם הלחיצה עליו עצמו עובדת.
 *
 * ⚠️ ב-RTL הידית "כבוי" בצד ימין ו"פועל" בשמאל — `inset-inline-start`
 * מטפל בזה בלי שום היפוך ידני.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: ReactNode;
}) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">{description}</span>
        ) : null}
      </span>
      <span className="relative inline-flex h-7 w-12 shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-slate-300 transition-colors duration-200 peer-checked:bg-brand-700 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/30"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-0.5 size-6 rounded-full bg-white elev-1 transition-[inset-inline-start] duration-200 ease-out [inset-inline-start:0.125rem] peer-checked:[inset-inline-start:1.375rem]"
        />
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// שורת הגדרה וכרטיס בחירה
// ---------------------------------------------------------------------------

/** מדליון, כותרת ותיאור — ומשהו בקצה (מתג, גלולה, כפתור). */
export function SettingRow({
  icon,
  tone = 'neutral',
  title,
  description,
  children,
}: {
  icon: IconName;
  tone?: MedallionTone;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <Medallion icon={icon} tone={tone} className="size-11" iconClassName="size-5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{description}</p>
        ) : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

/**
 * אפשרות אחת מתוך קבוצה, ככרטיס שלם.
 *
 * ⚠️ חייב לשבת בתוך `role="radiogroup"` עם שם. הכרטיס עצמו הוא
 * `radio` — העיגול שבקצה הוא רק הציור של `aria-checked`.
 */
export function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
  badge,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
  icon?: IconName;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-start transition duration-200 active:scale-[0.99] ${
        selected
          ? 'border-brand-700 bg-brand-50/70 ring-1 ring-brand-700'
          : 'border-slate-200 bg-surface elev-1 hover:border-slate-300'
      }`}
    >
      {icon ? <Medallion icon={icon} tone={selected ? 'brand' : 'neutral'} className="size-10" /> : null}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
          {title}
          {badge}
        </span>
        {description ? (
          <span className="mt-1 block text-xs leading-relaxed text-slate-600">{description}</span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          selected ? 'border-brand-700' : 'border-slate-300'
        }`}
      >
        {selected ? <span className="size-2.5 rounded-full bg-brand-700" /> : null}
      </span>
    </button>
  );
}
