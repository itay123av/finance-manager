/**
 * קליטת כל היסטוריית העו״ש מכל הקבצים שב-`private-data/`, ודוח מאוחד.
 *
 * מה הוא עושה:
 *  1. סורק את כל הקבצים בתיקייה (ללא תת-תיקיית כרטיסי האשראי).
 *  2. מפריד קובצי כרטיס אשראי ומדווח עליהם בלי לקלוט אותם.
 *  3. מסדר את קובצי העו״ש כרונולוגית לפי טווח התאריכים שלהם.
 *  4. קולט אותם בזה אחר זה — כפילויות בין קבצים חופפים נדחות אוטומטית.
 *  5. מבצע reconciliation לכל קובץ ולשרשרת כולה.
 *  6. מדפיס דוח מאוחד.
 *
 * ⚠️ קורא read-only. בסיס הנתונים בזיכרון בלבד ונעלם בסיום.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;

const { FinanceDatabase } = await import('../src/data/db');
const repos = await import('../src/data/repositories');
const { commitImport, countNeedingReview } = await import('../src/data/imports');
const { buildImportPreview } = await import('../src/import/pipeline');
const { buildDashboard } = await import('../src/core/dashboard');
const { reconcile } = await import('../src/core/reconcile');
const { monthlyExpenseAverage, monthlyIncomeAverage } = await import('../src/core/averages');
const { periodSummary } = await import('../src/core/periods');
const { confidenceLabelHe } = await import('../src/core/confidence');
const { monthEnd, monthStart, eachMonth, formatMonthHe, monthOf } = await import('../src/core/dates');
const { formatILS, fromShekels } = await import('../src/core/money');

const DIR = 'private-data';
const NOW = new Date('2026-08-07T12:00:00Z');

if (!existsSync(DIR)) {
  console.error('⛔ התיקייה private-data/ לא קיימת');
  process.exit(1);
}

const files = readdirSync(DIR, { withFileTypes: true })
  .filter((e) => e.isFile() && /\.(csv|xls|xlsx)$/i.test(e.name))
  .map((e) => ({ name: e.name, bytes: new Uint8Array(readFileSync(join(DIR, e.name))) }));

console.log('\n═══ קליטת היסטוריית עו״ש ═══\n');
console.log(`נמצאו ${files.length} קבצים ב-${DIR}/\n`);

const db = new FinanceDatabase(`consolidate-${Date.now()}`);
await db.open();
await repos.ensureCategories(db);

// ── שלב 1: סיווג הקבצים והסרת כפילויות ──────────────────────────────
interface Candidate {
  name: string;
  bytes: Uint8Array;
  from: string;
  to: string;
  count: number;
  opening: number | null;
  closing: number | null;
  encoding: string;
  format: string;
  consistent: boolean;
}

const bankFiles: Candidate[] = [];
const creditCardFiles: { name: string; rows: number }[] = [];
const seenHashes = new Map<string, string>();

const snapshot0 = await repos.loadSnapshot(db, NOW);
for (const file of files) {
  let dry;
  try {
    dry = buildImportPreview({
      file,
      accountId: repos.BANK_ACCOUNT_ID,
      existing: [],
      context: { merchantRules: [], categories: snapshot0.categories },
    });
  } catch (error) {
    console.log(`  ⚠️  ${file.name} — לא ניתן לקרוא (${(error as Error).message})`);
    continue;
  }

  if (dry.statementKind.kind === 'credit_card') {
    creditCardFiles.push({ name: file.name, rows: dry.counts.parsed });
    continue;
  }

  // קבצים זהים בתוכן — מספיק לקלוט אחד
  const signature = `${dry.counts.parsed}:${dry.dateRange?.from}:${dry.dateRange?.to}:${dry.statementClosingBalanceAgorot}`;
  const twin = seenHashes.get(signature);
  if (twin) {
    console.log(`  ↔️  ${file.name} — זהה בתוכן ל-${twin}, מדולג`);
    continue;
  }
  seenHashes.set(signature, file.name);

  bankFiles.push({
    name: file.name,
    bytes: file.bytes,
    from: dry.dateRange?.from ?? '',
    to: dry.dateRange?.to ?? '',
    count: dry.counts.parsed,
    opening: dry.inferredOpeningBalanceAgorot,
    closing: dry.statementClosingBalanceAgorot,
    encoding: dry.encoding,
    format: dry.format,
    consistent: dry.ledgerConsistent,
  });
}

// ── שלב 2: סדר כרונולוגי ─────────────────────────────────────────────
bankFiles.sort((a, b) => a.from.localeCompare(b.from));

console.log('\n── קובצי עו״ש (בסדר כרונולוגי) ──');
for (const f of bankFiles) {
  console.log(`\n  ${f.name}`);
  console.log(`    פורמט/קידוד: ${f.format} / ${f.encoding}`);
  console.log(`    טווח: ${f.from} … ${f.to}`);
  console.log(`    עסקאות: ${f.count}`);
  console.log(`    יתרת פתיחה: ${f.opening === null ? '—' : formatILS(f.opening)}`);
  console.log(`    יתרת סיום: ${f.closing === null ? '—' : formatILS(f.closing)}`);
  console.log(`    שרשרת יתרות: ${f.consistent ? '✅ תקינה' : '⚠️ שבורה'}`);
}

// ── שלב 3: חפיפות ────────────────────────────────────────────────────
console.log('\n── חפיפות בין קבצים ──');
let overlaps = 0;
for (let i = 1; i < bankFiles.length; i++) {
  const previous = bankFiles[i - 1]!;
  const current = bankFiles[i]!;
  if (current.from <= previous.to) {
    overlaps++;
    console.log(`  ⚠️ ${previous.name} ↔ ${current.name}: חופפים ב-${current.from}…${previous.to}`);
  }
}
if (bankFiles.length < 2) console.log('  אין מה להשוות — קובץ עו״ש אחד בלבד.');
else if (overlaps === 0) console.log('  אין חפיפות.');

if (bankFiles.length === 0) {
  console.log('\n⛔ לא נמצא אף קובץ עו״ש לקליטה.\n');
  process.exit(1);
}

// ── שלב 4: אונבורדינג לפי יתרת הפתיחה של הקובץ הראשון ────────────────
const first = bankFiles[0]!;
await repos.completeOnboarding(db, {
  bankBalanceAgorot: first.opening ?? 0,
  cashBalanceAgorot: 0,
  safetyBufferAgorot: 50_000,
  targetAgorot: fromShekels(5000),
  milestones: [fromShekels(1000), fromShekels(2500), fromShekels(5000)],
  estimatedMonthlySpendAgorot: fromShekels(400),
  openingDate: first.from,
});

// ── שלב 5: קליטה בזה אחר זה ──────────────────────────────────────────
console.log('\n── קליטה ──');
let totalImported = 0;
let totalDuplicates = 0;

for (const f of bankFiles) {
  const snapshot = await repos.loadSnapshot(db, NOW);
  const preview = buildImportPreview({
    file: { name: f.name, bytes: f.bytes },
    accountId: repos.BANK_ACCOUNT_ID,
    existing: snapshot.transactions,
    context: { merchantRules: await db.merchantRules.toArray(), categories: snapshot.categories },
  });

  if (preview.blockedReason !== null) {
    console.log(`  ⛔ ${f.name} — חסום (${preview.blockedReason})`);
    continue;
  }

  const result = await commitImport(db, {
    preview,
    accountId: repos.BANK_ACCOUNT_ID,
    selectedLines: new Set(preview.rows.filter((r) => r.selected).map((r) => r.sourceLine)),
    now: NOW,
  });

  totalImported += result.imported;
  totalDuplicates += preview.counts.exactDuplicates;

  const recon = reconcile({
    openingBalanceAgorot: f.opening ?? 0,
    openingDate: f.from,
    importedIncomeAgorot: preview.rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amountAgorot, 0),
    importedExpenseAgorot: preview.rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amountAgorot, 0),
    statementClosingBalanceAgorot: preview.statementClosingBalanceAgorot,
    existingNetInRangeAgorot: 0,
    rowsFailed: preview.counts.failed,
    duplicatesSkipped: preview.counts.exactDuplicates,
    dateRange: preview.dateRange,
  });

  console.log(
    `  ✅ ${f.name}: נקלטו ${result.imported}, כפולות ${preview.counts.exactDuplicates}, ` +
      `התאמה ${recon.matches ? '✅ פער ₪0' : `⚠️ פער ${formatILS(recon.differenceAgorot)}`}`,
  );
}

// ── שלב 6: דוח מאוחד ─────────────────────────────────────────────────
const snapshot = await repos.loadSnapshot(db, NOW);
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
});

const transactions = snapshot.transactions;
const dates = transactions.map((t) => t.date).sort();
const firstDate = dates[0]!;
const lastDate = dates.at(-1)!;
const months = eachMonth(monthOf(firstDate), monthOf(lastDate));

const totalIncome = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amountAgorot, 0);
const totalExpense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amountAgorot, 0);

const line = (label: string, value: string | number) =>
  console.log(`  ${label.padEnd(30, '.')} ${value}`);

console.log('\n\n═══ דוח מאוחד ═══\n');
line('עסקה ראשונה', firstDate);
line('עסקה אחרונה', lastDate);
line('חודשי היסטוריה', months.length);
line('מספר עסקאות', transactions.length);
line('סך הכנסות', formatILS(totalIncome));
line('סך הוצאות', formatILS(totalExpense));
line('יתרה נוכחית', formatILS(dashboard.balance.totalAgorot));
line('כפילויות שנדחו', totalDuplicates);
line('דורשות סיווג', await countNeedingReview(db));

console.log('\n── לפי חודש ──');
console.log('  חודש          נכנס        יצא         נטו');
for (const month of months) {
  const summary = periodSummary(transactions, monthStart(month), monthEnd(month));
  console.log(
    `  ${formatMonthHe(month).padEnd(14)}` +
      `${formatILS(summary.incomeAgorot).padStart(10)}  ` +
      `${formatILS(summary.expenseAgorot).padStart(10)}  ` +
      `${(summary.netAgorot >= 0 ? '+' : '') + formatILS(summary.netAgorot)}`,
  );
}

const expenseAvg = monthlyExpenseAverage(transactions, snapshot.today);
const incomeAvg = monthlyIncomeAverage(transactions, snapshot.today);

console.log('\n── ממוצעים ורמת ביטחון ──');
line('חציון הוצאות חודשי', expenseAvg.agorot === null ? '—' : formatILS(expenseAvg.agorot));
line('חודשים מלאים בנתונים', expenseAvg.monthsUsed);
line('רמת ביטחון (הוצאות)', confidenceLabelHe(expenseAvg.confidence));
line('חציון הכנסות חודשי', incomeAvg.agorot === null ? '—' : formatILS(incomeAvg.agorot));
line('רמת ביטחון (הכנסות)', confidenceLabelHe(incomeAvg.confidence));

console.log('\n── מצב נוכחי ──');
line('reservedForFutureMonths', formatILS(dashboard.safeToSpend.breakdown.reservedForFutureMonthsAgorot));
line('safeToSpendNow', formatILS(dashboard.safeToSpend.nowAgorot));
line('safeToSpendWeek', formatILS(dashboard.safeToSpend.weekAgorot));
line('סכום ביטחון', formatILS(dashboard.safeToSpend.breakdown.safetyBufferAgorot));
line('יעד', formatILS(dashboard.goalProgress.targetAgorot));
line('התקדמות', `${dashboard.goalProgress.progressPct}%`);
line('נשאר עד היעד', formatILS(dashboard.goalProgress.gapAgorot));
line('תאריך יעד משוער', dashboard.goalProjection.reachMonth ?? 'לא מגיעים בקצב הנוכחי');

if (creditCardFiles.length > 0) {
  console.log('\n── 💳 קובצי כרטיס אשראי שהופרדו ולא נקלטו ──');
  for (const c of creditCardFiles) console.log(`  · ${c.name}  (${c.rows} עסקאות)`);
  console.log('\n  לא נקלטו בכוונה: חיוב הכרטיס כבר מופיע כשורה מרוכזת בעו״ש.');
}

console.log('');
