/**
 * ערכת האייקונים.
 *
 * ⚠️ **למה לא אמוג'י, ולמה לא ספריית אייקונים.**
 *
 * אמוג'י אינם עיצוב — הם גופן. כל מערכת הפעלה מציירת אותם אחרת (🎯
 * נראה שונה לגמרי באנדרואיד, ב-iOS ובווינדוס), הם מגיעים בצבע קבוע
 * שלא מסתדר עם ערכת כהה, המשקל שלהם לא תואם לטיפוגרפיה שסביבם, וחלקם
 * פשוט חסרים במכשירים ישנים ומוצגים כמלבן.
 *
 * ספריית אייקונים הייתה פותרת את זה — ומוסיפה תלות שלמה ל-30 צורות.
 * לכן הן מצוירות כאן: SVG בקו, 24×24, `currentColor`.
 *
 * ⚠️ **`currentColor` הוא כל העניין.** האייקון יורש את צבע הטקסט
 * שסביבו, ולכן הוא נכון אוטומטית בבהיר, בכהה, על כפתור ירוק, ובמצב
 * `hover` — בלי אף כלל צבע משלו.
 *
 * ⚠️ **כולם `aria-hidden`.** אייקון כאן לעולם אינו נושא מידע לבדו:
 * לצידו יש תמיד טקסט, או `aria-label` על הפקד העוטף. קורא מסך שמקריא
 * "תמונה, בית" אחרי שהקריא "בית" רק מכפיל.
 *
 * ⚠️ **בלי כיווניות.** אין כאן חצים שמצביעים ימינה או שמאלה, כי
 * ב-RTL הם היו צריכים להתהפך. חצי הניווט מקבלים `chevron-inline`
 * שמסתובב לפי `dir` דרך CSS.
 */

import type { SVGProps } from 'react';

export type IconName =
  // ניווט
  | 'home'
  | 'receipt'
  | 'target'
  | 'trending-up'
  | 'more'
  | 'lightbulb'
  | 'calendar'
  | 'wallet'
  | 'sprout'
  | 'download'
  | 'tag'
  | 'save'
  | 'settings'
  | 'lock'
  | 'cloud'
  // סנכרון
  | 'cloud-check'
  | 'cloud-off'
  | 'refresh'
  | 'git-merge'
  // מצב ומשמעות
  | 'shield-check'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'sparkles'
  | 'confetti'
  | 'calculator'
  | 'credit-card'
  | 'alert-triangle'
  | 'info'
  | 'scale'
  | 'clock'
  // פעולות
  | 'plus'
  | 'pencil'
  | 'trash'
  | 'eye'
  | 'eye-off'
  | 'close'
  | 'chevron-up'
  | 'chevron-down'
  | 'chevron-inline'
  // רעיונות הכנסה
  | 'book'
  | 'laptop'
  | 'video'
  | 'users'
  | 'paw'
  | 'store'
  | 'package'
  | 'wrench'
  | 'keyboard';

/**
 * הגאומטריה. כל ערך הוא תוכן ה-`<svg>` בלבד.
 *
 * הקווים מתוכננים לרשת של 24 עם שוליים של 2, כך שכל האייקונים
 * נראים באותו גודל אופטי גם כשהצורות שונות מאוד.
 */
