/**
 * סיווג אוטומטי.
 *
 * שלוש שכבות, לפי סדר עדיפות יורד:
 *  1. **זיכרון תיקונים** — מה שהמשתמש כבר תיקן בעבר. גובר על הכל.
 *  2. **כללי מילות מפתח** — רשימת פתיחה בעברית.
 *  3. **ברירת מחדל** — "אחר", עם ביטחון אפס, מסומן לבדיקה.
 *
 * אין כאן AI, וזה מכוון: כלל שאפשר לקרוא הוא כלל שאפשר לתקן. רמת
 * הביטחון עולה עם כל תיקון, כך שהמערכת נעשית מדויקת יותר דווקא
 * בבתי העסק שבהם המשתמש קונה הרבה.
 */

import { FALLBACK_CATEGORY_ID, KEYWORD_RULES } from '../content/merchantRules.seed';
import type { Category, MerchantRule, TransactionType, UUID } from '../core/types';

export const LOW_CONFIDENCE_THRESHOLD = 0.7;

const CONFIDENCE = {
  /** תיקון ידני של המשתמש — ודאות מלאה. */
  learnedBase: 0.6,
  learnedStep: 0.1,
  learnedMax: 0.99,
  keyword: 0.7,
  fallback: 0,
} as const;

export interface ClassificationResult {
  categoryId: UUID;
  confidence: number;
  sourceHe: string;
}

export interface ClassifyContext {
  merchantRules: readonly MerchantRule[];
  categories: readonly Category[];
}

/** קטגוריות פעילות בלבד — סיווג לקטגוריה מאורכבת היה מחזיר אותה לחיים. */
function usableCategoryIds(categories: readonly Category[]): Set<UUID> {
  return new Set(categories.filter((c) => !c.archivedAt).map((c) => c.id));
}

export function classifyMerchant(
  merchantNormalized: string,
  type: TransactionType,
  context: ClassifyContext,
): ClassificationResult {
  const usable = usableCategoryIds(context.categories);
  const kindOf = new Map(context.categories.map((c) => [c.id, c.kind]));

  /** קטגוריה תקפה רק אם היא קיימת, פעילה, ומאותו כיוון כמו העסקה. */
  const isValid = (categoryId: UUID) =>
    usable.has(categoryId) && kindOf.get(categoryId) === type;

  // 1. זיכרון תיקונים — התאמה מדויקת
  const learned = context.merchantRules.find(
    (rule) => rule.matchType === 'exact' && rule.merchantNormalized === merchantNormalized,
  );
  if (learned && isValid(learned.categoryId)) {
    return {
      categoryId: learned.categoryId,
      confidence: Math.min(
        CONFIDENCE.learnedMax,
        CONFIDENCE.learnedBase + CONFIDENCE.learnedStep * learned.correctionCount,
      ),
      sourceHe: 'לפי תיקון קודם שלך',
    };
  }

  // 1ב. זיכרון תיקונים — התאמת מילת מפתח שנלמדה
  const learnedKeyword = context.merchantRules.find(
    (rule) =>
      rule.matchType === 'keyword' &&
      rule.merchantNormalized !== '' &&
      merchantNormalized.includes(rule.merchantNormalized),
  );
  if (learnedKeyword && isValid(learnedKeyword.categoryId)) {
    return {
      categoryId: learnedKeyword.categoryId,
      confidence: Math.min(
        CONFIDENCE.learnedMax,
        CONFIDENCE.learnedBase + CONFIDENCE.learnedStep * learnedKeyword.correctionCount,
      ),
      sourceHe: 'לפי תיקון קודם שלך',
    };
  }

  // 2. כללי פתיחה
  if (merchantNormalized !== '') {
    for (const rule of KEYWORD_RULES) {
      if (!isValid(rule.categoryId)) continue;
      if (rule.patterns.some((pattern) => pattern.test(merchantNormalized))) {
        return {
          categoryId: rule.categoryId,
          confidence: CONFIDENCE.keyword,
          sourceHe: 'זוהה לפי שם בית העסק',
        };
      }
    }
  }

  // 3. ברירת מחדל — לפי כיוון העסקה
  const fallback =
    type === 'income'
      ? (context.categories.find((c) => c.kind === 'income' && !c.archivedAt)?.id ??
        FALLBACK_CATEGORY_ID)
      : FALLBACK_CATEGORY_ID;

  return {
    categoryId: fallback,
    confidence: CONFIDENCE.fallback,
    sourceHe: 'לא זוהה — כדאי לבדוק',
  };
}

// ---------------------------------------------------------------------------
// למידה מתיקונים
// ---------------------------------------------------------------------------

export interface LearnResult {
  rule: MerchantRule;
  isNew: boolean;
}

/**
 * מייצר או מעדכן כלל מזיכרון התיקונים.
 * כל תיקון חוזר על אותו בית עסק מעלה את הביטחון בצעד אחד.
 */
export function learnFromCorrection(
  existing: readonly MerchantRule[],
  input: { merchantNormalized: string; categoryId: UUID; now: string; newId: () => string },
): LearnResult | null {
  // בלי שם בית עסק אין ממה ללמוד
  if (input.merchantNormalized.trim() === '') return null;

  const current = existing.find(
    (rule) => rule.matchType === 'exact' && rule.merchantNormalized === input.merchantNormalized,
  );

  if (!current) {
    return {
      isNew: true,
      rule: {
        id: input.newId(),
        merchantNormalized: input.merchantNormalized,
        categoryId: input.categoryId,
        matchType: 'exact',
        correctionCount: 1,
        source: 'learned',
        updatedAt: input.now,
      },
    };
  }

  return {
    isNew: false,
    rule: {
      ...current,
      categoryId: input.categoryId,
      // תיקון לאותה קטגוריה מחזק; שינוי דעה מאפס את המונה ומתחיל מחדש
      correctionCount:
        current.categoryId === input.categoryId ? current.correctionCount + 1 : 1,
      source: 'learned',
      updatedAt: input.now,
    },
  };
}

export function needsReview(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
}
