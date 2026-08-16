/**
 * טיפוסי הדומיין של מנוע החישוב.
 *
 * מוסכמות מחייבות:
 *  • כל סכום כסף הוא `Agorot` — מספר שלם של אגורות. אין float בחישובי כסף.
 *  • כל תאריך הוא `ISODate` בפורמט 'YYYY-MM-DD' — תאריך לוח, בלי שעה ובלי אזור זמן.
 *  • אף פונקציה ב-core לא קוראת לשעון. "עכשיו" מגיע תמיד כפרמטר.
 */

/** מספר שלם של אגורות. ‎100 אגורות = ₪1. */
export type Agorot = number;

/** תאריך לוח בפורמט 'YYYY-MM-DD'. */
export type ISODate = string;

/** חודש בפורמט 'YYYY-MM'. */
export type ISOMonth = string;

export type UUID = string;

// ---------------------------------------------------------------------------
// חשבונות
// ---------------------------------------------------------------------------

export type AccountType = 'bank' | 'cash';

export interface Account {
  id: UUID;
  name: string;
  type: AccountType;
  /** היתרה בתאריך הפתיחה. זהו **הנתון היחיד** של יתרה שנשמר במערכת. */
  openingBalanceAgorot: Agorot;
  /** עסקאות לפני תאריך זה מתעלמים מהן — הן כבר כלולות ביתרת הפתיחה. */
  openingDate: ISODate;
}

// ---------------------------------------------------------------------------
// עסקאות
// ---------------------------------------------------------------------------

export type TransactionType = 'income' | 'expense';

/** `actual` = קרה בפועל ונספר ביתרה. `pending` = טרם קרה ולא נספר. */
export type TransactionStatus = 'actual' | 'pending';

/**
 * `normal` = עסקה אמיתית.
 * `balance_adjustment` = תיקון פער מול היתרה בבנק. נספר ביתרה,
 * אך **מוחרג** מסיכומי הכנסות/הוצאות כדי לא לזהם ניתוח התנהגות.
 */
export type TransactionKind = 'normal' | 'balance_adjustment';

export type TransactionSourceKind = 'manual' | 'file';

export type Recurrence = 'one_time' | 'recurring';

