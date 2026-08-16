/**
 * גרסה ומזהה בנייה.
 *
 * שני הערכים מוזרקים בזמן בנייה מ-`vite.config.ts` — הגרסה מ-`package.json`,
 * מזהה הבנייה מהשעה. הם מוצגים במסך ההגדרות כי השאלה הראשונה כשמשהו
 * מתנהג מוזר היא "איזו גרסה בכלל רצה אצלך?", ובלי תשובה אין מאיפה להתחיל.
 *
 * ⚠️ אין כאן שום מידע על המשתמש. מזהה הבנייה הוא חותמת זמן של הבנייה,
 * לא של השימוש, והוא זהה אצל כל מי שמריץ את אותה גרסה.
 */

declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

/** נופל חזרה לערכי פיתוח כשרצים מחוץ ל-Vite (למשל בסקריפט). */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';

export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