const PATHS: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.2V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.2" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3h14v18l-2.3-1.6L14.4 21 12 19.4 9.6 21l-2.3-1.6L5 21z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  'trending-up': (
    <>
      <path d="M3 17.5 9.5 11l4 4L21 7.5" />
      <path d="M15.5 7.5H21V13" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 17.5a6 6 0 1 1 6 0v1.2a1.3 1.3 0 0 1-1.3 1.3h-3.4A1.3 1.3 0 0 1 9 18.7z" />
      <path d="M10 21h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 8V6.5A1.5 1.5 0 0 0 18.5 5H5.5A2.5 2.5 0 0 0 3 7.5v9A2.5 2.5 0 0 0 5.5 19h13a1.5 1.5 0 0 0 1.5-1.5V16" />
      <path d="M21 11h-4a1.5 1.5 0 0 0 0 5h4z" />
    </>
  ),
  sprout: (
    <>
      <path d="M12 21v-7" />
      <path d="M12 14C12 10 9 7.5 5 7.5c0 4 2.6 6.5 7 6.5z" />
      <path d="M12.6 12.5c0-3.2 2.4-5.5 5.4-5.5 0 3.2-2 5.5-5.4 5.5z" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v11" />
      <path d="M8 10.5 12 14.5l4-4" />
      <path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" />
    </>
  ),
  tag: (
    <>
      <path d="M11.6 3.5H20a.5.5 0 0 1 .5.5v8.4a1 1 0 0 1-.3.7l-7.4 7.4a1 1 0 0 1-1.4 0l-7.7-7.7a1 1 0 0 1 0-1.4l7.4-7.4a1 1 0 0 1 .5-.5z" />
      <circle cx="16.2" cy="7.8" r="1.4" />
    </>
  ),
  save: (
    <>
      <path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M7.5 3v6h7V3" />
      <rect x="7.5" y="13" width="9" height="8" rx="1" />
    </>
  ),
  cloud: <path d="M7 19a4.2 4.2 0 0 1-.3-8.4 5.3 5.3 0 0 1 10.1-1.2A3.9 3.9 0 0 1 17.5 19z" />,
  'cloud-check': (
    <>
      <path d="M7 18a4.2 4.2 0 0 1-.3-8.4 5.3 5.3 0 0 1 10.1-1.2A3.9 3.9 0 0 1 17.5 18h-1" />
      <path d="M9 18.2 11 20.2l4-4.2" />
    </>
  ),
  'cloud-off': (
    <>
      <path d="M7 19a4.2 4.2 0 0 1-.3-8.4 5.3 5.3 0 0 1 3-3.5" />
      <path d="M10.9 6.5a5.3 5.3 0 0 1 5.9 2.9A3.9 3.9 0 0 1 17.5 19h-6.9" />
      <path d="m4 3.5 16 17" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 5.5v5h-5" />
      <path d="M4 18.5v-5h5" />
      <path d="M19.4 10.5a7.5 7.5 0 0 0-13-3.2L4 10.5" />
      <path d="M4.6 13.5a7.5 7.5 0 0 0 13 3.2l2.4-3.2" />
    </>
  ),
  'git-merge': (
    <>
      <circle cx="7" cy="5.5" r="2.5" />
      <circle cx="7" cy="18.5" r="2.5" />
      <circle cx="17" cy="12" r="2.5" />
      <path d="M7 8v8" />
      <path d="M9.5 5.9c3.2.5 4.6 2.3 5 5.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="11" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  'shield-check': (
    <>
      <path d="M12 2.8 5 5.4v6c0 4.3 2.9 8.1 7 9.8 4.1-1.7 7-5.5 7-9.8v-6z" />
      <path d="M9 11.8 11.3 14 15.3 10" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
    </>
  ),
  moon: <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.6 8.6 0 1 0 20 14.2z" />,
  monitor: (
    <>
      <rect x="2.8" y="4" width="18.4" height="12.5" rx="2" />
      <path d="M9 20.5h6M12 16.5v4" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.7 10.4 11.2 6 9.6 10.4 8z" />
      <path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </>
  ),
  confetti: (
    <>
      <path d="M3.5 20.5 8 8.5l7.5 7.5z" />
      <path d="M13 3.5v2M18.5 5.5l-1.4 1.4M20.5 11h-2M16.5 2.8l.7 1.8" />
    </>
  ),
  calculator: (
    <>
      <rect x="4.5" y="2.8" width="15" height="18.4" rx="2.2" />
      <path d="M8 7h8" />
      <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18.2h.01M12 18.2h.01M15.5 18.2h.01" />
    </>
  ),
  'credit-card': (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 9.8h19" />
      <path d="M6 14.8h3.5" />
    </>
  ),
  'alert-triangle': (
    <>
      <path d="M12 3.8 21 19.2a1 1 0 0 1-.9 1.5H3.9a1 1 0 0 1-.9-1.5z" />
      <path d="M12 9.5v4.2" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  scale: (
    <>
      <path d="M12 3.5v17M7 20.5h10" />
      <path d="M4.5 7.5h15" />
      <path d="M4.5 7.5 2 14a2.8 2.8 0 0 0 5 0z" />
      <path d="M19.5 7.5 17 14a2.8 2.8 0 0 0 5 0z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.8V12l3.4 2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  pencil: (
    <>
      <path d="M16.4 3.9a2 2 0 0 1 2.8 0l.9.9a2 2 0 0 1 0 2.8L8.4 19.3 4 20l.7-4.4z" />
      <path d="M14.6 5.7 18.3 9.4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6.5h16" />
      <path d="M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7" />
      <path d="M6.5 6.5 7.4 20a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-13.5" />
      <path d="M10.5 10.5v6.5M13.5 10.5v6.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M4 4.5 20 20.5" />
      <path d="M9.6 6.1A9.3 9.3 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.9" />
      <path d="M6.4 8.2A17.3 17.3 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 3.6-.7" />
      <path d="M9.9 10.1a3 3 0 0 0 4.1 4.2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  'chevron-up': <path d="M5.5 14.5 12 8l6.5 6.5" />,
  'chevron-down': <path d="M5.5 9.5 12 16l6.5-6.5" />,
  'chevron-inline': <path d="M14.5 5.5 8 12l6.5 6.5" />,
  book: (
    <>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H10a2.5 2.5 0 0 1 2 1 2.5 2.5 0 0 1 2-1h4.5A1.5 1.5 0 0 1 20 4.5v12a1.5 1.5 0 0 1-1.5 1.5H14a2.5 2.5 0 0 0-2 1 2.5 2.5 0 0 0-2-1H5.5A1.5 1.5 0 0 1 4 16.5z" />
      <path d="M12 5v14" />
    </>
  ),
  laptop: (
    <>
      <rect x="4" y="4.5" width="16" height="11" rx="1.8" />
      <path d="M2 19h20" />
    </>
  ),
  video: (
    <>
      <rect x="2.8" y="6" width="12.4" height="12" rx="2.2" />
      <path d="M15.2 10.5 21 7.4v9.2l-5.8-3.1z" />
    </>
  ),
  users: (
    <>
      <circle cx="9.5" cy="8" r="3.4" />
      <path d="M3.5 20a6 6 0 0 1 12 0" />
      <path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M17.5 14.6a6 6 0 0 1 3 5.4" />
    </>
  ),
  paw: (
    <>
      <ellipse cx="7.4" cy="9.4" rx="1.9" ry="2.4" />
      <ellipse cx="16.6" cy="9.4" rx="1.9" ry="2.4" />
      <ellipse cx="11" cy="6.2" rx="1.7" ry="2.2" />
      <path d="M12 12.6c2.7 0 4.8 1.9 4.8 4.2 0 2-1.8 2.9-3.3 2.4a5 5 0 0 0-3 0c-1.5.5-3.3-.4-3.3-2.4 0-2.3 2.1-4.2 4.8-4.2z" />
    </>
  ),
  store: (
    <>
      <path d="M3.5 9.5V20a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1V9.5" />
      <path d="M2.8 9.5 4.6 4a1 1 0 0 1 .95-.7h12.9a1 1 0 0 1 .95.7l1.8 5.5a3 3 0 0 1-5.7 1 3 3 0 0 1-5.5 0 3 3 0 0 1-5.7-1z" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ),
  package: (
    <>
      <path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16z" />
      <path d="M3.5 8 12 12.5 20.5 8M12 12.5v8" />
    </>
  ),
  wrench: (
    <>
      <path d="M15.6 3.4a5.5 5.5 0 0 0-4.4 8.4L3.9 19a2 2 0 0 0 2.8 2.8l7.2-7.2a5.5 5.5 0 0 0 6.6-7.7l-3 3-2.7-.7-.7-2.7z" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.2" />
      <path d="M6.5 9.5h.01M10 9.5h.01M13.5 9.5h.01M17 9.5h.01M6.5 12.8h.01M10 12.8h.01M13.5 12.8h.01M17 12.8h.01M8.5 15.8h7" />
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  className?: string;
}

export function Icon({ name, className = 'size-5', ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      // ⚠️ תמיד מוסתר מקוראי מסך. ראה ההסבר בראש הקובץ.
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
