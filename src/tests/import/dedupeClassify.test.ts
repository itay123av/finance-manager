/**
 * בדיקות זיהוי כפילויות וסיווג אוטומטי.
 *
 * ⭐ הבדיקה החשובה כאן היא ששתי עסקאות זהות באמת **לא** נחשבות
 * לכפילות. מימוש מבוסס-מפתח היה מוחק את השנייה בשקט, וזו בדיוק
 * הסוג של שגיאה שמתגלה רק חודשיים אחר כך כשהיתרה לא מסתדרת.
 */

import { describe, expect, it } from 'vitest';
import { classifyDuplicates, dedupeKey, similarity } from '../../import/dedupe';
import { classifyMerchant, learnFromCorrection, needsReview } from '../../import/classify';
import { DEFAULT_CATEGORIES } from '../../content/categories.seed';
import { normalizeMerchant } from '../../data/normalize';
import type { MerchantRule, Transaction } from '../../core/types';
import type { ParsedRow } from '../../import/types';
import { ILS, tx } from '../helpers';

const ACCOUNT = 'acc-bank';

function row(overrides: Partial<ParsedRow> & { merchant: string }): ParsedRow {
  return {
    sourceLine: 2,
    date: '2026-08-05',
    amountAgorot: ILS(64),
    type: 'expense',
    merchantNormalized: normalizeMerchant(overrides.merchant),
    ...overrides,
  } as ParsedRow;
}

function existing(
  overrides: Partial<Transaction> & { merchant: string; shekels?: number },
): Transaction {
  const { shekels, ...rest } = overrides;
  return tx({
    date: '2026-08-05',
    shekels: shekels ?? 64,
    accountId: ACCOUNT,
    categoryId: 'cat-food-out',
    ...rest,
    merchantNormalized: normalizeMerchant(overrides.merchant),
  });
}

describe('כפילות מדויקת', () => {
  it('עסקה שכבר קיימת מסומנת ככפולה', () => {
    const verdicts = classifyDuplicates({
      accountId: ACCOUNT,
      rows: [row({ merchant: 'ארומה' })],
      existing: [existing({ merchant: 'ארומה' })],
    });
    expect(verdicts[0]?.verdict).toBe('exact_duplicate');
  });

  it('עסקה חדשה אינה מסומנת', () => {
    const verdicts = classifyDuplicates({
      accountId: ACCOUNT,
      rows: [row({ merchant: 'ארומה' })],
      existing: [existing({ merchant: 'רמי לוי', shekels: 152 })],
    });
    expect(verdicts[0]?.verdict).toBe('new');
  });

  it('⭐ שתי קניות זהות באמת — רק הראשונה נחשבת כפולה', () => {
    // בבסיס הנתונים יש אחת; בקובץ יש שתיים → אחת כפולה, אחת חדשה
    const verdicts = classifyDuplicates({
      accountId: ACCOUNT,
      rows: [row({ merchant: 'ארומה' }), row({ merchant: 'ארומה', sourceLine: 3 })],
      existing: [existing({ merchant: 'ארומה' })],
    });
    expect(verdicts.map((v) => v.verdict)).toEqual(['exact_duplicate', 'new']);
  });

  it('⭐ שלוש בקובץ ושתיים קיימות — שתיים כפולות ואחת חדשה', () => {
    const verdicts = classifyDuplicates({
      accountId: ACCOUNT,
      rows: [1, 2, 3].map((i) => row({ merchant: 'ארומה', sourceLine: i })),
      existing: [existing({ merchant: 'ארומה' }), existing({ merchant: 'ארומה' })],
    });
    expect(verdicts.map((v) => v.verdict)).toEqual(['exact_duplicate', 'exact_duplicate', 'new']);
  });

  it('ייבוא של אותו קובץ פעמיים לא מייצר שום עסקה חדשה', () => {
    const rows = [
      row({ merchant: 'ארומה' }),
      row({ merchant: 'רמי לוי', sourceLine: 3, amountAgorot: ILS(152) }),
    ];
    const alreadyImported = rows.map((r) =>
      existing({ merchant: r.merchant, date: r.date, shekels: r.amountAgorot / 100 }),
    );
    const verdicts = classifyDuplicates({ accountId: ACCOUNT, rows, existing: alreadyImported });
    expect(verdicts.every((v) => v.verdict === 'exact_duplicate')).toBe(true);
  });

  it('עסקה בחשבון אחר אינה נחשבת כפילות', () => {
    const verdicts = classifyDuplicates({
      accountId: ACCOUNT,
      rows: [row({ merchant: 'ארומה' })],
      existing: [existing({ merchant: 'ארומה', accountId: 'acc-cash' })],
    });
    expect(verdicts[0]?.verdict).toBe('new');
  });

  it('הכנסה והוצאה באותו סכום אינן כפילות זו של זו', () => {
    const verdicts = classifyDuplicates({
      accountId: ACCOUNT,
      rows: [row({ merchant: 'ארומה', type: 'income' })],
      existing: [existing({ merchant: 'ארומה', type: 'expense' })],
    });
    expect(verdicts[0]?.verdict).toBe('new');
  });

  it('המפתח מכיל את כל מה שמזהה עסקה', () => {
    const key = dedupeKey({
      accountId: ACCOUNT,
      date: '2026-08-05',
      amountAgorot: 6400,
      type: 'expense',
      merchantNormalized: 'ארומה',
    });
    expect(key).toBe('acc-bank|2026-08-05|expense|6400|ארומה');
  });
});

