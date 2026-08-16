/**
 * מציץ במבנה של קובץ מ-`private-data/` בלי לייבא אותו.
 *
 * מציג כותרות, גיליונות וספירות בלבד — כדי לזהות **סוג** של קובץ.
 * סכומים ושמות בתי עסק אינם מודפסים.
 *
 *   npx vite-node scripts/inspect-file.ts private-data/<קובץ>
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;

const { readTable, detectFormat } = await import('../src/import/tabular');
const { detectMapping, COLUMN_ROLE_LABELS_HE } = await import('../src/import/columnMapping');
const { parseRows } = await import('../src/import/rows');

const filePath = process.argv[2];
if (!filePath || !filePath.includes('private-data')) {
  console.error('שימוש: npx vite-node scripts/inspect-file.ts private-data/<קובץ>');
  process.exit(1);
}
const absolute = resolve(filePath);
if (!existsSync(absolute)) {
  console.error(`⛔ לא נמצא: ${filePath}`);
  process.exit(1);
}

const bytes = new Uint8Array(readFileSync(absolute));
const name = filePath.split(/[\\/]/).pop() ?? filePath;

console.log(`\n── ${name} ──`);
console.log(`  גודל: ${(bytes.length / 1024).toFixed(1)} KB`);
console.log(`  פורמט: ${detectFormat({ name, bytes })}`);

const table = readTable({ name, bytes });
console.log(`  קידוד: ${table.encoding}`);
console.log(`  גיליון: ${table.sheetName ?? '(לא רלוונטי)'}`);
console.log(`  שורות: ${table.rows.length}`);

const mapping = detectMapping(table.rows);
const header = mapping.headerRowIndex === null ? null : table.rows[mapping.headerRowIndex];
console.log(`  שורת כותרת: ${mapping.headerRowIndex === null ? '(אין)' : mapping.headerRowIndex + 1}`);
console.log('  עמודות:');
mapping.roles.forEach((role, i) => {
  console.log(`    [${i}] ${(header?.[i] ?? `עמודה ${i + 1}`).padEnd(24).slice(0, 24)} → ${COLUMN_ROLE_LABELS_HE[role]}`);
});

const parsed = parseRows(table.rows, mapping);
const dates = parsed.rows.map((r) => r.date).sort();
console.log(`  עסקאות שפוענחו: ${parsed.rows.length}  (נכשלו: ${parsed.failures.length})`);
console.log(`  טווח תאריכים: ${dates[0] ?? '—'} … ${dates.at(-1) ?? '—'}`);
console.log(`  עמודת יתרה: ${mapping.roles.includes('balance') ? 'יש' : 'אין'}`);

// ── האם זה כרטיס אשראי או חשבון בנק? ────────────────────────────────
const headerText = (header ?? []).join(' ');
const CREDIT_CARD_HINTS = ['שם בית העסק', 'סכום חיוב', 'מועד חיוב', 'סוג עסקה', 'תשלומים', '4 ספרות'];
const BANK_HINTS = ['יתרה', 'אסמכתה', 'ערוץ ביצוע', 'יום ערך'];
const creditScore = CREDIT_CARD_HINTS.filter((h) => headerText.includes(h)).length;
const bankScore = BANK_HINTS.filter((h) => headerText.includes(h)).length;

console.log(
  `\n  ⇒ סוג הקובץ: ${
    creditScore > bankScore ? '💳 פירוט כרטיס אשראי' : bankScore > 0 ? '🏦 חשבון עו״ש' : '❓ לא ברור'
  }  (רמזי אשראי: ${creditScore}, רמזי בנק: ${bankScore})`,
);
