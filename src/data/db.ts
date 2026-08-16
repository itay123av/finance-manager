/**
 * בסיס הנתונים המקומי.
 *
 * הכל יושב ב-IndexedDB במכשיר. אין שרת, אין סנכרון, אין חיבור יוצא.
 * Dexie נותן טרנזקציות, אינדקסים ומיגרציות גרסה — שלושת הדברים
 * שכתיבה ידנית מול IndexedDB עושה גרוע.
 *
 * ⚠️ IndexedDB אינו מוצפן. ההגנה האמיתית היא נעילת המסך של המכשיר.
 * ראה PRIVACY.md.
 */

import Dexie, { type Table } from 'dexie';
import type {
  Account,
  AppSettings,
  BackupRecord,
  Budget,
  CardTransaction,
  Category,
  CreditCard,
  ExpectedIncome,
  FinancialGoal,
  ImportSession,
  MerchantRule,
  PlannedExpense,
  RecurringTransaction,
  Transaction,
} from '../core/types';

export const DB_NAME = 'finance-manager';
export const SETTINGS_ID = 'singleton';

export class FinanceDatabase extends Dexie {
  accounts!: Table<Account, string>;
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  goals!: Table<FinancialGoal, string>;
  expectedIncomes!: Table<ExpectedIncome, string>;
  plannedExpenses!: Table<PlannedExpense, string>;
  recurring!: Table<RecurringTransaction, string>;
  merchantRules!: Table<MerchantRule, string>;
  importSessions!: Table<ImportSession, string>;
  budgets!: Table<Budget, string>;
  settings!: Table<AppSettings, string>;
  cards!: Table<CreditCard, string>;
  cardTransactions!: Table<CardTransaction, string>;
  backupRecords!: Table<BackupRecord, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores({
      accounts: 'id, type',
      // האינדקס על date הוא הכבד ביותר בשימוש — כל חישוב תקופתי נשען עליו.
      transactions:
        'id, date, categoryId, accountId, status, [date+type], [accountId+date], merchantNormalized, importSessionId, importHash',
      categories: 'id, kind, nature, sortOrder, archivedAt',
      goals: 'id, isPrimary',
      expectedIncomes: 'id, expectedDate, certainty, received',
      plannedExpenses: 'id, dueDate, paid, priority',
      recurring: 'id, active, categoryId',
      merchantRules: 'id, &merchantNormalized',
      importSessions: 'id, importedAt, undone',
      budgets: 'id, &month',
      settings: 'id',
    });

    // גרסה 2: כרטיסי אשראי. Dexie מוסיף את הטבלאות בלי לגעת בקיימות.
    this.version(2).stores({
      cards: 'id, &last4, active',
      cardTransactions:
        'id, cardId, purchaseDate, linkedBankTransactionId, importSessionId, merchantNormalized, status',
    });

    // גרסה 3: יומן גיבויים. אין כאן נתונים פיננסיים — רק "מתי גיבית",
    // וזה מה שמפעיל את התזכורת.
    this.version(3).stores({
      backupRecords: 'id, createdAt, reason',
    });
  }
}

/** מופע יחיד לשימוש האפליקציה. הבדיקות יוצרות מופעים משלהן. */
export const db = new FinanceDatabase();

/**
 * טבלאות הנתונים, בסדר קבוע — לגיבוי ולשחזור.
 *
 * ⚠️ `backupRecords` אינה כאן. שחזור לא אמור לדרוס את יומן הגיבויים
 * של המכשיר — ובמיוחד לא את הרישום של הגיבוי שנוצר רגע לפניו.
 * מחיקה מלאה כן מוחקת גם אותה, דרך `wipeAllData`.
 */
export function allTables(database: FinanceDatabase) {
  return {
    accounts: database.accounts,
    transactions: database.transactions,
    categories: database.categories,
    goals: database.goals,
    expectedIncomes: database.expectedIncomes,
    plannedExpenses: database.plannedExpenses,
    recurring: database.recurring,
    merchantRules: database.merchantRules,
    importSessions: database.importSessions,
    budgets: database.budgets,
    settings: database.settings,
    cards: database.cards,
    cardTransactions: database.cardTransactions,
  } as const;
}

/**
 * מוחק את כל הנתונים. בלתי הפיך.
 * מתבצע בטרנזקציה אחת — או שהכל נמחק, או ששום דבר לא נמחק.
 *
 * כולל את יומן הגיבויים: "מחיקת כל הנתונים" שמשאירה עקבות אינה מחיקה.
 */
export async function wipeAllData(database: FinanceDatabase): Promise<void> {
  const tables = [...Object.values(allTables(database)), database.backupRecords];
  await database.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
  });
  clearWebStorage();
}

/**
 * מנקה גם את אחסון הדפדפן.
 *
 * ⚠️ נכון להיום האפליקציה לא כותבת ל-`localStorage` ולא ל-`sessionStorage`
 * — כל ההעדפות יושבות בטבלת ההגדרות. הניקוי כאן הוא הגנה מפני העתיד:
 * הרגע שבו מישהו יוסיף "רק דגל קטן" ל-localStorage, "מחיקת כל הנתונים"
 * תפסיק להיות מלאה — בשקט, בלי שאף בדיקה תיפול.
 *
 * ⚠️ מה שלא נמחק כאן, בכוונה: ה-cache של ה-Service Worker. הוא מכיל
 * את קוד האפליקציה בלבד, ומחיקתו רק הייתה שוברת עבודה במצב לא מקוון.
 */
function clearWebStorage(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  } catch {
    // דפדפן שחוסם אחסון (מצב פרטי מחמיר) — אין מה לנקות ואין מה לדווח
  }
}
