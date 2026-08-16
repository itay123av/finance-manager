/**
 * הרכבת לוח הבקרה.
 *
 * זהו המקום היחיד שמחבר בין מודולי החישוב למספרים שהמשתמש רואה.
 * הוא נשאר טהור לגמרי — מקבל תמונת מצב, מחזיר אובייקט תצוגה — ולכן
 * אפשר לבדוק בדיוק את המספרים שיופיעו במסך, בלי להריץ ממשק.
 *
 * הממשק לא מחשב כלום. הוא רק מציג את מה שחוזר מכאן.
 */

import { buildAlerts, type Alert } from './alerts';
import { totalBalance, type BalanceResult } from './balance';
import { detectAnomalies } from './patterns';
import { detectSubscriptions } from './detailedPatterns';
import { isCardCharge } from './cardCharges';
import type { SubscriptionNotice } from './recurring';
import {
  budgetProgress,
  buildBudgetPlan,
  type BudgetPlanOption,
  type BudgetProgress,
  type ConcretePlanId,
} from './budget';
import { monthlyExpenseAverage, categoryMonthlyAverage, monthlyNetAverage } from './averages';
import { forecastScenario, type ForecastScenario } from './forecast';
import { goalProgress, projectGoal, type GoalProgress, type GoalProjection } from './goal';
import { clampMin0, sumA } from './money';
import {
  monthSummary,
  periodSummary,
  spentSoFarThisMonth,
  type CategoryTotal,
  type PeriodSummary,
} from './periods';
import { effectiveExpensesByCategory, getEffectiveExpenses } from './effectiveSpending';
import { assessSpendingConfidence, type SpendingConfidence } from './spendingConfidence';
import { fixedMonthlyCommitments } from './recurring';
import { safeToSpend, type SafeToSpendResult } from './safeToSpend';
import {
  allocateSeasonalIncome,
  reservedForFutureMonths,
  type SeasonalAllocation,
} from './seasonal';
import {
  diffDays,
  isSummerMonth,
  monthEnd,
  monthNumber,
  monthOf,
  monthStart,
  monthsBetween,
} from './dates';
import type {
  Account,
  Agorot,
  AppSettings,
  CardTransaction,
  Category,
  Confidence,
  CreditCard,
  ExpectedIncome,
  FinancialGoal,
  ISODate,
  PlannedExpense,
  RecurringTransaction,
  Transaction,
  UUID,
} from './types';

/** מתחת לסכום הזה, הכנסת הקיץ קטנה מכדי להצדיק פריסה על השנה. */
export const MIN_SUMMER_INCOME_FOR_ALLOCATION_AGOROT = 30_000; // ₪300
/** ספטמבר עד יוני. */
export const SEASONAL_MONTHS_TO_COVER = 10;

export interface DashboardInput {
  today: ISODate;
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  categories: readonly Category[];
  goal: FinancialGoal;
  settings: AppSettings;
  expectedIncomes: readonly ExpectedIncome[];
  plannedExpenses: readonly PlannedExpense[];
  recurringTransactions: readonly RecurringTransaction[];
  /** פירוט כרטיסי אשראי, אם יובא. */
  cardTransactions?: readonly CardTransaction[];
  cards?: readonly CreditCard[];
  /** תאריך הייבוא האחרון, לתזכורת רעננות. `null` כשמעולם לא יובא קובץ. */
  lastImportDate?: ISODate | null;
}

export interface FunBudgetState {
  plannedAgorot: Agorot;
  spentAgorot: Agorot;
  remainingAgorot: Agorot;
  usedPct: number;
}

export interface SeasonalContext {
  /** `null` כשלא נמצאה הכנסת קיץ משמעותית. */
  allocation: SeasonalAllocation | null;
  /** כמה מהיתרה שייך לחודשים הבאים ולכן אינו פנוי היום. */
  reservedAgorot: Agorot;
  summerIncomeAgorot: Agorot;
  monthsElapsed: number;
  explanationHe: string;
}

