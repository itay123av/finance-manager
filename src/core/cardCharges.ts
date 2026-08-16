/**
 * קישור עסקאות כרטיס לחיובים בחשבון הבנק.
 *
 * ⚠️ למה זה קיים בכלל.
 *
 * בחשבון הבנק מופיעה שורה "חיוב לכרטיס ויזה 3483 — ₪144". בפירוט
 * הכרטיס מופיעות אותן קניות בנפרד: ₪75, ₪6, ₪63. שתי הרשומות מתארות
 * **אותו כסף**. ספירה של שתיהן תנפח את ההוצאות פי שניים.
 *
 * הקישור כאן הוא מה שמאפשר לדעת אילו שתי רשומות מתארות את אותו כסף,
 * וכך להחליף את החיוב המרוכז בפירוט האמיתי — בלי לשנות את היתרה.
 *
 * ⚠️ מודל האצווה.
 *
 * בכרטיס דביט ("ויזה מיידי") אין מחזור חודשי: כל יום קניות מתקבץ
 * לחיוב נפרד כעבור יום-שלושה. לכן ההתאמה היא בין **קבוצת עסקאות**
 * לבין חיוב אחד, ולא בין חודש שלם לחיוב אחד.
 */

import { diffDays } from './dates';
import { sumA } from './money';
import type { Agorot, CardTransaction, ISODate, Transaction, UUID } from './types';

/** חלון הימים שבו חיוב יכול להתייחס לעסקה. */
export const CHARGE_WINDOW_DAYS = 6;
/** תקרת מועמדים לחיפוש תת-קבוצה — שומרת על זמן ריצה קבוע. */
const MAX_CANDIDATES = 14;

// ---------------------------------------------------------------------------
// זיהוי חיוב כרטיס בדוח הבנק
// ---------------------------------------------------------------------------

/**
 * מזהה שורה בבנק שהיא חיוב כרטיס, ומחלץ את ארבע הספרות.
 *
 * הניסוחים משתנים בין בנקים: "חיוב לכרטיס ויזה 3483", "חיוב כרטיס
 * אשראי 3483", "חיוב זמני לכרטיס חיוב מיידי" (בלי ספרות).
 */
export function detectCardCharge(merchant: string): { last4: string | null } | null {
  if (!/חיוב\s+(זמני\s+)?(ל)?כרטיס|חיוב\s+כרטיס\s+אשראי/.test(merchant)) return null;
  const digits = merchant.match(/(\d{4})\s*$/);
  return { last4: digits?.[1] ?? null };
}

export function isCardCharge(transaction: Transaction): boolean {
  return transaction.type === 'expense' && detectCardCharge(transaction.merchant) !== null;
}

// ---------------------------------------------------------------------------
// התאמה
// ---------------------------------------------------------------------------

export type MatchConfidence = 'high' | 'medium' | 'low' | 'unresolved';

export interface ChargeMatch {
  bankTransactionId: UUID;
  bankDate: ISODate;
  bankAmountAgorot: Agorot;
  last4: string | null;
  /** מזהי עסקאות הכרטיס שמרכיבות את החיוב. ריק כשלא נמצאה התאמה. */
  cardTransactionIds: UUID[];
  matchedAmountAgorot: Agorot;
  differenceAgorot: Agorot;
  confidence: MatchConfidence;
  reasonHe: string;
  /** כשיש יותר מפתרון אחד — כל האפשרויות, להכרעת המשתמש. */
  alternatives: UUID[][];
}

export interface MatchInput {
  bankTransactions: readonly Transaction[];
  cardTransactions: readonly CardTransaction[];
  cards: readonly { id: UUID; last4: string }[];
}

/**
 * מוצא **את כל** תת-הקבוצות שסכומן שווה ליעד.
 *
 * מחזיר את כולן ולא רק את הראשונה, כי ריבוי פתרונות הוא בדיוק המצב
 * שבו אסור לקשר אוטומטית — שתי קבוצות שונות יכולות להסתכם לאותו סכום.
 */
function findSubsets(
  items: readonly { id: UUID; amountAgorot: Agorot }[],
  target: Agorot,
): UUID[][] {
  const pool = items.slice(0, MAX_CANDIDATES);
  const solutions: UUID[][] = [];

  for (let mask = 1; mask < 1 << pool.length; mask++) {
    let sum = 0;
    const chosen: UUID[] = [];
    for (let i = 0; i < pool.length; i++) {
      if (mask & (1 << i)) {
        sum += pool[i]!.amountAgorot;
        chosen.push(pool[i]!.id);
      }
      if (sum > target) break;
    }
    if (sum === target) solutions.push(chosen);
    // די בשתי אפשרויות כדי לדעת שהמצב לא חד-משמעי
    if (solutions.length >= 2 && solutions[0]!.length !== solutions[1]!.length) break;
  }
  return solutions;
}

/**
 * מקשר חיובי בנק לעסקאות כרטיס.
 *
 * עובד כרונולוגית ומסמן עסקאות כמשויכות, כדי שאותה עסקה לא תשמש
 * לשני חיובים שונים.
 */
