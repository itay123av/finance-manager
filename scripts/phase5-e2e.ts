/**
 * אימות שלב 5 על הנתונים האמיתיים.
 *
 * ⚠️ סימולציות בלבד — שום עסקה לא נוצרת. בסיס הנתונים בזיכרון.
 * אין הדפסה של מספרי חשבון או כרטיס מלאים.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;

const { FinanceDatabase } = await import('../src/data/db');
const repos = await import('../src/data/repositories');
const { commitImport } = await import('../src/data/imports');
const { buildCardImportPreview, commitCardImport, ensureCard } = await import('../src/data/cards');
const { buildImportPreview } = await import('../src/import/pipeline');
const { buildDashboard } = await import('../src/core/dashboard');
const { simulatePurchase } = await import('../src/core/purchaseSimulation');
const { buildAllScenarios, HORIZONS } = await import('../src/core/forecastScenarios');
const { assessGoalStability } = await import('../src/core/goalStability');
const { allocationOptions, allocationIsBalanced, bufferShortfall } = await import(
  '../src/core/incomeAllocation'
);
const { monthlyExpenseAverage, monthlyNetAverage } = await import('../src/core/averages');
const { periodSummary } = await import('../src/core/periods');
const { lastRelevantSummerYear } = await import('../src/core/dashboard');
const { confidenceLabelHe } = await import('../src/core/confidence');
const { formatILS, fromShekels, clampMin0 } = await import('../src/core/money');
const { formatMonthHe } = await import('../src/core/dates');

const NOW = new Date('2026-08-07T12:00:00Z');
const pass: string[] = [];
const fail: string[] = [];
const check = (label: string, ok: boolean, detail = '') => {
  (ok ? pass : fail).push(label);
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`);
};
const line = (label: string, value: string | number) =>
  console.log(`  ${label.padEnd(30, '.')} ${value}`);

const db = new FinanceDatabase(`phase5-${Date.now()}`);
await db.open();
await repos.ensureCategories(db);

// ── טעינת הנתונים האמיתיים ───────────────────────────────────────────
const bankName = readdirSync('private-data').find((f) => f.endsWith('.csv'))!;
const bankFile = { name: bankName, bytes: new Uint8Array(readFileSync(join('private-data', bankName))) };
const dry = buildImportPreview({
  file: bankFile,
  accountId: repos.BANK_ACCOUNT_ID,
  existing: [],
  context: { merchantRules: [], categories: await db.categories.toArray() },
});
await repos.completeOnboarding(db, {
  bankBalanceAgorot: dry.inferredOpeningBalanceAgorot ?? 0,
  cashBalanceAgorot: 0,
  safetyBufferAgorot: fromShekels(500),
  targetAgorot: fromShekels(5000),
  milestones: [fromShekels(1000), fromShekels(2500), fromShekels(5000)],
  estimatedMonthlySpendAgorot: fromShekels(400),
  openingDate: dry.inferredOpeningDate!,
});
let s = await repos.loadSnapshot(db, NOW);
const bp = buildImportPreview({
  file: bankFile,
  accountId: repos.BANK_ACCOUNT_ID,
  existing: s.transactions,
  context: { merchantRules: [], categories: s.categories },
});
await commitImport(db, {
  preview: bp,
  accountId: repos.BANK_ACCOUNT_ID,
  selectedLines: new Set(bp.rows.filter((r) => r.selected).map((r) => r.sourceLine)),
  now: NOW,
});
for (const n of readdirSync('private-data/credit-card').filter((f) => /\.xlsx?$/i.test(f))) {
  const p = await buildCardImportPreview(db, {
    name: n,
    bytes: new Uint8Array(readFileSync(join('private-data/credit-card', n))),
  });
  await commitCardImport(db, p, { fileName: n, now: NOW });
}
const retired = await ensureCard(db, { last4: '4569', issuer: '-', nickname: 'ישן' });
await db.cards.put({ ...retired, active: false });

s = await repos.loadSnapshot(db, NOW);
const dashboard = buildDashboard({
  today: s.today,
  accounts: s.accounts,
  transactions: s.transactions,
  categories: s.categories,
  goal: s.goal!,
  settings: s.settings,
  expectedIncomes: s.expectedIncomes,
  plannedExpenses: s.plannedExpenses,
  recurringTransactions: s.recurring,
  cardTransactions: s.cardTransactions,
  cards: s.cards,
});

const regularNet = monthlyNetAverage(s.transactions, s.today, { excludeSummer: true });
const summerYear = lastRelevantSummerYear(s.today);
const summerNet = periodSummary(s.transactions, `${summerYear}-07-01`, `${summerYear}-08-31`).netAgorot;

const purchaseBase = {
  today: s.today,
  amountAgorot: 0,
  balanceAgorot: dashboard.balance.totalAgorot,
  safeToSpendNowAgorot: dashboard.safeToSpend.nowAgorot,
  reservedForFutureMonthsAgorot: dashboard.safeToSpend.breakdown.reservedForFutureMonthsAgorot,
  safetyBufferAgorot: dashboard.safeToSpend.breakdown.safetyBufferAgorot,
  targetAgorot: s.goal!.targetAgorot,
  regularMonthlyNetAgorot: regularNet.agorot ?? 0,
  summerTotalNetAgorot: clampMin0(summerNet),
  monthEndForecastAgorot: dashboard.forecast.monthEnd.endBalanceAgorot,
  threeMonthForecastAgorot: dashboard.forecast.threeMonths.endBalanceAgorot,
  expectedIncomes: s.expectedIncomes,
  historicalConfidence: dashboard.spendingConfidence.total,
};

console.log('\n═══ אימות שלב 5 ═══\n');
console.log('── היום ──');
line('יתרה', formatILS(dashboard.balance.totalAgorot));
line('safeToSpendNow', formatILS(dashboard.safeToSpend.nowAgorot));
line('reserve', formatILS(dashboard.safeToSpend.breakdown.reservedForFutureMonthsAgorot));
line('סכום ביטחון', formatILS(dashboard.safeToSpend.breakdown.safetyBufferAgorot));
line('פער ל-5,000', formatILS(dashboard.goalProgress.gapAgorot));

// ── חמש סימולציות ────────────────────────────────────────────────────
console.log('\n── סימולציות רכישה ──');
const transactionsBefore = await db.transactions.count();

for (const shekels of [50, 150, 400, 600, 1000]) {
  const r = simulatePurchase({ ...purchaseBase, amountAgorot: fromShekels(shekels) });
  console.log(`\n  ₪${shekels}  ${r.headlineHe}`);
  console.log(`    ${r.explanationHe}`);
  line('    יתרה אחרי', formatILS(r.after.balanceAgorot));
  line('    safeToSpend אחרי', formatILS(r.after.safeToSpendNowAgorot));
  line('    מהרזרבה', formatILS(r.reserveNeededAgorot));
  line('    מסכום הביטחון', formatILS(r.bufferBreachAgorot));
  line('    פער ליעד אחרי', formatILS(r.after.goalGapAgorot));
  line('    דחיית יעד', r.goalDelayDays > 0 ? `${r.goalDelayDays} ימים` : 'אין');
  line('    תחזית 3 חודשים', formatILS(r.after.threeMonthForecastAgorot));
  if (r.alternatives.length > 0) {
    console.log('    חלופות:');
    for (const a of r.alternatives) console.log(`      · ${a.labelHe} — ${a.detailHe}`);
  }
}

check(
  '⭐ הסימולציות לא יצרו אף עסקה',
  (await db.transactions.count()) === transactionsBefore,
  `${transactionsBefore} עסקאות לפני ואחרי`,
);

// ── תחזיות ───────────────────────────────────────────────────────────
// ⚠️ ההוצאה ההיסטורית, לא התקציב — אחרת "הקצב הנוכחי" ו"התקציב
// המאוזן" מחזירים אותם מספרים וההשוואה חסרת ערך
const expenseAvg = monthlyExpenseAverage(s.transactions, s.today);
const historicalExpense = expenseAvg.agorot ?? s.settings.estimatedMonthlySpendAgorot;

const forecastInput = {
  today: s.today,
  currentBalanceAgorot: dashboard.balance.totalAgorot,
  averageMonthlyExpenseAgorot: historicalExpense,
  averageRegularMonthlyIncomeAgorot: clampMin0((regularNet.agorot ?? 0) + historicalExpense),
  budgetMonthlySpendAgorot: dashboard.budgetPlan.monthlySpendAgorot,
  summerTotalNetAgorot: clampMin0(summerNet),
  expectedIncomes: s.expectedIncomes,
  historicalConfidence: dashboard.spendingConfidence.total,
};
const scenarios = buildAllScenarios(forecastInput);

console.log('\n\n── תחזיות ──');
console.log('  טווח        ' + scenarios.map((sc) => sc.labelHe.padEnd(18)).join(''));
for (const horizon of HORIZONS) {
  const label = horizon === 1 ? 'סוף החודש' : `${horizon} חודשים`;
  const values = scenarios
    .map((sc) => formatILS(sc.byHorizon[horizon].balanceAgorot).padEnd(18))
    .join('');
  console.log(`  ${label.padEnd(12)}${values}`);
}
console.log('\n  רמות ביטחון (התרחיש הראשי):');
for (const horizon of HORIZONS) {
  const point = scenarios[0]!.byHorizon[horizon];
  console.log(
    `    ${String(horizon).padStart(2)} חודשים: ${confidenceLabelHe(point.confidence)}` +
      `${point.requiresFarHorizonWarning ? '  ⚠️ תחזית רחוקה' : ''}`,
  );
}

check(
  '⭐ תחזית 12 חודשים אינה מוצגת כוודאית',
  scenarios.every((sc) => sc.byHorizon[12].confidence !== 'high'),
  confidenceLabelHe(scenarios[0]!.byHorizon[12].confidence),
);

// ── יעד יציב ─────────────────────────────────────────────────────────
const balanced = scenarios.find((sc) => sc.scenarioId === 'balanced')!;
const stability = assessGoalStability({
  today: s.today,
  currentBalanceAgorot: dashboard.balance.totalAgorot,
  targetAgorot: s.goal!.targetAgorot,
  minimumAfterReachedAgorot: s.goal!.minimumAfterReachedAgorot,
  projectedBalances: balanced.points,
  confidence: balanced.byHorizon[3].confidence,
});

console.log('\n── מצב היעד ──');
line('שלב', stability.phase);
line('הושג?', stability.reached ? 'כן' : 'לא');
line('stableGoal', stability.stable ? 'true' : 'false');
line('כותרת', stability.headlineHe);
console.log(`  ${stability.detailHe}`);
if (stability.firstDipMonth) {
  line('ירידה ראשונה', `${formatMonthHe(stability.firstDipMonth)} → ${formatILS(stability.firstDipBalanceAgorot!)}`);
}

// ── חלוקת הכנסה ──────────────────────────────────────────────────────
console.log('\n── חלוקת משכורת קיץ עתידית (₪4,200) ──');
const allocInput = {
  incomeAgorot: fromShekels(4200),
  monthsToCover: 10,
  commitmentsAgorot: 0,
  bufferShortfallAgorot: bufferShortfall(
    dashboard.balance.totalAgorot,
    dashboard.safeToSpend.breakdown.safetyBufferAgorot,
  ),
  essentialMonthlyAgorot: fromShekels(60),
  typicalFunMonthlyAgorot: fromShekels(70),
  goalGapAgorot: dashboard.goalProgress.gapAgorot,
  plannedPurchasesAgorot: 0,
};
for (const option of allocationOptions(allocInput)) {
  console.log(`\n  ${option.planId}:`);
  for (const l of option.lines) {
    console.log(`    ${l.labelHe.padEnd(24)} ${formatILS(l.amountAgorot).padStart(9)}`);
  }
  line('    הקצבה חודשית', formatILS(option.monthlyAllowanceAgorot));
  line('    מזה לבילויים', formatILS(option.monthlyFunAgorot));
}
check(
  '⭐ סכום החלוקה = ההכנסה, באגורה',
  allocationOptions(allocInput).every(allocationIsBalanced),
);

// ── עקביות ───────────────────────────────────────────────────────────
const dashboard2 = buildDashboard({
  today: s.today,
  accounts: s.accounts,
  transactions: s.transactions,
  categories: s.categories,
  goal: s.goal!,
  settings: s.settings,
  expectedIncomes: s.expectedIncomes,
  plannedExpenses: s.plannedExpenses,
  recurringTransactions: s.recurring,
  cardTransactions: s.cardTransactions,
  cards: s.cards,
});

console.log('\n── בדיקות עקביות ──');
check(
  '⭐ הסימולטור והדשבורד משתמשים באותו safeToSpend',
  purchaseBase.safeToSpendNowAgorot === dashboard2.safeToSpend.nowAgorot,
  formatILS(dashboard2.safeToSpend.nowAgorot),
);
check('היתרה לא השתנתה', dashboard2.balance.totalAgorot === dashboard.balance.totalAgorot);
check(
  'רמות הביטחון עדיין נפרדות',
  dashboard2.spendingConfidence.total !== dashboard2.spendingConfidence.category,
  `כולל: ${confidenceLabelHe(dashboard2.spendingConfidence.total)} · פילוח: ${confidenceLabelHe(dashboard2.spendingConfidence.category)}`,
);

console.log('');
console.log(fail.length === 0 ? '  שלב 5: ✅ עבר' : '  שלב 5: ❌ לא עבר');
console.log(`  ${pass.length} בדיקות עברו, ${fail.length} נכשלו\n`);
if (fail.length > 0) {
  for (const f of fail) console.log(`    ❌ ${f}`);
  process.exit(1);
}