export interface DashboardData {
  today: ISODate;
  balance: BalanceResult;
  month: PeriodSummary;
  goalProgress: GoalProgress;
  goalProjection: GoalProjection;
  safeToSpend: SafeToSpendResult;
  budgetPlan: BudgetPlanOption;
  budgetProgress: BudgetProgress;
  fun: FunBudgetState;
  /** פילוח לפי קטגוריה — מבוסס הוצאה אפקטיבית, בלי ספירה כפולה. */
  topCategories: CategoryTotal[];
  /** ⭐ שתי רמות ביטחון נפרדות: לסכום הכולל ולפילוח. */
  spendingConfidence: SpendingConfidence;
  seasonal: SeasonalContext;
  /** תחזית בסיסית בלבד — מנוע התרחישים המלא נחשף בשלב 5. */
  forecast: { monthEnd: ForecastScenario; threeMonths: ForecastScenario };
  /** התראות פעילות, ממוינות לפי דחיפות. */
  alerts: Alert[];
}

/** חלון שבו חיוב חוזר שזוהה נחשב "חדש" ושווה להזכיר. */
export const NEW_RECURRING_WINDOW_DAYS = 40;

// ---------------------------------------------------------------------------
// עזרים
// ---------------------------------------------------------------------------

function categoryIdsByNature(
  categories: readonly Category[],
  natures: readonly Category['nature'][],
): UUID[] {
  return categories
    .filter((c) => c.kind === 'expense' && natures.includes(c.nature))
    .map((c) => c.id);
}

/** סכום החציונים החודשיים של קבוצת קטגוריות. */
function medianMonthlyForCategories(
  transactions: readonly Transaction[],
  categoryIds: readonly UUID[],
  today: ISODate,
): Agorot {
  return sumA(
    categoryIds.map((id) => categoryMonthlyAverage(transactions, id, today).agorot ?? 0),
  );
}

/**
 * הקיץ הרלוונטי האחרון. ביולי-אוגוסט זה הקיץ הנוכחי; בשאר השנה זה
 * הקיץ שקדם — הכסף שאמור להחזיק עד הקיץ הבא.
 */
export function lastRelevantSummerYear(today: ISODate): number {
  const year = Number(today.slice(0, 4));
  return monthNumber(monthOf(today)) >= 7 ? year : year - 1;
}

/**
 * כמה חודשים מתוך תקופת הפריסה כבר עברו.
 * ביולי-אוגוסט התקופה טרם החלה ולכן 0. בספטמבר 0, באוקטובר 1, וכן הלאה.
 */
export function monthsElapsedSinceSummer(today: ISODate): number {
  if (isSummerMonth(monthOf(today))) return 0;
  const start = `${lastRelevantSummerYear(today)}-09`;
  const elapsed = monthsBetween(start, monthOf(today));
  return Math.min(SEASONAL_MONTHS_TO_COVER - 1, Math.max(0, elapsed));
}

/**
 * מזהה כמה מהיתרה הנוכחית שייך בעצם לחודשים הבאים.
 *
 * ⚠️ זהו החישוב שמונע את הטעות המסוכנת ביותר במערכת: באוגוסט, אחרי
 * שנכנסה משכורת הקיץ, היתרה גבוהה — אבל היא תקציב של עשרה חודשים
 * שיושב בחשבון אחד. בלי זה, "בטוח להוציא" היה מאשר להוציא את כולה.
 */
