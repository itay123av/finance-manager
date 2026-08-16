/**
 * כללי סיווג ראשוניים.
 *
 * זו נקודת פתיחה בלבד. הכלל החזק במערכת הוא **הזיכרון** — ברגע
 * שהמשתמש מתקן סיווג, התיקון גובר על כל מה שכאן.
 *
 * ⚠️ גבולות מילה בעברית.
 *
 * ב-JavaScript, `\b` עובד רק על תווי ASCII. לכן ביטוי תמים כמו
 * `/מונית/` מתאים גם בתוך "אל**מונית**", ו-"חנות אלמונית" הייתה
 * מסווגת כתחבורה. שגיאה כזו שקטה לחלוטין — היא לא זורקת חריגה,
 * היא רק מזייפת את הפירוט לפי קטגוריה.
 *
 * הפתרון: המונחים נכתבים כטקסט רגיל, ו-`compileTerm` עוטף כל אחד
 * בגבולות שמתאימים לעברית. מותר קידומת עברית בת אות אחת (ב/ל/מ/ה/ו/ש/כ)
 * כדי ש-"בסופר" עדיין יתאים ל-"סופר", אבל רק כשהיא בתחילת מילה.
 */

import { SYSTEM_CATEGORY_IDS } from './categories.seed';

const HEBREW = 'א-ת';
/** אותיות שימוש שנצמדות לתחילת מילה בעברית. */
const PREFIXES = 'בלמהושכ';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** האם המונח כתוב בעברית? קובע איזה סוג גבול נדרש. */
function isHebrew(term: string): boolean {
  return new RegExp(`[${HEBREW}]`).test(term);
}

/**
 * הופך מונח לביטוי עם גבולות מילה נכונים.
 * עברית — גבול ידני; לטינית — `\b` רגיל שעובד מצוין.
 */
export function compileTerm(term: string): RegExp {
  const escaped = escapeRegex(term.toLowerCase());
  if (!isHebrew(term)) return new RegExp(`\\b${escaped}\\b`, 'i');
  return new RegExp(`(^|[^${HEBREW}])[${PREFIXES}]?${escaped}($|[^${HEBREW}])`, 'i');
}

export interface KeywordRule {
  categoryId: string;
  /** מונחים כטקסט רגיל. הגבולות נוספים אוטומטית. */
  terms: string[];
}

export interface CompiledRule {
  categoryId: string;
  patterns: RegExp[];
}

const RULE_TERMS: KeywordRule[] = [
  {
    categoryId: 'cat-food-out',
    terms: [
      'מקדונלדס', 'מקדונלד', 'בורגר', 'פיצה', 'שווארמה', 'פלאפל', 'סושי', 'המבורגר',
      'חומוס', 'מסעדה', 'מסעדת', 'ארומה', 'קופיקס', 'לנדוור', 'רולדין', 'קפואה',
      'בית קפה', 'וולט', 'תן ביס',
      'wolt', '10bis', 'mcdonalds', 'burger', 'pizza', 'starbucks', 'cofix', 'kfc',
    ],
  },
  {
    categoryId: 'cat-shopping',
    terms: [
      'רמי לוי', 'שופרסל', 'ויקטורי', 'יינות ביתן', 'אושר עד', 'טיב טעם', 'יוחננוף',
      'סופר', 'מכולת', 'סופרפארם', 'ניו פארם',
      'ampm', 'superpharm', 'super pharm',
    ],
  },
  {
    categoryId: 'cat-transport',
    terms: [
      'רב קו', 'רבקו', 'אגד', 'מטרופולין', 'קווים', 'רכבת', 'מונית', 'מוניות',
      'דלק', 'סונול', 'פזומט', 'תחבורה',
      'gett', 'yango', 'uber', 'moovit', 'bird', 'lime',
    ],
  },
  {
    categoryId: 'cat-phone',
    // כולל תעתיקים עבריים: בדוחות בנק שמות השירותים מופיעים לא פעם
    // בעברית ולא באנגלית, ובלעדיהם הם נופלים ל"אחר"
    terms: [
      'סלקום', 'פרטנר', 'פלאפון', 'הוט מובייל', 'גולן טלקום', 'מנוי חודשי', 'חבילת גלישה',
      'ספוטיפיי', 'נטפליקס', 'יוטיוב', 'אפל', 'גוגל',
      'spotify', 'netflix', 'youtube', 'icloud', 'disney', 'hbo', 'apple', 'google',
    ],
  },
  {
    categoryId: 'cat-games',
    terms: [
      'steam', 'playstation', 'psn', 'xbox', 'nintendo', 'epic games', 'riot',
      'discord', 'app store', 'google play', 'itunes', 'roblox', 'fortnite',
    ],
  },
  {
    categoryId: 'cat-clothes',
    terms: [
      'קסטרו', 'פוקס', 'רנואר', 'גולף', 'אמריקן איגל', 'נעליים',
      'zara', 'h&m', 'pull&bear', 'bershka', 'adidas', 'nike', 'foot locker',
    ],
  },
  {
    categoryId: 'cat-sport',
    terms: ['חדר כושר', 'הולמס פלייס', 'גו אקטיב', 'קאנטרי', 'בריכה', 'holmes place'],
  },
  {
    categoryId: 'cat-study',
    terms: ['סטימצקי', 'צומת ספרים', 'ספרים', 'קורס', 'שיעור פרטי', 'אוניברסיטה', 'מכללה'],
  },
  {
    categoryId: 'cat-friends',
    terms: [
      'קולנוע', 'סינמה סיטי', 'יס פלאנט', 'רב חן', 'לונה פארק', 'באולינג',
      'אסקייפ רום', 'הופעה', 'כרטיסים',
    ],
  },
  {
    categoryId: 'cat-work',
    terms: ['משכורת', 'שכר', 'העברת שכר', 'salary', 'payroll'],
  },
  {
    categoryId: 'cat-family-money',
    terms: ['העברה מאמא', 'העברה מאבא', 'העברת כספים', 'הורים', 'מתנה'],
  },
  {
    categoryId: 'cat-refunds',
    terms: ['זיכוי', 'החזר', 'ביטול עסקה', 'refund'],
  },
];

export const KEYWORD_RULES: CompiledRule[] = RULE_TERMS.map((rule) => ({
  categoryId: rule.categoryId,
  patterns: rule.terms.map(compileTerm),
}));

/** שורות טכניות של הבנק — אינן עסקאות. */
export const IGNORED_PATTERNS: RegExp[] = [
  compileTerm('יתרת פתיחה'),
  compileTerm('יתרה קודמת'),
  compileTerm('opening balance'),
];

export const FALLBACK_CATEGORY_ID = SYSTEM_CATEGORY_IDS.uncategorized;
