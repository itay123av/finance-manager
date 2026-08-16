/**
 * בדיקות הצנרת המלאה: קובץ → תצוגה מקדימה → קליטה → ביטול.
 *
 * ⭐ הבדיקה הקריטית: ביטול ייבוא חייב למחוק **בדיוק** את מה שהייבוא
 * הכניס — לא שורה אחת פחות ולא שורה אחת יותר. עסקאות שהוזנו ידנית
 * או הגיעו מייבוא אחר חייבות לשרוד.
 */

// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { FinanceDatabase } from '../../data/db';
import {
  BANK_ACCOUNT_ID,
  CASH_ACCOUNT_ID,
  addTransaction,
  completeOnboarding,
  loadSnapshot,
} from '../../data/repositories';
import {
  commitImport,
  correctCategoryAndLearn,
  countNeedingReview,
  findSavedMapping,
  listImportSessions,
  undoImport,
} from '../../data/imports';
import { buildImportPreview } from '../../import/pipeline';
import { buildDashboard } from '../../core/dashboard';
import { ImportError } from '../../import/types';
import { fromShekels } from '../../core/money';
import { DEBIT_CREDIT_CSV, MESSY_CSV, SIMPLE_CSV, textFile } from './fixtures';

const NOW = new Date('2026-08-07T09:00:00Z');
let db: FinanceDatabase;
let counter = 0;

beforeEach(async () => {
  db = new FinanceDatabase(`test-import-${++counter}`);
  await db.open();
  await completeOnboarding(db, {
    bankBalanceAgorot: fromShekels(1090),
    cashBalanceAgorot: fromShekels(150),
    safetyBufferAgorot: fromShekels(500),
    targetAgorot: fromShekels(5000),
    milestones: [fromShekels(1000), fromShekels(2500), fromShekels(5000)],
    estimatedMonthlySpendAgorot: fromShekels(400),
    openingDate: '2026-07-01',
  });
});

async function preview(csv: string, name = 'bank.csv') {
  const snapshot = await loadSnapshot(db, NOW);
  return buildImportPreview({
    file: textFile(name, csv),
    accountId: BANK_ACCOUNT_ID,
    existing: snapshot.transactions,
    context: { merchantRules: await db.merchantRules.toArray(), categories: snapshot.categories },
  });
}

