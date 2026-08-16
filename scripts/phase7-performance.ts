/**
 * מדידת ביצועים דטרמיניסטית לשער השחרור של גרסה 1.
 *
 * הנתונים פיקטיביים ונוצרים מנתוני ה-seed. זמן יצירת בסיס הנתונים אינו
 * נמדד; המסלול שנמדד הוא המסלול האינטראקטיבי של טעינת snapshot והרכבת
 * לוח הבקרה. ב-20,000 עסקאות הוא חייב להישאר מתחת לשנייה במחשב הפיתוח.
 */

import 'fake-indexeddb/auto';
import { performance } from 'node:perf_hooks';
import { buildDashboard } from '../src/core/dashboard';
import { transactionsToCsv } from '../src/data/csvExport';
import { FinanceDatabase } from '../src/data/db';
import { defaultSettings, loadSnapshot } from '../src/data/repositories';
import { buildSeedData, SEED_TODAY } from '../src/dev/seed/fakeUser';
import type { Transaction } from '../src/core/types';

const SIZES = [1_000, 5_000, 20_000] as const;
const INTERACTIVE_LIMIT_MS = 1_000;
const NOW = new Date(`${SEED_TODAY}T12:00:00Z`);

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function elapsed<T>(fn: () => T): { value: T; ms: number } {
  const started = performance.now();
  const value = fn();
  return { value, ms: performance.now() - started };
}

async function elapsedAsync<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - started };
}

function makeTransactions(size: number): Transaction[] {
  const seed = buildSeedData().transactions;
  return Array.from({ length: size }, (_, index) => {
    const original = seed[index % seed.length]!;
    return {
      ...original,
      id: `perf-${size}-${index}`,
      // שינוי קטן ודטרמיניסטי מונע מצב שבו המנוע מקבל אלפי שורות זהות לגמרי.
      amountAgorot: original.amountAgorot + (index % 7),
      createdAt: `2026-08-07T12:${String(index % 60).padStart(2, '0')}:00.000Z`,
      updatedAt: `2026-08-07T12:${String(index % 60).padStart(2, '0')}:00.000Z`,
    };
  });
}

async function benchmark(size: number) {
  const seed = buildSeedData();
  const transactions = makeTransactions(size);
  const db = new FinanceDatabase(`phase7-performance-${size}`);

  try {
    await db.open();
    await db.transaction(
      'rw',
      [
        db.accounts,
        db.categories,
        db.transactions,
        db.goals,
        db.settings,
        db.expectedIncomes,
        db.plannedExpenses,
        db.recurring,
      ],
      async () => {
        await db.accounts.bulkPut(seed.accounts);
        await db.categories.bulkPut(seed.categories);
        await db.transactions.bulkPut(transactions);
        await db.goals.put(seed.goal);
        await db.settings.put({
          ...defaultSettings(),
          onboardingCompletedAt: NOW.toISOString(),
        });
        await db.expectedIncomes.bulkPut(seed.expectedIncomes);
        await db.plannedExpenses.bulkPut(seed.plannedExpenses);
        await db.recurring.bulkPut(seed.recurring);
      },
    );

    // חימום מנוע ה-JS וה-cache של IndexedDB לפני המדידה.
    const warm = await loadSnapshot(db, NOW);
    buildDashboard({
      today: warm.today,
      accounts: warm.accounts,
      transactions: warm.transactions,
      categories: warm.categories,
      goal: warm.goal!,
      settings: warm.settings,
      expectedIncomes: warm.expectedIncomes,
      plannedExpenses: warm.plannedExpenses,
      recurringTransactions: warm.recurring,
      cardTransactions: warm.cardTransactions,
      cards: warm.cards,
      lastImportDate: warm.lastImportDate,
    });

    const loadTimes: number[] = [];
    const dashboardTimes: number[] = [];
    let snapshot = warm;
    for (let run = 0; run < 5; run += 1) {
      const loaded = await elapsedAsync(() => loadSnapshot(db, NOW));
      snapshot = loaded.value;
      loadTimes.push(loaded.ms);

      dashboardTimes.push(
        elapsed(() =>
          buildDashboard({
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
            lastImportDate: snapshot.lastImportDate,
          }),
        ).ms,
      );
    }

    const csvMs = elapsed(() =>
      transactionsToCsv({ transactions: snapshot.transactions, categories: snapshot.categories }),
    ).ms;
    const loadMs = median(loadTimes);
    const dashboardMs = median(dashboardTimes);

    return {
      size,
      loadMs,
      dashboardMs,
      interactiveMs: loadMs + dashboardMs,
      csvMs,
    };
  } finally {
    db.close();
    await db.delete();
  }
}

console.log('\n═══ ביצועי שלב 7 — נתונים פיקטיביים ═══\n');
let failed = false;
for (const size of SIZES) {
  const result = await benchmark(size);
  const overLimit = size === 20_000 && result.interactiveMs > INTERACTIVE_LIMIT_MS;
  failed ||= overLimit;
  console.log(
    `${size.toLocaleString('en-US').padStart(6)} עסקאות · ` +
      `טעינה ${result.loadMs.toFixed(1)}ms · ` +
      `Dashboard ${result.dashboardMs.toFixed(1)}ms · ` +
      `סה״כ ${result.interactiveMs.toFixed(1)}ms · ` +
      `CSV ${result.csvMs.toFixed(1)}ms${overLimit ? '  ❌' : '  ✅'}`,
  );
}

if (failed) {
  console.error(`\n❌ המסלול האינטראקטיבי חרג מ-${INTERACTIVE_LIMIT_MS}ms ב-20,000 עסקאות.\n`);
  process.exit(1);
}

console.log(`\n✅ שער ${INTERACTIVE_LIMIT_MS}ms נשמר ב-20,000 עסקאות.\n`);