describe('כפילות מטושטשת', () => {
  it('אותו סכום בתאריך קרוב ותיאור דומה — מסומן לבדיקה, לא מדולג', () => {
    const verdicts = classifyDuplicates({
      accountId: ACCOUNT,
      rows: [row({ merchant: 'ארומה תל אביב', date: '2026-08-07' })],
      existing: [existing({ merchant: 'ארומה תל אביב', date: '2026-08-05' })],
    });
    expect(verdicts[0]?.verdict).toBe('possible_duplicate');
    expect(verdicts[0]?.reasonHe).toContain('2026-08-05');
  });

  it('מעבר לחלון של שלושה ימים — עסקה חדשה', () => {
    const verdicts = classifyDuplicates({
      accountId: ACCOUNT,
      rows: [row({ merchant: 'ארומה', date: '2026-08-20' })],
      existing: [existing({ merchant: 'ארומה', date: '2026-08-05' })],
    });
    expect(verdicts[0]?.verdict).toBe('new');
  });

  it('תיאור שונה מדי — עסקה חדשה', () => {
    const verdicts = classifyDuplicates({
      accountId: ACCOUNT,
      rows: [row({ merchant: 'פיצה האט', date: '2026-08-06' })],
      existing: [existing({ merchant: 'ארומה', date: '2026-08-05' })],
    });
    expect(verdicts[0]?.verdict).toBe('new');
  });

  it('מדד הדמיון מתנהג כצפוי', () => {
    expect(similarity('ארומה', 'ארומה')).toBe(1);
    expect(similarity('ארומה תל אביב', 'ארומה תל אביב ')).toBeGreaterThan(0.9);
    expect(similarity('ארומה', 'פיצה האט')).toBeLessThan(0.3);
    expect(similarity('', 'ארומה')).toBe(0);
    expect(similarity('א', 'א')).toBe(1);
  });
});

