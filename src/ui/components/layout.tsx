/**
 * פרימיטיבי הפריסה.
 *
 * ⚠️ **טקסט לא נמתח לרוחב המסך.** שורה של 200 תווים היא שורה שהעין
 * מאבדת באמצע. לכן שני רוחבים ולא אחד:
 *
 * - `reading` — מסכים שהם בעיקר טקסט ורשימות (פרטיות, רעיונות,
 *   הגדרות). נעצר ב-768 פיקסלים גם על מסך של 1920.
 * - `wide` — מסכים של נתונים, שבהם שטח נוסף באמת מוסיף מידע
 *   (לוח בקרה, עסקאות, תקציב, תחזית). גדל עד 1400.
 *
 * ⚠️ **v3 — כל מסך נפתח בבאנר.** המשתמש ראה את העיצוב החדש בלוח הבקרה
 * וביקש אותו "לכל הדפים". במקום לעצב כל מסך בנפרד, הבאנר חי כאן, ולכן
 * כל מסך מקבל אותו — וכל מסך עתידי יקבל אותו בלי לזכור.
 *
 * - **כותרת, אייקון ותת-כותרת** — מה המסך הזה ולמה נכנסים אליו.
 * - **מדדים** (`stats`) — עד שלושה מספרים שכבר מחושבים, על זכוכית.
 *   ⚠️ רק ערכים שהמסך כבר קיבל. הבאנר לא מחשב שום דבר פיננסי.
 * - **חפיפה** (`overlap`) — הכרטיס הראשון עולה על הבאנר, כמו בלוח הבקרה.
 * - **כניסה מדורגת** — הכרטיסים שמתחת עולים בזה אחר זה (`.stagger`).
 *
 * לוח הבקרה (`showTitle={false}`) בונה באנר משלו, עם יתרה וקו מגמה.
 */

import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export type PageWidth = 'reading' | 'wide';

const WIDTHS: Record<PageWidth, string> = {
  wide: 'max-w-md md:max-w-3xl lg:max-w-7xl 2xl:max-w-[87.5rem]',
  reading: 'max-w-md md:max-w-2xl lg:max-w-3xl',
};

export interface PageStat {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}

export interface PageProps {
  /** הכותרת הראשית של המסך (`h1`). */
  title: string;
  /**
   * `false` — בלי באנר, והכותרת נשארת לקורא מסך בלבד.
   * לוח הבקרה משתמש בזה כי הוא בונה באנר משלו.
   */
  showTitle?: boolean;
  /** משפט אחד מתחת לכותרת: למה נכנסים למסך הזה. */
  subtitle?: string;
  icon?: IconName;
  /** עד שלושה מספרים שכבר מחושבים. */
  stats?: PageStat[];
  /** פעולות בבאנר. ⚠️ הרקע כהה — קישור ירוק רגיל לא יקרא עליו. */
  actions?: ReactNode;
  /**
   * הכרטיס הראשון עולה על הבאנר, כמו "בטוח להוציא" בלוח הבקרה.
   *
   * ⚠️ רק כשהילד הראשון הוא כרטיס לבן. טקסט חופשי שעולה על הבאנר היה
   * טקסט כהה על רקע כהה.
   */
  overlap?: boolean;
  /** תוכן בתחילת שורת הכותרת, כשאין באנר. */
  leading?: ReactNode;
  width?: PageWidth;
  children: ReactNode;
}

/**
 * הבאנר שבראש כל מסך.
 *
 * ⚠️ בטלפון הוא נמתח עד קצות המסך ומתעגל רק למטה; מטאבלט ומעלה הוא
 * כרטיס מעוגל בתוך עמודת התוכן. מתיחה עד הקצוות בתוך עמודה צרה במסך
 * רחב הייתה נראית כמו פס שנחתך.
 *
 * ⚠️ ניגודיות — נמדד בלוח הבקרה על אותו רקע בדיוק: טקסט ישירות על הבאנר
 * לבן ב-90% (5.2:1 בנקודה הבהירה ביותר), ועל הזכוכית לבן מלא.
 *
 * ⚠️ המדדים ב-`div` ולא ב-`ul`. יש בדיקה שמאתרת את הרשימה הראשונה במסך
 * (רשימת רעיונות ההכנסה), ורשימה בבאנר הייתה נתפסת במקומה.
 */
