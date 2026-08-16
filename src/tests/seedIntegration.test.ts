/**
 * בדיקת אינטגרציה על נתוני הדוגמה הפיקטיביים.
 *
 * מריצה את כל מנוע החישוב מקצה לקצה על משתמש בדוי בן 16, ומוודאת
 * שהמספרים עקביים זה עם זה. זו הבדיקה שתופסת שבירה בין מודולים —
 * מקום שבדיקות יחידה לא מגיעות אליו.
 *
 * ⚠️ הנתונים פיקטיביים לחלוטין. ראה `src/dev/seed/fakeUser.ts`.
 */

import { describe, expect, it } from 'vitest';
import { buildSeedData } from '../dev/seed/fakeUser';
import { totalBalance } from '../core/balance';
import { monthSummary, periodSummary, spentSoFarThisMonth } from '../core/periods';
import {
  completeMonths,
  monthlyExpenseAverage,
  monthlyIncomeAverage,
  monthlyNetAverage,
} from '../core/averages';
import { buildBudgetPlans, defaultPlan } from '../core/budget';
import { safeToSpend } from '../core/safeToSpend';
import { goalProgress, projectGoal } from '../core/goal';
import { forecastScenario } from '../core/forecast';
import { allocateSeasonalIncome, allocationTotal, reservedForFutureMonths } from '../core/seasonal';
import { activeSubscriptions, fixedMonthlyCommitments } from '../core/recurring';
import { detectAnomalies } from '../core/patterns';
import { monthStart } from '../core/dates';
import { formatILS } from '../core/money';

const seed = buildSeedData();
const { accounts, transactions, goal, expectedIncomes, plannedExpenses, recurring, today } = seed;

const balance = totalBalance(accounts, transactions, today);
const thisMonth = monthSummary(transactions, today);
const expenseAvg = monthlyExpenseAverage(transactions, today);
const incomeAvg = monthlyIncomeAverage(transactions, today);
const regularNet = monthlyNetAverage(transactions, today, { excludeSummer: true });
const fixedCommitments = fixedMonthlyCommitments(transactions, today);

const plans = buildBudgetPlans({
  today,
  historicalMonthlySpend: expenseAvg,
  estimatedMonthlySpendAgorot: 40_000,
  fixedCommitmentsAgorot: fixedCommitments,
  expectedMonthlyIncomeAgorot: thisMonth.incomeAgorot,
  receivedMonthlyIncomeAgorot: thisMonth.incomeAgorot,
  currentBalanceAgorot: balance.totalAgorot,
  unconfirmedIncomeShare: 0.3,
});
const balanced = defaultPlan(plans);

/**
 * התרחיש האמיתי של המשתמש: אוגוסט, כסף הקיץ בחשבון, והוא צריך להחזיק
 * עד הקיץ הבא. ההקצאה העונתית היא שקובעת כמה מהיתרה באמת פנוי החודש.
 */
const allocation = allocateSeasonalIncome({
  summerIncomeAgorot: 360_000,
  monthsToCover: 10,
  targetAgorot: goal.targetAgorot,
  currentBalanceAgorot: balance.totalAgorot,
  essentialMonthlyAgorot: fixedCommitments + 6_000,
  typicalFunMonthlyAgorot: 20_000,
  plannedPurchasesAgorot: 0,
});
const reserved = reservedForFutureMonths(allocation, 0);

const sts = safeToSpend({
  today,
  currentBalanceAgorot: balance.totalAgorot,
  safetyBufferAgorot: 50_000,
  plannedExpenses,
  recurringTransactions: recurring,
  expectedIncomes,
  reservedForFutureMonthsAgorot: reserved,
  // אפס במכוון: כסף היעד כבר נעול בתוך `reserved`
  goalContributionAgorot: 0,
  goalSavedSoFarThisMonthAgorot: Math.max(0, thisMonth.netAgorot),
  plannedDiscretionarySpendAgorot: balanced.monthlySpendAgorot - spentSoFarThisMonth(transactions, today),
});

