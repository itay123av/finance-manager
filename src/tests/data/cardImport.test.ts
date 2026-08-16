/**
 * ⭐ בדיקות קליטת פירוט כרטיס אשראי, מקצה לקצה.
 *
 * שתי הבדיקות הקריטיות כאן:
 *   · `balanceBefore === balanceAfter` — פירוט לא משנה כסף.
 *   · `safeToSpendNow` זהה — פירוק חיוב לפרטיו אינו משחרר תקציב.
 *
 * אם אחת מהן נכשלת, זה באג חמור: המערכת "המציאה" או "מחקה" כסף.
 */

// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { FinanceDatabase } from '../../data/db';
import {
  BANK_ACCOUNT_ID,
  addTransaction,
  completeOnboarding,
  loadSnapshot,
} from '../../data/repositories';
import {
  buildCardImportPreview,
  commitCardImport,
  correctCardCategory,
  undoCardImport,
} from '../../data/cards';
import { buildDashboard } from '../../core/dashboard';
import {
  checkNoDoubleCounting,
  effectiveExpensesByCategory,
  getEffectiveExpenses,
  RETIRED_CARD_CATEGORY_ID,
  UNDETAILED_CARD_CATEGORY_ID,
} from '../../core/effectiveSpending';
import { fromShekels } from '../../core/money';
import type { SourceFile } from '../../import/types';

const NOW = new Date('2026-08-07T12:00:00Z');
let db: FinanceDatabase;
let counter = 0;

/**
 * בונה קובץ פירוט כרטיס במבנה של חברת אשראי ישראלית.
 * ⚠️ כל השמות והסכומים מומצאים.
 */
