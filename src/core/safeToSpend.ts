/**
 * "בטוח להוציא" — המדד המרכזי של המערכת.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  ⚠️  שני מספרים נפרדים. אסור לערבב ביניהם.
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  `nowAgorot` — כמה אפשר להוציא **עכשיו**, מכסף שכבר נמצא בחשבון.
 *                לא נכללת בו שום הכנסה עתידית: לא `possible`, לא `likely`,
 *                וגם לא `confirmed`. משכורת שמובטחת ב-25 לחודש היא לא כסף
 *                שאפשר להוציא ב-7 לחודש — היא יכולה להתעכב, להשתנות או
 *                לא להגיע, וההוצאה כבר תהיה מאחוריי.
 *
 *  `projection.byMonthEndAgorot` — תחזית. מסומנת ככזו בממשק, בצבע אחר,
 *                מתחת לקו מפריד, ולעולם לא כמספר הראשי.
 *
 *  ההקצאה השבועית נגזרת תמיד מ-`nowAgorot`, לעולם לא מהתחזית.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * כל רכיב בחישוב נשמר ב-`breakdown` ומוצג למשתמש תחת "איך חישבנו את זה?".
 * מספר שלא ניתן להסביר הוא מספר שלא ניתן לסמוך עליו.
 */

import { clampMin0, divA, formatILS, mulA, sumA } from './money';
import { daysInMonth, dayOfMonth, daysLeftInMonth, formatDateHe, monthEnd, monthOf } from './dates';
import type {
  Agorot,
  ExpectedIncome,
  ISODate,
  PlannedExpense,
  RecurringTransaction,
} from './types';

export interface CommittedItem {
  label: string;
  amountAgorot: Agorot;
  dueDate: ISODate;
  kind: 'planned' | 'recurring';
}

export interface IncomeItem {
  label: string;
  amountAgorot: Agorot;
  expectedDate: ISODate;
}

export interface SafeToSpendInput {
  today: ISODate;
  /** היתרה בפועל, נגזרת מ-`core/balance.ts`. */
  currentBalanceAgorot: Agorot;
  /** סכום ביטחון שלא נוגעים בו. */
  safetyBufferAgorot: Agorot;
  plannedExpenses: readonly PlannedExpense[];
  recurringTransactions: readonly RecurringTransaction[];
  expectedIncomes: readonly ExpectedIncome[];
  /**
   * כסף שכבר הוקצה לחודשים הבאים — התוצר של `core/seasonal.ts`.
   *
   * ⚠️ הרכיב הקריטי ביותר עבור מי שכל ההכנסה שלו בקיץ.
   * בלעדיו, באוגוסט המערכת הייתה מודיעה שאפשר "בבטחה" להוציא את כל
   * משכורת הקיץ — כסף שאמור להחזיק עד יוני. יתרה גבוהה בחודש אחד
   * אינה כסף פנוי; היא תקציב של עשרה חודשים שיושב בחשבון אחד.
   */
  reservedForFutureMonthsAgorot: Agorot;
  /** תרומת החודש ליעד, לפי מסלול התקציב שנבחר. */
  goalContributionAgorot: Agorot;
  /** כמה כבר נחסך החודש בפועל (נטו חיובי). מקטין את מה שנותר לחסוך. */
  goalSavedSoFarThisMonthAgorot: Agorot;
  /** הוצאה פנויה מתוכננת עד סוף החודש — לתחזית היתרה בלבד. */
  plannedDiscretionarySpendAgorot: Agorot;
}

export interface SafeToSpendBreakdown {
  currentBalanceAgorot: Agorot;
  safetyBufferAgorot: Agorot;
  availableNowAgorot: Agorot;
  committedLeftAgorot: Agorot;
  committedItems: CommittedItem[];
  reservedForFutureMonthsAgorot: Agorot;
  goalDueThisMonthAgorot: Agorot;
  resultAgorot: Agorot;
}

export interface SafeToSpendProjection {
  confirmedIncomeLeftAgorot: Agorot;
  confirmedIncomeItems: IncomeItem[];
  byMonthEndAgorot: Agorot;
  monthEndBalanceAgorot: Agorot;
  /** הכנסה לא ודאית — מוצגת בנפרד ולעולם לא מחוברת לשום סכום זמין. */
  unconfirmedIncomeAgorot: Agorot;
  unconfirmedIncomeItems: IncomeItem[];
}