async function importAll(csv: string, name = 'bank.csv') {
  const result = await preview(csv, name);
  return commitImport(db, {
    preview: result,
    accountId: BANK_ACCOUNT_ID,
    selectedLines: new Set(result.rows.filter((r) => r.selected).map((r) => r.sourceLine)),
    now: NOW,
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

describe('תצוגה מקדימה', () => {
  it('מסכמת את הקובץ בלי לכתוב שום דבר', async () => {
    const result = await preview(SIMPLE_CSV);

    expect(result.counts).toMatchObject({ parsed: 3, fresh: 3, exactDuplicates: 0, failed: 0 });
    expect(result.dateRange).toEqual({ from: '2026-08-01', to: '2026-08-05' });
    expect(result.encoding).toBe('utf-8');
    // ⭐ שום דבר לא נכתב עד לאישור
    expect(await db.transactions.count()).toBe(0);
  });

  it('מסווגת אוטומטית ומסמנת מה שלא בטוח', async () => {
    const result = await preview(SIMPLE_CSV);
    const aroma = result.rows.find((r) => r.merchant.includes('ארומה'));
    expect(aroma?.categoryId).toBe('cat-food-out');
    expect(aroma?.categoryConfidence).toBe(0.7);

    const salary = result.rows.find((r) => r.type === 'income');
    expect(salary?.categoryId).toBe('cat-work');
  });

  it('מדווחת על שורות שנכשלו עם הסיבה', async () => {
    const result = await preview(MESSY_CSV);
    expect(result.counts.failed).toBe(5);
    expect(result.counts.parsed).toBe(2);
    expect(result.failures[0]?.reason).toBe('invalid_date');
  });

  it('קובץ גדול מדי נדחה', async () => {
    const snapshot = await loadSnapshot(db, NOW);
    await expect(async () =>
      buildImportPreview({
        file: { name: 'big.csv', bytes: new Uint8Array(6 * 1024 * 1024) },
        accountId: BANK_ACCOUNT_ID,
        existing: snapshot.transactions,
        context: { merchantRules: [], categories: snapshot.categories },
      }),
    ).rejects.toThrow(ImportError);
  });

  it('קובץ בלי עמודות מזוהות נדחה בהודעה מועילה', async () => {
    await expect(async () => preview('שלום,עולם\nא,ב\n')).rejects.toThrow(/להתאים את העמודות/);
  });
});

describe('קליטה', () => {
  it('⭐ קולטת את העסקאות ומעדכנת את כל החישובים', async () => {
    const before = await dashboard();
    const { imported } = await importAll(SIMPLE_CSV);

    expect(imported).toBe(3);
    const after = await dashboard();
    // ‎-64 -152.50 +2400
    expect(after.balance.totalAgorot - before.balance.totalAgorot).toBe(fromShekels(2183.5));
    expect(after.month.incomeAgorot).toBe(fromShekels(2400));
    expect(after.goalProgress.progressPct).toBeGreaterThan(before.goalProgress.progressPct);
  });

  it('חובה/זכות נקלטים בכיוון הנכון', async () => {
    await importAll(DEBIT_CREDIT_CSV);
    const transactions = await db.transactions.toArray();
    expect(transactions.filter((t) => t.type === 'income')).toHaveLength(1);
    expect(transactions.filter((t) => t.type === 'expense')).toHaveLength(2);
  });

  it('העסקאות מסומנות כמקורן בקובץ ומקושרות לייבוא', async () => {
    const { sessionId } = await importAll(SIMPLE_CSV);
    const transactions = await db.transactions.toArray();
    expect(transactions.every((t) => t.source === 'file')).toBe(true);
    expect(transactions.every((t) => t.importSessionId === sessionId)).toBe(true);
    expect(transactions.every((t) => t.userCorrected === false)).toBe(true);
  });

  it('נשמר תיעוד ייבוא עם ספירות', async () => {
    await importAll(MESSY_CSV);
    const [session] = await listImportSessions(db);
    expect(session).toMatchObject({ fileName: 'bank.csv', rowsImported: 2, rowsFailed: 5, undone: false });
  });

  it('רק שורות שנבחרו נקלטות', async () => {
    const result = await preview(SIMPLE_CSV);
    const only = result.rows[0]!;
    const { imported } = await commitImport(db, {
      preview: result,
      accountId: BANK_ACCOUNT_ID,
      selectedLines: new Set([only.sourceLine]),
      now: NOW,
    });
    expect(imported).toBe(1);
    expect(await db.transactions.count()).toBe(1);
  });
});

describe('⭐ חסימת קליטה בלי הכרעת כיוון', () => {
  const ALL_POSITIVE = `תאריך,תיאור,סכום
01/08/2026,העברת שכר,2400.00
03/08/2026,ארומה,64.00
`;

  it('התצוגה המקדימה מסומנת כחסומה', async () => {
    const result = await preview(ALL_POSITIVE);
    expect(result.blockedReason).toBe('unresolved_direction');
    expect(result.direction.confidence).toBe('unresolved');
  });

  it('⭐ הקליטה נדחית גם אם מישהו עוקף את הממשק', async () => {
    const result = await preview(ALL_POSITIVE);
    await expect(
      commitImport(db, {
        preview: result,
        accountId: BANK_ACCOUNT_ID,
        selectedLines: new Set(result.rows.map((r) => r.sourceLine)),
        now: NOW,
      }),
    ).rejects.toThrow('אי אפשר לקלוט לפני שנקבע מה הכנסה ומה הוצאה');

    expect(await db.transactions.count()).toBe(0);
  });

  it('אחרי הכרעה — הקליטה עוברת והכיוון נכון', async () => {
    const snapshot = await loadSnapshot(db, NOW);
    const resolved = buildImportPreview({
      file: textFile('bank.csv', ALL_POSITIVE),
      accountId: BANK_ACCOUNT_ID,
      existing: snapshot.transactions,
      context: { merchantRules: [], categories: snapshot.categories },
      directionRule: { kind: 'all_expense' },
    });

    expect(resolved.blockedReason).toBeNull();
    const { imported } = await commitImport(db, {
      preview: resolved,
      accountId: BANK_ACCOUNT_ID,
      selectedLines: new Set(resolved.rows.map((r) => r.sourceLine)),
      now: NOW,
    });

    expect(imported).toBe(2);
    expect((await db.transactions.toArray()).every((t) => t.type === 'expense')).toBe(true);
  });
});

describe('⭐ ייבוא חוזר של אותו קובץ', () => {
  it('לא מייצר עסקאות כפולות', async () => {
    await importAll(SIMPLE_CSV);
    const countAfterFirst = await db.transactions.count();

    const second = await preview(SIMPLE_CSV);
    expect(second.counts.exactDuplicates).toBe(3);
    expect(second.counts.fresh).toBe(0);
    expect(second.rows.every((r) => !r.selected)).toBe(true);

    await importAll(SIMPLE_CSV);
    expect(await db.transactions.count()).toBe(countAfterFirst);
  });

  it('קובץ חופף חלקית מוסיף רק את החדש', async () => {
    await importAll(SIMPLE_CSV);
    const extended = SIMPLE_CSV + '06/08/2026,פיצה האט,-89.90,1086.10\n';
    const result = await preview(extended);

    expect(result.counts.exactDuplicates).toBe(3);
    expect(result.counts.fresh).toBe(1);

    await importAll(extended);
    expect(await db.transactions.count()).toBe(4);
  });
});

describe('⭐ ביטול ייבוא', () => {
  it('מחזיר את המצב בדיוק לקדמותו', async () => {
    const before = await dashboard();
    const { sessionId } = await importAll(SIMPLE_CSV);

    const { removed } = await undoImport(db, sessionId);
    expect(removed).toBe(3);

    const after = await dashboard();
    expect(after.balance.totalAgorot).toBe(before.balance.totalAgorot);
    expect(after.safeToSpend.nowAgorot).toBe(before.safeToSpend.nowAgorot);
    expect(after.goalProgress.progressPct).toBe(before.goalProgress.progressPct);
  });

  it('⭐ לא נוגע בעסקאות ידניות ולא בייבוא אחר', async () => {
    const manual = await addTransaction(db, {
      accountId: CASH_ACCOUNT_ID,
      date: '2026-08-04',
      amountAgorot: fromShekels(35),
      type: 'expense',
      categoryId: 'cat-shopping',
      merchant: 'קיוסק',
    });
    const first = await importAll(SIMPLE_CSV, 'august.csv');
    const second = await importAll('תאריך,תיאור,סכום\n02/07/2026,ספרים,-45.00\n', 'july.csv');

    await undoImport(db, first.sessionId);

    const remaining = await db.transactions.toArray();
    expect(remaining.map((t) => t.id)).toContain(manual.id);
    expect(remaining.filter((t) => t.importSessionId === second.sessionId)).toHaveLength(1);
    expect(remaining.filter((t) => t.importSessionId === first.sessionId)).toHaveLength(0);
  });

  it('מסמן את הייבוא כמבוטל, וביטול חוזר אינו מוחק עוד', async () => {
    const { sessionId } = await importAll(SIMPLE_CSV);
    await undoImport(db, sessionId);
    expect((await db.importSessions.get(sessionId))?.undone).toBe(true);

    const again = await undoImport(db, sessionId);
    expect(again.removed).toBe(0);
  });

  it('ביטול של ייבוא שאינו קיים נכשל בבירור', async () => {
    await expect(undoImport(db, 'no-such-session')).rejects.toThrow('הייבוא לא נמצא');
  });

  it('אחרי ביטול אפשר לייבא את אותו קובץ מחדש', async () => {
    const { sessionId } = await importAll(SIMPLE_CSV);
    await undoImport(db, sessionId);

    const result = await preview(SIMPLE_CSV);
    expect(result.counts.fresh).toBe(3);
    await importAll(SIMPLE_CSV);
    expect(await db.transactions.count()).toBe(3);
  });
});

describe('⭐ תיקון קטגוריה ולמידה', () => {
  it('התיקון נשמר, והעסקה הבאה מאותו מקום מסווגת נכון', async () => {
    await importAll(SIMPLE_CSV);
    const aroma = (await db.transactions.toArray()).find((t) => t.merchant.includes('ארומה'))!;
    expect(aroma.categoryId).toBe('cat-food-out');

    // המשתמש מחליט שארומה היא בעצם יציאה עם חברים
    const { learned } = await correctCategoryAndLearn(db, aroma.id, 'cat-friends', NOW);
    expect(learned).toBe(true);
    expect((await db.transactions.get(aroma.id))?.categoryId).toBe('cat-friends');

    // ובקובץ הבא — הסיווג כבר לפי הבחירה שלו
    const next = await preview('תאריך,תיאור,סכום\n06/08/2026,ארומה תל אביב,-31.00\n');
    expect(next.rows[0]?.categoryId).toBe('cat-friends');
    expect(next.rows[0]?.classificationSourceHe).toContain('תיקון קודם');
  });

  it('סופר כמה עסקאות עוד צריכות בדיקה', async () => {
    await importAll('תאריך,תיאור,סכום\n05/08/2026,חנות אלמונית 999,-40.00\n');
    expect(await countNeedingReview(db)).toBe(1);

    const unknown = (await db.transactions.toArray())[0]!;
    await correctCategoryAndLearn(db, unknown.id, 'cat-shopping', NOW);
    expect(await countNeedingReview(db)).toBe(0);
  });

  it('תיקון עסקה שאינה קיימת נכשל בבירור', async () => {
    await expect(correctCategoryAndLearn(db, 'nope', 'cat-other', NOW)).rejects.toThrow(
      'העסקה לא נמצאה',
    );
  });
});

describe('זיכרון מיפוי העמודות', () => {
  it('מיפוי נשמר ונמצא לקובץ הבא מאותו בנק', async () => {
    const first = await preview(SIMPLE_CSV);
    await importAll(SIMPLE_CSV);

    const saved = await findSavedMapping(db, first.mapping.signature);
    expect(saved).not.toBeNull();
    expect(saved?.roles).toEqual(first.mapping.roles);
  });

  it('חתימה שלא נראתה מחזירה null', async () => {
    await importAll(SIMPLE_CSV);
    expect(await findSavedMapping(db, 'חתימה אחרת לגמרי')).toBeNull();
  });
});