function cardFile(
  rows: (string | number)[][],
  options: { last4?: string; total?: string; name?: string } = {},
): SourceFile {
  const sheet = XLSX.utils.aoa_to_sheet([
    [`פירוט עסקאות לחשבון בנק בדיוני 111-222 לכרטיס ויזה המסתיים ב-${options.last4 ?? '3483'}`],
    [`עסקאות בחיוב מיידי ${options.total ?? '0.00'} ₪`],
    ['תאריך עסקה', 'שם בית עסק', 'סכום עסקה', 'סכום חיוב', 'סוג עסקה', 'ענף', 'הערות'],
    ...rows,
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'גיליון');
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return { name: options.name ?? 'card.xlsx', bytes: new Uint8Array(buffer) };
}

/** שלוש קניות מ-25-26/07 שירדו כחיוב אחד של ₪143.52 ב-28/07. */
const BATCH_ROWS = [
  ['25/7/26', 'חנות אלף', '₪ 74.90', '₪ 74.90', 'רגילה', 'תקשורת ומחשבים', ''],
  ['26/7/26', 'קיוסק בית', '₪ 6.00', '₪ 6.00', 'מיידית', 'מזון ומשקאות', ''],
  ['26/7/26', 'שירות דיגיטלי', '$ 20.00', '₪ 62.62', 'רגילה', 'תקשורת ומחשבים', ''],
];

beforeEach(async () => {
  db = new FinanceDatabase(`test-card-${++counter}`);
  await db.open();
  await completeOnboarding(db, {
    bankBalanceAgorot: fromShekels(1000),
    cashBalanceAgorot: 0,
    safetyBufferAgorot: fromShekels(500),
    targetAgorot: fromShekels(5000),
    milestones: [fromShekels(5000)],
    estimatedMonthlySpendAgorot: fromShekels(400),
    openingDate: '2026-07-01',
  });
});

/** מוסיף את חיוב הכרטיס בבנק. */
async function addCharge(shekels: number, date = '2026-07-28', last4 = '3483') {
  return addTransaction(db, {
    accountId: BANK_ACCOUNT_ID,
    date,
    amountAgorot: fromShekels(shekels),
    type: 'expense',
    categoryId: 'cat-other',
    merchant: `חיוב לכרטיס ויזה ${last4}`,
  });
}

async function dashboard() {
  const s = await loadSnapshot(db, NOW);
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

async function importCard(file: SourceFile) {
  const preview = await buildCardImportPreview(db, file);
  return { preview, result: await commitCardImport(db, preview, { fileName: file.name, now: NOW }) };
}

describe('פענוח קובץ הכרטיס', () => {
  it('מחלץ ארבע ספרות, סכום מוצהר ועסקאות', async () => {
    const preview = await buildCardImportPreview(
      db,
      cardFile(BATCH_ROWS, { total: '143.52' }),
    );

    expect(preview.cardLast4).toBe('3483');
    expect(preview.counts.total).toBe(3);
    expect(preview.declaredTotalAgorot).toBe(fromShekels(143.52));
    expect(preview.totalBilledAgorot).toBe(fromShekels(143.52));
    expect(preview.declaredMatches).toBe(true);
  });

  it('⭐ עסקת מט״ח: נשמר הסכום בשקלים, והמקורי לצד מידע', async () => {
    const preview = await buildCardImportPreview(db, cardFile(BATCH_ROWS));
    const fx = preview.rows.find((r) => r.merchant === 'שירות דיגיטלי')!;

    expect(fx.amountAgorot).toBe(fromShekels(62.62)); // הכסף שיצא
    expect(fx.originalAmountAgorot).toBe(fromShekels(20)); // ‎$20 למידע
    expect(fx.originalCurrency).toBe('USD');
    expect(preview.counts.foreignCurrency).toBe(1);
  });

  it('⭐ סיווג לפי ענף חברת האשראי גובר על ניחוש משם בית העסק', async () => {
    const preview = await buildCardImportPreview(db, cardFile(BATCH_ROWS));
    const row = preview.rows.find((r) => r.merchant === 'חנות אלף')!;

    expect(row.categoryId).toBe('cat-phone'); // "תקשורת ומחשבים"
    expect(row.confidence).toBe(0.85);
    expect(row.sourceHe).toContain('ענף');
  });

  it('שורות שאינן עסקאות אינן נחשבות שגיאה', async () => {
    const preview = await buildCardImportPreview(
      db,
      cardFile([...BATCH_ROWS, ['את המידע המלא על כל עסקה אפשר למצוא באתר ובאפליקציה', '', '', '', '', '', '']]),
    );
    expect(preview.counts.failed).toBe(0);
    expect(preview.counts.total).toBe(3);
  });

  it('⭐ כותרות עם שורות חדשות בתוך התא — כמו בייצוא אמיתי', async () => {
    // חברות האשראי מייצאות "תאריך\nעסקה" ולא "תאריך עסקה"
    const sheet = XLSX.utils.aoa_to_sheet([
      ['פירוט עסקאות לכרטיס ויזה המסתיים ב-3483'],
      ['עסקאות בחיוב מיידי 74.90 ₪'],
      ['תאריך\nעסקה', 'שם בית עסק', 'סכום\nעסקה', 'סכום\nחיוב', 'סוג\nעסקה', 'ענף', 'הערות'],
      ['25/7/26', 'חנות אלף', '₪ 74.90', '₪ 74.90', 'רגילה', 'תקשורת ומחשבים', ''],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'גיליון');
    const bytes = new Uint8Array(
      XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer,
    );

    const preview = await buildCardImportPreview(db, { name: 'real.xlsx', bytes });
    expect(preview.counts.total).toBe(1);
    expect(preview.cardLast4).toBe('3483');
    expect(preview.rows[0]?.amountAgorot).toBe(fromShekels(74.9));
  });

  it('קובץ בלי מספר כרטיס נחסם', async () => {
    const file = cardFile(BATCH_ROWS);
    // מסירים את שורת הכותרת עם מספר הכרטיס
    const workbook = XLSX.read(file.bytes, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
    XLSX.utils.sheet_add_aoa(sheet, [['פירוט עסקאות']], { origin: 'A1' });
    const bytes = new Uint8Array(
      XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer,
    );

    const preview = await buildCardImportPreview(db, { name: 'x.xlsx', bytes });
    expect(preview.blockedReason).toBe('no_card_number');
    await expect(commitCardImport(db, preview)).rejects.toThrow('לא זוהה מספר כרטיס');
  });
});

describe('⭐⭐ יתרת הבנק אינה משתנה', () => {
  it('balanceBefore === balanceAfter', async () => {
    await addCharge(143.52);
    const before = await dashboard();

    await importCard(cardFile(BATCH_ROWS, { total: '143.52' }));
    const after = await dashboard();

    expect(after.balance.totalAgorot).toBe(before.balance.totalAgorot);
    expect(after.month.expenseAgorot).toBe(before.month.expenseAgorot);
  });

  it('⭐ safeToSpendNow זהה אחרי ייבוא היסטורי', async () => {
    await addCharge(143.52);
    const before = await dashboard();

    await importCard(cardFile(BATCH_ROWS, { total: '143.52' }));
    const after = await dashboard();

    expect(after.safeToSpend.nowAgorot).toBe(before.safeToSpend.nowAgorot);
    expect(after.safeToSpend.weekAgorot).toBe(before.safeToSpend.weekAgorot);
    expect(after.goalProgress.progressPct).toBe(before.goalProgress.progressPct);
  });

  it('עסקאות הכרטיס לא נכנסו לטבלת תנועות הבנק', async () => {
    await addCharge(143.52);
    const bankCountBefore = await db.transactions.count();

    await importCard(cardFile(BATCH_ROWS, { total: '143.52' }));

    expect(await db.transactions.count()).toBe(bankCountBefore);
    expect(await db.cardTransactions.count()).toBe(3);
  });
});

describe('⭐ קישור וספירה כפולה', () => {
  it('שלוש העסקאות מקושרות לחיוב האחד', async () => {
    const charge = await addCharge(143.52);
    const { result } = await importCard(cardFile(BATCH_ROWS, { total: '143.52' }));

    expect(result.linked).toBe(3);
    const linked = await db.cardTransactions.toArray();
    expect(linked.every((t) => t.linkedBankTransactionId === charge.id)).toBe(true);
    expect(linked.every((t) => t.billingDate === '2026-07-28')).toBe(true);
  });

  it('⭐ ההוצאות לא נספרות פעמיים', async () => {
    await addCharge(143.52);
    await importCard(cardFile(BATCH_ROWS, { total: '143.52' }));

    const snapshot = await loadSnapshot(db, NOW);
    const check = checkNoDoubleCounting({
      transactions: snapshot.transactions,
      cardTransactions: await db.cardTransactions.toArray(),
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(check.ok).toBe(true);
    expect(check.effectiveTotalAgorot).toBe(fromShekels(143.52));
    expect(check.bankAndCashTotalAgorot).toBe(fromShekels(143.52));
  });

  it('⭐ הקטגוריות משתפרות: מ"לא מפורט" לקטגוריות אמיתיות', async () => {
    await addCharge(143.52);
    const snapshot0 = await loadSnapshot(db, NOW);

    // לפני שיש פירוט כלשהו, החיוב נראה כמו כרטיס ישן — אין שום
    // אינדיקציה שקיים קובץ פירוט
    const before = effectiveExpensesByCategory(
      getEffectiveExpenses({
        transactions: snapshot0.transactions,
        cardTransactions: [],
        from: '2026-07-01',
        to: '2026-07-31',
      }),
      snapshot0.categories,
    );
    expect(before[0]?.categoryId).toBe(RETIRED_CARD_CATEGORY_ID);

    await importCard(cardFile(BATCH_ROWS, { total: '143.52' }));
    const snapshot1 = await loadSnapshot(db, NOW);
    const after = effectiveExpensesByCategory(
      getEffectiveExpenses({
        transactions: snapshot1.transactions,
        cardTransactions: await db.cardTransactions.toArray(),
        from: '2026-07-01',
        to: '2026-07-31',
      }),
      snapshot1.categories,
    );

    expect(after.some((c) => c.categoryId === UNDETAILED_CARD_CATEGORY_ID)).toBe(false);
    expect(after.find((c) => c.categoryId === 'cat-phone')?.amountAgorot).toBe(
      fromShekels(137.52),
    );
    expect(after.find((c) => c.categoryId === 'cat-shopping')?.amountAgorot).toBe(fromShekels(6));
  });

  it('⭐ חיוב של כרטיס אחר בלי פירוט מסווג ככרטיס ישן', async () => {
    await addCharge(143.52);
    await addCharge(80, '2026-07-22', '4569'); // כרטיס שאין לו קובץ
    await importCard(cardFile(BATCH_ROWS, { total: '143.52' }));

    const snapshot = await loadSnapshot(db, NOW);
    const byCategory = effectiveExpensesByCategory(
      getEffectiveExpenses({
        transactions: snapshot.transactions,
        cardTransactions: await db.cardTransactions.toArray(),
        cards: await db.cards.toArray(),
        from: '2026-07-01',
        to: '2026-07-31',
      }),
      snapshot.categories,
    );

    expect(byCategory.find((c) => c.categoryId === RETIRED_CARD_CATEGORY_ID)?.amountAgorot).toBe(
      fromShekels(80),
    );
    // והכרטיס המפורט לא נשאר אטום
    expect(byCategory.some((c) => c.categoryId === UNDETAILED_CARD_CATEGORY_ID)).toBe(false);
  });
});

describe('כפילויות, ביטול וייבוא חוזר', () => {
  it('⭐ ייבוא אותו קובץ פעמיים לא מכפיל עסקאות', async () => {
    await addCharge(143.52);
    await importCard(cardFile(BATCH_ROWS, { total: '143.52' }));
    expect(await db.cardTransactions.count()).toBe(3);

    const second = await buildCardImportPreview(db, cardFile(BATCH_ROWS, { total: '143.52' }));
    expect(second.counts.duplicates).toBe(3);
    expect(second.counts.fresh).toBe(0);

    await commitCardImport(db, second, { fileName: 'card.xlsx', now: NOW });
    expect(await db.cardTransactions.count()).toBe(3);
  });

  it('שתי קניות זהות באמת אינן כפילות', async () => {
    await addCharge(12);
    const rows = [
      ['26/7/26', 'קיוסק', '₪ 6.00', '₪ 6.00', 'מיידית', 'מזון ומשקאות', ''],
      ['26/7/26', 'קיוסק', '₪ 6.00', '₪ 6.00', 'מיידית', 'מזון ומשקאות', ''],
    ];
    const { preview } = await importCard(cardFile(rows, { total: '12.00' }));
    expect(preview.counts.duplicates).toBe(0);
    expect(await db.cardTransactions.count()).toBe(2);
  });

  it('⭐ ביטול מחזיר את המצב בדיוק', async () => {
    await addCharge(143.52);
    const before = await dashboard();

    const { result } = await importCard(cardFile(BATCH_ROWS, { total: '143.52' }));
    const { removed } = await undoCardImport(db, result.sessionId);

    expect(removed).toBe(3);
    expect(await db.cardTransactions.count()).toBe(0);

    const after = await dashboard();
    expect(after.balance.totalAgorot).toBe(before.balance.totalAgorot);
    expect(after.safeToSpend.nowAgorot).toBe(before.safeToSpend.nowAgorot);
  });

  it('ביטול פעמיים אינו מוחק עוד', async () => {
    await addCharge(143.52);
    const { result } = await importCard(cardFile(BATCH_ROWS, { total: '143.52' }));
    await undoCardImport(db, result.sessionId);
    expect((await undoCardImport(db, result.sessionId)).removed).toBe(0);
  });

  it('ייבוא מחדש אחרי ביטול מחזיר את אותן עסקאות', async () => {
    await addCharge(143.52);
    const { result } = await importCard(cardFile(BATCH_ROWS, { total: '143.52' }));
    await undoCardImport(db, result.sessionId);

    const again = await importCard(cardFile(BATCH_ROWS, { total: '143.52' }));
    expect(again.result.imported).toBe(3);
    expect(again.result.linked).toBe(3);
  });

  it('ביטול של ייבוא שאינו קיים נכשל בבירור', async () => {
    await expect(undoCardImport(db, 'nope')).rejects.toThrow('הייבוא לא נמצא');
  });
});

describe('תיקון סיווג ולמידה', () => {
  it('⭐ תיקון עסקת כרטיס נלמד ומשפיע על הבא', async () => {
    await addCharge(143.52);
    await importCard(cardFile(BATCH_ROWS, { total: '143.52' }));

    const kiosk = (await db.cardTransactions.toArray()).find((t) => t.merchant === 'קיוסק בית')!;
    expect(kiosk.categoryId).toBe('cat-shopping');

    const { learned } = await correctCardCategory(db, kiosk.id, 'cat-food-out', NOW);
    expect(learned).toBe(true);

    // ובקובץ הבא — הסיווג כבר לפי הבחירה
    const next = await buildCardImportPreview(
      db,
      cardFile([['28/7/26', 'קיוסק בית', '₪ 9.00', '₪ 9.00', 'מיידית', 'מזון ומשקאות', '']]),
    );
    expect(next.rows[0]?.categoryId).toBe('cat-food-out');
    expect(next.rows[0]?.sourceHe).toContain('תיקון קודם');
  });

  it('תיקון עסקה שאינה קיימת נכשל בבירור', async () => {
    await expect(correctCardCategory(db, 'nope', 'cat-other')).rejects.toThrow('לא נמצאה');
  });
});

describe('כרטיס שאינו מקושר', () => {
  it('בלי חיוב מתאים — העסקאות נקלטות אך לא מקושרות', async () => {
    const { result } = await importCard(cardFile(BATCH_ROWS, { total: '143.52' }));
    expect(result.imported).toBe(3);
    expect(result.linked).toBe(0);

    const stored = await db.cardTransactions.toArray();
    expect(stored.every((t) => t.linkedBankTransactionId === undefined)).toBe(true);
  });

  it('הן אינן משפיעות על ההוצאות כל עוד אין קישור', async () => {
    const before = await dashboard();
    await importCard(cardFile(BATCH_ROWS, { total: '143.52' }));
    const after = await dashboard();
    expect(after.month.expenseAgorot).toBe(before.month.expenseAgorot);
  });
});