export interface SafeToSpendResult {
  /** עשוי להיות שלילי. הממשק לעולם לא מציג מספר שלילי חשוף — ראה `messageHe`. */
  nowAgorot: Agorot;
  weekAgorot: Agorot;
  daysLeftInMonth: number;
  daysCovered: number;
  isOverspent: boolean;
  overspentByAgorot: Agorot;
  /** כמה אפשר עדיין להוציא כשדוחים את תרומת היעד (אך לא את ההתחייבויות). */
  recoveryAgorot: Agorot;
  headlineHe: string;
  messageHe: string;
  breakdown: SafeToSpendBreakdown;
  projection: SafeToSpendProjection;
}

/**
 * האם הוצאה חוזרת עדיין צפויה להיגבות החודש.
 * לא נספרת אם כבר נראתה החודש — אחרת היינו מנכים אותה פעמיים.
 */
export function isRecurringStillDueThisMonth(
  recurring: RecurringTransaction,
  today: ISODate,
): boolean {
  if (!recurring.active || recurring.type !== 'expense') return false;
  if (recurring.frequency !== 'monthly') return false;
  if (recurring.lastSeenDate && monthOf(recurring.lastSeenDate) === monthOf(today)) return false;

  // יום 31 בחודש בן 30 יום נגבה ביום האחרון.
  const effectiveDay = Math.min(recurring.dayOfCycle, daysInMonth(today));
  return effectiveDay >= dayOfMonth(today);
}

