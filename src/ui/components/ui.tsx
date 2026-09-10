/**
 * רכיבי בסיס.
 *
 * מכוונים לטלפון ולעברית: מרווחי מגע נדיבים, `ms-`/`me-` במקום
 * `ml-`/`mr-` כדי ש-RTL יעבוד, וסכומים תמיד בתוך `.num` שמונע
 * מהמספר להתהפך בתוך משפט בעברית.
 *
 * ⚠️ **שפת העיצוב (v1.5)** — ראה את ההסבר המלא בראש `styles.css`.
 * בקצרה: עומק במקום מסגרות, צבע רק כשיש לו משמעות, ומספרים כגיבור.
 * כל שינוי ויזואלי ברכיב כאן משפיע על כל המסכים — ולכן כאן, ולא
 * מסך-מסך.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { useMoneyFormatter } from '../AppData';
import { Icon, type IconName } from './icons';
import type { FormatMoneyOptions } from '../../core/money';

// ---------------------------------------------------------------------------
// סכומים
// ---------------------------------------------------------------------------

export function Money({
  agorot,
  className = '',
  ...options
}: { agorot: number; className?: string } & FormatMoneyOptions) {
  const format = useMoneyFormatter();
  // `num` — בידוד דו-כיווני. `sensitive` — מה שמצב דיסקרטי מטשטש.
  return <span className={`num sensitive ${className}`}>{format(agorot, options)}</span>;
}

/**
 * מתג "הסתר סכומים".
 *
 * ⚠️ נגיש מהמסך הראשי ולא רק מההגדרות: הרגע שבו צריך אותו הוא הרגע
 * שבו מישהו כבר עומד לידך.
 *
 * ⚠️ בטלפון רואים רק את האייקון, אבל הטקסט **נשאר** כשם הנגיש
 * (`max-sm:sr-only`). שורת הכותרת צרה מדי לשם מלא לצד הלוגו והברכה,
 * וקורא מסך עדיין שומע בדיוק מה הכפתור עושה.
 */
export function DiscreetToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-slate-200/80 bg-surface px-3 text-sm font-medium text-slate-600 elev-1 transition hover:text-slate-900"
    >
      <Icon name={on ? 'eye-off' : 'eye'} className="size-[1.125rem]" />
      <span className="max-sm:sr-only">{on ? 'להציג סכומים' : 'להסתיר סכומים'}</span>
    </button>
  );
}

/**
 * סמל המותג — שלושה עמודים עולים.
 *
 * ⚠️ לא ‎₪‎ ולא חץ מגמה. החץ כבר משמש את "החלטות" בניווט, ושימוש כפול
 * באותו סמל גורם לשני הדברים להיראות כמו אותו דבר. עמודים שגדלים הם
 * בדיוק מה שהאפליקציה עושה: חיסכון שנבנה.
 */
export function BrandMark({ className = 'size-9' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`brand-mark flex shrink-0 items-center justify-center rounded-xl text-white ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-[58%]" fill="currentColor">
        <rect x="3.5" y="13" width="4.5" height="7.5" rx="1.6" opacity="0.55" />
        <rect x="9.75" y="8.5" width="4.5" height="12" rx="1.6" opacity="0.8" />
        <rect x="16" y="3.5" width="4.5" height="17" rx="1.6" />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------------------
// פריסה
// ---------------------------------------------------------------------------

type Tone = 'plain' | 'brand' | 'caution';

/**
 * ⚠️ `plain` הוא כמעט תמיד הנכון. `brand` ו-`caution` שמורים להודעות —
 * "נשמר", "שים לב" — ולא לכרטיסי תוכן. כרטיס תוכן צבעוני היה בדיוק
 * מה שהפך את לוח הבקרה לפסיפס של פסטל.
 */
const CARD_TONES: Record<Tone, string> = {
  plain: 'border-slate-200/70 bg-surface elev-1',
  brand: 'border-brand-100 bg-brand-50/70',
  caution: 'border-caution-300/50 bg-caution-100/35',
};

export function Card({
  children,
  className = '',
  tone = 'plain',
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
}) {
  return (
    <section className={`rounded-[1.25rem] border p-5 ${CARD_TONES[tone]} ${className}`}>
      {children}
    </section>
  );
}

/** צבעי המדליון שמאחורי אייקון הכותרת. */
const MEDALLION_TONES = {
  neutral: 'bg-slate-100 text-slate-600',
  brand: 'bg-brand-50 text-accent',
  caution: 'bg-caution-100 text-caution-700',
} as const;

export type MedallionTone = keyof typeof MEDALLION_TONES;

export function Medallion({
  icon,
  tone = 'neutral',
  className = 'size-8',
}: {
  icon: IconName;
  tone?: MedallionTone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-[0.625rem] ${MEDALLION_TONES[tone]} ${className}`}
    >
      <Icon name={icon} className="size-[1.125rem]" />
    </span>
  );
}

