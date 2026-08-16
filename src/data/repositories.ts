/**
 * גישה לנתונים.
 *
 * כל כתיבה עוברת ולידציה של Zod לפני שהיא נוגעת בבסיס הנתונים.
 * המחיר הוא כמה מילישניות; התמורה היא שרשומה פגומה לא נכנסת בשקט
 * ומתגלה רק כשהיתרה לא מסתדרת.
 */

import { CURRENT_SCHEMA_VERSION, TABLE_SCHEMAS } from './schema';
import { allTables, SETTINGS_ID, type FinanceDatabase } from './db';
import { normalizeMerchant } from './normalize';
import { DEFAULT_CATEGORIES } from '../content/categories.seed';
import { fromShekels } from '../core/money';
import { todayInIsrael } from '../core/dates';
import {
  DEFAULT_SAFETY_BUFFER_AGOROT,
  type Account,
  type Agorot,
  type AppSettings,
  type CardTransaction,
  type Category,
  type CategoryNature,
  type CreditCard,
  type ExpectedIncome,
  type FinancialGoal,
  type ISODate,
  type PlannedExpense,
  type RecurringTransaction,
  type Transaction,
  type UUID,
} from '../core/types';

export function newId(): UUID {
  return crypto.randomUUID();
}

function nowStamp(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// הגדרות
// ---------------------------------------------------------------------------

export function defaultSettings(): AppSettings {
  return {
    id: SETTINGS_ID,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    safetyBufferAgorot: DEFAULT_SAFETY_BUFFER_AGOROT,
    budgetPlanId: 'balanced',
    estimatedMonthlySpendAgorot: fromShekels(400),
    showAgorot: false,
    discreetMode: false,
  };
}

export async function getSettings(db: FinanceDatabase): Promise<AppSettings> {
  return (await db.settings.get(SETTINGS_ID)) ?? defaultSettings();
}

export async function saveSettings(
  db: FinanceDatabase,
  patch: Partial<Omit<AppSettings, 'id'>>,
): Promise<AppSettings> {
  const current = await getSettings(db);
  const next = TABLE_SCHEMAS.settings.parse({ ...current, ...patch, id: SETTINGS_ID });
  await db.settings.put(next as AppSettings);
  return next as AppSettings;
}

export async function isOnboarded(db: FinanceDatabase): Promise<boolean> {
  const settings = await db.settings.get(SETTINGS_ID);
  return Boolean(settings?.onboardingCompletedAt);
}

// ---------------------------------------------------------------------------
// אונבורדינג
// ---------------------------------------------------------------------------

export interface OnboardingInput {
  bankBalanceAgorot: Agorot;
  cashBalanceAgorot: Agorot;
  safetyBufferAgorot: Agorot;
  targetAgorot: Agorot;
  milestones: Agorot[];
  estimatedMonthlySpendAgorot: Agorot;
  openingDate: ISODate;
}

export const BANK_ACCOUNT_ID = 'account-bank';
export const CASH_ACCOUNT_ID = 'account-cash';
export const PRIMARY_GOAL_ID = 'goal-primary';

/**
 * מקים את המערכת בכניסה הראשונה.
 * הכל בטרנזקציה אחת — מצב חלקי (חשבונות בלי יעד) היה שובר את לוח הבקרה.
 */
export async function completeOnboarding(
  db: FinanceDatabase,
  input: OnboardingInput,
): Promise<void> {
  const accounts: Account[] = [
    {
      id: BANK_ACCOUNT_ID,
      name: 'חשבון בנק',
      type: 'bank',
      openingBalanceAgorot: input.bankBalanceAgorot,
      openingDate: input.openingDate,
    },
    {
      id: CASH_ACCOUNT_ID,
      name: 'מזומן',
      type: 'cash',
      openingBalanceAgorot: input.cashBalanceAgorot,
      openingDate: input.openingDate,
    },
  ];

  const goal: FinancialGoal = {
    id: PRIMARY_GOAL_ID,
    name: `יעד ${(input.targetAgorot / 100).toLocaleString('en-US')} ש״ח`,
    targetAgorot: input.targetAgorot,
    startingBalanceAgorot: input.bankBalanceAgorot + input.cashBalanceAgorot,
    startDate: input.openingDate,
    minimumAfterReachedAgorot: Math.round(input.targetAgorot * 0.9),
    milestones: [...input.milestones].sort((a, b) => a - b),
    isPrimary: true,
  };

  accounts.forEach((a) => TABLE_SCHEMAS.accounts.parse(a));
  TABLE_SCHEMAS.goals.parse(goal);

  const tables = allTables(db);
  await db.transaction(
    'rw',
    [tables.accounts, tables.goals, tables.categories, tables.settings],
    async () => {
      await tables.accounts.bulkPut(accounts);
      await tables.goals.put(goal);
      if ((await tables.categories.count()) === 0) {
        await tables.categories.bulkPut(DEFAULT_CATEGORIES);
      }
      await tables.settings.put({
        ...defaultSettings(),
        safetyBufferAgorot: input.safetyBufferAgorot,
        estimatedMonthlySpendAgorot: input.estimatedMonthlySpendAgorot,
        lastAccountId: BANK_ACCOUNT_ID,
        onboardingCompletedAt: nowStamp(),
      });
    },
  );
}

// ---------------------------------------------------------------------------
// עסקאות
// ---------------------------------------------------------------------------

export interface NewTransactionInput {
  accountId: UUID;
  date: ISODate;
  amountAgorot: Agorot;
  type: Transaction['type'];
  categoryId: UUID;
  merchant?: string;
  note?: string;
  paymentMethod?: string;
  planned?: boolean;
}

export function buildTransaction(input: NewTransactionInput): Transaction {
  const merchant = (input.merchant ?? '').trim();
  const stamp = nowStamp();
  const transaction: Transaction = {
    id: newId(),
    accountId: input.accountId,
    date: input.date,
    amountAgorot: input.amountAgorot,
    type: input.type,
    merchant,
    merchantNormalized: normalizeMerchant(merchant),
    categoryId: input.categoryId,
    paymentMethod: input.paymentMethod ?? '',
    recurrence: 'one_time',
    planned: input.planned ?? false,
    source: 'manual',
    // הזנה ידנית היא ודאות מלאה — המשתמש בחר את הקטגוריה בעצמו.
    classificationConfidence: 1,
    userCorrected: true,
    status: 'actual',
    kind: 'normal',
    createdAt: stamp,
    updatedAt: stamp,
    ...(input.note ? { note: input.note } : {}),
  };
  TABLE_SCHEMAS.transactions.parse(transaction);
  return transaction;
}

export async function addTransaction(
  db: FinanceDatabase,
  input: NewTransactionInput,
): Promise<Transaction> {
  const transaction = buildTransaction(input);
  await db.transactions.put(transaction);
  // זוכרים את החשבון האחרון כדי שההזנה הבאה תהיה מהירה יותר.
  await saveSettings(db, { lastAccountId: input.accountId });
  return transaction;
}

export async function updateTransaction(
  db: FinanceDatabase,
  id: UUID,
  patch: Partial<NewTransactionInput>,
): Promise<Transaction> {
  const existing = await db.transactions.get(id);
  if (!existing) throw new Error('העסקה לא נמצאה');

  const merchant = patch.merchant === undefined ? existing.merchant : patch.merchant.trim();
  const next: Transaction = {
    ...existing,
    ...(patch.accountId ? { accountId: patch.accountId } : {}),
    ...(patch.date ? { date: patch.date } : {}),
    ...(patch.amountAgorot !== undefined ? { amountAgorot: patch.amountAgorot } : {}),
    ...(patch.type ? { type: patch.type } : {}),
    ...(patch.categoryId ? { categoryId: patch.categoryId } : {}),
    ...(patch.paymentMethod !== undefined ? { paymentMethod: patch.paymentMethod } : {}),
    ...(patch.planned !== undefined ? { planned: patch.planned } : {}),
    merchant,
    merchantNormalized: normalizeMerchant(merchant),
    userCorrected: true,
    updatedAt: nowStamp(),
  };
  if (patch.note !== undefined) {
    if (patch.note) next.note = patch.note;
    else delete next.note;
  }

  TABLE_SCHEMAS.transactions.parse(next);
  await db.transactions.put(next);
  return next;
}

export async function deleteTransaction(db: FinanceDatabase, id: UUID): Promise<void> {
  await db.transactions.delete(id);
}

/**
 * מחזיר עסקה בדיוק כפי שהייתה — הבסיס ל"ביטול".
 *
 * ⚠️ **אותו `id`**, ולא רשומה חדשה. עסקה שחוזרת עם מזהה אחר שוברת את
 * הקישור לפירוט הכרטיס ואת מניעת הכפילויות בייבוא: `importHash` היה
 * נשאר, אבל השורה שאליה הוא מצביע כבר לא. ביטול צריך להחזיר את המצב,
 * לא ליצור מצב חדש שנראה דומה.
 */
export async function restoreTransaction(
  db: FinanceDatabase,
  transaction: Transaction,
): Promise<void> {
  TABLE_SCHEMAS.transactions.parse(transaction);
  await db.transactions.put(transaction);
}

/** מעדכן קטגוריה של עסקה — הפעולה הנפוצה ביותר אחרי ייבוא. */
export async function setTransactionCategory(
  db: FinanceDatabase,
  id: UUID,
  categoryId: UUID,
): Promise<void> {
  await db.transactions.update(id, {
    categoryId,
    userCorrected: true,
    classificationConfidence: 1,
    updatedAt: nowStamp(),
  });
}

// ---------------------------------------------------------------------------
// קטגוריות
// ---------------------------------------------------------------------------

export async function ensureCategories(db: FinanceDatabase): Promise<void> {
  if ((await db.categories.count()) === 0) {
    await db.categories.bulkPut(DEFAULT_CATEGORIES);
  }
}

export async function createCategory(
  db: FinanceDatabase,
  input: { name: string; kind: Category['kind']; nature: CategoryNature; color?: string },
): Promise<Category> {
  const maxOrder = await db.categories.orderBy('sortOrder').last();
  const category: Category = {
    id: newId(),
    name: input.name.trim(),
    kind: input.kind,
    nature: input.nature,
    color: input.color ?? '#94a3b8',
    isSystem: false,
    sortOrder: (maxOrder?.sortOrder ?? 0) + 10,
  };
  TABLE_SCHEMAS.categories.parse(category);
  await db.categories.put(category);
  return category;
}

export async function updateCategory(
  db: FinanceDatabase,
  id: UUID,
  patch: { name?: string; nature?: CategoryNature; color?: string },
): Promise<void> {
  const existing = await db.categories.get(id);
  if (!existing) throw new Error('הקטגוריה לא נמצאה');
  const next: Category = {
    ...existing,
    ...(patch.name ? { name: patch.name.trim() } : {}),
    ...(patch.nature ? { nature: patch.nature } : {}),
    ...(patch.color ? { color: patch.color } : {}),
  };
  TABLE_SCHEMAS.categories.parse(next);
  await db.categories.put(next);
}

export interface ArchiveResult {
  archived: boolean;
  deleted: boolean;
  transactionCount: number;
}

/**
 * קטגוריה שמשויכות אליה עסקאות **לא נמחקת פיזית** — היא עוברת לארכיון.
 * מחיקה הייתה מותירה עסקאות עם הפניה לקטגוריה שאינה קיימת, והפירוט
 * לפי קטגוריה היה מציג "לא ידוע" לצמיתות.
 */
export async function archiveOrDeleteCategory(
  db: FinanceDatabase,
  id: UUID,
): Promise<ArchiveResult> {
  const category = await db.categories.get(id);
  if (!category) throw new Error('הקטגוריה לא נמצאה');
  if (category.isSystem) throw new Error('אי אפשר למחוק קטגוריית מערכת');

  const transactionCount = await db.transactions.where('categoryId').equals(id).count();
  if (transactionCount > 0) {
    await db.categories.put({ ...category, archivedAt: nowStamp() });
    return { archived: true, deleted: false, transactionCount };
  }
  await db.categories.delete(id);
  return { archived: false, deleted: true, transactionCount: 0 };
}

export async function unarchiveCategory(db: FinanceDatabase, id: UUID): Promise<void> {
  const category = await db.categories.get(id);
  if (!category) return;
  // מסירים את השדה עצמו ולא מציבים undefined — `exactOptionalPropertyTypes`
  // מבחין בין "לא קיים" לבין "קיים וריק", ו-Dexie שומר את מה שקיבל.
  const restored: Category = { ...category };
  delete restored.archivedAt;
  await db.categories.put(restored);
}

// ---------------------------------------------------------------------------
// יעד
// ---------------------------------------------------------------------------

export async function getPrimaryGoal(db: FinanceDatabase): Promise<FinancialGoal | undefined> {
  return (await db.goals.get(PRIMARY_GOAL_ID)) ?? (await db.goals.toCollection().first());
}

export async function updateGoal(
  db: FinanceDatabase,
  patch: Partial<Pick<FinancialGoal, 'targetAgorot' | 'milestones' | 'targetDate' | 'name'>>,
): Promise<void> {
  const goal = await getPrimaryGoal(db);
  if (!goal) throw new Error('לא נמצא יעד');
  const next: FinancialGoal = {
    ...goal,
    ...(patch.name ? { name: patch.name } : {}),
    ...(patch.targetAgorot !== undefined ? { targetAgorot: patch.targetAgorot } : {}),
    ...(patch.milestones ? { milestones: [...patch.milestones].sort((a, b) => a - b) } : {}),
    ...(patch.targetDate ? { targetDate: patch.targetDate } : {}),
  };
  TABLE_SCHEMAS.goals.parse(next);
  await db.goals.put(next);
}

// ---------------------------------------------------------------------------
// תמונת מצב מלאה — הקלט של `core/dashboard.ts`
// ---------------------------------------------------------------------------

export interface Snapshot {
  today: ISODate;
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  goal: FinancialGoal | undefined;
  settings: AppSettings;
  expectedIncomes: ExpectedIncome[];
  plannedExpenses: PlannedExpense[];
  recurring: RecurringTransaction[];
  cardTransactions: CardTransaction[];
  cards: CreditCard[];
  /** תאריך הייבוא האחרון שלא בוטל. `null` כשמעולם לא יובא קובץ. */
  lastImportDate: ISODate | null;
  /** תאריך הגיבוי האחרון לפי יומן הגיבויים. מפעיל את התזכורת. */
  lastBackupDate: ISODate | null;
}

export async function loadSnapshot(db: FinanceDatabase, now: Date): Promise<Snapshot> {
  const [
    accounts,
    transactions,
    categories,
    goal,
    settings,
    expectedIncomes,
    plannedExpenses,
    recurring,
    cardTransactions,
    cards,
    importSessions,
    backupRecords,
  ] = await Promise.all([
    db.accounts.toArray(),
    db.transactions.toArray(),
    db.categories.toArray(),
    getPrimaryGoal(db),
    getSettings(db),
    db.expectedIncomes.toArray(),
    db.plannedExpenses.toArray(),
    db.recurring.toArray(),
    db.cardTransactions.toArray(),
    db.cards.toArray(),
    db.importSessions.toArray(),
    db.backupRecords.toArray(),
  ]);

  // ייבוא שבוטל אינו מעיד על רעננות הנתונים
  const lastImportDate =
    importSessions
      .filter((s) => !s.undone)
      .map((s) => s.importedAt.slice(0, 10) as ISODate)
      .sort()
      .pop() ?? null;

  // גם גיבוי אוטומטי שנוצר לפני שחזור נספר: קובץ ירד למכשיר, וזו
  // בדיוק ההגנה שהתזכורת מבקשת.
  const lastBackupDate =
    backupRecords
      .map((r) => r.createdAt.slice(0, 10) as ISODate)
      .sort()
      .pop() ?? null;

  return {
    today: todayInIsrael(now),
    accounts,
    transactions,
    categories,
    goal,
    settings,
    expectedIncomes,
    plannedExpenses,
    recurring,
    cardTransactions,
    cards,
    lastImportDate,
    lastBackupDate,
  };
}