export function detectSeasonalContext(input: DashboardInput): SeasonalContext {
  const { today, transactions, categories, goal, accounts } = input;

  const summerYear = lastRelevantSummerYear(today);
  const summer = periodSummary(transactions, `${summerYear}-07-01`, `${summerYear}-08-31`);
  const summerIncomeAgorot = summer.incomeAgorot;

  if (summerIncomeAgorot < MIN_SUMMER_INCOME_FOR_ALLOCATION_AGOROT) {
    return {
      allocation: null,
      reservedAgorot: 0,
      summerIncomeAgorot,
      monthsElapsed: 0,
      explanationHe:
        'עדיין לא נרשמה הכנסת קיץ משמעותית, ולכן אין כסף שמור לחודשים הבאים.',
    };
  }

  const essentialIds = categoryIdsByNature(categories, ['essential', 'important']);
  const funIds = categoryIdsByNature(categories, ['fun']);

  const essentialMonthlyAgorot =
    fixedMonthlyCommitments(transactions, today) +
    medianMonthlyForCategories(transactions, essentialIds, today);
  const typicalFunMonthlyAgorot = medianMonthlyForCategories(transactions, funIds, today);

  const monthsElapsed = monthsElapsedSinceSummer(today);
  const balanceNow = totalBalance(accounts, transactions, today).totalAgorot;

  const allocation = allocateSeasonalIncome({
    summerIncomeAgorot,
    monthsToCover: SEASONAL_MONTHS_TO_COVER,
    targetAgorot: goal.targetAgorot,
    currentBalanceAgorot: balanceNow,
    essentialMonthlyAgorot,
    typicalFunMonthlyAgorot,
    plannedPurchasesAgorot: 0,
    safetyBufferTargetAgorot: input.settings.safetyBufferAgorot,
  });

  // ------------------------------------------------------------------
  // תקרת השמירה.
  //
  // שני דברים שחייבים להישאר מחוץ לסכום השמור:
  //  1. **ההקצבה של החודש הנוכחי** — היא מיועדת להיום, לא לעתיד.
  //  2. **סכום הביטחון** — הוא כבר נוכה בשלב הראשון של הפריסה, ו-
  //     `safeToSpend` מנכה אותו שוב. בלי החרגה כאן הוא נספר פעמיים.
  //
  // בלי התקרה הזו, משתמש חדש שקיבל משכורת קיץ היה רואה "בטוח להוציא: 0"
  // ובאותו מסך "הקצבה חודשית: ₪40" — שני מספרים שסותרים זה את זה.
  const maxReserve = Math.max(
    0,
    balanceNow - input.settings.safetyBufferAgorot - allocation.monthlyAllowanceAgorot,
  );
  const reservedAgorot = Math.min(reservedForFutureMonths(allocation, monthsElapsed), maxReserve);

  const monthsLeft = SEASONAL_MONTHS_TO_COVER - monthsElapsed;
  return {
    allocation,
    reservedAgorot: clampMin0(reservedAgorot),
    summerIncomeAgorot,
    monthsElapsed,
    explanationHe:
      `חלק מהיתרה הוא כסף הקיץ, והוא צריך להחזיק עוד כ-${monthsLeft} חודשים. ` +
      `הסכום הזה שמור בצד ולא נספר בתור כסף פנוי להיום.`,
  };
}

// ---------------------------------------------------------------------------
// ההרכבה
// ---------------------------------------------------------------------------