const progress = goalProgress(goal, balance.totalAgorot);
const projection = projectGoal({
  today,
  currentBalanceAgorot: balance.totalAgorot,
  targetAgorot: goal.targetAgorot,
  regularMonthlyNetAgorot: regularNet.agorot ?? 0,
  summerTotalNetAgorot: 400_000,
  historicalConfidence: regularNet.confidence,
});

describe('נתוני הדוגמה נבנים כמתוכנן', () => {
  it('מכסה 15 חודשים ומייצר כמות עסקאות סבירה', () => {
    expect(transactions.length).toBeGreaterThan(150);
    expect(completeMonths(transactions, today)).toHaveLength(14);
  });

  it('⭐ הפרופיל "צפוף אבל אפשרי" — לא מיואש ולא ורוד', () => {
    // חודש רגיל שוחק מעט, אבל היעד עדיין בר-השגה דרך הקיץ
    expect(regularNet.agorot ?? 0).toBeLessThan(0);
    expect(projection.monthsToGoal).not.toBeNull();
    expect(balance.totalAgorot).toBeGreaterThan(50_000);
  });

  it('⭐ פברואר 2026 הוא חודש בלי שום הכנסה', () => {
    const feb = periodSummary(transactions, '2026-02-01', '2026-02-28');
    expect(feb.incomeAgorot).toBe(0);
    expect(feb.expenseAgorot).toBeGreaterThan(0);
    expect(completeMonths(transactions, today)).toContain('2026-02');
  });

  it('⭐ הקיץ מרכז את רוב ההכנסה השנתית', () => {
    const july = periodSummary(transactions, '2026-07-01', '2026-07-31');
    const june = periodSummary(transactions, '2026-06-01', '2026-06-30');
    expect(july.incomeAgorot).toBeGreaterThan(june.incomeAgorot * 5);
  });

  it('⭐ הרכישה הגדולה מזוהה כחריגה', () => {
    const anomalies = detectAnomalies(transactions, '2026-03-01', '2026-03-31');
    expect(anomalies.some((a) => a.amountAgorot === 38_000)).toBe(true);
  });

  it('⭐ המנוי החודשי מזוהה כהוצאה חוזרת', () => {
    const subs = activeSubscriptions(transactions, today);
    const spotify = subs.find((s) => s.merchantNormalized === 'spotify');
    expect(spotify?.monthlyAgorot).toBe(2_200);
    expect(spotify?.yearlyAgorot).toBe(26_400);
  });

  it('יש עסקאות בשני החשבונות', () => {
    expect(balance.byAccount).toHaveLength(2);
    expect(balance.byAccount.every((a) => a.countedTransactions > 0)).toBe(true);
  });

  it('היתרה נמוכה מהיעד — יש לאן לשאוף', () => {
    expect(balance.totalAgorot).toBeLessThan(goal.targetAgorot);
    expect(balance.totalAgorot).toBeGreaterThan(0);
  });
});

