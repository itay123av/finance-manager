/**
 * אימות שלב 6 על הנתונים האמיתיים.
 *
 * מייבא עו״ש + פירוט כרטיס 3483, מסמן את 4569 ככרטיס ישן, ומריץ את
 * שכבת התובנות — כדי לראות מה המערכת באמת אומרת, ומה היא נמנעת מלומר.
 *
 * ⚠️ read-only. אין הדפסה של מספרי חשבון או כרטיס מלאים.
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
const { buildInsights, insightsByBasis } = await import('../src/core/insights');
const { getEffectiveExpenses, effectiveExpensesByCategory } = await import(
  '../src/core/effectiveSpending'
);
const { monthlyTotals } = await import('../src/core/detailedPatterns');
const { reviewWeek, reviewMonth, reserveUsedInPeriod } = await import('../src/core/periodReview');
const { totalBalance } = await import('../src/core/balance');
const { periodSummary } = await import('../src/core/periods');
const { eachMonth, monthEnd, monthOf, monthStart, addDays, formatMonthHe } = await import(
  '../src/core/dates'
);
const { confidenceLabelHe } = await import('../src/core/confidence');
const { formatILS, fromShekels } = await import('../src/core/money');

const NOW = new Date('2026-08-07T12:00:00Z');
const pass: string[] = [];
const fail: string[] = [];
const check = (label: string, ok: boolean, detail = '') => {
  (ok ? pass : fail).push(label);
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`);
};
const line = (label: string, value: string | number) =>
  console.log(`  ${label.padEnd(32, '.')} ${value}`);

const db = new FinanceDatabase(`phase6-${Date.now()}`);
await db.open();
await repos.ensureCategories(db);

console.log('\n═══ אימות שלב 6 ═══\n');

// ── ייבוא ────────────────────────────────────────────────────────────
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

// ── חישוב ────────────────────────────────────────────────────────────
snapshot = await repos.loadSnapshot(db, NOW);
const dashboard = buildDashboard({
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

const dates = snapshot.transactions.map((t) => t.date).sort();
const expenses = getEffectiveExpenses({
  transactions: snapshot.transactions,
  cardTransactions: snapshot.cardTransactions,
  cards: snapshot.cards,
  from: dates[0]!,
  to: snapshot.today,
});

const months = eachMonth(monthOf(dates[0]!), monthOf(snapshot.today));
const bars = months.map((month) => {
  const s = periodSummary(snapshot.transactions, monthStart(month), monthEnd(month));
  return { month, income: s.incomeAgorot, expense: s.expenseAgorot, net: s.netAgorot };
});

const negativeMonths = bars.filter((b) => b.net < 0).length;
const summerIncome = bars
  .filter((b) => ['07', '08'].includes(b.month.slice(5, 7)))
  .reduce((sum, b) => sum + b.income, 0);
const yearIncome = bars.reduce((sum, b) => sum + b.income, 0);

const insights = buildInsights({
  today: snapshot.today,
  expenses,
  categories: snapshot.categories,
  confidence: dashboard.spendingConfidence,
  negativeMonths,
  totalMonths: bars.length,
  reservedForFutureMonthsAgorot: dashboard.safeToSpend.breakdown.reservedForFutureMonthsAgorot,
  monthlyAllowanceAgorot:
    dashboard.seasonal.allocation?.monthlyAllowanceAgorot ??
    dashboard.budgetPlan.monthlySpendAgorot,
  summerIncomeAgorot: summerIncome,
  yearIncomeAgorot: yearIncome,
});

const byBasis = insightsByBasis(insights.insights);

// ── דוח ──────────────────────────────────────────────────────────────
console.log('── רמות ביטחון ──');
line('סכום כולל', confidenceLabelHe(dashboard.spendingConfidence.total));
line('פילוח קטגוריות', confidenceLabelHe(dashboard.spendingConfidence.category));
line('חלק מפורט', `${Math.round(dashboard.spendingConfidence.detailedShare * 100)}%`);

console.log('\n── תובנות: התמונה הגדולה ──');
for (const insight of byBasis.total) {
  console.log(`  • ${insight.titleHe}`);
  console.log(`    ${insight.bodyHe}`);
  console.log(`    ↳ ${insight.evidenceHe}\n`);
}

console.log('── תובנות: מהעסקאות המפורטות ──');
for (const insight of byBasis.detailed) {
  console.log(`  • ${insight.titleHe}`);
  console.log(`    ${insight.bodyHe}\n`);
}

console.log('── חיובים חוזרים שזוהו ──');
if (insights.subscriptions.length === 0) console.log('  (לא זוהו)');
for (const sub of insights.subscriptions) {
  console.log(
    `  ${sub.merchant.padEnd(26).slice(0, 26)} ${formatILS(sub.typicalAmountAgorot).padStart(9)}/חודש  ` +
      `${formatILS(sub.yearlyAgorot).padStart(10)}/שנה  (${sub.occurrences} חיובים)` +
      (sub.possiblyStale ? '  ⚠️ לא הופיע לאחרונה' : ''),
  );
}
line('סך מנויים פעילים לחודש', formatILS(insights.subscriptionsMonthlyAgorot));

console.log('\n── תובנות שנחסמו ──');
line('מספר', insights.suppressedCount);
if (insights.suppressionNoteHe) console.log(`  ${insights.suppressionNoteHe}`);

console.log('\n── נכנס מול יצא, לפי חודש ──');
for (const bar of bars) {
  console.log(
    `  ${formatMonthHe(bar.month).padEnd(14)} נכנס ${formatILS(bar.income).padStart(9)}  ` +
      `יצא ${formatILS(bar.expense).padStart(9)}  נטו ${(bar.net >= 0 ? '+' : '') + formatILS(bar.net)}`,
  );
}

console.log('\n── פילוח (הוצאה אפקטיבית) ──');
for (const entry of effectiveExpensesByCategory(expenses, snapshot.categories)) {
  console.log(
    `  ${entry.categoryName.padEnd(26)} ${formatILS(entry.amountAgorot).padStart(10)}  (${entry.count})`,
  );
}

// ── סיכומים ──────────────────────────────────────────────────────────
const monthlyAllowance =
  dashboard.seasonal.allocation?.monthlyAllowanceAgorot ??
  dashboard.budgetPlan.monthlySpendAgorot;
const shared = {
  transactions: snapshot.transactions,
  expenses,
  categories: snapshot.categories,
  confidence: dashboard.spendingConfidence,
};

const week = reviewWeek({
  ...shared,
  today: snapshot.today,
  budgetAgorot: dashboard.budgetPlan.weeklySpendAgorot,
  reserveUsedAgorot: reserveUsedInPeriod(
    snapshot.transactions,
    addDays(snapshot.today, -6),
    snapshot.today,
    monthlyAllowance,
  ),
});

const month = reviewMonth({
  ...shared,
  month: monthOf(snapshot.today),
  budgetAgorot: dashboard.budgetPlan.monthlySpendAgorot,
  reserveUsedAgorot: reserveUsedInPeriod(
    snapshot.transactions,
    monthStart(monthOf(snapshot.today)),
    snapshot.today,
    monthlyAllowance,
  ),
  openingBalanceAgorot: totalBalance(
    snapshot.accounts,
    snapshot.transactions,
    addDays(monthStart(monthOf(snapshot.today)), -1),
  ).totalAgorot,
  closingBalanceAgorot: dashboard.balance.totalAgorot,
});

console.log('\n── סיכום השבוע ──');
line('טווח', `${week.from} – ${week.to}`);
line('נכנס / יצא', `${formatILS(week.incomeAgorot)} / ${formatILS(week.expenseAgorot)}`);
line('נטו', formatILS(week.netAgorot));
line('כותרת', week.headlineHe);
line('נגע ברזרבה', week.usedReserve ? formatILS(week.usedReserveAgorot) : 'לא');
line('פילוח מוצג', week.topCategories.length > 0 ? 'כן' : 'לא (ביטחון נמוך)');

console.log('\n── סיכום החודש ──');
line('יתרת פתיחה', formatILS(month.openingBalanceAgorot));
line('יתרה עכשיו', formatILS(month.closingBalanceAgorot));
line('נכנס / יצא', `${formatILS(month.incomeAgorot)} / ${formatILS(month.expenseAgorot)}`);
line('ניצול תקציב', month.budgetUsedPct === null ? '—' : `${month.budgetUsedPct}%`);
line('עמד בתקציב', month.metBudget === null ? '—' : month.metBudget ? 'כן' : 'לא');

console.log('\n── התראות ──');
// ⚠️ הכותרת בלבד. גוף ההתראה מכיל שמות בתי עסק אמיתיים, ואין סיבה
// שהם יגיעו ל-stdout. הבדיקות למטה בוחנות את הגוף בלי להדפיס אותו.
for (const alert of dashboard.alerts) {
  line(alert.severity === 'warn' ? '⚠️' : 'ℹ️', alert.titleHe);
}
if (dashboard.alerts.length === 0) line('—', 'אין התראות פעילות');

// ── בדיקות ───────────────────────────────────────────────────────────
console.log('\n── בדיקות ──');
check(
  '⭐ אין התראת "עסקה חריגה" על חיוב כרטיס מרוכז',
  dashboard.alerts
    .filter((a) => a.type === 'unusual_transaction')
    .every((a) => !a.bodyHe.includes('כרטיס')),
);
check(
  '⭐ אף התראה לא נוזפת',
  dashboard.alerts.every((a) =>
    ['לא היית צריך', 'בזבזת', 'יותר מדי', 'תפסיק'].every(
      (word) => !`${a.titleHe} ${a.bodyHe}`.includes(word),
    ),
  ),
);
check(
  '⭐ אף התראה לא מבטיחה פעולה שלא בוצעה',
  dashboard.alerts.every((a) => !a.bodyHe.includes('הוספתי')),
);
check(
  '⭐ אין תובנות קטגוריאליות בביטחון נמוך',
  byBasis.category.length === 0,
  `${insights.suppressedCount} נחסמו`,
);
check('יש תובנות ברמת הסכום הכולל', byBasis.total.length > 0, `${byBasis.total.length}`);
check(
  '⭐ זוהו חיובים חוזרים מהפירוט',
  insights.subscriptions.length > 0,
  `${insights.subscriptions.length}`,
);
check(
  '⭐ אף תובנה לא אומרת "יותר מדי" או "צמצם"',
  insights.insights.every(
    (i) => !`${i.titleHe} ${i.bodyHe}`.includes('יותר מדי') && !`${i.titleHe} ${i.bodyHe}`.includes('צמצם'),
  ),
);
check(
  'לכל תובנה יש ראיה',
  insights.insights.every((i) => i.evidenceHe.length > 0),
);
check(
  '⭐ פילוח בסיכום חסום כשהביטחון נמוך',
  week.topCategories.length === 0 && week.categoriesHiddenReasonHe !== null,
);
check(
  'הסכומים בסיכום מוצגים למרות זאת',
  week.expenseAgorot >= 0 && month.expenseAgorot >= 0,
);
check(
  'היתרה לא השתנתה',
  dashboard.balance.totalAgorot === bankPreview.statementClosingBalanceAgorot,
  formatILS(dashboard.balance.totalAgorot),
);
check(
  'סך החודשים בגרף תואם להיסטוריה',
  bars.length === monthlyTotals(expenses).length,
  `${bars.length} חודשים`,
);

console.log('');
console.log(fail.length === 0 ? '  שלב 6: ✅ עבר' : '  שלב 6: ❌ לא עבר');
console.log(`  ${pass.length} בדיקות עברו, ${fail.length} נכשלו\n`);
if (fail.length > 0) {
  for (const f of fail) console.log(`    ❌ ${f}`);
  process.exit(1);
}
