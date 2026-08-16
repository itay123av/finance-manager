/** סריקת פרטיות ואבטחה סופית לגרסה 1 — ללא קריאת תוכן קבצי הכספים. */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const failures: string[] = [];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function text(path: string): string {
  return readFileSync(path, 'utf8');
}

function fail(message: string) {
  failures.push(message);
}

const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean)
  .map((path) => path.replaceAll('\\', '/'));

for (const path of listed) {
  if (path.startsWith('private-data/')) fail('קובץ מתוך private-data מופיע ב-Git.');
  if (/\.(?:xls|xlsx)$/i.test(path)) fail('קובץ Excel מופיע ב-Git.');
  if (/\.csv$/i.test(path) && !path.startsWith('src/tests/fixtures/')) {
    fail('קובץ CSV שאינו fixture מופיע ב-Git.');
  }
  if (/^\.env(?:\.|$)/.test(path) && path !== '.env.example') fail('קובץ env פרטי מופיע ב-Git.');
}

const runtimeFiles = walk(join(ROOT, 'src')).filter(
  (path) => !path.includes(`${join('src', 'tests')}`) && /\.(?:ts|tsx|js|jsx)$/i.test(path),
);
const outboundPattern = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon\s*\(/;
for (const path of runtimeFiles) {
  if (outboundPattern.test(text(path))) {
    fail(`נמצא primitive של רשת בקוד הריצה: ${relative(ROOT, path)}`);
  }
}

const inspectable = listed
  .map((path) => join(ROOT, path))
  .filter((path) => existsSync(path) && statSync(path).isFile())
  .filter((path) => !['.png', '.ico', '.woff', '.woff2'].includes(extname(path).toLowerCase()));
const secretPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{20,}|\bAIza[0-9A-Za-z_-]{20,}/;
for (const path of inspectable) {
  if (secretPattern.test(text(path))) fail(`נמצא דפוס שנראה כמו סוד: ${relative(ROOT, path)}`);
}

const sourceMaps = walk(join(ROOT, 'dist')).filter((path) => path.endsWith('.map'));
if (sourceMaps.length > 0) fail('נמצאו source maps בתוך dist.');

const privateNames = walk(join(ROOT, 'private-data'))
  .map((path) => basename(path))
  .filter((name) => name !== 'phase7-baseline-before.json');
const publicText = [
  ...inspectable,
  ...walk(join(ROOT, 'dist')).filter((path) => /\.(?:html|js|css|json|svg|txt)$/i.test(path)),
];
for (const privateName of privateNames) {
  if (publicText.some((path) => text(path).includes(privateName))) {
    fail('שם של קובץ פרטי נמצא בקוד או ב-build.');
    break;
  }
}

const indexHtml = text(join(ROOT, 'index.html'));
const headers = text(join(ROOT, 'public', '_headers'));
if (!indexHtml.includes("connect-src 'none'")) fail("חסר connect-src 'none' ב-index.html.");
if (!headers.includes("connect-src 'none'")) fail("חסר connect-src 'none' ב-_headers.");

if (failures.length > 0) {
  for (const message of failures) console.error(`❌ ${message}`);
  process.exit(1);
}

console.log(`✅ פרטיות: ${listed.length} קובצי עבודה ו-${runtimeFiles.length} קובצי runtime נסרקו.`);
console.log('✅ אין קובצי נתונים פרטיים ב-Git, אין primitives של רשת ואין source maps.');
