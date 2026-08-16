/**
 * חישוב יתרה — מקור אמת יחיד.
 *
 * ⚠️ אין במערכת שדה "יתרה נוכחית" שמור. היתרה **תמיד** נגזרת מיתרת הפתיחה
 * של החשבון ומהעסקאות שמעליה. שדה יתרה שמור היה יכול לצאת מסנכרון עם
 * העסקאות, ואז שני מספרים סותרים היו מתחרים על התואר "האמת".
 *
 * שלושה כללי הדרה, כל אחד מהם מונע באג ספציפי:
 *  1. עסקאות לפני `openingDate` — כבר כלולות ביתרת הפתיחה. ספירתן = ספירה כפולה
 *     (קורה כשמייבאים היסטוריה ישנה מהבנק).
 *  2. עסקאות אחרי `asOf` — עדיין לא קרו.
 *  3. `status = 'pending'` — טרם התרחשו בפועל.
 */

import { sumA } from './money';
import type { Account, Agorot, ISODate, Transaction } from './types';

export interface AccountBalance {
  accountId: string;
  name: string;
  type: Account['type'];
  balanceAgorot: Agorot;
  countedTransactions: number;
}

export interface BalanceBreakdown {
  openingTotalAgorot: Agorot;
  incomeTotalAgorot: Agorot;
  expenseTotalAgorot: Agorot;
  /** תיקוני התאמה מול הבנק, נטו. מופרדים כדי שלא יזהמו ניתוח הכנסות/הוצאות. */
  adjustmentsNetAgorot: Agorot;
  countedTransactions: number;
  ignoredBeforeOpening: number;
  ignoredAfterAsOf: number;
  ignoredPending: number;
}

export interface BalanceResult {
  totalAgorot: Agorot;
  byAccount: AccountBalance[];
  breakdown: BalanceBreakdown;
}

/** האם העסקה נספרת ביתרה של החשבון הנתון בתאריך הנתון. */
export function countsTowardBalance(
  transaction: Transaction,
  account: Account,
  asOf: ISODate,
): boolean {
  return (
    transaction.accountId === account.id &&
    transaction.status === 'actual' &&
    transaction.date >= account.openingDate &&
    transaction.date <= asOf
  );
}

/** ‎+‎ להכנסה, ‎−‎ להוצאה. */
export function signedAmount(transaction: Transaction): Agorot {
  return transaction.type === 'income' ? transaction.amountAgorot : -transaction.amountAgorot;
}

export function accountBalance(
  account: Account,
  transactions: readonly Transaction[],
  asOf: ISODate,
): AccountBalance {
  const counted = transactions.filter((t) => countsTowardBalance(t, account, asOf));
  return {
    accountId: account.id,
    name: account.name,
    type: account.type,
    balanceAgorot: account.openingBalanceAgorot + sumA(counted.map(signedAmount)),
    countedTransactions: counted.length,
  };
}

/**
 * היתרה הכוללת על פני כל החשבונות.
 *
 * מובטחת הזהות:
 *   `total = openingTotal + income − expense + adjustmentsNet`
 * וזו בדיוק הטבלה שהממשק מציג תחת "איך חישבנו את היתרה".
 */
export function totalBalance(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  asOf: ISODate,
): BalanceResult {
  const byAccount = accounts.map((a) => accountBalance(a, transactions, asOf));
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  let incomeTotalAgorot = 0;
  let expenseTotalAgorot = 0;
  let adjustmentsNetAgorot = 0;
  let countedTransactions = 0;
  let ignoredBeforeOpening = 0;
  let ignoredAfterAsOf = 0;
  let ignoredPending = 0;

  for (const t of transactions) {
    const account = accountById.get(t.accountId);
    if (!account) continue;

    if (t.status !== 'actual') {
      ignoredPending++;
      continue;
    }
    if (t.date < account.openingDate) {
      ignoredBeforeOpening++;
      continue;
    }
    if (t.date > asOf) {
      ignoredAfterAsOf++;
      continue;
    }

    countedTransactions++;
    if (t.kind === 'balance_adjustment') {
      adjustmentsNetAgorot += signedAmount(t);
    } else if (t.type === 'income') {
      incomeTotalAgorot += t.amountAgorot;
    } else {
      expenseTotalAgorot += t.amountAgorot;
    }
  }

  const openingTotalAgorot = sumA(accounts.map((a) => a.openingBalanceAgorot));

  return {
    totalAgorot: sumA(byAccount.map((a) => a.balanceAgorot)),
    byAccount,
    breakdown: {
      openingTotalAgorot,
      incomeTotalAgorot,
      expenseTotalAgorot,
      adjustmentsNetAgorot,
      countedTransactions,
      ignoredBeforeOpening,
      ignoredAfterAsOf,
      ignoredPending,
    },
  };
}

/**
 * הפער בין היתרה המחושבת ליתרה שמופיעה בבנק.
 * חיובי = בבנק יש יותר ממה שהמערכת יודעת (חסרה הכנסה).
 * מכאן נוצרת עסקת `balance_adjustment` — הפער נשאר מתועד וגלוי, לא נמחק.
 */
export function reconciliationGap(
  calculatedAgorot: Agorot,
  actualBankBalanceAgorot: Agorot,
): Agorot {
  return actualBankBalanceAgorot - calculatedAgorot;
}