describe('סיווג אוטומטי', () => {
  const context = { merchantRules: [] as MerchantRule[], categories: DEFAULT_CATEGORIES };

  it('מזהה בתי עסק מוכרים לפי מילות מפתח', () => {
    expect(classifyMerchant('ארומה תל אביב', 'expense', context).categoryId).toBe('cat-food-out');
    expect(classifyMerchant('רמי לוי סניף מרכז', 'expense', context).categoryId).toBe('cat-shopping');
    expect(classifyMerchant('רב קו', 'expense', context).categoryId).toBe('cat-transport');
    expect(classifyMerchant('spotify premium', 'expense', context).categoryId).toBe('cat-phone');
    // דוחות בנק ישראליים כותבים שמות שירותים בעברית
    expect(classifyMerchant('ספוטיפיי', 'expense', context).categoryId).toBe('cat-phone');
    expect(classifyMerchant('נטפליקס', 'expense', context).categoryId).toBe('cat-phone');
    expect(classifyMerchant('steam games', 'expense', context).categoryId).toBe('cat-games');
  });

  it('מסווג משכורת כהכנסה מעבודה', () => {
    const result = classifyMerchant('העברת שכר', 'income', context);
    expect(result.categoryId).toBe('cat-work');
  });

  it('⭐ מונח עברי לא מתאים בתוך מילה ארוכה יותר', () => {
    // "אלמונית" מכילה את "מונית" — בלי גבולות מילה עבריים זה היה
    // מסווג חנות אלמונית כתחבורה
    expect(classifyMerchant('חנות אלמונית 999', 'expense', context).categoryId).toBe('cat-other');
    // "סופרפארם" מכילה את "סופר" אבל היא לא מכולת
    expect(classifyMerchant('סופרפארם', 'expense', context).categoryId).toBe('cat-shopping');
    // "מסעדה" לא אמורה להיתפס בתוך מילה אחרת
    expect(classifyMerchant('אבוקדו', 'expense', context).categoryId).toBe('cat-other');
  });

  it('קידומת עברית בת אות אחת עדיין מתאימה', () => {
    expect(classifyMerchant('קניתי בסופר', 'expense', context).categoryId).toBe('cat-shopping');
    expect(classifyMerchant('נסיעה במונית', 'expense', context).categoryId).toBe('cat-transport');
  });

  it('גבולות מילה בלטינית ממשיכים לעבוד', () => {
    expect(classifyMerchant('steam', 'expense', context).categoryId).toBe('cat-games');
    // "upbeat" מכילה "be" — ואסור שתסווג כקניות
    expect(classifyMerchant('upbeat studio', 'expense', context).categoryId).toBe('cat-other');
  });

  it('מה שלא זוהה מקבל ביטחון אפס ומסומן לבדיקה', () => {
    const result = classifyMerchant('חנות מוזרה 12345', 'expense', context);
    expect(result.categoryId).toBe('cat-other');
    expect(result.confidence).toBe(0);
    expect(needsReview(result.confidence)).toBe(true);
    expect(result.sourceHe).toContain('כדאי לבדוק');
  });

  it('⭐ תיקון קודם של המשתמש גובר על כללי מילות המפתח', () => {
    const rules: MerchantRule[] = [
      {
        id: 'r1',
        merchantNormalized: 'ארומה תל אביב',
        categoryId: 'cat-friends', // המשתמש החליט שזה יציאה עם חברים
        matchType: 'exact',
        correctionCount: 2,
        source: 'learned',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ];
    const result = classifyMerchant('ארומה תל אביב', 'expense', { ...context, merchantRules: rules });
    expect(result.categoryId).toBe('cat-friends');
    expect(result.sourceHe).toContain('תיקון קודם');
  });

  it('הביטחון עולה עם מספר התיקונים', () => {
    const make = (count: number): MerchantRule[] => [
      {
        id: 'r1',
        merchantNormalized: 'חנות',
        categoryId: 'cat-shopping',
        matchType: 'exact',
        correctionCount: count,
        source: 'learned',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ];
    const at = (count: number) =>
      classifyMerchant('חנות', 'expense', { ...context, merchantRules: make(count) }).confidence;

    expect(at(1)).toBeCloseTo(0.7);
    expect(at(3)).toBeCloseTo(0.9);
    expect(at(10)).toBeLessThanOrEqual(0.99);
    expect(needsReview(at(3))).toBe(false);
  });

  it('לא מסווג לקטגוריה מאורכבת', () => {
    const archived = DEFAULT_CATEGORIES.map((c) =>
      c.id === 'cat-food-out' ? { ...c, archivedAt: '2026-01-01T00:00:00.000Z' } : c,
    );
    const result = classifyMerchant('ארומה', 'expense', { ...context, categories: archived });
    expect(result.categoryId).not.toBe('cat-food-out');
  });

  it('לא מסווג הוצאה לקטגוריית הכנסה', () => {
    const result = classifyMerchant('העברת שכר', 'expense', context);
    expect(result.categoryId).not.toBe('cat-work');
  });
});

describe('למידה מתיקונים', () => {
  const base = { now: '2026-08-07T00:00:00.000Z', newId: () => 'new-rule' };

  it('תיקון ראשון יוצר כלל חדש', () => {
    const result = learnFromCorrection([], {
      ...base,
      merchantNormalized: 'חנות מוזרה',
      categoryId: 'cat-shopping',
    });
    expect(result?.isNew).toBe(true);
    expect(result?.rule.correctionCount).toBe(1);
    expect(result?.rule.source).toBe('learned');
  });

  it('תיקון חוזר לאותה קטגוריה מחזק את הכלל', () => {
    const first = learnFromCorrection([], {
      ...base,
      merchantNormalized: 'חנות',
      categoryId: 'cat-shopping',
    })!;
    const second = learnFromCorrection([first.rule], {
      ...base,
      merchantNormalized: 'חנות',
      categoryId: 'cat-shopping',
    })!;
    expect(second.isNew).toBe(false);
    expect(second.rule.correctionCount).toBe(2);
  });

  it('⭐ שינוי דעה מאפס את המונה ולא מצטבר על קטגוריה שגויה', () => {
    const first = learnFromCorrection([], {
      ...base,
      merchantNormalized: 'חנות',
      categoryId: 'cat-shopping',
    })!;
    const strengthened = learnFromCorrection([first.rule], {
      ...base,
      merchantNormalized: 'חנות',
      categoryId: 'cat-shopping',
    })!;
    const changed = learnFromCorrection([strengthened.rule], {
      ...base,
      merchantNormalized: 'חנות',
      categoryId: 'cat-clothes',
    })!;
    expect(changed.rule.categoryId).toBe('cat-clothes');
    expect(changed.rule.correctionCount).toBe(1);
  });

  it('בלי שם בית עסק אין ממה ללמוד', () => {
    expect(
      learnFromCorrection([], { ...base, merchantNormalized: '', categoryId: 'cat-other' }),
    ).toBeNull();
  });
});