export function CardTitle({
  children,
  hint,
  icon,
  iconTone = 'neutral',
}: {
  children: ReactNode;
  hint?: string;
  icon?: IconName;
  iconTone?: MedallionTone;
}) {
  return (
    // slate-600 ולא slate-500: הכותרת מופיעה גם על רקע מגוון (brand-50,
    // caution), ושם slate-500 יורד ל-4.38:1 — מתחת לסף.
    //
    // ⚠️ `items-center` ולא `items-baseline`: לאייקון אין קו בסיס, ויישור
    // לפיו היה מפיל אותו כמה פיקסלים מתחת לטקסט.
    <h2 className="mb-4 flex items-center gap-2.5 text-sm font-semibold text-slate-600">
      {icon ? <Medallion icon={icon} tone={iconTone} /> : null}
      {children}
      {hint ? <InfoTip text={hint} /> : null}
    </h2>
  );
}

/**
 * כרטיס KPI — מספר אחד גדול עם תווית.
 *
 * ⚠️ קיים רק בפריסת הדסקטופ. בטלפון ארבעה מספרים בשורה היו יורדים
 * לרוחב של 80 פיקסלים כל אחד, ו-‎₪4,400‎ היה נשבר לשתי שורות.
 *
 * ⚠️ `hero` — משטח כהה עם טקסט לבן, לכרטיס אחד בלבד בשורה: היתרה.
 * שני גיבורים באותה שורה הם אפס גיבורים.
 */
