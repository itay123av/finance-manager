/**
 * ⭐ בדיקות ההוצאה האפקטיבית — ההגנה מפני ספירה כפולה.
 *
 * התרחיש: חיוב בנק "חיוב לכרטיס ויזה 1234 — ₪144", ובפירוט הכרטיס
 * אותן קניות: ₪75 + ₪6 + ₪63. סכימה של שניהם תיתן ₪288 במקום ₪144.
 *
 * ⚠️ כל השמות והסכומים כאן מומצאים. אין בקובץ הזה שורה מקובץ אמיתי.
 */

import { describe, expect, it } from 'vitest';
import {
  RETIRED_CARD_CATEGORY_ID,
  UNDETAILED_CARD_CATEGORY_ID,
  checkNoDoubleCounting,
  effectiveExpensesByCategory,
  getEffectiveExpenses,
  isOpaqueCategory,
} from '../../core/effectiveSpending';
import { detectCardCharge, isCardCharge } from '../../core/cardCharges';
import { DEFAULT_CATEGORIES } from '../../content/categories.seed';
import type { CardTransaction } from '../../core/types';
import { ILS, tx } from '../helpers';

const PERIOD = { from: '2026-07-01', to: '2026-07-31' };

/** חיוב הכרטיס בבנק. */
const charge = tx({
  id: 'bank-charge-1',
  date: '2026-07-28',
  shekels: 144,
  merchant: 'חיוב לכרטיס ויזה 3483',
  categoryId: 'cat-other',
});

/** קנייה רגילה בבנק, לא קשורה לכרטיס. */
const groceries = tx({
  id: 'bank-groceries',
  date: '2026-07-10',
  shekels: 100,
  merchant: 'רמי לוי',
  categoryId: 'cat-shopping',
});

function cardTx(overrides: Partial<CardTransaction> & { id: string; shekels: number }): CardTransaction {
  const { shekels, ...rest } = overrides;
  return {
    cardId: 'card-3483',
    purchaseDate: '2026-07-26',
    merchant: 'חנות',
    merchantNormalized: 'חנות',
    amountAgorot: ILS(shekels),
    currency: 'ILS',
    categoryId: 'cat-phone',
    isRefund: false,
    status: 'billed',
    sourceFile: 'card.xlsx',
    classificationConfidence: 0.85,
    userCorrected: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...rest,
  } as CardTransaction;
}

const details: CardTransaction[] = [
  cardTx({ id: 'c1', shekels: 75, merchant: 'חנות א׳', linkedBankTransactionId: 'bank-charge-1' }),
  cardTx({
    id: 'c2',
    shekels: 6,
    merchant: 'חנות ב׳',
    categoryId: 'cat-food-out',
    linkedBankTransactionId: 'bank-charge-1',
  }),
  cardTx({ id: 'c3', shekels: 63, merchant: 'חנות ג׳', linkedBankTransactionId: 'bank-charge-1' }),
];

describe('זיהוי חיוב כרטיס בדוח הבנק', () => {
  it('מזהה את הניסוחים הנפוצים ומחלץ ארבע ספרות', () => {
    expect(detectCardCharge('חיוב לכרטיס ויזה 3483')).toEqual({ last4: '3483' });
    expect(detectCardCharge('חיוב כרטיס אשראי 4569')).toEqual({ last4: '4569' });
    expect(detectCardCharge('חיוב זמני לכרטיס חיוב מיידי')).toEqual({ last4: null });
  });

  it('לא מזהה עסקאות רגילות', () => {
    expect(detectCardCharge('רמי לוי')).toBeNull();
    expect(detectCardCharge('העברה מאיתי')).toBeNull();
    expect(isCardCharge(groceries)).toBe(false);
    expect(isCardCharge(charge)).toBe(true);
  });
});

