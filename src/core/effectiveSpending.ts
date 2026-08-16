/**
 * הוצאה אפקטיבית — מקור האמת היחיד לניתוח הוצאות.
 *
 * ⚠️ הבעיה שהמודול הזה פותר.
 *
 * אותה הוצאה מופיעה פעמיים בנתונים:
 *   · בבנק:    "חיוב לכרטיס ויזה 1234 — ₪150"
 *   · בכרטיס:  חנות א׳ ₪80 + חנות ב׳ ₪40 + חנות ג׳ ₪30
 *
 * שתי הרשומות מתארות את אותו כסף. סכימה של שתיהן תיתן ₪300 במקום ₪150.
 *
 * ⚠️ הכלל.
 *
 *   חיוב כרטיס **שיש לו פירוט מקושר** → מוחלף בעסקאות הכרטיס.
 *   חיוב כרטיס **בלי פירוט**          → נשאר, תחת "כרטיס אשראי — לא מפורט".
 *   כל השאר (בנק, מזומן)              → נכלל כרגיל.
 *
 * כך אף הוצאה לא נעלמת גם כשחסר קובץ כרטיס, ואף הוצאה לא נספרת פעמיים
 * כשהקובץ קיים.
 *
 * ⚠️ מה המודול הזה **לא** עושה: הוא לא נוגע ביתרת הבנק. היתרה נגזרת
 * תמיד מ-`core/balance.ts` לפי תנועות הבנק בלבד. פירוק חיוב לפרטיו
 * משנה את **הסיווג** של ההוצאה, לא את הכסף.
 */

import { detectCardCharge, isCardCharge } from './cardCharges';
import { isBetween } from './dates';
import { sumA } from './money';
import type {
  Agorot,
  CardTransaction,
  Category,
  CreditCard,
  ISODate,
  Transaction,
  UUID,
} from './types';

/**
 * חיוב של כרטיס פעיל שהפירוט שלו טרם יובא.
 * ⇒ שווה להשלים את הקובץ; הפער הזה בר-תיקון.
 */
export const UNDETAILED_CARD_CATEGORY_ID = 'cat-card-undetailed';
export const UNDETAILED_CARD_CATEGORY_NAME = 'כרטיס אשראי — לא מפורט';

/**
 * חיוב של כרטיס ישן שאין ולא יהיה לו פירוט.
 *
 * ⚠️ ההבחנה בין שתי הקטגוריות אינה קוסמטית. "לא מפורט" הוא חוב שאפשר
 * לסגור בהעלאת קובץ; "כרטיס ישן" הוא עובדה קבועה. לכן הראשון מוצג
 * כמשימה פתוחה, והשני **מוחרג** מכל הסקה ברמת הקטגוריה — אחרת המערכת
 * הייתה בונה המלצות ("אתה מוציא יותר מדי על…") על כסף שאיש לא יודע
 * לאן הלך.
 */
export const RETIRED_CARD_CATEGORY_ID = 'cat-card-retired';
export const RETIRED_CARD_CATEGORY_NAME = 'כרטיס ישן — לא מפורט';

/** קטגוריות שאין להן פירוט אמיתי ולכן אינן משמשות לניתוח קטגוריאלי. */
export const OPAQUE_CATEGORY_IDS: readonly string[] = [
  UNDETAILED_CARD_CATEGORY_ID,
  RETIRED_CARD_CATEGORY_ID,
];

export function isOpaqueCategory(categoryId: string): boolean {
  return OPAQUE_CATEGORY_IDS.includes(categoryId);
}

export type EffectiveSource = 'bank' | 'cash' | 'card' | 'card_undetailed' | 'card_retired';

export interface EffectiveExpense {
  id: UUID;
  date: ISODate;
  amountAgorot: Agorot;
  categoryId: UUID;
  merchant: string;
  source: EffectiveSource;
  /** לעסקת כרטיס — החיוב בבנק שהיא מחליפה. */
  replacesBankTransactionId?: UUID;
}

export interface EffectiveExpensesInput {
  transactions: readonly Transaction[];
  cardTransactions: readonly CardTransaction[];
  from: ISODate;
  to: ISODate;
  /**
   * כרטיסים ידועים. משמש כדי להבחין בין כרטיס פעיל שהפירוט שלו חסר
   * לבין כרטיס ישן שלא יהיה לו פירוט לעולם.
   */
  cards?: readonly CreditCard[];
}

/**
 * האם לחיוב הזה יכול להיות פירוט בעתיד?
 *
 * כרטיס שסומן `active: false` הוא ישן. כרטיס שאין לו אף עסקת פירוט
 * ואינו רשום כלל — גם הוא נחשב ישן, כי אין שום אינדיקציה שיגיע קובץ.
 */
function isRetiredCardCharge(
  last4: string | null,
  cards: readonly CreditCard[],
  cardTransactions: readonly CardTransaction[],
): boolean {
  if (last4 === null) return false;

  const card = cards.find((c) => c.last4 === last4);
  if (card) {
    if (!card.active) return true;
    return !cardTransactions.some((t) => t.cardId === card.id);
  }
  // כרטיס שלא נרשם מעולם ואין לו פירוט
  return true;
}

/**
 * מחזיר את ההוצאות של התקופה, בלי ספירה כפולה.
 *
 * שים לב לתאריך שנבחר לעסקת כרטיס: משתמשים ב-**תאריך החיוב בבנק**
 * ולא בתאריך הרכישה. אחרת רכישה מ-31/07 שירדה ב-02/08 הייתה נספרת
 * ביולי בעוד שהכסף יצא באוגוסט, והסכומים החודשיים לא היו מסתדרים
 * מול היתרה.
 */
