/**
 * הקטגוריות ההתחלתיות.
 *
 * `nature` הוא השדה החשוב כאן — הוא קובע אילו קטגוריות רשאיות להופיע
 * בהמלצות לצמצום. קטגוריות `essential` ו-`important` לעולם לא יוצעו
 * לצמצום, וקטגוריות `fun` יוצעו רק לחזרה לרמה הרגילה — לעולם לא לאיפוס.
 *
 * המשתמש יכול להוסיף, לערוך ולמחוק קטגוריות. `isSystem` מסמן קטגוריות
 * שהמערכת נשענת עליהן ולכן לא ניתן למחוק (אפשר לשנות שם).
 */

import type { Category } from '../core/types';

export const SYSTEM_CATEGORY_IDS = {
  balanceAdjustment: 'cat-balance-adjustment',
  uncategorized: 'cat-other',
} as const;

/**
 * קטגוריות שהמערכת מנהלת בעצמה ואין לבחור בהן בהזנה ידנית.
 *
 * "התאמת יתרה" נוצרת אך ורק מהשוואה מול היתרה בבנק. עסקה ידנית שתסווג
 * אליה תיראה כמו תיקון חשבונאי ותבלבל את קריאת הדוחות — בלי שום סימן
 * שמשהו לא בסדר.
 */
const MANUAL_ENTRY_EXCLUDED = new Set<string>([SYSTEM_CATEGORY_IDS.balanceAdjustment]);

export function isSelectableForManualEntry(category: { id: string }): boolean {
  return !MANUAL_ENTRY_EXCLUDED.has(category.id);
}

export const DEFAULT_CATEGORIES: Category[] = [
  // ── הוצאות: הנאה ובילויים ──────────────────────────────────────────
  { id: 'cat-food-out', name: 'אוכל בחוץ', kind: 'expense', nature: 'fun', color: '#f59e0b', isSystem: false, sortOrder: 10 },
  { id: 'cat-friends', name: 'יציאות עם חברים', kind: 'expense', nature: 'fun', color: '#ec4899', isSystem: false, sortOrder: 20 },
  { id: 'cat-games', name: 'משחקים ואפליקציות', kind: 'expense', nature: 'fun', color: '#8b5cf6', isSystem: false, sortOrder: 30 },

  // ── הוצאות: ניתנות לצמצום ──────────────────────────────────────────
  { id: 'cat-shopping', name: 'קניות', kind: 'expense', nature: 'reducible', color: '#06b6d4', isSystem: false, sortOrder: 40 },
  { id: 'cat-clothes', name: 'בגדים', kind: 'expense', nature: 'reducible', color: '#14b8a6', isSystem: false, sortOrder: 50 },
  { id: 'cat-gifts', name: 'מתנות', kind: 'expense', nature: 'reducible', color: '#f43f5e', isSystem: false, sortOrder: 60 },

  // ── הוצאות: חיוניות ────────────────────────────────────────────────
  { id: 'cat-transport', name: 'תחבורה', kind: 'expense', nature: 'essential', color: '#3b82f6', isSystem: false, sortOrder: 70 },
  { id: 'cat-phone', name: 'טלפון ומנויים', kind: 'expense', nature: 'essential', color: '#6366f1', isSystem: false, sortOrder: 80 },

  // ── הוצאות: חשובות ─────────────────────────────────────────────────
  { id: 'cat-study', name: 'לימודים', kind: 'expense', nature: 'important', color: '#0ea5e9', isSystem: false, sortOrder: 90 },
  { id: 'cat-sport', name: 'ספורט', kind: 'expense', nature: 'important', color: '#22c55e', isSystem: false, sortOrder: 100 },
  { id: 'cat-family', name: 'הוצאות משפחתיות', kind: 'expense', nature: 'important', color: '#a855f7', isSystem: false, sortOrder: 110 },

  { id: 'cat-savings', name: 'חיסכון', kind: 'expense', nature: 'system', color: '#15803d', isSystem: true, sortOrder: 120 },

  // ── הכנסות ─────────────────────────────────────────────────────────
  { id: 'cat-work', name: 'עבודה', kind: 'income', nature: 'system', color: '#16a34a', isSystem: false, sortOrder: 200 },
  { id: 'cat-family-money', name: 'מתנות וכסף מהמשפחה', kind: 'income', nature: 'system', color: '#65a30d', isSystem: false, sortOrder: 210 },
  { id: 'cat-refunds', name: 'החזרים', kind: 'income', nature: 'system', color: '#84cc16', isSystem: false, sortOrder: 220 },

  // ── מערכת ──────────────────────────────────────────────────────────
  { id: SYSTEM_CATEGORY_IDS.uncategorized, name: 'אחר', kind: 'expense', nature: 'reducible', color: '#94a3b8', isSystem: true, sortOrder: 900 },
  {
    id: SYSTEM_CATEGORY_IDS.balanceAdjustment,
    name: 'התאמת יתרה',
    kind: 'expense',
    nature: 'system',
    color: '#64748b',
    isSystem: true,
    sortOrder: 999,
  },
];
