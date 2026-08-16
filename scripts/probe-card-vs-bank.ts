/**
 * בדיקה חד-פעמית: איך חיובי הכרטיס בעו״ש מתייחסים לעסקאות בפירוט?
 * מחזור חודשי אחד, או חיוב נפרד לכל עסקה?
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import * as XLSX from 'xlsx';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;

const { readTable } = await import('../src/import/tabular');
const { detectMapping } = await import('../src/import/columnMapping');
const { parseRows } = await import('../src/import/rows');
const { formatILS } = await import('../src/core/money');

// ── חיובי הכרטיס בעו״ש ───────────────────────────────────────────────
const bankFile = readdirSync('private-data').find((f) => f.endsWith('.csv'))!;
const table = readTable({
  name: bankFile,
  bytes: new Uint8Array(readFileSync(join('private-data', bankFile))),
});
const { rows } = parseRows(table.rows, detectMapping(table.rows));

const charges = rows
  .filter((r) => /חיוב\s+(זמני\s+)?לכרטיס/.test(r.merchant))
  .map((r) => ({
    date: r.date,
    amount: r.amountAgorot,
    last4: r.merchant.match(/(\d{4})\s*$/)?.[1] ?? '?',
  }))
  .sort((a, b) => a.date.localeCompare(b.date));

console.log(`\n── חיובי כרטיס בעו״ש: ${charges.length} ──`);
for (const c of charges) console.log(`  ${c.date}  כרטיס ${c.last4}  ${formatILS(c.amount)}`);

// ── עסקאות מקובצי הכרטיס ─────────────────────────────────────────────
const cardTx: { date: string; amount: number; merchant: string }[] = [];
for (const name of readdirSync('private-data/credit-card')) {
  const wb = XLSX.read(new Uint8Array(readFileSync(join('private-data/credit-card', name))), {
    type: 'array',
    raw: false,
  });
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;
  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false });
  for (const row of raw.slice(3)) {
    const date = String(row[0] ?? '');
    if (!/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(date)) continue;
    const billed = String(row[3] ?? '').replace(/[₪,\s]/g, '');
    const [d, m, y] = date.split('/');
    cardTx.push({
      date: `20${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`,
      amount: Math.round(Number(billed) * 100),
      merchant: String(row[1] ?? ''),
    });
  }
}
cardTx.sort((a, b) => a.date.localeCompare(b.date));

console.log(`\n── עסקאות בפירוט הכרטיס: ${cardTx.length} ──`);
for (const t of cardTx) console.log(`  ${t.date}  ${formatILS(t.amount).padStart(9)}  ${t.merchant}`);

// ── האם כל חיוב = סכום של עסקאות באותם ימים? ─────────────────────────
console.log('\n── ניסיון התאמה: חיוב ← קבוצת עסקאות ──');
const used = new Set<number>();
for (const charge of charges) {
  if (charge.last4 !== '3483') continue;
  // מחפשים תת-קבוצה של עסקאות שטרם שויכו, בחלון של 5 ימים אחורה
  const candidates = cardTx
    .map((t, i) => ({ ...t, i }))
    .filter((t) => !used.has(t.i) && t.date <= charge.date && t.date >= addDays(charge.date, -6));

  const found = subsetSum(candidates, charge.amount);
  if (found) {
    found.forEach((t) => used.add(t.i));
    console.log(
      `  ✅ ${charge.date} ${formatILS(charge.amount).padStart(9)} = ${found
        .map((t) => `${t.merchant.slice(0, 18)} ${formatILS(t.amount)}`)
        .join('  +  ')}`,
    );
  } else {
    console.log(`  ❌ ${charge.date} ${formatILS(charge.amount).padStart(9)} — לא נמצאה התאמה`);
  }
}
const unmatched = cardTx.filter((_, i) => !used.has(i));
console.log(`\n  עסקאות כרטיס שלא שויכו: ${unmatched.length}`);
for (const t of unmatched) console.log(`    ${t.date} ${formatILS(t.amount)} ${t.merchant}`);

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function subsetSum<T extends { amount: number }>(items: T[], target: number): T[] | null {
  const n = items.length;
  for (let mask = 1; mask < 1 << Math.min(n, 12); mask++) {
    let sum = 0;
    const chosen: T[] = [];
    for (let i = 0; i < Math.min(n, 12); i++) {
      if (mask & (1 << i)) {
        sum += items[i]!.amount;
        chosen.push(items[i]!);
      }
    }
    if (sum === target) return chosen;
  }
  return null;
}