function PageHero({
  title,
  subtitle,
  icon,
  stats,
  actions,
  overlap,
}: Pick<PageProps, 'title' | 'subtitle' | 'icon' | 'stats' | 'actions' | 'overlap'>) {
  const count = stats?.length ?? 0;
  const columns = count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3';

  return (
    <header
      className={`hero-surface hero-sheen relative isolate animate-page-in overflow-hidden rounded-[1.75rem] px-5 pt-6 text-white max-md:-mx-4 max-md:-mt-4 max-md:rounded-t-none max-md:pt-[max(1.5rem,env(safe-area-inset-top))] lg:px-8 lg:pt-7 ${
        overlap ? 'pb-16' : 'pb-6 lg:pb-7'
      }`}
    >
      <span aria-hidden className="aurora-blob aurora-a" />
      <span aria-hidden className="aurora-blob aurora-b" />

      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          {icon ? (
            <span
              aria-hidden
              className="glass flex size-12 shrink-0 items-center justify-center rounded-2xl"
            >
              <Icon name={icon} className="size-6" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight lg:text-[2rem]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-sm leading-snug text-white/90">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="relative shrink-0">{actions}</div> : null}
      </div>

      {count > 0 ? (
        <div className={`relative mt-6 grid gap-2.5 ${columns}`}>
          {stats!.map((stat, index) => (
            <div
              key={stat.label}
              className={`glass rounded-2xl p-3.5 lg:p-4 ${
                count === 3 && index === 0 ? 'col-span-2 lg:col-span-1' : ''
              }`}
            >
              <p className="text-xs text-white">{stat.label}</p>
              <p className="num-display mt-1.5 text-xl leading-none font-semibold lg:text-2xl">
                {stat.value}
              </p>
              {stat.sub ? <p className="mt-1.5 text-xs text-white">{stat.sub}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </header>
  );
}

export function Page({
  title,
  showTitle = true,
  subtitle,
  icon,
  stats,
  actions,
  overlap = false,
  leading,
  width = 'wide',
  children,
}: PageProps) {
  if (!showTitle) {
    return (
      <main
        className={`mx-auto w-full space-y-4 px-4 pt-4 pb-32 md:pb-10 lg:space-y-6 lg:px-8 lg:pt-8 ${WIDTHS[width]}`}
      >
        {leading || actions ? (
          <div
            className={`flex min-h-11 items-center gap-4 ${leading ? 'justify-between' : 'justify-end'}`}
          >
            <h1 className="sr-only">{title}</h1>
            {leading}
            {actions}
          </div>
        ) : (
          // ⚠️ בלי שורת כותרת בכלל כשאין מה להציג בה. לוח הבקרה מתחיל
          // במשטח גיבור שנמתח עד קצות המסך, ושורה ריקה בגובה 44 פיקסלים
          // מעליו הייתה דוחפת אותו למטה ומשאירה פס ריק בראש המסך.
          <h1 className="sr-only">{title}</h1>
        )}
        {children}
      </main>
    );
  }

  return (
    <main className={`mx-auto w-full px-4 pt-4 pb-32 md:pb-10 lg:px-8 lg:pt-8 ${WIDTHS[width]}`}>
      <PageHero
        title={title}
        overlap={overlap}
        {...(subtitle ? { subtitle } : {})}
        {...(icon ? { icon } : {})}
        {...(stats ? { stats } : {})}
        {...(actions ? { actions } : {})}
      />
      {/* ⚠️ `relative z-10` בחפיפה — בלעדיו הכרטיס היה נצבע מתחת לבאנר,
          שיש לו `isolate` ולכן הקשר ערימה משלו. */}
      <div
        className={`stagger space-y-4 lg:space-y-6 ${
          overlap ? 'relative z-10 -mt-10' : 'mt-5 lg:mt-6'
        }`}
      >
        {children}
      </div>
    </main>
  );
}

/**
 * גריד תוכן.
 *
 * ⚠️ עמודה אחת עד `lg`. הסיבה אינה טכנית: בטאבלט לאורך, שתי עמודות
 * של כרטיסים פיננסיים דוחסות מספרים לרוחב של 300 פיקסלים ומאלצות
 * גלישה בכל תווית. עדיף טור אחד רחב.
 */
export function Grid({
  columns = 2,
  children,
  className = '',
}: {
  columns?: 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}) {
  const layouts = {
    2: 'lg:grid-cols-2',
    3: 'lg:grid-cols-2 2xl:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  } as const;
  return (
    <div className={`grid grid-cols-1 gap-4 lg:gap-6 ${layouts[columns]} ${className}`}>
      {children}
    </div>
  );
}

/**
 * עמודה בתוך גריד — לערימת כרטיסים.
 *
 * בלי זה כל כרטיס הוא תא נפרד בגריד, וכרטיסים באותה עמודה נמתחים
 * לגובה אחיד. ערימה בתוך תא שומרת על הגובה הטבעי של כל כרטיס.
 */
export function Stack({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-4 lg:space-y-6 ${className}`}>{children}</div>;
}
