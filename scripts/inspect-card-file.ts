/**
 * ניתוח read-only של קובץ פירוט כרטיס אשראי.
 *
 * מדפיס את המבנה המלא — כל השורות והעמודות — כדי שאפשר יהיה להבין
 * מה הקובץ באמת מכיל לפני שבונים עליו. לא כותב לשום מקום.
 *
 *   npx vite-node scripts/inspect-card-file.ts private-data/credit-card/<קובץ>
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';

const filePath = process.argv[2];
if (!filePath || !filePath.includes('private-data')) {
  console.error('שימוש: npx vite-node scripts/inspect-card-file.ts private-data/...');
  process.exit(1);
}
const absolute = resolve(filePath);
if (!existsSync(absolute)) {
  console.error(`⛔ לא נמצא: ${filePath}`);
  process.exit(1);
}

const workbook = XLSX.read(new Uint8Array(readFileSync(absolute)), { type: 'array', raw: false });

console.log(`\n══ ${filePath.split(/[\\/]/).pop()} ══`);
console.log(`גיליונות: ${workbook.SheetNames.length}`);

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) continue;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  });

  // שם הגיליון מכיל מספר חשבון — מנוקה
  const safeName = sheetName.replace(/\d[\d-]{5,}\d/g, (m) => `•••${m.replace(/\D/g, '').slice(-4)}`);
  console.log(`\n── גיליון "${safeName}" · ${rows.length} שורות ──`);

  rows.forEach((row, index) => {
    const cells = (row as unknown[]).map((c) => String(c ?? '').replace(/\s+/g, ' ').trim());
    if (cells.every((c) => c === '')) return;
    console.log(`  [${String(index).padStart(2)}] ${cells.map((c) => c || '·').join(' ┃ ')}`);
  });
}
console.log('');