describe('עקביות בין המודולים', () => {
  it('זהות היתרה מתקיימת', () => {
    const b = balance.breakdown;
    expect(
      b.openingTotalAgorot + b.incomeTotalAgorot - b.expenseTotalAgorot + b.adjustmentsNetAgorot,
    ).toBe(balance.totalAgorot);
  });

  it('פירוק "בטוח להוציא" מסתכם לתוצאה', () => {
    const b = sts.breakdown;
    expect(b.availableNowAgorot).toBe(b.currentBalanceAgorot - b.safetyBufferAgorot);
    expect(
      b.availableNowAgorot -
        b.committedLeftAgorot -
        b.reservedForFutureMonthsAgorot -
        b.goalDueThisMonthAgorot,
    ).toBe(sts.nowAgorot);
  });

  it('⭐ רוב היתרה של אוגוסט שמורה לחודשים הבאים ואינה פנויה', () => {
    expect(sts.breakdown.reservedForFutureMonthsAgorot).toBeGreaterThan(200_000);
    // בלי ההקצאה העתידית "בטוח להוציא" היה גדול פי כמה
    expect(sts.nowAgorot).toBeLessThan(balance.totalAgorot / 3);
  });

  it('⭐ ההכנסה הוודאית של 28/08 אינה חלק מ"בטוח להוציא עכשיו"', () => {
    expect(sts.projection.confirmedIncomeLeftAgorot).toBe(110_000);
    expect(sts.projection.byMonthEndAgorot).toBe(sts.nowAgorot + 110_000);
    // הכנסות likely ו-possible מוצגות בנפרד ולא מחוברות לכלום
    expect(sts.projection.unconfirmedIncomeAgorot).toBe(30_000);
  });

  it('סכום החודש הנוכחי עקבי בין periods ל-balance', () => {
    const fromPeriods = periodSummary(transactions, monthStart(today), today);
    expect(fromPeriods.incomeAgorot).toBe(thisMonth.incomeAgorot);
    expect(fromPeriods.expenseAgorot).toBe(spentSoFarThisMonth(transactions, today));
  });

  it('שלושת המסלולים מסודרים מהמחמיר לגמיש', () => {
    expect(plans[0]!.monthlySpendAgorot).toBeLessThanOrEqual(plans[1]!.monthlySpendAgorot);
    expect(plans[1]!.monthlySpendAgorot).toBeLessThanOrEqual(plans[2]!.monthlySpendAgorot);
    expect(plans[0]!.funBudgetAgorot).toBeLessThanOrEqual(plans[2]!.funBudgetAgorot);
  });

  it('התקציב לא יורד מתחת להוצאות הקבועות שזוהו', () => {
    for (const plan of plans) {
      expect(plan.monthlySpendAgorot).toBeGreaterThanOrEqual(fixedCommitments);
    }
  });

  it('רמת הביטחון גבוהה — יש 14 חודשי נתונים', () => {
    expect(expenseAvg.confidence).toBe('high');
    expect(incomeAvg.confidence).toBe('high');
  });

  it('תחזית ל-12 חודשים מסומנת כרחוקה ואינה בביטחון גבוה', () => {
    const f = forecastScenario(
      {
        today,
        currentBalanceAgorot: balance.totalAgorot,
        averageMonthlyExpenseAgorot: expenseAvg.agorot ?? 0,
        averageRegularMonthlyIncomeAgorot: incomeAvg.agorot ?? 0,
        budgetMonthlySpendAgorot: balanced.monthlySpendAgorot,
        summerTotalNetAgorot: 400_000,
        expectedIncomes,
        plannedExpenses,
        historicalConfidence: expenseAvg.confidence,
      },
      'currentAverage',
      12,
    );
    expect(f.confidence).toBe('low');
    expect(f.requiresFarHorizonWarning).toBe(true);
  });

  it('חלוקת הכנסת הקיץ שומרת על האינווריאנטה', () => {
    const allocation = allocateSeasonalIncome({
      summerIncomeAgorot: 360_000,
      monthsToCover: 10,
      targetAgorot: goal.targetAgorot,
      currentBalanceAgorot: balance.totalAgorot,
      essentialMonthlyAgorot: fixedCommitments + 6_000,
      typicalFunMonthlyAgorot: 20_000,
      plannedPurchasesAgorot: 0,
    });
    expect(allocationTotal(allocation)).toBe(360_000);
    expect(allocation.monthlyAllowanceAgorot).toBeGreaterThan(0);
    expect(allocation.goalTotalAgorot).toBeGreaterThan(0);
  });
});

/**
 * מדפיס את הטבלה שמוצגת למשתמש לאימות ידני של המספרים.
 * הרצה: `npx vitest run src/tests/seedIntegration.test.ts --reporter=verbose`
 */
