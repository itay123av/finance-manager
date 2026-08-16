/**
 * כלי אימות לקובץ בנק אמיתי.
 *
 * מריצים אותו כך:
 *   npx vite-node scripts/verify-bank-file.ts private-data/<שם הקובץ>
 *
 * ⚠️ כללי עבודה עם הקובץ האמיתי:
 *  · הקובץ נקרא **לקריאה בלבד** ואינו משתנה.
 *  · הוא אינו מועתק לשום מקום ואינו נכנס ל-git (התיקייה ב-.gitignore).
 *  · הכלי הזה אינו חלק מ-production build — הוא יושב ב-`scripts/`.
 *  · הפלט מציג 10 שורות דוגמה בלבד; אפשר להסתיר גם אותן עם ‎--redact.
 *  · שום דבר לא נכתב לבסיס נתונים. זו קריאה וניתוח בלבד.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

// טבלאות HTML שמתחזות ל-Excel דורשות DOMParser, שאינו קיים ב-Node
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;

const { readTable } = await import('../src/import/tabular');
const { detectMapping, COLUMN_ROLE_LABELS_HE } = await import('../src/import/columnMapping');
const { parseRows, FAILURE_LABELS_HE } = await import('../src/import/rows');
const { findDirectionCandidates, resolveDirection, suggestIncomeValue } = await import(
  '../src/import/direction'
);
const { classifyDuplicates } = await import('../src/import/dedupe');
const { classifyMerchant, needsReview } = await import('../src/import/classify');
const { DEFAULT_CATEGORIES } = await import('../src/content/categories.seed');
const { reconcile, walkStatement } = await import('../src/core/reconcile');
const { detectStatementKind, redactAccountNumbers } = await import('../src/import/statementKind');
const { formatILS } = await import('../src/core/money');

const args = process.argv.slice(2);
const redact = args.includes('--redact');
const filePath = args.find((a) => !a.startsWith('--'));

if (!filePath) {
  console.error('שימוש: npx vite-node scripts/verify-bank-file.ts private-data/<קובץ> [--redact]');
  process.exit(1);
}

const absolute = resolve(filePath);
if (!absolute.includes('private-data')) {
  console.error('⛔ הכלי קורא קבצים מתוך private-data/ בלבד.');
  process.exit(1);
}
if (!existsSync(absolute)) {
  console.error(`⛔ הקובץ לא נמצא: ${filePath}`);
  process.exit(1);
}

const bytes = new Uint8Array(readFileSync(absolute));
const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

const line = (label: string, value: string | number) =>
  console.log(`  ${label.padEnd(28, '.')} ${value}`);

console.log('\n═══ דוח אימות קובץ בנק ═══\n');
line('קובץ', fileName);
line('גודל', `${(bytes.length / 1024).toFixed(1)} KB`);

// ── 1. פענוח ─────────────────────────────────────────────────────────
const table = readTable({ name: fileName, bytes });
line('פורמט שזוהה', table.format);
line('קידוד', table.encoding);
// שם הגיליון מכיל לא פעם מספר חשבון מלא — לא מדפיסים אותו כמו שהוא
line('גיליון', table.sheetName === null ? '(לא רלוונטי)' : redactAccountNumbers(table.sheetName));
line('סה״כ שורות בקובץ', table.rows.length);

// ── 2. מיפוי עמודות ──────────────────────────────────────────────────
const mapping = detectMapping(table.rows);
const headerRow = mapping.headerRowIndex === null ? null : table.rows[mapping.headerRowIndex];

// ── סוג הדוח — בנק או כרטיס אשראי ────────────────────────────────────
const kind = detectStatementKind({
  headerCells: headerRow ?? [],
  hasBalanceColumn: mapping.roles.includes('balance'),
});
line('סוג הדוח', kind.kind === 'credit_card' ? '💳 כרטיס אשראי' : kind.kind === 'bank' ? '🏦 עו״ש' : '❓ לא ברור');

if (kind.kind === 'credit_card') {
  console.log(`\n  ⛔ ${kind.reasonHe}`);
  console.log('     קובץ כזה לא נקלט לחשבון בנק — הוא היה סופר כל רכישה פעמיים,');
  console.log('     כי חיוב הכרטיס כבר מופיע כשורה אחת מרוכזת בדוח העו״ש.');
  console.log(`\n     רמזים שזוהו: ${kind.signals.creditCard.join(', ')}`);
  const dataRows = table.rows.slice((mapping.headerRowIndex ?? -1) + 1);
  console.log(`     שורות בקובץ: ${dataRows.length}`);
  console.log('\n═══ סוף הדוח — הקובץ לא נקלט ═══\n');
  process.exit(0);
}

console.log('\n── מיפוי עמודות ──');
line('שורת כותרת', mapping.headerRowIndex === null ? '(אין)' : String(mapping.headerRowIndex + 1));
mapping.roles.forEach((role, index) => {
  const header = headerRow?.[index] ?? `עמודה ${index + 1}`;
  console.log(`  [${index}] ${header.padEnd(22).slice(0, 22)} → ${COLUMN_ROLE_LABELS_HE[role]}`);
});

// ── 3. שורות וכיוון ──────────────────────────────────────────────────
const parsed = parseRows(table.rows, mapping);
const candidates = findDirectionCandidates(table.rows, mapping, headerRow ?? null);
const direction = resolveDirection({
  hasDebitCredit: parsed.hasDebitCredit,
  sawNegativeAmount: parsed.sawNegativeAmount,
  hasRows: parsed.rows.length > 0,
  rule: { kind: 'auto' },
  candidates,
});

console.log('\n── כיוון העסקאות ──');
line('הוכרע?', direction.confidence === 'resolved' ? 'כן' : '⚠️ לא');
line('מקור', direction.sourceHe);
if (direction.confidence === 'unresolved') {
  console.log(`\n  ⚠️  ${direction.messageHe}\n`);
  if (candidates.length > 0) {
    console.log('  עמודות שיכולות להכריע:');
    for (const candidate of candidates) {
      console.log(
        `    · ${candidate.header} → ערכים: ${candidate.distinctValues.join(' / ')}` +
          `  (מוצע כהכנסה: "${suggestIncomeValue(candidate)}")`,
      );
    }
  }
}

// ── 4. סיווג וכפילויות ───────────────────────────────────────────────
const context = { merchantRules: [], categories: DEFAULT_CATEGORIES };
const verdicts = classifyDuplicates({ accountId: 'acc-bank', rows: parsed.rows, existing: [] });
const classified = parsed.rows.map((row, i) => ({
  ...row,
  verdict: verdicts[i]!.verdict,
  classification: classifyMerchant(row.merchantNormalized, row.type, context),
}));

const income = classified.filter((r) => r.type === 'income');
const expense = classified.filter((r) => r.type === 'expense');

console.log('\n── תוצאות ──');
line('עסקאות שזוהו', classified.length);
if (direction.confidence === 'resolved') {
  line('הכנסות', `${income.length}  (${formatILS(income.reduce((s, r) => s + r.amountAgorot, 0))})`);
  line('הוצאות', `${expense.length}  (${formatILS(expense.reduce((s, r) => s + r.amountAgorot, 0))})`);
} else {
  // הצגת פילוח כאן הייתה מטעה: הוא נגזר מברירת מחדל שטרם אושרה
  line('הכנסות / הוצאות', '⚠️ לא ניתן לקבוע עד שיוכרע הכיוון');
}
line('שורות שנכשלו', parsed.failures.length);
line('כפילויות', classified.filter((r) => r.verdict !== 'new').length);
line('סווגו בביטחון גבוה', classified.filter((r) => !needsReview(r.classification.confidence)).length);
line('דורשות בדיקה', classified.filter((r) => needsReview(r.classification.confidence)).length);

const dates = classified.map((r) => r.date).sort();
line('טווח תאריכים', dates.length > 0 ? `${dates[0]} … ${dates[dates.length - 1]}` : '(אין)');

if (parsed.failures.length > 0) {
  console.log('\n  שורות שנכשלו:');
  for (const failure of parsed.failures.slice(0, 15)) {
    console.log(`    שורה ${failure.sourceLine}: ${FAILURE_LABELS_HE[failure.reason]}`);
  }
  if (parsed.failures.length > 15) console.log(`    ... ועוד ${parsed.failures.length - 15}`);
}

// ── 5. דוגמאות ───────────────────────────────────────────────────────
console.log('\n── 10 עסקאות לדוגמה (אחרי נירמול) ──');
const categoryName = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.name]));
for (const row of classified.slice(0, 10)) {
  const merchant = redact ? '•'.repeat(10) : row.merchant.slice(0, 26).padEnd(26);
  const amount = redact ? '•••' : formatILS(row.amountAgorot).padStart(10);
  const arrow =
    direction.confidence === 'resolved' ? (row.type === 'income' ? '↓ נכנס' : '↑ יצא ') : '? ??? ';
  const category = categoryName.get(row.classification.categoryId) ?? '?';
  const flag = needsReview(row.classification.confidence) ? ' ⚠' : '  ';
  console.log(`  ${row.date}  ${arrow} ${amount}  ${merchant} ${category}${flag}`);
}

// ── 6. התאמת יתרה ────────────────────────────────────────────────────
const withBalance = classified.filter((r) => r.statementBalanceAgorot !== undefined);
const closing = withBalance.length > 0 ? true : null;

console.log('\n── התאמת יתרה ──');
if (direction.confidence === 'unresolved') {
  console.log('  ⚠️ אי אפשר להתאים יתרה לפני שהוכרע מה הכנסה ומה הוצאה.');
} else if (closing === null) {
  console.log('  בקובץ אין עמודת יתרה — אי אפשר להשוות.');
} else {
  // ── הליכה עסקה-עסקה: מסיקה את יתרת הפתיחה מהקובץ עצמו ──
  const walk = walkStatement(
    classified.map((row) => ({
      date: row.date,
      signedAmountAgorot: row.type === 'income' ? row.amountAgorot : -row.amountAgorot,
      statementBalanceAgorot: row.statementBalanceAgorot!,
    })),
  );

  line('סדר השורות בקובץ', walk.chronological ? 'מהישן לחדש' : 'מהחדש לישן');
  line('שרשרת היתרות תקינה?', walk.consistent ? '✅ כן — כל העסקאות מתחברות' : '⚠️ לא');
  if (!walk.consistent) {
    console.log(`\n  ${walk.breaks.length} נקודות שבירה:`);
    for (const b of walk.breaks.slice(0, 10)) {
      console.log(
        `    שורה ${b.index} (${b.date}): צפוי ${formatILS(b.expectedAgorot)}, בפועל ${formatILS(b.actualAgorot)}, סטייה ${formatILS(b.driftAgorot)}`,
      );
    }
  }
  line('יתרת פתיחה שהוסקה', formatILS(walk.inferredOpeningBalanceAgorot ?? 0));
  line('תאריך יתרת הפתיחה', walk.openingDate ?? '—');
  line('יתרת סיום בקובץ', formatILS(walk.closingBalanceAgorot ?? 0));

  console.log('');
  const openingBalanceAgorot = Number(
    process.env.OPENING_BALANCE_AGOROT ?? String(walk.inferredOpeningBalanceAgorot ?? 0),
  );
  const openingDate = process.env.OPENING_DATE ?? walk.openingDate ?? dates[0] ?? '1970-01-01';

  const result = reconcile({
    openingBalanceAgorot,
    openingDate,
    importedIncomeAgorot: income.reduce((s, r) => s + r.amountAgorot, 0),
    importedExpenseAgorot: expense.reduce((s, r) => s + r.amountAgorot, 0),
    // ⚠️ הכרונולוגית, לא האחרונה בקובץ
    statementClosingBalanceAgorot: walk.closingBalanceAgorot,
    existingNetInRangeAgorot: 0,
    rowsFailed: parsed.failures.length,
    duplicatesSkipped: 0,
    dateRange: dates.length > 0 ? { from: dates[0]!, to: dates.at(-1)! } : null,
  });

  line('יתרת פתיחה בשימוש', formatILS(openingBalanceAgorot));
  line('צפוי לפי החישוב', formatILS(result.expectedAgorot));
  line('יתרת סיום כרונולוגית', formatILS(walk.closingBalanceAgorot ?? 0));
  line('פער', formatILS(result.differenceAgorot));
  console.log(`\n  ${result.summaryHe}`);
  for (const cause of result.causes) console.log(`    · ${cause.explanationHe}`);
  console.log('\n  ℹ️  לא נוצרה התאמת יתרה. היא תיווצר רק באישור מפורש שלך.');
}

console.log('\n═══ סוף הדוח — שום דבר לא נכתב לבסיס הנתונים ═══\n');