export function matchCardTransactionsToCharges(input: MatchInput): ChargeMatch[] {
  const last4ById = new Map(input.cards.map((c) => [c.id, c.last4]));
  const used = new Set<UUID>();

  const charges = input.bankTransactions
    .filter(isCardCharge)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  return charges.map((charge) => {
    const { last4 } = detectCardCharge(charge.merchant)!;

    const base = {
      bankTransactionId: charge.id,
      bankDate: charge.date,
      bankAmountAgorot: charge.amountAgorot,
      last4,
    };

    // מועמדים: אותו כרטיס, טרם שויכו, נרכשו לפני החיוב ובתוך החלון
    const candidates = input.cardTransactions
      .filter((t) => {
        if (used.has(t.id) || t.status !== 'billed') return false;
        if (last4 !== null && last4ById.get(t.cardId) !== last4) return false;
        const gap = diffDays(t.purchaseDate, charge.date);
        return gap >= 0 && gap <= CHARGE_WINDOW_DAYS;
      })
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));

    if (candidates.length === 0) {
      return {
        ...base,
        cardTransactionIds: [],
        matchedAmountAgorot: 0,
        differenceAgorot: charge.amountAgorot,
        confidence: 'unresolved' as const,
        reasonHe: last4
          ? `אין עסקאות כרטיס ${last4} בטווח התאריכים של החיוב.`
          : 'לחיוב אין מספר כרטיס, ואין עסקאות מתאימות בטווח.',
        alternatives: [],
      };
    }

    const subsets = findSubsets(candidates, charge.amountAgorot);

    if (subsets.length === 0) {
      return {
        ...base,
        cardTransactionIds: [],
        matchedAmountAgorot: 0,
        differenceAgorot: charge.amountAgorot,
        confidence: 'unresolved' as const,
        reasonHe: 'לא נמצאה קבוצת עסקאות שמסתכמת בדיוק לסכום החיוב.',
        alternatives: [],
      };
    }

    // ⚠️ יותר מפתרון אחד — לא מקשרים לבד
    if (subsets.length > 1) {
      return {
        ...base,
        cardTransactionIds: [],
        matchedAmountAgorot: 0,
        differenceAgorot: charge.amountAgorot,
        confidence: 'low' as const,
        reasonHe: `נמצאו ${subsets.length} צירופים שונים שמסתכמים לאותו סכום. צריך לבחור ידנית.`,
        alternatives: subsets,
      };
    }

    const chosen = subsets[0]!;
    chosen.forEach((id) => used.add(id));

    const chosenTransactions = candidates.filter((t) => chosen.includes(t.id));
    const maxGap = Math.max(...chosenTransactions.map((t) => diffDays(t.purchaseDate, charge.date)));

    // ביטחון גבוה דורש גם התאמת מספר כרטיס וגם פער תאריכים סביר
    const confidence: MatchConfidence = last4 !== null && maxGap <= 4 ? 'high' : 'medium';

    return {
      ...base,
      cardTransactionIds: chosen,
      matchedAmountAgorot: sumA(chosenTransactions.map((t) => t.amountAgorot)),
      differenceAgorot: 0,
      confidence,
      reasonHe:
        chosen.length === 1
          ? `עסקה אחת בסכום זהה, ${maxGap} ימים לפני החיוב.`
          : `${chosen.length} עסקאות שמסתכמות בדיוק לסכום החיוב, עד ${maxGap} ימים לפניו.`,
      alternatives: [],
    };
  });
}

/** רק התאמות שמותר לקשר אוטומטית. */
export function autoLinkable(matches: readonly ChargeMatch[]): ChargeMatch[] {
  return matches.filter((m) => m.confidence === 'high' || m.confidence === 'medium');
}

// ---------------------------------------------------------------------------
// התאמת מחזור
// ---------------------------------------------------------------------------

export interface CycleReconcileResult {
  cardTransactionsTotalAgorot: Agorot;
  linkedChargesTotalAgorot: Agorot;
  differenceAgorot: Agorot;
  matches: boolean;
  unlinkedCardTransactions: number;
  unmatchedCharges: number;
  summaryHe: string;
}

export function reconcileCardCycle(
  cardTransactions: readonly CardTransaction[],
  matches: readonly ChargeMatch[],
): CycleReconcileResult {
  const billed = cardTransactions.filter((t) => t.status === 'billed');
  const cardTotal = sumA(billed.map((t) => (t.isRefund ? -t.amountAgorot : t.amountAgorot)));

  const linked = matches.filter((m) => m.cardTransactionIds.length > 0);
  const chargesTotal = sumA(linked.map((m) => m.bankAmountAgorot));

  const linkedIds = new Set(linked.flatMap((m) => m.cardTransactionIds));
  const unlinked = billed.filter((t) => !linkedIds.has(t.id)).length;
  const unmatched = matches.length - linked.length;
  const difference = cardTotal - chargesTotal;

  return {
    cardTransactionsTotalAgorot: cardTotal,
    linkedChargesTotalAgorot: chargesTotal,
    differenceAgorot: difference,
    matches: difference === 0 && unlinked === 0,
    unlinkedCardTransactions: unlinked,
    unmatchedCharges: unmatched,
    summaryHe:
      difference === 0 && unlinked === 0
        ? 'כל עסקאות הכרטיס שויכו לחיובים בבנק, בלי פער.'
        : unlinked > 0
          ? `${unlinked} עסקאות כרטיס לא שויכו לאף חיוב. ייתכן שהחיוב שלהן טרם הופיע בדוח הבנק.`
          : 'יש פער בין סכום עסקאות הכרטיס לסכום החיובים שקושרו.',
  };
}