export function KpiCard({
  label,
  value,
  sub,
  tone = 'plain',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone | 'hero';
}) {
  const hero = tone === 'hero';
  return (
    <section
      className={`rounded-[1.25rem] border p-5 2xl:p-6 ${
        hero ? 'hero-surface border-white/10 text-white' : CARD_TONES[tone]
      }`}
    >
      <p className={`text-sm font-medium ${hero ? 'text-white/85' : 'text-slate-600'}`}>{label}</p>
      <p
        className={`num-display mt-3 text-[2rem] leading-none font-semibold 2xl:text-[2.5rem] ${
          hero ? 'text-white' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
      {sub ? (
        <p className={`mt-3 text-sm ${hero ? 'text-white/85' : 'text-slate-600'}`}>{sub}</p>
      ) : null}
    </section>
  );
}

/**
 * שורת תווית–ערך.
 *
 * ⚠️ הערך כהה מהתווית. כשהשניים באותו אפור העין לא יודעת על מה לנחות,
 * וכל שורה נקראת כמו משפט אחד ארוך.
 */
export function Row({
  label,
  children,
  strong = false,
}: {
  label: ReactNode;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className={`text-sm ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
        {label}
      </span>
      <span className={`text-sm text-slate-900 ${strong ? 'font-semibold' : 'font-medium'}`}>
        {children}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// פעולות
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-700 text-white elev-btn hover:bg-brand-900 active:translate-y-px disabled:bg-slate-300 disabled:shadow-none',
  secondary:
    'border border-slate-200 bg-surface text-slate-800 elev-1 hover:border-slate-300 hover:bg-slate-50',
  ghost: 'text-accent hover:bg-brand-50',
  // ⚠️ היה בלי מצב מושבת, ולכן "למחוק הכל" נראה לחיץ גם לפני שהוקלדה
  // מילת האישור.
  danger: 'bg-alertred-600 text-white elev-btn hover:brightness-95 disabled:opacity-50',
};

/**
 * המחלקות של כפתור, בלי הכפתור.
 *
 * ⚠️ קיים כדי שקישור שנראה כמו כפתור יישאר `<a>`. `<button>` בתוך
 * `<a>` הוא HTML לא חוקי, וקורא מסך מכריז עליו כשני פקדים מקוננים.
 */
export function buttonClass(variant: ButtonVariant = 'primary', full = false): string {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition duration-150 ease-out disabled:cursor-not-allowed ${
    BUTTON_VARIANTS[variant]
  } ${full ? 'w-full' : ''}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  full?: boolean;
};

export function Button({
  variant = 'primary',
  full = false,
  className = '',
  ...props
}: ButtonProps) {
  return <button {...props} className={`${buttonClass(variant, full)} ${className}`} />;
}

// ---------------------------------------------------------------------------
// טפסים
// ---------------------------------------------------------------------------

/**
 * הבסיס של כל שדה קלט.
 *
 * ⚠️ מצב המיקוד הוא גבול ירוק כהה **והילה**, לא רק הילה. הילה בהירה
 * לבדה נותנת פחות מ-3:1 מול לבן — מתחת לסף של מחוון מיקוד. הגבול
 * ב-brand-700 נותן 6:1, וההילה רק מרככת.
 */
const FIELD_BASE =
  'w-full rounded-xl border border-slate-200 bg-surface text-base text-slate-900 elev-1 transition duration-150 hover:border-slate-300 focus:border-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-500/20';

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children(id)}
      {hint && !error ? <p className="text-xs leading-relaxed text-slate-500">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-h-12 px-3.5 placeholder:text-slate-500 ${FIELD_BASE} ${props.className ?? ''}`}
    />
  );
}

/** קלט סכום — מקלדת מספרית בטלפון, ומיושר לשמאל כמו מספר. */
export function AmountInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <TextInput
      type="text"
      inputMode="decimal"
      autoComplete="off"
      dir="ltr"
      placeholder="0"
      {...props}
      className={`text-start text-2xl font-semibold tracking-tight tabular-nums ${props.className ?? ''}`}
    />
  );
}

export function Select(props: InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const { children, className, ...rest } = props;
  return (
    <select {...(rest as object)} className={`min-h-12 px-3.5 ${FIELD_BASE} ${className ?? ''}`}>
      {children}
    </select>
  );
}

/** בחירה מהירה מבין כמה אפשרויות — למשל סכום הביטחון. */
export function ChoiceGroup<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; note?: string }[];
  value: T | null;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`min-h-12 flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition duration-150 ${
              selected
                ? 'border-brand-700 bg-brand-50 text-accent-strong ring-1 ring-brand-700'
                : 'border-slate-200 bg-surface text-slate-700 elev-1 hover:border-slate-300'
            }`}
          >
            <span className="num">{option.label}</span>
            {option.note ? (
              <span className="block text-xs font-normal text-slate-600">{option.note}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// משוב ומצבים
// ---------------------------------------------------------------------------

export function ProgressBar({
  pct,
  tone = 'brand',
}: {
  pct: number;
  tone?: 'brand' | 'caution' | 'danger';
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const tones = {
    brand: 'bg-brand-500',
    caution: 'bg-caution-600',
    danger: 'bg-alertred-600',
  } as const;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-out ${tones[tone]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      {/*
        ⚠️ העיגול נראה 24 פיקסלים, אבל אזור הלחיצה שלו 44 — דרך
        `after` שקוף שמתפרש מסביבו. בלי ההרחבה הזו הכפתור נמצא מתחת
        למינימום של WCAG 2.2.
      */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="הסבר"
        aria-expanded={open}
        className="relative flex size-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 after:absolute after:-inset-2.5 after:content-['']"
      >
        <Icon name="info" className="size-3.5" />
      </button>
      {open ? (
        <span className="absolute top-8 z-20 w-60 rounded-xl bg-inverse p-3 text-xs leading-relaxed font-normal text-on-inverse elev-3 animate-fade-in">
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-surface/60 px-6 py-10 text-center">
      <p className="text-base font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-600">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = 'טוען…' }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-3 p-10 text-sm text-slate-500"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500"
      />
      {label}
    </div>
  );
}

/**
 * פס התקדמות לפעולה ארוכה.
 *
 * כשאין אחוזים ידועים (`pct === null`) מוצג פס אינסופי — שקר קטן
 * ומוסכם, שעדיף על מסך קפוא שנראה תקוע.
 */
export function ProgressState({ label, pct }: { label: string; pct: number | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[1.25rem] border border-slate-200/70 bg-surface p-5 elev-1"
    >
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
        <div
          className={`h-full rounded-full bg-brand-500 ${pct === null ? 'w-1/3 animate-pulse' : ''}`}
          style={pct === null ? undefined : { width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      {pct !== null ? (
        <p className="mt-2 text-xs text-slate-500">
          <span className="num">{Math.round(pct)}%</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * באנר מידע שאפשר לדחות.
 *
 * הטון רגוע בכוונה: זו תזכורת, לא אזהרה. באנר שנראה כמו שגיאה
 * נסגר אוטומטית בעין אחרי שלוש פעמים, וכשהוא באמת חשוב כבר לא רואים
 * אותו.
 */
export function Banner({
  title,
  body,
  action,
  onDismiss,
  dismissLabel = 'לא עכשיו',
  tone = 'info',
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  tone?: 'info' | 'caution';
}) {
  const tones = {
    info: 'border-slate-200/70 bg-surface elev-1',
    caution: 'border-caution-300/60 bg-caution-100/40',
  } as const;
  return (
    <section className={`rounded-[1.25rem] border p-5 ${tones[tone]}`} aria-label={title}>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {body ? <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {action}
        {onDismiss ? (
          <Button variant="ghost" onClick={onDismiss}>
            {dismissLabel}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-[1.25rem] border border-alertred-100 bg-alertred-100/40 p-5 text-center"
    >
      <p className="text-sm font-medium text-slate-800">{message}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          לנסות שוב
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// חלונות
// ---------------------------------------------------------------------------

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * גיליון תחתון — הדפוס הנוח ביותר לפעולה מהירה בטלפון.
 *
 * ⚠️ שלושה דברים שדיאלוג חייב, ושחסרים כשבונים אותו "מהר":
 *
 * 1. **מלכודת מיקוד.** בלעדיה Tab יוצא מהדיאלוג אל הדף שמאחוריו,
 *    וקורא מסך מקריא תוכן שהמשתמש לא יכול לראות.
 * 2. **החזרת המיקוד.** בסגירה המיקוד חוזר לכפתור שפתח, אחרת הוא
 *    קופץ לתחילת הדף וצריך לנווט הכל מחדש.
 * 3. **כותרת מקושרת.** `aria-labelledby` אל ה-`h2` האמיתי, כדי
 *    שהכותרת שנשמעת תהיה בדיוק זו שנראית.
 */
export type SheetWidth = 'default' | 'wide';

/**
 * ⚠️ במסך רחב הדיאלוג מתרחב, אבל לא בלי גבול.
 *
 * טופס ברוחב 1200 פיקסלים גורם לעין לנוע מקצה לקצה בין תווית לשדה,
 * ו"רחב יותר" מפסיק להיות "נוח יותר" הרבה לפני שנגמר המקום.
 */
const SHEET_WIDTHS: Record<SheetWidth, string> = {
  default: 'max-w-md sm:max-w-lg lg:max-w-2xl',
  wide: 'max-w-md sm:max-w-2xl lg:max-w-3xl',
};

export function Sheet({
  open,
  onClose,
  title,
  children,
  restoreFocusTo,
  width = 'default',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** יעד מפורש כשפותח הדיאלוג מגיע מרכיב שעובר render באותה פעולה. */
  restoreFocusTo?: HTMLElement | null;
  width?: SheetWidth;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    returnFocusTo.current = restoreFocusTo ?? (document.activeElement as HTMLElement | null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !ref.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      const target = returnFocusTo.current;
      // React מסיר קודם את תוכן הפורטל. החזרה מיידית עלולה להידרס
      // כשהכפתור הממוקד בתוך הדיאלוג נעלם, ולכן מחזירים אחרי ה-commit.
      queueMicrotask(() => {
        if (target?.isConnected) target.focus();
      });
    };
  }, [open, restoreFocusTo]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in items-end justify-center bg-backdrop backdrop-blur-[3px] sm:items-center sm:p-4">
      <button type="button" aria-label="סגירה" className="absolute inset-0" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 max-h-[90dvh] w-full animate-sheet-in overflow-y-auto rounded-t-[1.75rem] bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] elev-3 sm:rounded-[1.5rem] lg:p-7 ${SHEET_WIDTHS[width]}`}
      >
        {/* ידית גרירה — סימן מוכר שזה גיליון שנפתח מלמטה. בדסקטופ אין
            "למטה", ולכן היא נעלמת. */}
        <div aria-hidden className="mx-auto -mt-1 mb-4 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" />
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
          >
            <Icon name="close" className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** אישור לפני פעולה בלתי הפיכה. `confirmWord` דורש הקלדה מפורשת. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  confirmWord,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  confirmWord?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const canConfirm = !confirmWord || typed.trim() === confirmWord;

  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <div className="space-y-4 text-sm leading-relaxed text-slate-700">
        <div>{body}</div>
        {confirmWord ? (
          <Field label={`להמשך, הקלד: ${confirmWord}`}>
            {(id) => (
              <TextInput
                id={id}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
              />
            )}
          </Field>
        ) : null}
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" full onClick={onCancel}>
            ביטול
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            full
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