describe('⭐ חיוב עם פירוט מוחלף, לא מתווסף', () => {
  it('סכום ההוצאות נשאר ₪244 ולא ₪388', () => {
    const expenses = getEffectiveExpenses({
      transactions: [charge, groceries],
      cardTransactions: details,
      ...PERIOD,
    });

    const total = expenses.reduce((s, e) => s + e.amountAgorot, 0);
    expect(total).toBe(ILS(244)); // 100 קניות + 144 פירוט הכרטיס
    // החיוב המרוכז עצמו אינו מופיע
    expect(expenses.some((e) => e.id === charge.id)).toBe(false);
    expect(expenses.filter((e) => e.source === 'card')).toHaveLength(3);
  });

  it('הקטגוריות מגיעות מהפירוט ולא מהחיוב', () => {
    const expenses = getEffectiveExpenses({
      transactions: [charge, groceries],
      cardTransactions: details,
      ...PERIOD,
    });
    const byCategory = effectiveExpensesByCategory(expenses, DEFAULT_CATEGORIES);

    expect(byCategory.find((c) => c.categoryId === 'cat-phone')?.amountAgorot).toBe(ILS(138));
    expect(byCategory.find((c) => c.categoryId === 'cat-food-out')?.amountAgorot).toBe(ILS(6));
    expect(byCategory.find((c) => c.categoryId === 'cat-shopping')?.amountAgorot).toBe(ILS(100));
    expect(byCategory.some((c) => c.categoryId === UNDETAILED_CARD_CATEGORY_ID)).toBe(false);
  });

  it('⭐ עסקת כרטיס נספרת בתאריך החיוב בבנק, לא בתאריך הרכישה', () => {
    // רכישה ב-31/07 שירדה מהבנק ב-02/08 שייכת לאוגוסט
    const lateCharge = tx({
      id: 'bank-charge-aug',
      date: '2026-08-02',
      shekels: 50,
      merchant: 'חיוב לכרטיס ויזה 3483',
    });
    const purchase = cardTx({
      id: 'c-late',
      shekels: 50,
      purchaseDate: '2026-07-31',
      linkedBankTransactionId: 'bank-charge-aug',
    });

    const july = getEffectiveExpenses({
      transactions: [lateCharge],
      cardTransactions: [purchase],
      ...PERIOD,
    });
    expect(july).toHaveLength(0);

    const august = getEffectiveExpenses({
      transactions: [lateCharge],
      cardTransactions: [purchase],
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(august).toHaveLength(1);
    expect(august[0]?.date).toBe('2026-08-02');
  });
});

describe('⭐ חיוב בלי פירוט — ההוצאה לא נעלמת', () => {
  /** כרטיס פעיל שיש לו פירוט — חיוב שלא קושר הוא "חסר", לא "ישן". */
  const ACTIVE_CARD = [
    { id: 'card-3483', nickname: 'כרטיס', last4: '3483', issuer: 'x', chargeMode: 'immediate' as const, active: true },
  ];

  it('כרטיס פעיל: חיוב לא מקושר נשמר תחת "כרטיס אשראי — לא מפורט"', () => {
    const expenses = getEffectiveExpenses({
      transactions: [charge, groceries],
      // יש עסקאות לכרטיס, אבל אף אחת לא מקושרת לחיוב הזה
      cardTransactions: details.map((d) => {
        const copy = { ...d };
        delete copy.linkedBankTransactionId;
        return copy;
      }),
      cards: ACTIVE_CARD,
      ...PERIOD,
    });

    expect(expenses.reduce((s, e) => s + e.amountAgorot, 0)).toBe(ILS(244));
    const undetailed = expenses.find((e) => e.source === 'card_undetailed');
    expect(undetailed?.amountAgorot).toBe(ILS(144));
    expect(undetailed?.categoryId).toBe(UNDETAILED_CARD_CATEGORY_ID);
  });

  it('⭐ כרטיס בלי שום פירוט נחשב ישן', () => {
    const expenses = getEffectiveExpenses({
      transactions: [charge, groceries],
      cardTransactions: [],
      ...PERIOD,
    });

    expect(expenses.reduce((s, e) => s + e.amountAgorot, 0)).toBe(ILS(244));
    const retired = expenses.find((e) => e.source === 'card_retired');
    expect(retired?.amountAgorot).toBe(ILS(144));
    expect(retired?.categoryId).toBe(RETIRED_CARD_CATEGORY_ID);
  });

  it('⭐ כרטיס שסומן לא פעיל נחשב ישן גם אם יש לו פירוט', () => {
    const expenses = getEffectiveExpenses({
      transactions: [charge],
      cardTransactions: details,
      cards: [{ ...ACTIVE_CARD[0]!, active: false }],
      ...PERIOD,
    });
    // הפירוט המקושר עדיין מחליף את החיוב
    expect(expenses.filter((e) => e.source === 'card')).toHaveLength(3);
  });

  it('הקטגוריות הווירטואליות מקבלות שמות קריאים ונבדלים', () => {
    const retired = effectiveExpensesByCategory(
      getEffectiveExpenses({ transactions: [charge], cardTransactions: [], ...PERIOD }),
      DEFAULT_CATEGORIES,
    );
    expect(retired[0]?.categoryName).toBe('כרטיס ישן — לא מפורט');

    const undetailed = effectiveExpensesByCategory(
      getEffectiveExpenses({
        transactions: [charge],
        cardTransactions: details.map((d) => {
          const copy = { ...d };
          delete copy.linkedBankTransactionId;
          return copy;
        }),
        cards: ACTIVE_CARD,
        ...PERIOD,
      }),
      DEFAULT_CATEGORIES,
    );
    expect(undetailed[0]?.categoryName).toBe('כרטיס אשראי — לא מפורט');
  });

  it('⭐ פירוט חלקי: כרטיס אחד מפורט, השני ישן', () => {
    const otherCharge = tx({
      id: 'bank-charge-2',
      date: '2026-07-22',
      shekels: 80,
      merchant: 'חיוב לכרטיס ויזה 4569',
    });
    const expenses = getEffectiveExpenses({
      transactions: [charge, otherCharge],
      cardTransactions: details,
      cards: ACTIVE_CARD,
      ...PERIOD,
    });

    expect(expenses.reduce((s, e) => s + e.amountAgorot, 0)).toBe(ILS(224));
    // 3483 הוחלף בפירוט; 4569 נשאר כישן
    expect(expenses.filter((e) => e.source === 'card')).toHaveLength(3);
    expect(expenses.filter((e) => e.source === 'card_retired')).toHaveLength(1);
  });

  it('שתי הקטגוריות מזוהות כאטומות', () => {
    expect(isOpaqueCategory(RETIRED_CARD_CATEGORY_ID)).toBe(true);
    expect(isOpaqueCategory(UNDETAILED_CARD_CATEGORY_ID)).toBe(true);
    expect(isOpaqueCategory('cat-food-out')).toBe(false);
  });
});

describe('זיכויים', () => {
  it('זיכוי מקטין את ההוצאה בקטגוריה ואינו הכנסה', () => {
    const refund = cardTx({
      id: 'c-refund',
      shekels: 20,
      merchant: 'החזר',
      categoryId: 'cat-phone',
      isRefund: true,
      linkedBankTransactionId: 'bank-charge-1',
    });
    const expenses = getEffectiveExpenses({
      transactions: [charge],
      cardTransactions: [...details, refund],
      ...PERIOD,
    });

    const byCategory = effectiveExpensesByCategory(expenses, DEFAULT_CATEGORIES);
    expect(byCategory.find((c) => c.categoryId === 'cat-phone')?.amountAgorot).toBe(ILS(118));
  });
});

describe('עסקאות שטרם חויבו', () => {
  it('pending אינה נספרת כהוצאה שבוצעה', () => {
    const pending = cardTx({
      id: 'c-pending',
      shekels: 500,
      status: 'pending',
      linkedBankTransactionId: 'bank-charge-1',
    });
    const expenses = getEffectiveExpenses({
      transactions: [charge],
      cardTransactions: [...details, pending],
      ...PERIOD,
    });
    expect(expenses.some((e) => e.id === 'c-pending')).toBe(false);
    expect(expenses.reduce((s, e) => s + e.amountAgorot, 0)).toBe(ILS(144));
  });

  it('עסקה מקושרת לחיוב שאינו קיים אינה נספרת', () => {
    const orphan = cardTx({ id: 'c-orphan', shekels: 90, linkedBankTransactionId: 'no-such-bank' });
    const expenses = getEffectiveExpenses({
      transactions: [charge],
      cardTransactions: [...details, orphan],
      ...PERIOD,
    });
    expect(expenses.some((e) => e.id === 'c-orphan')).toBe(false);
  });

  it('עסקת כרטיס שלא קושרה כלל אינה נספרת פעמיים', () => {
    const unlinked = cardTx({ id: 'c-unlinked', shekels: 30 });
    const expenses = getEffectiveExpenses({
      transactions: [charge],
      cardTransactions: [...details, unlinked],
      ...PERIOD,
    });
    expect(expenses.reduce((s, e) => s + e.amountAgorot, 0)).toBe(ILS(144));
  });
});

describe('⭐ ה-invariant נגד ספירה כפולה', () => {
  it('עובר כשהפירוט מחליף את החיוב', () => {
    const check = checkNoDoubleCounting({
      transactions: [charge, groceries],
      cardTransactions: details,
      ...PERIOD,
    });
    expect(check.ok).toBe(true);
    expect(check.effectiveTotalAgorot).toBe(check.bankAndCashTotalAgorot);
    expect(check.differenceAgorot).toBe(0);
  });

  it('עובר גם כשאין פירוט בכלל', () => {
    const check = checkNoDoubleCounting({
      transactions: [charge, groceries],
      cardTransactions: [],
      ...PERIOD,
    });
    expect(check.ok).toBe(true);
  });

  it('⭐ תופס ספירה כפולה אם החיוב לא הוחלף', () => {
    // מדמים את הבאג: עסקאות כרטיס שמקושרות לחיוב שאינו מזוהה כחיוב כרטיס
    const mislabeled = tx({
      id: 'bank-charge-1',
      date: '2026-07-28',
      shekels: 144,
      merchant: 'קנייה רגילה', // לא מזוהה כחיוב כרטיס → לא יוחלף
    });
    const check = checkNoDoubleCounting({
      transactions: [mislabeled],
      cardTransactions: details,
      ...PERIOD,
    });

    expect(check.ok).toBe(false);
    expect(check.differenceAgorot).toBe(ILS(144));
    expect(check.messageHe).toContain('ספירה כפולה');
  });

  it('הוצאות אפקטיביות קטנות מהבנק זה מותר', () => {
    // עסקת כרטיס שטרם חויבה — הבנק כבר חייב, הפירוט עוד לא הגיע
    const check = checkNoDoubleCounting({
      transactions: [charge, groceries],
      cardTransactions: [],
      from: '2026-07-01',
      to: '2026-07-15',
    });
    expect(check.ok).toBe(true);
  });
});

describe('סינון תקופה וסוגי תנועות', () => {
  it('הכנסות אינן נכללות', () => {
    const income = tx({ id: 'inc', date: '2026-07-05', shekels: 500, type: 'income' });
    const expenses = getEffectiveExpenses({
      transactions: [income, groceries],
      cardTransactions: [],
      ...PERIOD,
    });
    expect(expenses).toHaveLength(1);
  });

  it('התאמת יתרה אינה נכללת', () => {
    const adjustment = tx({
      id: 'adj',
      date: '2026-07-06',
      shekels: 50,
      kind: 'balance_adjustment',
    });
    const expenses = getEffectiveExpenses({
      transactions: [adjustment, groceries],
      cardTransactions: [],
      ...PERIOD,
    });
    expect(expenses).toHaveLength(1);
  });

  it('עסקאות מחוץ לתקופה אינן נכללות', () => {
    const expenses = getEffectiveExpenses({
      transactions: [charge, groceries],
      cardTransactions: details,
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(expenses).toHaveLength(0);
  });

  it('רשימה ריקה מחזירה אפס', () => {
    expect(
      getEffectiveExpenses({ transactions: [], cardTransactions: [], ...PERIOD }),
    ).toEqual([]);
    expect(effectiveExpensesByCategory([], DEFAULT_CATEGORIES)).toEqual([]);
  });

  it('קטגוריה לא מוכרת מקבלת שם ברירת מחדל', () => {
    const orphanCategory = tx({
      id: 'x',
      date: '2026-07-08',
      shekels: 10,
      categoryId: 'cat-deleted',
    });
    const byCategory = effectiveExpensesByCategory(
      getEffectiveExpenses({ transactions: [orphanCategory], cardTransactions: [], ...PERIOD }),
      DEFAULT_CATEGORIES,
    );
    expect(byCategory[0]?.categoryName).toBe('לא ידוע');
  });
});
