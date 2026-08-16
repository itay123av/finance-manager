/**
 * פרימיטיבי הפריסה.
 *
 * ⚠️ הכלל שמנחה את כל הקובץ הזה: **מובייל לא זז.**
 *
 * כל מחלקה כאן מתחילה בערך שהיה בגרסה 1.0 (`max-w-md`, `p-4`,
 * `pb-28`), ורק מ-`md` ומעלה — 768 פיקסלים, מעל הגבול העליון של
 * מובייל — הרוחב מתחיל לגדול. מסך של 767 פיקסלים מקבל בדיוק את מה
 * שקיבל קודם, עד הפיקסל.
 *
 * ⚠️ **טקסט לא נמתח לרוחב המסך.** שורה של 200 תווים היא שורה שהעין
 * מאבדת באמצע. לכן שני רוחבים ולא אחד:
 *
 * - `reading` — מסכים שהם בעיקר טקסט ורשימות (פרטיות, רעיונות,
 *   הגדרות). נעצר ב-768 פיקסלים גם על מסך של 1920.
 * - `wide` — מסכים של נתונים, שבהם שטח נוסף באמת מוסיף מידע
 *   (לוח בקרה, עסקאות, תקציב, תחזית). גדל עד 1400.
 */

import type { ReactNode } from 'react';

export type PageWidth = 'reading' | 'wide';

const WIDTHS: Record<PageWidth, string> = {
  // עד 767 — max-w-md, כמו קודם. ואז: טאבלט, דסקטופ, ומסך רחב.
  wide: 'max-w-md md:max-w-3xl lg:max-w-7xl 2xl:max-w-[87.5rem]',
  reading: 'max-w-md md:max-w-2xl lg:max-w-3xl',
};

export interface PageProps {
  /** הכותרת הראשית של המסך. */
  title: string;
  /**
   * `false` מסתיר את הכותרת ויזואלית ומשאיר אותה לקורא מסך.
   * לוח הבקרה לא מציג כותרת — המספר הגדול הוא הכותרת שלו.
   */
  showTitle?: boolean;
  /** פעולות שמופיעות לצד הכותרת. */
  actions?: ReactNode;
  width?: PageWidth;
  children: ReactNode;
}

export function Page({
  title,
  showTitle = true,
  actions,
  width = 'wide',
  children,
}: PageProps) {
  return (
    <main
      className={`mx-auto w-full space-y-4 p-4 pb-28 md:pb-10 lg:space-y-6 lg:px-8 lg:pt-6 ${WIDTHS[width]}`}
    >
      {/*
        ⚠️ `justify-end` כשאין כותרת נראית.

        `sr-only` ממקם את הכותרת מחוץ לזרימה, ולכן `justify-between`
        היה משאיר את הפעולות דבוקות לתחילת השורה — הפוך ממה שהיה
        בלוח הבקרה בגרסה 1.0, שבו מתג ההסתרה יושב בקצה.
      */}
      <div
        className={`flex items-center gap-4 ${showTitle ? 'justify-between' : 'justify-end'}`}
      >
        <h1
          className={
            showTitle ? 'pt-2 text-2xl font-bold text-slate-900 lg:pt-0 lg:text-3xl' : 'sr-only'
          }
        >
          {title}
        </h1>
        {actions}
      </div>
      {children}
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
