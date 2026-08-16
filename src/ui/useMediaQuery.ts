/**
 * שאילתת מדיה כמצב React.
 *
 * ⚠️ למה בכלל JavaScript, כשיש `lg:hidden`?
 *
 * הסתרה ב-CSS משאירה את שני הניווטים ב-DOM. קורא מסך אמנם מדלג על
 * `display:none`, אבל התוצאה היא שני עצי ניווט שקיימים תמיד ואחד מהם
 * חי רק בזכות גיליון סגנונות — שבירה שקטה אם מחלקה משתנה. כאן נבנה
 * **אחד בלבד**: או סרגל צד, או שורה תחתונה.
 *
 * ⚠️ `matchMedia` אינו קיים ב-jsdom. חוסר ההגדרה מתפרש כמובייל, וזו
 * ההתנהגות הנכונה: כל בדיקות הממשק הקיימות נכתבו מול הפריסה הצרה,
 * והן ממשיכות לבדוק בדיוק אותה.
 */

import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const read = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false;

  const [matches, setMatches] = useState(read);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** גבול הדסקטופ — זהה ל-`lg` של Tailwind. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}