export interface Transaction {
  id: UUID;
  accountId: UUID;
  date: ISODate;
  /** תמיד חיובי. הכיוון נקבע לפי `type`. */
  amountAgorot: Agorot;
  type: TransactionType;
  merchant: string;
  merchantNormalized: string;
  categoryId: UUID;
  paymentMethod: string;
  recurrence: Recurrence;
  recurringId?: UUID;
  /** האם ההוצאה הייתה מתוכננת מראש. */
  planned: boolean;
  note?: string;
  source: TransactionSourceKind;
  importSessionId?: UUID;
  /** 0–1. רמת הביטחון של הסיווג האוטומטי. 1 = תוקן ידנית. */
  classificationConfidence: number;
  userCorrected: boolean;
  status: TransactionStatus;
  kind: TransactionKind;
  importHash?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// קטגוריות
// ---------------------------------------------------------------------------

export type CategoryKind = 'income' | 'expense';

/**
 * אופי ההוצאה — קובע אילו קטגוריות רשאיות להופיע בהמלצות לצמצום.
 * המערכת לעולם לא תמליץ לאפס קטגוריית `fun`.
 */
export type CategoryNature = 'essential' | 'important' | 'fun' | 'reducible' | 'system';

export interface Category {
  id: UUID;
  name: string;
  kind: CategoryKind;
  nature: CategoryNature;
  parentId?: UUID;
  color: string;
  isSystem: boolean;
  sortOrder: number;
  archivedAt?: string;
}

// ---------------------------------------------------------------------------
// תקציב ויעדים
// ---------------------------------------------------------------------------

export type BudgetPlanId = 'conservative' | 'balanced' | 'flexible' | 'custom';

export interface Budget {
  id: UUID;
  month: ISOMonth;
  plan: BudgetPlanId;
  totalPlannedAgorot: Agorot;
  funBudgetAgorot: Agorot;
  safetyBufferAgorot: Agorot;
  goalContributionAgorot: Agorot;
}

export interface BudgetCategory {
  id: UUID;
  budgetId: UUID;
  categoryId: UUID;
  plannedAgorot: Agorot;
  isFixed: boolean;
}

export interface FinancialGoal {
  id: UUID;
  name: string;
  targetAgorot: Agorot;
  startingBalanceAgorot: Agorot;
  startDate: ISODate;
  targetDate?: ISODate;
  /** לאחר השגת היעד — הסכום שאסור לרדת מתחתיו. */
  minimumAfterReachedAgorot: Agorot;
  milestones: Agorot[];
  isPrimary: boolean;
  achievedAt?: string;
}

// ---------------------------------------------------------------------------
// הכנסות צפויות והוצאות מתוכננות
// ---------------------------------------------------------------------------

/**
 * `confirmed` — סוכם ובטוח. **רק זה** נכנס לתחזית סוף החודש.
 * `likely` / `possible` — מוצגים בנפרד ולעולם לא נספרים בשום חישוב של כסף זמין.
 */
export type IncomeCertainty = 'confirmed' | 'likely' | 'possible';

export interface ExpectedIncome {
  id: UUID;
  label: string;
  expectedAmountAgorot: Agorot;
  expectedDate: ISODate;
  certainty: IncomeCertainty;
  hours?: number;
  hourlyRateAgorot?: Agorot;
  relatedCostsAgorot?: Agorot;
  received: boolean;
  receivedTransactionId?: UUID;
}

export type ExpensePriority = 'must' | 'want';

export interface PlannedExpense {
  id: UUID;
  label: string;
  amountAgorot: Agorot;
  dueDate: ISODate;
  categoryId?: UUID;
  priority: ExpensePriority;
  paid: boolean;
}

export type RecurringFrequency = 'monthly' | 'weekly' | 'yearly';

export interface RecurringTransaction {
  id: UUID;
  label: string;
  amountAgorot: Agorot;
  type: TransactionType;
  categoryId: UUID;
  frequency: RecurringFrequency;
  /** יום בחודש (1–31) עבור monthly, יום בשבוע (0–6) עבור weekly. */
  dayOfCycle: number;
  active: boolean;
  lastSeenDate?: ISODate;
  detectedAutomatically: boolean;
}

// ---------------------------------------------------------------------------
// סיווג אוטומטי וייבוא (נבנים בשלב 3; הטיפוסים קיימים כבר עכשיו כדי
// שהגיבוי יכלול אותם ולא יאבד נתונים בשדרוג)
// ---------------------------------------------------------------------------

export interface MerchantRule {
  id: UUID;
  merchantNormalized: string;
  categoryId: UUID;
  matchType: 'exact' | 'keyword';
  correctionCount: number;
  source: 'seed' | 'learned';
  updatedAt: string;
}

export interface ImportSession {
  id: UUID;
  fileName: string;
  fileHash: string;
  importedAt: string;
  rowsTotal: number;
  rowsImported: number;
  rowsDuplicate: number;
  rowsFailed: number;
  failures: string;
  columnMapping: string;
  undone: boolean;
}

// ---------------------------------------------------------------------------
// גיבויים
// ---------------------------------------------------------------------------

/**
 * תיעוד של גיבוי שנוצר — לא הגיבוי עצמו.
 *
 * ⚠️ אין כאן שום נתון פיננסי: תאריך, גרסת סכמה, ספירות שורות והאם
 * הקובץ הוצפן. די בזה כדי לדעת מתי גיבית לאחרונה, וזה כל מה שנדרש
 * לתזכורת. שמירת יותר מזה הייתה מייצרת עותק שני של המידע בלי סיבה.
 */
export interface BackupRecord {
  id: UUID;
  createdAt: string;
  schemaVersion: number;
  rowCounts: Record<string, number>;
  encrypted: boolean;
  /** `pre_restore` — גיבוי אוטומטי של המצב שנדרס בשחזור. */
  reason: 'manual' | 'pre_restore';
}

// ---------------------------------------------------------------------------
// כרטיסי אשראי
// ---------------------------------------------------------------------------

/**
 * איך הכרטיס מחייב את חשבון הבנק.
 *
 * `immediate` — כרטיס דביט ("ויזה מיידי"): כל יום קניות מתקבץ לחיוב
 * נפרד בבנק כעבור יום-שלושה. אין מחזור חודשי.
 * `monthly` — כרטיס אשראי רגיל: חיוב מרוכז אחד בחודש.
 */
export type CardChargeMode = 'immediate' | 'monthly';

export interface CreditCard {
  id: UUID;
  nickname: string;
  /** ⚠️ ארבע ספרות אחרונות בלבד. מספר כרטיס מלא לא נשמר לעולם. */
  last4: string;
  issuer: string;
  chargeMode: CardChargeMode;
  active: boolean;
}

/** `pending` — עסקה שטרם ירדה מהבנק ולכן אינה הוצאה שבוצעה. */
export type CardTransactionStatus = 'billed' | 'pending';

/**
 * עסקה שבוצעה בכרטיס.
 *
 * ⚠️ זו **אינה** תנועה בחשבון הבנק. היא מתארת מה נקנה ואיפה; החיוב
 * בפועל הוא `Transaction` נפרד בחשבון הבנק. ההפרדה הזו היא מה שמונע
 * ספירה כפולה — ראה `core/effectiveSpending.ts`.
 */
export interface CardTransaction {
  id: UUID;
  cardId: UUID;
  purchaseDate: ISODate;
  /** מתי ירד בפועל מהבנק, כשידוע. */
  billingDate?: ISODate;
  merchant: string;
  merchantNormalized: string;
  /** הסכום שחויב בשקלים — זה הסכום שמשפיע על הכסף. */
  amountAgorot: Agorot;
  currency: string;
  /** בעסקת מט״ח: הסכום והמטבע המקוריים, למידע בלבד. */
  originalAmountAgorot?: Agorot;
  originalCurrency?: string;
  categoryId: UUID;
  /** קטגוריית הענף מחברת האשראי — רמז חזק לסיווג. */
  issuerCategory?: string;
  installmentNumber?: number;
  installmentCount?: number;
  isRefund: boolean;
  status: CardTransactionStatus;
  sourceFile: string;
  importSessionId?: UUID;
  classificationConfidence: number;
  userCorrected: boolean;
  /** החיוב בבנק שאליו העסקה שויכה. `undefined` = טרם שויכה. */
  linkedBankTransactionId?: UUID;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// הגדרות המשתמש
// ---------------------------------------------------------------------------

export type ConcreteBudgetPlanId = 'conservative' | 'balanced' | 'flexible';

/** שלוש הבחירות המהירות לסכום הביטחון. האמצעית היא ברירת המחדל. */
export const SAFETY_BUFFER_PRESETS_AGOROT = [30_000, 50_000, 80_000] as const;
export const DEFAULT_SAFETY_BUFFER_AGOROT = 50_000;

/** רשומה יחידה. אין בה שם, אימייל או שום פרט מזהה. */
export interface AppSettings {
  id: 'singleton';
  schemaVersion: number;
  safetyBufferAgorot: Agorot;
  budgetPlanId: ConcreteBudgetPlanId;
  /** הערכת המשתמש מהאונבורדינג, לשימוש עד שתצטבר היסטוריה. */
  estimatedMonthlySpendAgorot: Agorot;
  showAgorot: boolean;
  /** מטשטש סכומים על המסך — לצילומי מסך ולמבטים מזדמנים. */
  discreetMode: boolean;
  /** ערכת צבעים. `system` הולך אחרי הגדרת המכשיר. */
  theme?: ThemePreference;
  /** החשבון שנעשה בו שימוש לאחרונה — ברירת המחדל בהוספת עסקה. */
  lastAccountId?: UUID;
  onboardingCompletedAt?: string;
  lastBackupAt?: string;
  /** עד מתי המשתמש ביקש שקט מתזכורת הגיבוי. דחייה זמנית, לא ביטול. */
  backupReminderDismissedUntil?: ISODate;
  /** נעילת האפליקציה. נעדר = כבוי. ראה `AppLock`. */
  lock?: AppLock;
}

/**
 * נעילת האפליקציה — הרתעה, לא הצפנה.
 *
 * ⚠️ הקוד עצמו **אינו נשמר**. נשמר ממנו `verifier` בלבד: תוצאת PBKDF2
 * עם salt אקראי, שאי אפשר להפוך בחזרה לקוד. אימות = גזירה מחדש והשוואה.
 *
 * ⚠️ זה לא מצפין את IndexedDB. מי שיש לו גישה למכשיר לא-נעול ויודע
 * לפתוח את כלי הפיתוח יראה את הנתונים בלי קשר לקוד הזה. הוא מונע מבט
 * מזדמן, וזו כל ההבטחה.
 */
export interface AppLock {
  verifier: string;
  salt: string;
  iterations: number;
  /** 0 = לנעול מיד כשעוזבים את האפליקציה. */
  autoLockMinutes: number;
}

export const AUTO_LOCK_CHOICES_MINUTES = [0, 1, 5, 15] as const;

/**
 * ערכת הצבעים.
 *
 * ⚠️ `system` היא ברירת המחדל ולא "בהיר". מי שהגדיר את הטלפון שלו
 * לכהה עשה את זה בכוונה, ואפליקציה שמתעלמת מזה נפתחת כמסך לבן בחדר
 * חשוך.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_CHOICES: readonly ThemePreference[] = ['system', 'light', 'dark'];

// ---------------------------------------------------------------------------
// רמת ביטחון
// ---------------------------------------------------------------------------

/**
 * `none` — אין מספיק נתונים. הממשק לא יציג מספר כלל.
 * `low` / `medium` / `high` — ראה `core/confidence.ts` לכללים המדויקים.
 */
export type Confidence = 'none' | 'low' | 'medium' | 'high';

export type RiskLevel = 'low' | 'medium' | 'high';