export function getEffectiveExpenses(input: EffectiveExpensesInput): EffectiveExpense[] {
  const { transactions, cardTransactions, from, to } = input;
  const cards = input.cards ?? [];

  // אילו חיובי בנק כוסו על ידי פירוט
  const detailedChargeIds = new Set(
    cardTransactions
      .filter((t) => t.linkedBankTransactionId !== undefined && t.status === 'billed')
      .map((t) => t.linkedBankTransactionId!),
  );

  const bankById = new Map(transactions.map((t) => [t.id, t]));
  const result: EffectiveExpense[] = [];

  // ── תנועות בנק ומזומן ──────────────────────────────────────────────
  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    if (transaction.status !== 'actual' || transaction.kind !== 'normal') continue;
    if (!isBetween(transaction.date, from, to)) continue;

    if (isCardCharge(transaction)) {
      // ⭐ יש פירוט → החיוב מוחלף בו ואינו נספר
      if (detailedChargeIds.has(transaction.id)) continue;

      const { last4 } = detectCardCharge(transaction.merchant)!;
      const retired = isRetiredCardCharge(last4, cards, cardTransactions);

      result.push({
        id: transaction.id,
        date: transaction.date,
        amountAgorot: transaction.amountAgorot,
        categoryId: retired ? RETIRED_CARD_CATEGORY_ID : UNDETAILED_CARD_CATEGORY_ID,
        merchant: transaction.merchant,
        source: retired ? 'card_retired' : 'card_undetailed',
      });
      continue;
    }

    result.push({
      id: transaction.id,
      date: transaction.date,
      amountAgorot: transaction.amountAgorot,
      categoryId: transaction.categoryId,
      merchant: transaction.merchant,
      source: 'bank',
    });
  }

  // ── עסקאות כרטיס שמחליפות חיוב ─────────────────────────────────────
  for (const card of cardTransactions) {
    if (card.status !== 'billed') continue;
    if (card.linkedBankTransactionId === undefined) continue;

    const charge = bankById.get(card.linkedBankTransactionId);
    // בלי החיוב המקושר אין לנו תאריך אמין, והכסף ממילא לא יצא מהבנק
    if (!charge) continue;
    if (!isBetween(charge.date, from, to)) continue;

    result.push({
      id: card.id,
      date: charge.date,
      // זיכוי מקטין את ההוצאה בקטגוריה, ולכן נשמר כסכום שלילי
      amountAgorot: card.isRefund ? -card.amountAgorot : card.amountAgorot,
      categoryId: card.categoryId,
      merchant: card.merchant,
      source: 'card',
      replacesBankTransactionId: card.linkedBankTransactionId,
    });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

export interface EffectiveCategoryTotal {
  categoryId: UUID;
  categoryName: string;
  amountAgorot: Agorot;
  count: number;
}

export function effectiveExpensesByCategory(
  expenses: readonly EffectiveExpense[],
  categories: readonly Category[],
): EffectiveCategoryTotal[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  names.set(UNDETAILED_CARD_CATEGORY_ID, UNDETAILED_CARD_CATEGORY_NAME);
  names.set(RETIRED_CARD_CATEGORY_ID, RETIRED_CARD_CATEGORY_NAME);

  const totals = new Map<UUID, { amount: Agorot; count: number }>();
  for (const expense of expenses) {
    const current = totals.get(expense.categoryId) ?? { amount: 0, count: 0 };
    totals.set(expense.categoryId, {
      amount: current.amount + expense.amountAgorot,
      count: current.count + 1,
    });
  }

  return [...totals.entries()]
    .map(([categoryId, { amount, count }]) => ({
      categoryId,
      categoryName: names.get(categoryId) ?? 'לא ידוע',
      amountAgorot: amount,
      count,
    }))
    .sort((a, b) => b.amountAgorot - a.amountAgorot);
}

// ---------------------------------------------------------------------------
// ⭐ ה-invariant שמגן מפני ספירה כפולה
// ---------------------------------------------------------------------------

export interface DoubleCountCheck {
  effectiveTotalAgorot: Agorot;
  bankAndCashTotalAgorot: Agorot;
  differenceAgorot: Agorot;
  /** אמת = אין ספירה כפולה. */
  ok: boolean;
  messageHe: string;
}

/**
 * מוודא שסכום ההוצאות האפקטיביות אינו גדול מסכום ההוצאות בבנק ובמזומן.
 *
 * זה ה-invariant המרכזי של המודול. אם פירוט הכרטיס וחיוב הבנק נספרו
 * יחד, הסכום האפקטיבי יקפוץ מעל סכום הבנק — וזה בדיוק מה שנתפס כאן.
 *
 * הכיוון השני מותר: הוצאות אפקטיביות **קטנות** מהבנק כשעסקת כרטיס
 * טרם חויבה, או כשחיוב שייך לתקופה אחרת.
 */
export function checkNoDoubleCounting(input: EffectiveExpensesInput): DoubleCountCheck {
  const effective = getEffectiveExpenses(input);
  const effectiveTotal = sumA(effective.map((e) => e.amountAgorot));

  const bankAndCash = sumA(
    input.transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          t.status === 'actual' &&
          t.kind === 'normal' &&
          isBetween(t.date, input.from, input.to),
      )
      .map((t) => t.amountAgorot),
  );

  const difference = effectiveTotal - bankAndCash;
  const ok = difference <= 0;

  return {
    effectiveTotalAgorot: effectiveTotal,
    bankAndCashTotalAgorot: bankAndCash,
    differenceAgorot: difference,
    ok,
    messageHe: ok
      ? 'אין ספירה כפולה: ההוצאות האפקטיביות אינן עולות על ההוצאות בבנק.'
      : 'ספירה כפולה! פירוט הכרטיס וחיוב הבנק נספרים יחד.',
  };
}
