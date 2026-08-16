/**
 * אימות שלב 4 על הנתונים האמיתיים.
 *
 * מייבא עו״ש + פירוט כרטיס 3483, מסמן את 4569 ככרטיס ישן, ובודק
 * שהתקציב הקטגוריאלי אינו מושפע מההוצאות האטומות.
 *
 * ⚠️ read-only מול הקבצים. אין הדפסה של מספרי חשבון או כרטיס מלאים.
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
const { buildCategoryBudget, reducibleLines } = await import('../src/core/categoryBudget');
const { getEffectiveExpenses, checkNoDoubleCounting, RETIRED_CARD_CATEGORY_ID, effectiveExpensesByCategory } =
  await import('../src/core/effectiveSpending');
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
  console.log(`  ${label.padEnd(34, '.')} ${value}`);

const db = new FinanceDatabase(`phase4-${Date.now()}`);
await db.open();
await repos.ensureCategories(db);

console.log('\n═══ אימות שלב 4 ═══\n');

// ── עו״ש ─────────────────────────────────────────────────────────────
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

// ── פירוט כרטיס 3483 ─────────────────────────────────────────────────
for (const name of readdirSync('private-data/credit-card').filter((f) => /\.xlsx?$/i.test(f))) {
  const preview = await buildCardImportPreview(db, {
    name,
    bytes: new Uint8Array(readFileSync(join('private-data/credit-card', name))),
  });
  await commitCardImport(db, preview, { fileName: name, now: NOW });
}

// ── ⭐ סימון הכרטיס הישן ─────────────────────────────────────────────
const retired = await ensureCard(db, { last4: '4569', issuer: 'לא ידוע', nickname: 'כרטיס ישן' });
await db.cards.put({ ...retired, active: false });

// ── מדידה ────────────────────────────────────────────────────────────
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
});

const dates = snapshot.transactions.map((t) => t.date).sort();
const allExpenses = getEffectiveExpenses({
  transactions: snapshot.transactions,
  cardTransactions: snapshot.cardTransactions,
  cards: snapshot.cards,
  from: dates[0]!,
  to: snapshot.today,
});

const conf = dashboard.spendingConfidence;

console.log('── רמות ביטחון ──');
line('ביטחון בסכום הכולל', confidenceLabelHe(conf.total));
line('ביטחון בפילוח', confidenceLabelHe(conf.category));
line('חלק ההוצאות המפורטות', `${Math.round(conf.detailedShare * 100)}%`);
line('מפורט', formatILS(conf.detailedAgorot));
line('אטום (כרטיס ישן)', formatILS(conf.opaqueAgorot));
line('ייעוץ קטגוריאלי מותר', conf.categoryAdviceAllowed ? 'כן' : 'לא');

// ── תקציב לפי קטגוריה ────────────────────────────────────────────────
const budget = buildCategoryBudget({
  expenses: allExpenses,
  categories: snapshot.categories,
  today: snapshot.today,
  planRatio: 0.9,
});

console.log('\n── תקציב לפי קטגוריה (מאוזן) ──');
for (const l of budget.lines) {
  console.log(
    `  ${l.categoryName.padEnd(24)} חציון ${formatILS(l.typicalMonthlyAgorot).padStart(9)}  ` +
      `תקציב ${formatILS(l.plannedAgorot).padStart(9)}  (${l.monthsUsed} חודשים)`,
  );
}
line('סך התקציב המפורט', formatILS(budget.totalPlannedAgorot));
line('רזרבה לכרטיס הישן', formatILS(budget.opaqueMonthlyAgorot));
line('סה״כ צפוי לחודש', formatILS(budget.grandTotalAgorot));

// ── השוואה: עם ובלי ההוצאות האטומות ──────────────────────────────────
const withoutOpaque = buildCategoryBudget({
  expenses: allExpenses.filter((e) => e.categoryId !== RETIRED_CARD_CATEGORY_ID),
  categories: snapshot.categories,
  today: snapshot.today,
  planRatio: 0.9,
});

console.log('\n── בדיקות ──');
check(
  '⭐ הכרטיס הישן לא מעוות את התקציב הקטגוריאלי',
  budget.totalPlannedAgorot === withoutOpaque.totalPlannedAgorot,
  `${formatILS(budget.totalPlannedAgorot)} בשני המקרים`,
);
check(
  'אין שורת תקציב לכרטיס הישן',
  !budget.lines.some((l) => l.categoryId === RETIRED_CARD_CATEGORY_ID),
);
check(
  'לא מוצע לצמצם קטגוריה אטומה',
  !reducibleLines(budget).some((l) => l.categoryId === RETIRED_CARD_CATEGORY_ID),
);
check(
  '⭐ הסכום הכולל אמין למרות שהפילוח חלקי',
  conf.total === 'high',
  `כולל: ${confidenceLabelHe(conf.total)} · פילוח: ${confidenceLabelHe(conf.category)}`,
);
check('שתי הרמות אכן שונות', conf.total !== conf.category);
check('מוצגת הסתייגות', conf.disclaimerHe !== null);
check(
  'אין ספירה כפולה',
  checkNoDoubleCounting({
    transactions: snapshot.transactions,
    cardTransactions: snapshot.cardTransactions,
    cards: snapshot.cards,
    from: dates[0]!,
    to: snapshot.today,
  }).ok,
);

const byCategory = effectiveExpensesByCategory(allExpenses, snapshot.categories);
const retiredTotal = byCategory.find((c) => c.categoryId === RETIRED_CARD_CATEGORY_ID);
check(
  'חיובי הכרטיס הישן מסווגים ככרטיס ישן',
  retiredTotal !== undefined,
  retiredTotal ? formatILS(retiredTotal.amountAgorot) : '—',
);
// ⚠️ משווים לסכום המדויק מהדוח ולא למספר מעוגל: היתרה היא ₪4,399.56
// ו-`formatILS` מציג ₪4,400. השוואה למספר המעוגל הייתה בדיקה שקרית.
check(
  'היתרה תואמת בדיוק ליתרת הסיום בדוח',
  dashboard.balance.totalAgorot === bankPreview.statementClosingBalanceAgorot,
  `${dashboard.balance.totalAgorot} אגורות`,
);

console.log('\n── מצב סופי ──');
line('currentBalance', formatILS(dashboard.balance.totalAgorot));
line('safeToSpendNow', formatILS(dashboard.safeToSpend.nowAgorot));
line('safeToSpendWeek', formatILS(dashboard.safeToSpend.weekAgorot));
line('תקציב חודשי (מאוזן)', formatILS(dashboard.budgetPlan.monthlySpendAgorot));
line('תקציב בילויים', formatILS(dashboard.fun.plannedAgorot));
line('יעד', `${dashboard.goalProgress.progressPct}% · נשאר ${formatILS(dashboard.goalProgress.gapAgorot)}`);
line('תאריך יעד משוער', dashboard.goalProjection.reachMonth ?? 'לא מגיעים בקצב הנוכחי');

console.log('\n── הקטגוריות הבולטות החודש ──');
for (const c of dashboard.topCategories) {
  console.log(`  ${c.categoryName.padEnd(24)} ${formatILS(c.amountAgorot).padStart(9)}  ${c.sharePct}%`);
}

console.log('');
console.log(fail.length === 0 ? '  שלב 4: ✅ עבר' : '  שלב 4: ❌ לא עבר');
console.log(`  ${pass.length} בדיקות עברו, ${fail.length} נכשלו\n`);
if (fail.length > 0) {
  for (const f of fail) console.log(`    ❌ ${f}`);
  process.exit(1);
}