export function buildDashboard(input: DashboardInput): DashboardData {
  const {
    today,
    accounts,
    transactions,
    categories,
    goal,
    settings,
    expectedIncomes,
    plannedExpenses,
    recurringTransactions,
  } = input;

  const balance = totalBalance(accounts, transactions, today);
  const month = monthSummary(transactions, today);
  const spentSoFar = spentSoFarThisMonth(transactions, today);

  // ── תקציב ────────────────────────────────────────────────────────────
  const expenseAverage = monthlyExpenseAverage(transactions, today);
  const fixedCommitmentsAgorot = fixedMonthlyCommitments(transactions, today);

  const confirmedRemaining = sumA(
    expectedIncomes
      .filter(
        (e) =>
          !e.received &&
          e.certainty === 'confirmed' &&
          e.expectedDate > today &&
          e.expectedDate <= monthEnd(today),
      )
      .map((e) => e.expectedAmountAgorot),
  );
  const unconfirmedRemaining = sumA(
    expectedIncomes
      .filter(
        (e) =>
          !e.received &&
          e.certainty !== 'confirmed' &&
          e.expectedDate > today &&
          e.expectedDate <= monthEnd(today),
      )
      .map((e) => e.expectedAmountAgorot),
  );
  const totalPlannedIncome = month.incomeAgorot + confirmedRemaining + unconfirmedRemaining;

  const budgetPlan = buildBudgetPlan(settings.budgetPlanId as ConcretePlanId, {
    today,
    historicalMonthlySpend: expenseAverage,
    estimatedMonthlySpendAgorot: settings.estimatedMonthlySpendAgorot,
    fixedCommitmentsAgorot,
    expectedMonthlyIncomeAgorot: month.incomeAgorot + confirmedRemaining,
    // ⚠️ רק מה שכבר בחשבון רשאי לייצר תרומה ליעד שמנוכה מהכסף הפנוי
    receivedMonthlyIncomeAgorot: month.incomeAgorot,
    currentBalanceAgorot: balance.totalAgorot,
    unconfirmedIncomeShare:
      totalPlannedIncome === 0 ? 0 : unconfirmedRemaining / totalPlannedIncome,
  });

  const progress = budgetProgress(transactions, budgetPlan.monthlySpendAgorot, today);

  // ── כסף הקיץ ─────────────────────────────────────────────────────────
  const seasonal = detectSeasonalContext(input);

  // ── בטוח להוציא ──────────────────────────────────────────────────────
  //
  // כשפעילה פריסת קיץ, תרומת היעד מועברת כאפס: כסף היעד כבר נעול בתוך
  // `reservedAgorot`, וניכוי נוסף היה מקטין את הסכום פעמיים על אותו שקל.
  const sts = safeToSpend({
    today,
    currentBalanceAgorot: balance.totalAgorot,
    safetyBufferAgorot: settings.safetyBufferAgorot,
    plannedExpenses,
    recurringTransactions,
    expectedIncomes,
    reservedForFutureMonthsAgorot: seasonal.reservedAgorot,
    goalContributionAgorot: seasonal.allocation ? 0 : budgetPlan.goalContributionAgorot,
    goalSavedSoFarThisMonthAgorot: clampMin0(month.netAgorot),
    plannedDiscretionarySpendAgorot: clampMin0(budgetPlan.monthlySpendAgorot - spentSoFar),
  });

  // ── בילויים ──────────────────────────────────────────────────────────
  const funIds = new Set(categoryIdsByNature(categories, ['fun']));
  const funSpentAgorot = sumA(
    transactions
      .filter(
        (t) =>
          t.status === 'actual' &&
          t.kind === 'normal' &&
          t.type === 'expense' &&
          funIds.has(t.categoryId) &&
          t.date >= monthStart(today) &&
          t.date <= today,
      )
      .map((t) => t.amountAgorot),
  );
  const funPlannedAgorot = seasonal.allocation
    ? seasonal.allocation.monthlyFunAgorot
    : budgetPlan.funBudgetAgorot;

  const fun: FunBudgetState = {
    plannedAgorot: funPlannedAgorot,
    spentAgorot: funSpentAgorot,
    remainingAgorot: funPlannedAgorot - funSpentAgorot,
    usedPct:
      funPlannedAgorot === 0
        ? 0
        : Math.round((funSpentAgorot / funPlannedAgorot) * 1000) / 10,
  };

  // ── יעד ──────────────────────────────────────────────────────────────
  const regularNet = monthlyNetAverage(transactions, today, { excludeSummer: true });
  const summerYear = lastRelevantSummerYear(today);
  const summerNet = periodSummary(
    transactions,
    `${summerYear}-07-01`,
    `${summerYear}-08-31`,
  ).netAgorot;

  const goalProjection = projectGoal({
    today,
    currentBalanceAgorot: balance.totalAgorot,
    targetAgorot: goal.targetAgorot,
    regularMonthlyNetAgorot: regularNet.agorot ?? 0,
    summerTotalNetAgorot: clampMin0(summerNet),
    historicalConfidence: regularNet.confidence,
  });

  // ── תחזית בסיסית ─────────────────────────────────────────────────────
  const forecastInput = {
    today,
    currentBalanceAgorot: balance.totalAgorot,
    averageMonthlyExpenseAgorot: expenseAverage.agorot ?? settings.estimatedMonthlySpendAgorot,
    averageRegularMonthlyIncomeAgorot: clampMin0((regularNet.agorot ?? 0) + (expenseAverage.agorot ?? 0)),
    budgetMonthlySpendAgorot: budgetPlan.monthlySpendAgorot,
    summerTotalNetAgorot: clampMin0(summerNet),
    expectedIncomes,
    plannedExpenses,
    historicalConfidence: expenseAverage.confidence as Confidence,
  };

  // ── פילוח לפי קטגוריה, דרך ההוצאה האפקטיבית ─────────────────────────
  //
  // חשוב שזה יעבור דרך `getEffectiveExpenses` ולא דרך התנועות הגולמיות:
  // אחרת חיוב כרטיס מרוכז היה מופיע כשורה אחת גדולה תחת "אחר", ופירוט
  // הכרטיס היה נספר בנוסף אליו.
  const cardTransactions = input.cardTransactions ?? [];
  const cards = input.cards ?? [];

  const monthExpenses = getEffectiveExpenses({
    transactions,
    cardTransactions,
    cards,
    from: monthStart(today),
    to: today,
  });

  const historyExpenses = getEffectiveExpenses({
    transactions,
    cardTransactions,
    cards,
    from: transactions.length > 0 ? [...transactions].sort((a, b) => a.date.localeCompare(b.date))[0]!.date : today,
    to: today,
  });

  const spendingConfidence = assessSpendingConfidence({
    expenses: historyExpenses,
    monthsOfData: expenseAverage.monthsUsed,
  });

  // ── התראות ───────────────────────────────────────────────────────────
  //
  // ⚠️ שתי החלטות שמונעות רעש:
  //
  // 1. **חיוב כרטיס מרוכז אינו "עסקה חריגה"**. הוא סכום של יום שלם,
  //    ולכן גדול מכל עסקה בודדת מטבעו; ההתראה הייתה אומרת "שווה לוודא"
  //    בלי לומר מה לוודא, כי אין לו שם בית עסק. וכשיש פירוט, ההוצאה
  //    האמיתית נמצאת בשורות הפירוט וספירתו כאן הייתה כפילות.
  //
  //    המחיר: חריגה בתוך פירוט הכרטיס לא תיתפס כאן — `detectAnomalies`
  //    עובד על תנועות בנק בלבד. מסך התובנות מכסה את הפירוט בדרכים
  //    אחרות (בתי עסק חוזרים, חודשים חריגים).
  //
  // 2. **"חיוב חוזר חדש" נגזר מהפירוט**, לא מתנועות הבנק, ורק כשהמופע
  //    הראשון שלו טרי. אחרת כל טעינה של המסך הייתה מכריזה מחדש על
  //    אותם מנויים ותיקים.
  const anomalies = detectAnomalies(
    transactions.filter((t) => !isCardCharge(t)),
    monthStart(today),
    today,
  );

  const newlyDetectedRecurring: SubscriptionNotice[] = detectSubscriptions({
    expenses: historyExpenses,
    today,
  })
    .filter((s) => !s.possiblyStale && diffDays(s.firstDate, today) <= NEW_RECURRING_WINDOW_DAYS)
    .map((s) => ({
      merchantNormalized: s.merchantNormalized,
      label: s.merchant,
      monthlyAgorot: s.typicalAmountAgorot,
      yearlyAgorot: s.yearlyAgorot,
      occurrences: s.occurrences,
      lastSeenDate: s.lastDate,
      messageHe: `${s.merchant} חוזר כל חודש.`,
    }));

  const goalNow = goalProgress(goal, balance.totalAgorot);

  const alerts = buildAlerts({
    today,
    safeToSpend: sts,
    budgetProgress: progress,
    funBudget: { plannedAgorot: fun.plannedAgorot, spentAgorot: fun.spentAgorot },
    anomalies,
    newlyDetectedRecurring,
    expectedIncomes,
    goalProgressPct: goalNow.progressPct,
    safetyBufferAgorot: settings.safetyBufferAgorot,
    lastImportDate: input.lastImportDate ?? null,
  });

  return {
    today,
    balance,
    month,
    goalProgress: goalNow,
    goalProjection,
    safeToSpend: sts,
    budgetPlan,
    budgetProgress: progress,
    fun,
    topCategories: (() => {
      const totals = effectiveExpensesByCategory(monthExpenses, categories);
      const monthTotal = sumA(totals.map((c) => c.amountAgorot));
      return totals
        .map((c) => ({
          categoryId: c.categoryId,
          categoryName: c.categoryName,
          amountAgorot: c.amountAgorot,
          transactionCount: c.count,
          sharePct:
            monthTotal === 0 ? 0 : Math.round((c.amountAgorot / monthTotal) * 1000) / 10,
        }))
        .slice(0, 5);
    })(),
    spendingConfidence,
    seasonal,
    forecast: {
      monthEnd: forecastScenario(forecastInput, 'currentAverage', 1),
      threeMonths: forecastScenario(forecastInput, 'currentAverage', 3),
    },
    alerts,
  };
}