describe('טבלת אימות', () => {
  it('מדפיסה את תוצאות החישוב על נתוני הדוגמה', () => {
    const rows: [string, string][] = [
      ['תאריך החישוב', today],
      ['מספר עסקאות', String(transactions.length)],
      ['חודשים מלאים בנתונים', String(completeMonths(transactions, today).length)],
      ['— יתרה —', ''],
      ['יתרה כוללת', formatILS(balance.totalAgorot)],
      ['  מתוכה בבנק', formatILS(balance.byAccount[0]?.balanceAgorot ?? 0)],
      ['  מתוכה במזומן', formatILS(balance.byAccount[1]?.balanceAgorot ?? 0)],
      ['— החודש —', ''],
      ['הכנסות החודש', formatILS(thisMonth.incomeAgorot)],
      ['הוצאות החודש', formatILS(thisMonth.expenseAgorot)],
      ['הפרש', formatILS(thisMonth.netAgorot, { signed: true })],
      ['— ממוצעים —', ''],
      [`הוצאה חודשית (חציון, ${expenseAvg.monthsUsed} ח׳)`, formatILS(expenseAvg.agorot ?? 0)],
      ['רמת ביטחון', expenseAvg.confidence],
      ['הכנסה חודשית (חציון)', formatILS(incomeAvg.agorot ?? 0)],
      ['נטו חודש רגיל (בלי קיץ)', formatILS(regularNet.agorot ?? 0, { signed: true })],
      ['הוצאות קבועות שזוהו', formatILS(fixedCommitments)],
      ['— תקציב מאוזן —', ''],
      ['תקציב חודשי', formatILS(balanced.monthlySpendAgorot)],
      ['תקציב שבועי', formatILS(balanced.weeklySpendAgorot)],
      ['תקציב בילויים', formatILS(balanced.funBudgetAgorot)],
      ['רמת סיכון', `${balanced.risk.level} — ${balanced.risk.primaryReasonHe}`],
      ['— בטוח להוציא —', ''],
      ['עכשיו', formatILS(sts.nowAgorot)],
      ['השבוע', formatILS(sts.weekAgorot)],
      ['ימים שנותרו בחודש', String(sts.daysLeftInMonth)],
      ['  יתרה', formatILS(sts.breakdown.currentBalanceAgorot)],
      ['  − סכום ביטחון', formatILS(sts.breakdown.safetyBufferAgorot)],
      ['  − התחייבויות', formatILS(sts.breakdown.committedLeftAgorot)],
      ['  − שמור לחודשים הבאים', formatILS(sts.breakdown.reservedForFutureMonthsAgorot)],
      ['  − תרומה ליעד', formatILS(sts.breakdown.goalDueThisMonthAgorot)],
      ['— חלוקת כסף הקיץ —', ''],
      ['הכנסת הקיץ', formatILS(allocation.summerIncomeAgorot)],
      ['  קרן ביטחון', formatILS(allocation.safetyBufferAgorot)],
      ['  הוצאות קבועות ל-10 ח׳', formatILS(allocation.essentialTotalAgorot)],
      ['  בילויים ל-10 ח׳', formatILS(allocation.funFloorTotalAgorot)],
      ['  ליעד', formatILS(allocation.goalTotalAgorot)],
      ['הקצבה חודשית', formatILS(allocation.monthlyAllowanceAgorot)],
      ['  מתוכה לבילויים', formatILS(allocation.monthlyFunAgorot)],
      ['מכסה חודשים', `${allocation.monthsActuallyCovered} מתוך ${allocation.monthsToCover}`],
      ['תחזית לסוף החודש', formatILS(sts.projection.byMonthEndAgorot)],
      ['  הכנסה ודאית שתיכנס', formatILS(sts.projection.confirmedIncomeLeftAgorot)],
      ['  הכנסה לא ודאית (בנפרד)', formatILS(sts.projection.unconfirmedIncomeAgorot)],
      ['— יעד —', ''],
      ['התקדמות', `${progress.progressPct}%`],
      ['פער ליעד', formatILS(progress.gapAgorot)],
      ['מאז ההתחלה', formatILS(progress.sinceStartAgorot, { signed: true })],
      ['יעד ביניים הבא', formatILS(progress.nextMilestone?.amountAgorot ?? 0)],
      ['חודשים משוערים ליעד', projection.monthsToGoal === null ? 'לא בקצב הנוכחי' : String(projection.monthsToGoal)],
      ['חודש ההגעה המשוער', projection.reachMonth ?? '—'],
      ['רמת ביטחון של התחזית', projection.confidence],
    ];

    const width = Math.max(...rows.map(([label]) => label.length));
    const table = rows
      .map(([label, value]) => (value === '' ? `\n${label}` : `  ${label.padEnd(width)}  ${value}`))
      .join('\n');

    console.log(`\n${table}\n`);
    expect(rows.length).toBeGreaterThan(30);
  });
});
