/**
 * החלת ערכת הצבעים.
 *
 * ⚠️ **מה היה שבור.**
 *
 * הגיליון הכריז `color-scheme: light dark` — כלומר "אני תומך בשתיהן" —
 * אבל בפועל היה מיושם רק בהיר. התוצאה על מכשיר שמוגדר לכהה: הדפדפן
 * צבע בכהה את מה ששייך לו (פקדי טפסים, בוררי תאריך, פסי גלילה, רקע
 * ברירת המחדל), בעוד שכל הכרטיסים נשארו לבנים. זה המראה המעורבב.
 *
 * ⚠️ **למה הערכה נפתרת ב-JavaScript ולא ב-`prefers-color-scheme` בלבד.**
 *
 * המשתמש יכול לבחור במפורש בהיר או כהה, בלי קשר להגדרת המערכת.
 * שלוש אפשרויות (מערכת / בהיר / כהה) מול שאילתת מדיה אחת מחייבות
 * הכרעה בקוד; מה שנכתב בסוף ל-DOM הוא תמיד ערך מוחלט — `light` או
 * `dark` — כדי שגיליון הסגנונות יצטרך להכיר רק שני מצבים.
 */

import { useEffect } from 'react';
import { useMediaQuery } from './useMediaQuery';
import type { ThemePreference } from '../core/types';

export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** ההעדפה בפועל, אחרי פתרון `system` מול הגדרת המכשיר. */
export function resolveTheme(
  preference: ThemePreference | undefined,
  systemPrefersDark: boolean,
): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * כותב את הערכה ל-`<html>`.
 *
 * ⚠️ נכתב על אלמנט השורש ולא על עטיפה פנימית: הרקע של הדף, פסי
 * הגלילה והפקדים המובנים נגזרים מ-`html`, ואם הערכה יושבת עמוק יותר
 * הם נשארים מאחור — וזו בדיוק אותה תערובת מחדש.
 */
export function useTheme(preference: ThemePreference | undefined): 'light' | 'dark' {
  const systemPrefersDark = useMediaQuery(DARK_QUERY);
  const resolved = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    // שורת ה-meta מעדכנת את צבע סרגל הדפדפן במכשירים ניידים
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'dark' ? '#0d1117' : '#14532d');
  }, [resolved]);

  return resolved;
}
