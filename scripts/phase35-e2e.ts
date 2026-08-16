/**
 * אימות שלב 3.5 מקצה לקצה, על הקבצים האמיתיים.
 *
 * זרימה: ייבוא עו״ש → מדידה לפני → ייבוא שלושת קובצי האשראי →
 * קישור → מדידה אחרי → השוואה.
 *
 * ⚠️ read-only מול הקבצים. בסיס הנתונים בזיכרון ונעלם בסיום.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;

const { FinanceDatabase } = await import('../src/data/db');
const repos = await import('../src/data/repositories');
const { commitImport, countNeedingReview } = await import('../src/data/imports');
const { buildCardImportPreview, commitCardImport, undoCardImport } = await import(
  '../src/data/cards'
);
const { buildImportPreview } = await import('../src/import/pipeline');
const { buildDashboard } = await import('../src/core/dashboard');
const { matchCardTransactionsToCharges, reconcileCardCycle } = await import(
  '../src/core/cardCharges'
);
const {
  checkNoDoubleCounting,
  effectiveExpensesByCategory,
  getEffectiveExpenses,
  UNDETAILED_CARD_CATEGORY_ID,
} = await import('../src/core/effectiveSpending');
const { formatILS, fromShekels } = await import('../src/core/money');

const NOW = new Date('2026-08-07T12:00:00Z');
const PERIOD = { from: '2026-02-01', to: '2026-08-31' };
const pass: string[] = [];
const fail: string[] = [];

const check = (label: string, ok: boolean, detail = '') => {
  (ok ? pass : fail).push(label);
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`);
};
const line = (label: string, value: string | number) =>
  console.log(`  ${label.padEnd(34, '.')} ${value}`);

const db = new FinanceDatabase(`phase35-${Date.now()}`);
await db.open();
await repos.ensureCategories(db);

console.log('\n═══ אימות שלב 3.5 ═══\n');

// ── עו״ש ─────────────────────────────────────────────────────────────
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

async function dashboard() {
  const s = await repos.loadSnapshot(db, NOW);
  return buildDashboard({
    today: s.today,
    accounts: s.accounts,
    transactions: s.transactions,
    categories: s.categories,
    goal: s.goal!,
    settings: s.settings,
    expectedIncomes: s.expectedIncomes,
    plannedExpenses: s.plannedExpenses,
    recurringTransactions: s.recurring,
  });
}

async function categoryReport() {
  const s = await repos.loadSnapshot(db, NOW);
  const cardTransactions = await db.cardTransactions.toArray();
  const expenses = getEffectiveExpenses({
    transactions: s.transactions,
    cardTransactions,
    ...PERIOD,
  });
  return effectiveExpensesByCategory(expenses, s.categories);
}

// ── לפני ─────────────────────────────────────────────────────────────
const before = await dashboard();
const beforeCategories = await categoryReport();
const bankTx = await db.transactions.toArray();

console.log('── לפני פירוט האשראי ──');
line('עסקאות בנק', bankTx.length);
line('דורשות סיווג', await countNeedingReview(db));
line('currentBalance', formatILS(before.balance.totalAgorot));
line('safeToSpendNow', formatILS(before.safeToSpend.nowAgorot));
console.log('  הוצאה לפי קטגוריה:');
for (const c of beforeCategories) {
  console.log(`    ${c.categoryName.padEnd(26)} ${formatILS(c.amountAgorot).padStart(10)}  (${c.count})`);
}

// ── קליטת קובצי האשראי ───────────────────────────────────────────────
console.log('\n── קובצי אשראי ──');
const cardDir = 'private-data/credit-card';
const cardFiles = readdirSync(cardDir).filter((f) => /\.xlsx?$/i.test(f)).sort();
const sessions: string[] = [];

for (const name of cardFiles) {
  const file = { name, bytes: new Uint8Array(readFileSync(join(cardDir, name))) };
  const preview = await buildCardImportPreview(db, file);

  console.log(`\n  ${name}`);
  line('    כרטיס', `•••${preview.cardLast4}`);
  line('    טווח תאריכים', `${preview.file.dateRange?.from} … ${preview.file.dateRange?.to}`);
  line('    עסקאות', preview.counts.total);
  line('    סך חיובים', formatILS(preview.totalBilledAgorot));
  line('    זיכויים', preview.counts.refunds);
  line('    בתשלומים', preview.counts.installments);
  line('    pending', preview.counts.pending);
  line('    מט״ח', preview.counts.foreignCurrency);
  line('    סכום מוצהר בקובץ', preview.declaredTotalAgorot === null ? '—' : formatILS(preview.declaredTotalAgorot));
  line('    תואם למוצהר', preview.declaredMatches ? '✅' : '⚠️');

  const result = await commitCardImport(db, preview, { fileName: name, now: NOW });
  sessions.push(result.sessionId);
  line('    נקלטו', result.imported);
  // הקישור רץ מחדש על כל העסקאות בכל ייבוא, ולכן המספר מצטבר
  line('    סה״כ מקושרות עד כה', result.linked);
}

// ── קישור והתאמה ─────────────────────────────────────────────────────
snapshot = await repos.loadSnapshot(db, NOW);
const cardTransactions = await db.cardTransactions.toArray();
const cards = await db.cards.toArray();
const matches = matchCardTransactionsToCharges({
  bankTransactions: snapshot.transactions,
  cardTransactions,
  cards,
});

console.log('\n── קישור חיובים ──');
const linkedMatches = matches.filter((m) => m.cardTransactionIds.length > 0);
for (const m of linkedMatches) {
  console.log(
    `  ${m.bankDate}  ${formatILS(m.bankAmountAgorot).padStart(9)}  כרטיס ${m.last4 ?? '—'}  ` +
      `← ${m.cardTransactionIds.length} עסקאות  [${m.confidence}]`,
  );
}
const unresolved = matches.filter((m) => m.cardTransactionIds.length === 0);
console.log(`\n  חיובים ללא פירוט: ${unresolved.length}`);

const cycle = reconcileCardCycle(cardTransactions, matches);
console.log('\n── התאמת מחזור ──');
line('סכום עסקאות הכרטיס', formatILS(cycle.cardTransactionsTotalAgorot));
line('סכום החיובים שקושרו', formatILS(cycle.linkedChargesTotalAgorot));
line('פער', formatILS(cycle.differenceAgorot));
line('עסקאות שלא שויכו', cycle.unlinkedCardTransactions);
console.log(`  ${cycle.summaryHe}`);

// ── אחרי ─────────────────────────────────────────────────────────────
const after = await dashboard();
const afterCategories = await categoryReport();
const doubleCount = checkNoDoubleCounting({
  transactions: snapshot.transactions,
  cardTransactions,
  ...PERIOD,
});

console.log('\n── אחרי פירוט האשראי ──');
line('CardTransactions', cardTransactions.length);
line('בתי עסק שזוהו', new Set(cardTransactions.map((t) => t.merchantNormalized)).size);
line('דורשות סיווג', cardTransactions.filter((t) => t.classificationConfidence < 0.7).length);
line('currentBalance', formatILS(after.balance.totalAgorot));
line('safeToSpendNow', formatILS(after.safeToSpend.nowAgorot));
console.log('  הוצאה לפי קטגוריה:');
for (const c of afterCategories) {
  console.log(`    ${c.categoryName.padEnd(26)} ${formatILS(c.amountAgorot).padStart(10)}  (${c.count})`);
}

// ── בדיקות ───────────────────────────────────────────────────────────
console.log('\n── בדיקות ──');
check(
  'currentBalance לא השתנה',
  after.balance.totalAgorot === before.balance.totalAgorot,
  formatILS(after.balance.totalAgorot),
);
check(
  'safeToSpendNow לא השתנה',
  after.safeToSpend.nowAgorot === before.safeToSpend.nowAgorot,
  formatILS(after.safeToSpend.nowAgorot),
);
check('אין ספירה כפולה', doubleCount.ok, doubleCount.messageHe);
check('כל עסקאות הכרטיס שויכו', cycle.unlinkedCardTransactions === 0);
check('אין פער בהתאמת המחזור', cycle.differenceAgorot === 0);
check(
  'הקטגוריות השתפרו',
  afterCategories.length > beforeCategories.length,
  `${beforeCategories.length} → ${afterCategories.length} קטגוריות`,
);

const undetailedBefore =
  beforeCategories.find((c) => c.categoryId === UNDETAILED_CARD_CATEGORY_ID)?.amountAgorot ?? 0;
const undetailedAfter =
  afterCategories.find((c) => c.categoryId === UNDETAILED_CARD_CATEGORY_ID)?.amountAgorot ?? 0;
check(
  '"לא מפורט" הצטמצם',
  undetailedAfter < undetailedBefore,
  `${formatILS(undetailedBefore)} → ${formatILS(undetailedAfter)}`,
);

// ביטול וייבוא חוזר
const balanceBeforeUndo = (await dashboard()).balance.totalAgorot;
for (const id of sessions) await undoCardImport(db, id);
check('ביטול לא שינה יתרה', (await dashboard()).balance.totalAgorot === balanceBeforeUndo);
check('כל עסקאות הכרטיס נמחקו', (await db.cardTransactions.count()) === 0);

let reimported = 0;
for (const name of cardFiles) {
  const file = { name, bytes: new Uint8Array(readFileSync(join(cardDir, name))) };
  const preview = await buildCardImportPreview(db, file);
  const result = await commitCardImport(db, preview, { fileName: name, now: NOW });
  reimported += result.imported;
}
check('ייבוא חוזר החזיר את אותן עסקאות', reimported === cardTransactions.length);
check(
  'היתרה זהה גם אחרי ייבוא חוזר',
  (await dashboard()).balance.totalAgorot === before.balance.totalAgorot,
);

console.log('');
console.log(fail.length === 0 ? '  שלב 3.5: ✅ עבר' : '  שלב 3.5: ❌ לא עבר');
console.log(`  ${pass.length} בדיקות עברו, ${fail.length} נכשלו\n`);
if (fail.length > 0) {
  for (const f of fail) console.log(`    ❌ ${f}`);
  process.exit(1);
}
