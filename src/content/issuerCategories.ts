/**
 * מיפוי "ענף" מחברת האשראי לקטגוריות המערכת.
 *
 * חברות האשראי כבר מסווגות כל עסקה לענף. זה סיווג מקצועי, יציב, ומגיע
 * חינם עם הקובץ — הרבה יותר אמין מניחוש לפי שם בית העסק. לכן הוא גובר
 * על כללי מילות המפתח, ונסוג רק מפני תיקון ידני של המשתמש.
 */

export const ISSUER_CATEGORY_MAP: Record<string, string> = {
  'מזון ומשקאות': 'cat-shopping',
  'מזון מהיר': 'cat-food-out',
  מסעדות: 'cat-food-out',
  'בתי קפה': 'cat-food-out',
  סופרמרקטים: 'cat-shopping',
  'תקשורת ומחשבים': 'cat-phone',
  אלקטרוניקה: 'cat-shopping',
  'טיפוח ויופי': 'cat-shopping',
  הלבשה: 'cat-clothes',
  'הלבשה והנעלה': 'cat-clothes',
  'פנאי בילוי': 'cat-friends',
  'פנאי ובילוי': 'cat-friends',
  בידור: 'cat-friends',
  תיירות: 'cat-friends',
  'תיירות ונופש': 'cat-friends',
  תחבורה: 'cat-transport',
  'תחבורה ודלק': 'cat-transport',
  דלק: 'cat-transport',
  'ציוד ומשרד': 'cat-study',
  ספרים: 'cat-study',
  חינוך: 'cat-study',
  'בריאות וספורט': 'cat-sport',
  ספורט: 'cat-sport',
  'בית ובנייה': 'cat-shopping',
  'שירותים פיננסיים': 'cat-other',
  ביטוח: 'cat-other',
};

/** מחזיר את הקטגוריה המתאימה לענף, או `null` כשהענף לא מוכר. */
export function categoryForIssuerBranch(branch: string | undefined): string | null {
  if (!branch) return null;
  const clean = branch.replace(/\s+/g, ' ').trim();
  return ISSUER_CATEGORY_MAP[clean] ?? null;
}
