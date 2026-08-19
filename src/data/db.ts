/**
 * בסיס הנתונים המקומי.
 *
 * הכל יושב ב-IndexedDB במכשיר. Dexie נותן טרנזקציות, אינדקסים
 * ומיגרציות גרסה — שלושת הדברים שכתיבה ידנית מול IndexedDB עושה גרוע.
 *
 * ⚠️ IndexedDB אינו מוצפן. ההגנה האמיתית היא נעילת המסך של המכשיר.
 * ראה PRIVACY.md.
 *
 * ⚠️ מגרסה 1.2 קיים סנכרון אופציונלי (`data/sync`). הוא **כבוי כברירת
 * מחדל**, ומה שעוזב את המכשיר הוא בלוב מוצפן בלבד. בסיס הנתונים
 * עצמו נשאר מקור האמת — הענן הוא עותק, לא מקור.
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

/**
 * מצב הסנכרון של המכשיר הזה. שורה יחידה.
 *
 * ⚠️ סיסמת **החשבון** לעולם אינה כאן — היא נשלחת לשירות ההתחברות
 * ולא נשמרת. סיסמת **ההצפנה** כן נשמרת כאן כשהמשתמש ביקש, וההסבר
 * המלא למה זה לא מחליש את ההצפנה נמצא ליד השדה עצמו.
 *
 * `lastSyncedLocalHash` הוא טביעת אצבע חד־כיוונית שלא ניתן לשחזר
 * ממנה נתונים — הוא משמש רק כדי לענות על "האם השתנה כאן משהו".
 */
export interface SyncStateRow {
  id: 'singleton';
  /** האם המשתמש הפעיל סנכרון בכלל. כבוי כברירת מחדל. */
  enabled: boolean;
  /** חותמת הבלוב בענן בסנכרון המוצלח האחרון. נקודת הייחוס להתנגשויות. */
  lastSyncedRemoteAt: string | null;
  /** טביעת אצבע של הנתונים המקומיים באותו רגע. */
  lastSyncedLocalHash: string | null;
  /** לתצוגה בלבד: "סונכרן לאחרונה ב…". */
  lastSyncedAt: string | null;
  /**
   * סיסמת ההצפנה, כשהמשתמש ביקש לזכור אותה במכשיר הזה.
   *
   * ⚠️ **למה זה לא מחליש את ההצפנה, ולמה זה בכל זאת דורש הסבר.**
   *
   * ההצפנה כאן מגנה מפני **השרת**: הוא מקבל בלוב אטום ואין לו מפתח.
   * המפתח שמור כאן, ב-IndexedDB — בדיוק במקום שבו כבר שמורות כל
   * העסקאות בטקסט גלוי. מי שיש לו גישה לאחסון הזה כבר מחזיק את
   * הנתונים עצמם, ולכן המפתח שלצידם אינו מוסיף לו דבר.
   *
   * במילים אחרות: לא לשמור אותו כאן היה מחמיר מול תוקף שכבר ניצח,
   * ומשלם על כך בכך שכל סנכרון דורש הקלדה ידנית.
   *
   * ⚠️ מה שכן משתנה: מי שמשאיל את המחשב שלו נותן גם גישה לענן.
   * לכן קיימת אפשרות מפורשת לא לזכור, והכיבוי מוחק את השדה מיד.
   */
  rememberedPassphrase: string | null;
  /**
   * האם המשתמש מסכים שנזכור את הסיסמה ונסנכרן לבד.
   *
   * ⚠️ שדה נפרד מ-`rememberedPassphrase` בכוונה. אילו הסקנו את
   * ההעדפה מ"האם יש סיסמה שמורה", משתמש חדש — שעדיין אין לו אחת —
   * היה מקבל תיבה לא מסומנת, הסנכרון האוטומטי לעולם לא היה מתחיל,
   * וזה בדיוק הכשל שבגללו נתונים אבדו.
   */
  rememberEnabled: boolean;
  /**
   * קוד החיבור של המכשיר הזה.
   *
   * ⚠️ נשמר כדי שאפשר יהיה להציג אותו שוב כשמחברים מכשיר נוסף.
   * בלעדיו, מי שסוגר את המסך לפני שהעתיק את הקוד מאבד את היכולת
   * לחבר מכשירים — והדרך היחידה חזרה היא למחוק את הענן ולהתחיל
   * מחדש.
   *
   * ⚠️ הקוד עצמו **לעולם אינו נשלח לשרת**. השרת מקבל רק ערכים
   * שנגזרו ממנו חד־כיוונית. ראה `data/sync/identity.ts`.
   */
  pairingCode: string | null;
}

export const SYNC_STATE_ID = 'singleton';

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
  syncState!: Table<SyncStateRow, string>;

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

    // גרסה 4: מצב הסנכרון של **המכשיר הזה**.
    //
    // ⚠️ טבלה נפרדת ולא שדה ב-`settings`, מסיבה אחת: `settings` נכללת
    // בגיבוי ולכן מסתנכרנת. אילו "מתי סונכרנתי לאחרונה" היה יושב שם,
    // הערך של הטלפון היה נכתב על המחשב בכל משיכה — ושני המכשירים היו
    // מאבדים את נקודת הייחוס שמאפשרת לזהות התנגשות.
    this.version(4).stores({
      syncState: 'id',
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
 *
 * ⚠️ כולל גם את מצב הסנכרון. אחרת המכשיר היה נשאר עם "סונכרנתי
 * לאחרונה מול הבלוב הזה" מול בסיס נתונים ריק — ובפתיחה הבאה זה
 * נראה בדיוק כמו "מחקתי הכל בכוונה", מה שהיה מעלה מחיקה לענן.
 *
 * ⚠️ מה שהמחיקה הזו **אינה** עושה: היא לא מוחקת את העותק בענן. זו
 * פעולה נפרדת ומכוונת ב-`deleteRemoteVault`, כי "ניקיתי את הטלפון"
 * ו"אני רוצה למחוק את הגיבוי שלי" הם שני דברים שונים לגמרי.
 */
export async function wipeAllData(database: FinanceDatabase): Promise<void> {
  const tables = [
    ...Object.values(allTables(database)),
    database.backupRecords,
    database.syncState,
  ];
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
