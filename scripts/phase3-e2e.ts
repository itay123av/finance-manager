/**
 * אימות שלב 3 מקצה לקצה, מול קובץ הבנק האמיתי.
 *
 * מריץ את כל 11 השלבים דרך בסיס נתונים אמיתי (בזיכרון):
 *   parse → mapping → direction → normalization → dedupe → classification
 *   → preview → import → reconciliation → undo → re-import
 *
 * ⚠️ הקובץ נקרא read-only מ-`private-data/` ואינו משתנה. בסיס הנתונים
 * הוא fake-indexeddb בזיכרון בלבד ונעלם בסיום. הפלט אינו מציג שמות
 * בתי עסק או סכומים בודדים — רק מצרפים.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;

const { FinanceDatabase } = await import('../src/data/db');
const repos = await import('../src/data/repositories');
const { commitImport, undoImport, correctCategoryAndLearn, countNeedingReview } = await import(
  '../src/data/imports'
);
const { buildImportPreview } = await import('../src/import/pipeline');
const { buildDashboard } = await import('../src/core/dashboard');
const { reconcile } = await import('../src/core/reconcile');
const { formatILS, fromShekels } = await import('../src/core/money');

const filePath = process.argv[2];
if (!filePath || !filePath.includes('private-data')) {
  console.error('שימוש: npx vite-node scripts/phase3-e2e.ts private-data/<קובץ>');
  process.exit(1);
}
const absolute = resolve(filePath);
if (!existsSync(absolute)) {
  console.error(`⛔ הקובץ לא נמצא: ${filePath}`);
  process.exit(1);
}

const bytes = new Uint8Array(readFileSync(absolute));
const file = { name: filePath.split(/[\\/]/).pop() ?? 'bank.csv', bytes };

const NOW = new Date('2026-08-07T12:00:00Z');
const pass: string[] = [];
const fail: string[] = [];
const notes: string[] = [];

const check = (label: string, ok: boolean, detail = '') => {
  (ok ? pass : fail).push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`);
};

const db = new FinanceDatabase(`phase3-e2e-${Date.now()}`);
await db.open();

console.log('\n═══ אימות שלב 3 — מקצה לקצה ═══\n');

// ── 1-7. parse → preview ─────────────────────────────────────────────
console.log('▸ שלבים 1–7: parse → mapping → direction → dedupe → classification → preview');

await repos.ensureCategories(db);
let snapshot = await repos.loadSnapshot(db, NOW);

const dryRun = buildImportPreview({
  file,
  accountId: repos.BANK_ACCOUNT_ID,
  existing: [],
  context: { merchantRules: [], categories: snapshot.categories },
});

check('הקובץ פוענח', dryRun.rows.length > 0, `${dryRun.rows.length} עסקאות`);
check('קידוד זוהה', dryRun.encoding !== '', dryRun.encoding);
check('מיפוי עמודות תקין', dryRun.mapping.roles.includes('date'));
check('כיוון הוכרע אוטומטית', dryRun.direction.confidence === 'resolved', dryRun.direction.sourceHe);
check('אין שורות שנכשלו', dryRun.counts.failed === 0, `${dryRun.counts.failed} כשלים`);
check('שרשרת היתרות מתחברת', dryRun.ledgerConsistent);
check('יתרת פתיחה הוסקה מהקובץ', dryRun.inferredOpeningBalanceAgorot !== null);
check('התצוגה המקדימה אינה חסומה', dryRun.blockedReason === null);

const openingBalanceAgorot = dryRun.inferredOpeningBalanceAgorot ?? 0;
const openingDate = dryRun.inferredOpeningDate ?? dryRun.dateRange!.from;

// ── אונבורדינג עם היתרה שהוסקה ────────────────────────────────────────
await repos.completeOnboarding(db, {
  bankBalanceAgorot: openingBalanceAgorot,
  cashBalanceAgorot: 0,
  safetyBufferAgorot: 50_000,
  targetAgorot: fromShekels(5000),
  milestones: [fromShekels(1000), fromShekels(2500), fromShekels(5000)],
  estimatedMonthlySpendAgorot: fromShekels(400),
  openingDate,
});

snapshot = await repos.loadSnapshot(db, NOW);
const preview = buildImportPreview({
  file,
  accountId: repos.BANK_ACCOUNT_ID,
  existing: snapshot.transactions,
  context: { merchantRules: await db.merchantRules.toArray(), categories: snapshot.categories },
});

// ── 8. import ────────────────────────────────────────────────────────
console.log('\n▸ שלב 8: import');
const before = await dashboard();
const commit = await commitImport(db, {
  preview,
  accountId: repos.BANK_ACCOUNT_ID,
  selectedLines: new Set(preview.rows.filter((r) => r.selected).map((r) => r.sourceLine)),
  now: NOW,
});
check('העסקאות נקלטו', commit.imported === preview.counts.fresh, `${commit.imported} עסקאות`);

const after = await dashboard();

// ── 9. reconciliation ────────────────────────────────────────────────
console.log('\n▸ שלב 9: reconciliation');
const recon = reconcile({
  openingBalanceAgorot,
  openingDate,
  importedIncomeAgorot: preview.rows
    .filter((r) => r.type === 'income')
    .reduce((s, r) => s + r.amountAgorot, 0),
  importedExpenseAgorot: preview.rows
    .filter((r) => r.type === 'expense')
    .reduce((s, r) => s + r.amountAgorot, 0),
  statementClosingBalanceAgorot: preview.statementClosingBalanceAgorot,
  existingNetInRangeAgorot: 0,
  rowsFailed: preview.counts.failed,
  duplicatesSkipped: preview.counts.exactDuplicates,
  dateRange: preview.dateRange,
});
check('היתרה תואמת לקובץ', recon.matches, `פער ${formatILS(recon.differenceAgorot)}`);
check(
  'היתרה במערכת = היתרה בקובץ',
  after.balance.totalAgorot === preview.statementClosingBalanceAgorot,
  formatILS(after.balance.totalAgorot),
);

// ── תיקון קטגוריה ולמידה ─────────────────────────────────────────────
const unknown = (await db.transactions.toArray()).find(
  (t) => t.classificationConfidence < 0.7 && t.merchantNormalized !== '',
);
if (unknown) {
  await correctCategoryAndLearn(db, unknown.id, 'cat-shopping', NOW);
  const rules = await db.merchantRules.toArray();
  check('תיקון קטגוריה נלמד', rules.length > 0, `${rules.length} כללים נלמדו`);
} else {
  notes.push('לא נמצאה עסקה עם סיווג לא בטוח לבדיקת הלמידה');
}

// ── 10. undo ─────────────────────────────────────────────────────────
console.log('\n▸ שלב 10: undo');
const undone = await undoImport(db, commit.sessionId);
const afterUndo = await dashboard();

check('הביטול מחק את מה שנקלט', undone.removed === commit.imported, `${undone.removed} נמחקו`);
check('היתרה חזרה לקדמותה', afterUndo.balance.totalAgorot === before.balance.totalAgorot);
check('safeToSpendNow חזר לקדמותו', afterUndo.safeToSpend.nowAgorot === before.safeToSpend.nowAgorot);
check('ההתקדמות ליעד חזרה לקדמותה', afterUndo.goalProgress.progressPct === before.goalProgress.progressPct);
check('לא נשארו עסקאות מהייבוא', (await db.transactions.count()) === 0);

// ── 11. re-import ────────────────────────────────────────────────────
console.log('\n▸ שלב 11: import מחדש');
snapshot = await repos.loadSnapshot(db, NOW);
const second = buildImportPreview({
  file,
  accountId: repos.BANK_ACCOUNT_ID,
  existing: snapshot.transactions,
  context: { merchantRules: await db.merchantRules.toArray(), categories: snapshot.categories },
});
const recommit = await commitImport(db, {
  preview: second,
  accountId: repos.BANK_ACCOUNT_ID,
  selectedLines: new Set(second.rows.filter((r) => r.selected).map((r) => r.sourceLine)),
  now: NOW,
});
const final = await dashboard();

check('אותו מספר עסקאות', recommit.imported === commit.imported);
check('אותה יתרה', final.balance.totalAgorot === after.balance.totalAgorot);
check('אותן הכנסות', final.month.incomeAgorot === after.month.incomeAgorot);
check('אותן הוצאות', final.month.expenseAgorot === after.month.expenseAgorot);

// ── ייבוא כפול ────────────────────────────────────────────────────────
snapshot = await repos.loadSnapshot(db, NOW);
const third = buildImportPreview({
  file,
  accountId: repos.BANK_ACCOUNT_ID,
  existing: snapshot.transactions,
  context: { merchantRules: [], categories: snapshot.categories },
});
check(
  'ייבוא חוזר מזהה הכל ככפול',
  third.counts.fresh === 0 && third.counts.exactDuplicates === third.counts.parsed,
  `${third.counts.exactDuplicates} כפולות`,
);

// ── דוח סופי ──────────────────────────────────────────────────────────
const income = preview.rows.filter((r) => r.type === 'income');
const expense = preview.rows.filter((r) => r.type === 'expense');
const line = (label: string, value: string | number) =>
  console.log(`  ${label.padEnd(32, '.')} ${value}`);

console.log('\n═══ סיכום ═══\n');
line('יתרת פתיחה שזוהתה', formatILS(openingBalanceAgorot));
line('תאריך יתרת הפתיחה', openingDate);
line('יתרה נוכחית במערכת', formatILS(final.balance.totalAgorot));
line('יתרה לפי הקובץ', formatILS(preview.statementClosingBalanceAgorot ?? 0));
line('פער', formatILS(recon.differenceAgorot));
line('סך הכנסות', `${income.length} · ${formatILS(income.reduce((s, r) => s + r.amountAgorot, 0))}`);
line('סך הוצאות', `${expense.length} · ${formatILS(expense.reduce((s, r) => s + r.amountAgorot, 0))}`);
line('מספר עסקאות', await db.transactions.count());
line('דורשות בדיקת סיווג', await countNeedingReview(db));
line('reservedForFutureMonths', formatILS(final.safeToSpend.breakdown.reservedForFutureMonthsAgorot));
line('safeToSpendNow', formatILS(final.safeToSpend.nowAgorot));
line('safeToSpendWeek', formatILS(final.safeToSpend.weekAgorot));
line('סכום ביטחון', formatILS(final.safeToSpend.breakdown.safetyBufferAgorot));
line('יעד', formatILS(final.goalProgress.targetAgorot));
line('התקדמות ליעד', `${final.goalProgress.progressPct}%`);
line('נשאר עד היעד', formatILS(final.goalProgress.gapAgorot));
line('תאריך יעד משוער', final.goalProjection.reachMonth ?? 'לא מגיעים בקצב הנוכחי');
line('תקציב חודשי', formatILS(final.budgetPlan.monthlySpendAgorot));

console.log('');
if (notes.length > 0) {
  console.log('  הערות:');
  for (const note of notes) console.log(`    · ${note}`);
  console.log('');
}

console.log(fail.length === 0 ? '  שלב 3: ✅ עבר' : '  שלב 3: ❌ לא עבר');
console.log(`  ${pass.length} בדיקות עברו, ${fail.length} נכשלו\n`);
if (fail.length > 0) {
  for (const f of fail) console.log(`    ❌ ${f}`);
  process.exit(1);
}

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