/** התחייבויות שטרם שולמו עד סוף החודש: הוצאות `must` + הוצאות חוזרות. */
export function committedItemsRemaining(
  plannedExpenses: readonly PlannedExpense[],
  recurringTransactions: readonly RecurringTransaction[],
  today: ISODate,
): CommittedItem[] {
  const end = monthEnd(today);

  const planned: CommittedItem[] = plannedExpenses
    .filter((p) => !p.paid && p.priority === 'must' && p.dueDate >= today && p.dueDate <= end)
    .map((p) => ({
      label: p.label,
      amountAgorot: p.amountAgorot,
      dueDate: p.dueDate,
      kind: 'planned' as const,
    }));

  const recurring: CommittedItem[] = recurringTransactions
    .filter((r) => isRecurringStillDueThisMonth(r, today))
    .map((r) => ({
      label: r.label,
      amountAgorot: r.amountAgorot,
      dueDate: `${monthOf(today)}-${String(Math.min(r.dayOfCycle, daysInMonth(today))).padStart(2, '0')}`,
      kind: 'recurring' as const,
    }));

  return [...planned, ...recurring].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** הכנסות ודאיות שעדיין צפויות להיכנס עד סוף החודש. */
export function confirmedIncomeRemaining(
  expectedIncomes: readonly ExpectedIncome[],
  today: ISODate,
): IncomeItem[] {
  const end = monthEnd(today);
  return expectedIncomes
    .filter(
      (e) =>
        !e.received &&
        e.certainty === 'confirmed' &&
        e.expectedDate > today &&
        e.expectedDate <= end,
    )
    .map((e) => ({
      label: e.label,
      amountAgorot: e.expectedAmountAgorot,
      expectedDate: e.expectedDate,
    }))
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}

function unconfirmedIncomeRemaining(
  expectedIncomes: readonly ExpectedIncome[],
  today: ISODate,
): IncomeItem[] {
  const end = monthEnd(today);
  return expectedIncomes
    .filter(
      (e) =>
        !e.received &&
        e.certainty !== 'confirmed' &&
        e.expectedDate > today &&
        e.expectedDate <= end,
    )
    .map((e) => ({
      label: e.label,
      amountAgorot: e.expectedAmountAgorot,
      expectedDate: e.expectedDate,
    }))
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}

export function safeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const {
    today,
    currentBalanceAgorot,
    safetyBufferAgorot,
    plannedExpenses,
    recurringTransactions,
    expectedIncomes,
    reservedForFutureMonthsAgorot,
    goalContributionAgorot,
    goalSavedSoFarThisMonthAgorot,
    plannedDiscretionarySpendAgorot,
  } = input;

  // ── א׳. כסף שכבר בחשבון ─────────────────────────────────────────────
  const availableNowAgorot = currentBalanceAgorot - safetyBufferAgorot;

  const committedItems = committedItemsRemaining(plannedExpenses, recurringTransactions, today);
  const committedLeftAgorot = sumA(committedItems.map((c) => c.amountAgorot));

  const goalDueThisMonthAgorot = clampMin0(
    goalContributionAgorot - goalSavedSoFarThisMonthAgorot,
  );

  const nowAgorot =
    availableNowAgorot -
    committedLeftAgorot -
    clampMin0(reservedForFutureMonthsAgorot) -
    goalDueThisMonthAgorot;

  // ── ב׳. הקצאה שבועית — נגזרת מהמספר של עכשיו, לא מהתחזית ───────────
  const daysLeft = daysLeftInMonth(today);
  const daysCovered = Math.min(7, daysLeft);
  const weekAgorot = nowAgorot <= 0 ? 0 : mulA(divA(nowAgorot, daysLeft), daysCovered);

  // ── ג׳. תחזית — נפרדת לחלוטין ───────────────────────────────────────
  const confirmedIncomeItems = confirmedIncomeRemaining(expectedIncomes, today);
  const confirmedIncomeLeftAgorot = sumA(confirmedIncomeItems.map((i) => i.amountAgorot));
  const unconfirmedIncomeItems = unconfirmedIncomeRemaining(expectedIncomes, today);

  const projection: SafeToSpendProjection = {
    confirmedIncomeLeftAgorot,
    confirmedIncomeItems,
    byMonthEndAgorot: nowAgorot + confirmedIncomeLeftAgorot,
    monthEndBalanceAgorot:
      currentBalanceAgorot +
      confirmedIncomeLeftAgorot -
      committedLeftAgorot -
      plannedDiscretionarySpendAgorot,
    unconfirmedIncomeAgorot: sumA(unconfirmedIncomeItems.map((i) => i.amountAgorot)),
    unconfirmedIncomeItems,
  };

  // ── ד׳. ניסוח — בלי מספר שלילי חשוף, בלי טון שיפוטי ─────────────────
  const isOverspent = nowAgorot < 0;
  // בהתאוששות דוחים את תרומת היעד, אך לא נוגעים בכסף של החודשים הבאים —
  // הוא לא "מרווח", הוא התקציב של אוקטובר.
  const recoveryAgorot = clampMin0(
    availableNowAgorot - committedLeftAgorot - clampMin0(reservedForFutureMonthsAgorot),
  );

  let headlineHe: string;
  let messageHe: string;

  if (!isOverspent) {
    headlineHe = `בטוח להוציא עכשיו: ${formatILS(nowAgorot)}`;
    messageHe = `עד סוף החודש נשארו ${daysLeft} ימים. השבוע אפשר להוציא עד ${formatILS(weekAgorot)}.`;
  } else if (recoveryAgorot > 0) {
    headlineHe = 'החודש חרגת מהתוכנית';
    messageHe =
      `חרגת ב-${formatILS(-nowAgorot)}. כדי לחזור למסלול, מומלץ להוציא עד ` +
      `${formatILS(recoveryAgorot)} עד סוף החודש. היעד יידחה קצת — אפשר להשלים בחודש הבא.`;
  } else {
    headlineHe = 'הכסף שנשאר מיועד להוצאות שכבר מתוכננות';
    const first = committedItems[0];
    messageHe = first
      ? `הקרובה שבהן: ${first.label} — ${formatILS(first.amountAgorot)} ב-${formatDateHe(first.dueDate)}.`
      : 'שווה לבדוק את סכום הביטחון בהגדרות — ייתכן שהוא גבוה מדי לשלב הזה.';
  }

  return {
    nowAgorot,
    weekAgorot,
    daysLeftInMonth: daysLeft,
    daysCovered,
    isOverspent,
    overspentByAgorot: clampMin0(-nowAgorot),
    recoveryAgorot,
    headlineHe,
    messageHe,
    breakdown: {
      currentBalanceAgorot,
      safetyBufferAgorot,
      availableNowAgorot,
      committedLeftAgorot,
      committedItems,
      reservedForFutureMonthsAgorot: clampMin0(reservedForFutureMonthsAgorot),
      goalDueThisMonthAgorot,
      resultAgorot: nowAgorot,
    },
    projection,
  };
}
