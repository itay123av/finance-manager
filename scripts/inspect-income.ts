/**
 * מציג את **ההכנסות בלבד** מקובץ עו״ש.
 *
 * ההכנסות הן מה שקובע את התקציב ואת תאריך היעד, ולכן שווה לראות
 * אותן במפורש לפני שבונים עליהן. הוצאות אינן מודפסות.
 *
 *   npx vite-node scripts/inspect-income.ts private-data/<קובץ>
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;

const { readTable } = await import('../src/import/tabular');
const { detectMapping } = await import('../src/import/columnMapping');
const { parseRows } = await import('../src/import/rows');
const { formatILS } = await import('../src/core/money');
const { monthOf } = await import('../src/core/dates');

const filePath = process.argv[2];
if (!filePath || !filePath.includes('private-data')) {
  console.error('שימוש: npx vite-node scripts/inspect-income.ts private-data/<קובץ>');
  process.exit(1);
}
const absolute = resolve(filePath);
if (!existsSync(absolute)) {
  console.error(`⛔ לא נמצא: ${filePath}`);
  process.exit(1);
}

const bytes = new Uint8Array(readFileSync(absolute));
const table = readTable({ name: filePath, bytes });
const mapping = detectMapping(table.rows);
const { rows } = parseRows(table.rows, mapping);

const income = rows.filter((r) => r.type === 'income').sort((a, b) => a.date.localeCompare(b.date));

console.log(`\n── הכנסות בלבד (${income.length}) ──\n`);
for (const row of income) {
  console.log(`  ${row.date}  ${formatILS(row.amountAgorot).padStart(9)}   ${row.merchant}`);
}

console.log('\n── סיכום לפי חודש ──');
const byMonth = new Map<string, number>();
for (const row of income) {
  byMonth.set(monthOf(row.date), (byMonth.get(monthOf(row.date)) ?? 0) + row.amountAgorot);
}
for (const [month, total] of [...byMonth].sort()) {
  console.log(`  ${month}  ${formatILS(total).padStart(9)}`);
}
console.log('');
