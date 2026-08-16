/**
 * שתי רמות ביטחון נפרדות — כמה אנחנו סומכים על **הסכום**, וכמה על
 * **הפילוח**.
 *
 * ⚠️ למה ההפרדה חיונית.
 *
 * "הוצאת ₪525 בחודש" ו-"הוצאת ₪180 על אוכל בחוץ" הם שני מספרים עם
 * מידה שונה לגמרי של ודאות. הראשון נגזר מיתרת הבנק, שמתאמתת מול הדוח
 * בפער ₪0 — הוא כמעט עובדה. השני נגזר מפירוט שקיים רק לחלק מההוצאות.
 *
 * כשחלק מההיסטוריה הוא חיובים של כרטיס ישן בלי פירוט, הסכום הכולל
 * נשאר מדויק אבל הפילוח מתבסס על מדגם חלקי. רמת ביטחון אחת לשניהם
 * הייתה מאלצת לבחור בין שני רעים: או להציג המלצות קטגוריה על נתונים
 * שאינם תומכים בהן, או להסתיר גם את הסכום הכולל שכן אמין.
 */

import { confidenceFromMonths, minConfidence } from './confidence';
import { isOpaqueCategory, type EffectiveExpense } from './effectiveSpending';
import { sumA } from './money';
import type { Agorot, Confidence } from './types';

/** מתחת לזה, הפילוח מתבסס על מיעוט מההוצאות ואינו בר-שימוש. */
export const MIN_DETAILED_SHARE_FOR_CATEGORY_ADVICE = 0.5;
const HIGH_DETAIL_SHARE = 0.85;
const MEDIUM_DETAIL_SHARE = 0.6;

export interface SpendingConfidence {
  /** ביטחון בסכום הכולל — נגזר מכמות ההיסטוריה. */
  total: Confidence;
  /** ביטחון בפילוח לקטגוריות — נגזר גם מכמה מההוצאות מפורטות. */
  category: Confidence;
  /** חלק ההוצאות שיש להן קטגוריה אמיתית. */
  detailedShare: number;
  detailedAgorot: Agorot;
  opaqueAgorot: Agorot;
  totalAgorot: Agorot;
  /** האם מותר לבנות המלצות ברמת קטגוריה. */
  categoryAdviceAllowed: boolean;
  /** הסבר קצר להצגה, או `null` כשאין הסתייגות. */
  disclaimerHe: string | null;
}

export interface SpendingConfidenceInput {
  expenses: readonly EffectiveExpense[];
  /** מספר החודשים המלאים שיש עליהם נתונים. */
  monthsOfData: number;
}

export function assessSpendingConfidence(
  input: SpendingConfidenceInput,
): SpendingConfidence {
  const totalAgorot = sumA(input.expenses.map((e) => e.amountAgorot));
  const opaqueAgorot = sumA(
    input.expenses.filter((e) => isOpaqueCategory(e.categoryId)).map((e) => e.amountAgorot),
  );
  const detailedAgorot = totalAgorot - opaqueAgorot;

  // בלי הוצאות כלל, שאלת הפילוח לא מתעוררת
  const detailedShare = totalAgorot === 0 ? 1 : detailedAgorot / totalAgorot;

  const total = confidenceFromMonths(input.monthsOfData);

  // הפילוח לא יכול להיות בטוח יותר מהסכום הכולל, וגם לא יותר ממה
  // שחלק ההוצאות המפורטות מצדיק
  const fromShare: Confidence =
    detailedShare >= HIGH_DETAIL_SHARE
      ? 'high'
      : detailedShare >= MEDIUM_DETAIL_SHARE
        ? 'medium'
        : detailedShare >= MIN_DETAILED_SHARE_FOR_CATEGORY_ADVICE
          ? 'low'
          : 'none';

  const category = minConfidence(total, fromShare);
  const categoryAdviceAllowed =
    detailedShare >= MIN_DETAILED_SHARE_FOR_CATEGORY_ADVICE && category !== 'none';

  return {
    total,
    category,
    detailedShare,
    detailedAgorot,
    opaqueAgorot,
    totalAgorot,
    categoryAdviceAllowed,
    disclaimerHe:
      opaqueAgorot === 0
        ? null
        : 'חלק מההוצאות ההיסטוריות שייכות לכרטיס ישן ללא פירוט, ולכן ההמלצות לפי קטגוריה מבוססות בעיקר על הנתונים המפורטים יותר.',
  };
}

/**
 * משקל לחודש לצורך חישוב ממוצעים לפי קטגוריה.
 *
 * חודש שרובו מפורט מייצג את הרגלי ההוצאה טוב יותר מחודש שרובו חיובי
 * כרטיס אטומים. במקום להשמיט חודשים חלקיים לגמרי — מה שהיה מבזבז
 * נתונים אמיתיים — הם נספרים לפי מידת הפירוט שלהם.
 */
export function monthDetailWeight(expenses: readonly EffectiveExpense[]): number {
  const total = sumA(expenses.map((e) => e.amountAgorot));
  if (total === 0) return 0;
  const opaque = sumA(
    expenses.filter((e) => isOpaqueCategory(e.categoryId)).map((e) => e.amountAgorot),
  );
  return Math.max(0, (total - opaque) / total);
}
