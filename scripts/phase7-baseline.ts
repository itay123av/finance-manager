/**
 * Baseline רגרסיה לשלב 7.
 *
 * מטרת הקובץ אחת: לתפוס את כל המספרים הפיננסיים **לפני** הליטוש, כדי
 * שאפשר יהיה להוכיח בסוף שאף שינוי עיצובי לא הזיז אותם. ליטוש UI
 * שמשנה מספר פיננסי הוא רגרסיה חמורה, ובלי baseline אי אפשר לראות אותה.
 *
 * ⚠️ read-only מול הקבצים האמיתיים. הפלט מכיל מספרים, מזהי התראות
 * וכותרות בלבד — לא שמות בתי עסק, לא מספרי חשבון, לא מספרי כרטיס.
 *
 * שימוש:
 *   npx tsx scripts/phase7-baseline.ts <קובץ-פלט.json>
 *   npx tsx scripts/phase7-baseline.ts <קובץ-פלט.json> --compare <baseline.json>
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
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
const { fromShekels, formatILS } = await import('../src/core/money');

const NOW = new Date('2026-08-07T12:00:00Z');

const outPath = process.argv[2];
if (!outPath) {
  console.error('שימוש: npx tsx scripts/phase7-baseline.ts <קובץ-פלט.json> [--compare <baseline>]');
  process.exit(2);
}
const compareIdx = process.argv.indexOf('--compare');
const comparePath = compareIdx > 0 ? process.argv[compareIdx + 1] : undefined;

// ── בניית מצב זהה לזה של שלב 6 ────────────────────────────────────────
const db = new FinanceDatabase(`phase7-baseline-${Date.now()}`);
await db.open();
await repos.ensureCategories(db);

const bankName = readdirSync('private-data').find((f) => f.endsWith('.csv'))!;
const bankFile = {
  name: bankName,
  bytes: new Uint8Array(readFileSync(join('private-data', bankName))),
};

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
  openingDate: dry.inferredOpeningDate ?? dry.dateRange!.from,
});

let snapshot = await repos.loadSnapshot(db, NOW);
const bankPreview = buildImportPreview({
  file: bankFile,
  accountId: repos.BANK_ACCOUNT_ID,
  existing: snapshot.transactions,
  context: { merchantRules: [], categories: snapshot.categories },
});
await commitImport(db, {
  preview: bankPreview,
  accountId: repos.BANK_ACCOUNT_ID,
  selectedLines: new Set(bankPreview.rows.filter((r) => r.selected).map((r) => r.sourceLine)),
  now: NOW,
});

for (const name of readdirSync('private-data/credit-card').filter((f) => /\.xlsx?$/i.test(f))) {
  const preview = await buildCardImportPreview(db, {
    name,
    bytes: new Uint8Array(readFileSync(join('private-data/credit-card', name))),
  });
  await commitCardImport(db, preview, { fileName: name, now: NOW });
}

const retired = await ensureCard(db, { last4: '4569', issuer: 'לא ידוע', nickname: 'כרטיס ישן' });
await db.cards.put({ ...retired, active: false });

snapshot = await repos.loadSnapshot(db, NOW);
const d = buildDashboard({
  today: snapshot.today,
  accounts: snapshot.accounts,
  transactions: snapshot.transactions,
  categories: snapshot.categories,
  goal: snapshot.goal!,
  settings: snapshot.settings,
  expectedIncomes: snapshot.expectedIncomes,
  plannedExpenses: snapshot.plannedExpenses,
  recurringTransactions: snapshot.recurring,
  cardTransactions: snapshot.cardTransactions,
  cards: snapshot.cards,
  lastImportDate: snapshot.lastImportDate,
});

// ── התמונה שנשמרת ─────────────────────────────────────────────────────
//
// רק מספרים ומזהים. מבנה שטוח בכוונה: השוואה שדה-מול-שדה מייצרת
// הודעה שאומרת בדיוק איזה מספר זז, ולא "האובייקטים שונים".
const baseline: Record<string, number | string | boolean | null> = {
  'balance.total': d.balance.totalAgorot,
  'balance.accounts': d.balance.byAccount.length,
  'transactions.count': snapshot.transactions.length,
  'cardTransactions.count': snapshot.cardTransactions.length,

  'safeToSpend.now': d.safeToSpend.nowAgorot,
  'safeToSpend.week': d.safeToSpend.weekAgorot,
  'safeToSpend.projectedMonthEnd': d.safeToSpend.projection.byMonthEndAgorot,
  'safeToSpend.confirmedIncomeLeft': d.safeToSpend.projection.confirmedIncomeLeftAgorot,
  'safeToSpend.overspent': d.safeToSpend.isOverspent,
  'safeToSpend.available': d.safeToSpend.breakdown.availableNowAgorot,
  'safeToSpend.committed': d.safeToSpend.breakdown.committedLeftAgorot,
  'safeToSpend.goalDue': d.safeToSpend.breakdown.goalDueThisMonthAgorot,
  'safeToSpend.reserved': d.safeToSpend.breakdown.reservedForFutureMonthsAgorot,
  'safeToSpend.buffer': d.safeToSpend.breakdown.safetyBufferAgorot,

  'goal.target': d.goalProgress.targetAgorot,
  'goal.current': d.goalProgress.currentAgorot,
  'goal.progressPct': d.goalProgress.progressPct,
  'goal.gap': d.goalProgress.gapAgorot,
  'goal.sinceStart': d.goalProgress.sinceStartAgorot,
  'goal.reachDate': d.goalProjection.reachDate ?? null,
  'goal.monthsToGoal': d.goalProjection.monthsToGoal ?? null,
  'goal.confidence': d.goalProjection.confidence,

  'budget.plan': d.budgetPlan.id,
  'budget.monthly': d.budgetPlan.monthlySpendAgorot,
  'budget.weekly': d.budgetPlan.weeklySpendAgorot,
  'budget.fun': d.budgetPlan.funBudgetAgorot,
  'budget.spent': d.budgetProgress.spentAgorot,
  'budget.remaining': d.budgetProgress.remainingAgorot,
  'fun.planned': d.fun.plannedAgorot,
  'fun.spent': d.fun.spentAgorot,

  'month.income': d.month.incomeAgorot,
  'month.expense': d.month.expenseAgorot,
  'month.net': d.month.netAgorot,

  'seasonal.reserved': d.seasonal.reservedAgorot,
  'seasonal.summerIncome': d.seasonal.summerIncomeAgorot,
  'seasonal.monthlyAllowance': d.seasonal.allocation?.monthlyAllowanceAgorot ?? null,

  'forecast.monthEnd': d.forecast.monthEnd.endBalanceAgorot,
  'forecast.monthEnd.confidence': d.forecast.monthEnd.confidence,
  'forecast.threeMonths': d.forecast.threeMonths.endBalanceAgorot,
  'forecast.threeMonths.confidence': d.forecast.threeMonths.confidence,

  'confidence.total': d.spendingConfidence.total,
  'confidence.category': d.spendingConfidence.category,
  'confidence.detailedShare': Math.round(d.spendingConfidence.detailedShare * 10_000),

  'alerts.count': d.alerts.length,
  'alerts.types': d.alerts.map((a) => a.type).sort().join(','),
};

writeFileSync(outPath, JSON.stringify(baseline, null, 2), 'utf8');

console.log('\n═══ Baseline פיננסי ═══\n');
const MONEY_KEY =
  /total|now|week|available|committed|goalDue|reserved|buffer|target|current|remaining|monthly|weekly|fun|spent|income|expense|net|Allowance|monthEnd|threeMonths|projected|gap|sinceStart|planned/i;
const NOT_MONEY_KEY = /count|Pct|accounts|Share|confidence|Date|\.plan$|monthsToGoal/i;
for (const [key, value] of Object.entries(baseline)) {
  const isMoney = typeof value === 'number' && MONEY_KEY.test(key) && !NOT_MONEY_KEY.test(key);
  console.log(`  ${key.padEnd(32, '.')} ${isMoney ? formatILS(value as number) : String(value)}`);
}
console.log(`\n  נשמר: ${outPath}\n`);

// ── השוואה ────────────────────────────────────────────────────────────
if (comparePath) {
  if (!existsSync(comparePath)) {
    console.error(`  ❌ קובץ ההשוואה לא נמצא: ${comparePath}`);
    process.exit(1);
  }
  const before = JSON.parse(readFileSync(comparePath, 'utf8')) as typeof baseline;
  const keys = new Set([...Object.keys(before), ...Object.keys(baseline)]);
  const drift: string[] = [];
  for (const key of keys) {
    if (before[key] !== baseline[key]) {
      drift.push(`  ❌ ${key}: ${String(before[key])} → ${String(baseline[key])}`);
    }
  }
  console.log('── השוואה מול ה-baseline ──');
  if (drift.length === 0) {
    console.log(`  ✅ ${keys.size} שדות — אף מספר פיננסי לא זז.\n`);
  } else {
    console.log(`  ${drift.length} שדות זזו:`);
    for (const row of drift) console.log(row);
    console.log('');
    process.exit(1);
  }
}
