/**
 * רכיבי בסיס.
 *
 * מכוונים לטלפון ולעברית: מרווחי מגע נדיבים, `ms-`/`me-` במקום
 * `ml-`/`mr-` כדי ש-RTL יעבוד, וסכומים תמיד בתוך `.num` שמונע
 * מהמספר להתהפך בתוך משפט בעברית.
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
 * שבו מישהו כבר עומד לידך. שלוש לחיצות דרך תפריט ההגדרות מגיעות
 * מאוחר מדי.
 */
export function DiscreetToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-500 hover:bg-slate-100"
    >
      <Icon name={on ? 'eye-off' : 'eye'} className="size-4" />
      {on ? 'להציג סכומים' : 'להסתיר סכומים'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// פריסה
// ---------------------------------------------------------------------------

export function Card({
  children,
  className = '',
  tone = 'plain',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'plain' | 'brand' | 'caution';
}) {
  const tones = {
    plain: 'border-slate-200 bg-surface',
    brand: 'border-brand-100 bg-brand-50',
    caution: 'border-caution-100 bg-caution-100/40',
  } as const;
  return (
    <section className={`rounded-2xl border p-4 ${tones[tone]} ${className}`}>{children}</section>
  );
}

export function CardTitle({
  children,
  hint,
  icon,
}: {
  children: ReactNode;
  hint?: string;
  icon?: IconName;
}) {
  return (
    // slate-600 ולא slate-500: הכותרת מופיעה גם על רקע מגוון (brand-50,
    // caution), ושם slate-500 יורד ל-4.38:1 — מתחת לסף.
    //
    // ⚠️ `items-center` ולא `items-baseline`: לאייקון אין קו בסיס, ויישור
    // לפיו היה מפיל אותו כמה פיקסלים מתחת לטקסט.
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
      {icon ? <Icon name={icon} className="size-4" /> : null}
      {children}
      {hint ? <InfoTip text={hint} /> : null}
    </h2>
  );
}

/**
 * כרטיס KPI — מספר אחד גדול עם תווית.
 *
 * ⚠️ קיים רק בפריסת הדסקטופ. בטלפון ארבעה מספרים בשורה היו יורדים
 * לרוחב של 80 פיקסלים כל אחד, ו-‎₪4,400‎ היה נשבר לשתי שורות. שם
 * הכרטיסים המלאים עושים את העבודה טוב יותר.
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
  tone?: 'plain' | 'brand' | 'caution';
}) {
  const tones = {
    plain: 'border-slate-200 bg-surface',
    brand: 'border-brand-100 bg-brand-50',
    caution: 'border-caution-100 bg-caution-100/40',
  } as const;
  return (
    <section className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900 2xl:text-4xl">{value}</p>
      {sub ? <p className="mt-2 text-sm text-slate-600">{sub}</p> : null}
    </section>
  );
}

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
    <div
      className={`flex items-baseline justify-between gap-3 py-1.5 ${
        strong ? 'font-semibold text-slate-900' : 'text-slate-600'
      }`}
    >
      <span className="text-sm">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// פעולות
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-900 disabled:bg-slate-300',
  secondary: 'border border-slate-300 bg-surface text-slate-800 hover:bg-slate-50',
  ghost: 'text-accent hover:bg-brand-50',
  danger: 'bg-alertred-600 text-white hover:brightness-90',
};

/**
 * המחלקות של כפתור, בלי הכפתור.
 *
 * ⚠️ קיים כדי שקישור שנראה כמו כפתור יישאר `<a>`. `<button>` בתוך
 * `<a>` הוא HTML לא חוקי, וקורא מסך מכריז עליו כשני פקדים מקוננים —
 * שניהם מבלבלים, ואף אחד מהם לא נשמע כמו "מעבר למסך".
 */
export function buttonClass(variant: ButtonVariant = 'primary', full = false): string {
  return `inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition ${
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
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children(id)}
      {hint && !error ? <p className="text-xs text-slate-500">{hint}</p> : null}
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
      className={`min-h-11 w-full rounded-xl border border-slate-300 bg-surface px-3 text-base text-slate-900 placeholder:text-slate-500 ${
        props.className ?? ''
      }`}
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
      className={`text-start text-2xl font-bold tabular-nums ${props.className ?? ''}`}
    />
  );
}

export function Select(props: InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const { children, className, ...rest } = props;
  return (
    <select
      {...(rest as object)}
      className={`min-h-11 w-full rounded-xl border border-slate-300 bg-surface px-3 text-base text-slate-900 ${className ?? ''}`}
    >
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
            className={`min-h-11 flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
              selected
                ? 'border-brand-700 bg-brand-50 text-accent-strong'
                : 'border-slate-300 bg-surface text-slate-700'
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
      className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${tones[tone]}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      {/*
        ⚠️ העיגול נראה 24 פיקסלים, אבל אזור הלחיצה שלו 44 — דרך
        `after` שקוף שמתפרש מסביבו. עיגול קטן בתוך כותרת הוא מטרה
        שקשה לפגוע בה באגודל, ובלי ההרחבה הזו הכפתור נמצא מתחת
        למינימום של WCAG 2.2.
      */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="הסבר"
        aria-expanded={open}
        className="relative flex size-6 items-center justify-center rounded-full bg-slate-200 text-slate-600 after:absolute after:-inset-2.5 after:content-['']"
      >
        <Icon name="info" className="size-3.5" />
      </button>
      {open ? (
        <span className="absolute top-6 z-20 w-56 rounded-xl bg-inverse p-3 text-xs font-normal leading-relaxed text-on-inverse shadow-lg">
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
      <p className="font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = 'טוען…' }: { label?: string }) {
  return (
    <div className="p-8 text-center text-sm text-slate-500" role="status" aria-live="polite">
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
    <div role="status" aria-live="polite" className="rounded-2xl border border-slate-200 p-5">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
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
    info: 'border-slate-200 bg-slate-50',
    caution: 'border-caution-100 bg-caution-100/40',
  } as const;
  return (
    <section className={`rounded-2xl border p-4 ${tones[tone]}`} aria-label={title}>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {body ? <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
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
    <div role="alert" className="rounded-2xl border border-alertred-100 bg-alertred-100/40 p-5 text-center">
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
 * `wide` שמור לתוכן שבאמת צריך רוחב — סימולציה עם השוואת תרחישים.
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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-backdrop sm:items-center">
      <button type="button" aria-label="סגירה" className="absolute inset-0" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl lg:p-6 ${SHEET_WIDTHS[width]}`}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <Icon name="close" />
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
