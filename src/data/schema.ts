/**
 * סכמות ולידציה בזמן ריצה.
 *
 * טיפוסי ה-TypeScript ב-`core/types.ts` הם מקור האמת למבנה. הסכמות כאן
 * שומרות על הגבול שבו נתונים **נכנסים** למערכת — בעיקר בשחזור גיבוי,
 * שם הקובץ עלול להיות פגום, ישן, או לא מה שהמשתמש חשב שהוא בחר.
 *
 * ⚠️ אין כאן ולא יהיה שדה של פרטי התחברות. `src/tests/privacy.test.ts`
 * סורק את הקובץ הזה ונכשל אם יופיע אחד מהם.
 */

import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 1;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך חייב להיות בפורמט YYYY-MM-DD');
const isoMonth = z.string().regex(/^\d{4}-\d{2}$/, 'חודש חייב להיות בפורמט YYYY-MM');
const timestamp = z.string().min(1);
const uuid = z.string().min(1);
/** סכום באגורות — תמיד מספר שלם. */
const agorot = z.number().int('סכומים נשמרים באגורות שלמות בלבד');
const positiveAgorot = agorot.nonnegative('סכום לא יכול להיות שלילי');

export const accountSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(60),
  type: z.enum(['bank', 'cash']),
  openingBalanceAgorot: agorot,
  openingDate: isoDate,
});

export const transactionSchema = z.object({
  id: uuid,
  accountId: uuid,
  date: isoDate,
  amountAgorot: positiveAgorot.refine((v) => v > 0, 'סכום עסקה חייב להיות גדול מאפס'),
  type: z.enum(['income', 'expense']),
  merchant: z.string().max(200),
  merchantNormalized: z.string().max(200),
  categoryId: uuid,
  paymentMethod: z.string().max(60),
  recurrence: z.enum(['one_time', 'recurring']),
  recurringId: uuid.optional(),
  planned: z.boolean(),
  note: z.string().max(500).optional(),
  source: z.enum(['manual', 'file']),
  importSessionId: uuid.optional(),
  classificationConfidence: z.number().min(0).max(1),
  userCorrected: z.boolean(),
  status: z.enum(['actual', 'pending']),
  kind: z.enum(['normal', 'balance_adjustment']),
  importHash: z.string().optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const categorySchema = z.object({
  id: uuid,
  name: z.string().min(1).max(40),
  kind: z.enum(['income', 'expense']),
  nature: z.enum(['essential', 'important', 'fun', 'reducible', 'system']),
  parentId: uuid.optional(),
  color: z.string().max(30),
  isSystem: z.boolean(),
  sortOrder: z.number().int(),
  archivedAt: timestamp.optional(),
});

export const financialGoalSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(60),
  targetAgorot: positiveAgorot,
  startingBalanceAgorot: agorot,
  startDate: isoDate,
  targetDate: isoDate.optional(),
  minimumAfterReachedAgorot: positiveAgorot,
  milestones: z.array(positiveAgorot),
  isPrimary: z.boolean(),
  achievedAt: timestamp.optional(),
});

export const expectedIncomeSchema = z.object({
  id: uuid,
  label: z.string().min(1).max(120),
  expectedAmountAgorot: positiveAgorot,
  expectedDate: isoDate,
  certainty: z.enum(['confirmed', 'likely', 'possible']),
  hours: z.number().nonnegative().optional(),
  hourlyRateAgorot: positiveAgorot.optional(),
  relatedCostsAgorot: positiveAgorot.optional(),
  received: z.boolean(),
  receivedTransactionId: uuid.optional(),
});

export const plannedExpenseSchema = z.object({
  id: uuid,
  label: z.string().min(1).max(120),
  amountAgorot: positiveAgorot,
  dueDate: isoDate,
  categoryId: uuid.optional(),
  priority: z.enum(['must', 'want']),
  paid: z.boolean(),
});

export const recurringTransactionSchema = z.object({
  id: uuid,
  label: z.string().min(1).max(120),
  amountAgorot: positiveAgorot,
  type: z.enum(['income', 'expense']),
  categoryId: uuid,
  frequency: z.enum(['monthly', 'weekly', 'yearly']),
  dayOfCycle: z.number().int().min(0).max(31),
  active: z.boolean(),
  lastSeenDate: isoDate.optional(),
  detectedAutomatically: z.boolean(),
});

export const merchantRuleSchema = z.object({
  id: uuid,
  merchantNormalized: z.string().min(1).max(200),
  categoryId: uuid,
  matchType: z.enum(['exact', 'keyword']),
  correctionCount: z.number().int().nonnegative(),
  source: z.enum(['seed', 'learned']),
  updatedAt: timestamp,
});

export const importSessionSchema = z.object({
  id: uuid,
  fileName: z.string().max(260),
  fileHash: z.string().max(128),
  importedAt: timestamp,
  rowsTotal: z.number().int().nonnegative(),
  rowsImported: z.number().int().nonnegative(),
  rowsDuplicate: z.number().int().nonnegative(),
  rowsFailed: z.number().int().nonnegative(),
  failures: z.string(),
  columnMapping: z.string(),
  undone: z.boolean(),
});

export const budgetSchema = z.object({
  id: uuid,
  month: isoMonth,
  plan: z.enum(['conservative', 'balanced', 'flexible', 'custom']),
  totalPlannedAgorot: positiveAgorot,
  funBudgetAgorot: positiveAgorot,
  safetyBufferAgorot: positiveAgorot,
  goalContributionAgorot: positiveAgorot,
});

/**
 * נעילת האפליקציה.
 *
 * ⚠️ אין כאן שדה לקוד עצמו, ולא יהיה. `verifier` הוא פלט PBKDF2 עם
 * `salt` אקראי — חד-כיווני. `src/tests/privacy.test.ts` נכשל אם מישהו
 * ינסה להוסיף כאן שמירה של הקוד.
 */
export const appLockSchema = z.object({
  verifier: z.string().min(1).max(200),
  salt: z.string().min(1).max(200),
  iterations: z.number().int().positive(),
  autoLockMinutes: z.number().int().min(0).max(60),
});

export const appSettingsSchema = z.object({
  id: z.literal('singleton'),
  schemaVersion: z.number().int().positive(),
  safetyBufferAgorot: positiveAgorot,
  budgetPlanId: z.enum(['conservative', 'balanced', 'flexible']),
  estimatedMonthlySpendAgorot: positiveAgorot,
  showAgorot: z.boolean(),
  discreetMode: z.boolean(),
  // ברירת מחדל כשהשדה נעדר — גיבוי שנוצר לפני שהערכות הוצגו עדיין נטען
  theme: z.enum(['system', 'light', 'dark']).optional(),
  lastAccountId: uuid.optional(),
  onboardingCompletedAt: timestamp.optional(),
  lastBackupAt: timestamp.optional(),
  backupReminderDismissedUntil: isoDate.optional(),
  lock: appLockSchema.optional(),
});

export const backupRecordSchema = z.object({
  id: uuid,
  createdAt: timestamp,
  schemaVersion: z.number().int().positive(),
  rowCounts: z.record(z.number().int().nonnegative()),
  encrypted: z.boolean(),
  reason: z.enum(['manual', 'pre_restore']),
});

export const creditCardSchema = z.object({
  id: uuid,
  nickname: z.string().min(1).max(60),
  // ⚠️ ארבע ספרות בדיוק. מספר כרטיס מלא נדחה ברמת הסכמה.
  last4: z.string().regex(/^\d{4}$/, 'נשמרות ארבע ספרות אחרונות בלבד'),
  issuer: z.string().max(80),
  chargeMode: z.enum(['immediate', 'monthly']),
  active: z.boolean(),
});

export const cardTransactionSchema = z.object({
  id: uuid,
  cardId: uuid,
  purchaseDate: isoDate,
  billingDate: isoDate.optional(),
  merchant: z.string().max(200),
  merchantNormalized: z.string().max(200),
  amountAgorot: positiveAgorot,
  currency: z.string().length(3),
  originalAmountAgorot: positiveAgorot.optional(),
  originalCurrency: z.string().length(3).optional(),
  categoryId: uuid,
  issuerCategory: z.string().max(60).optional(),
  installmentNumber: z.number().int().positive().optional(),
  installmentCount: z.number().int().positive().optional(),
  isRefund: z.boolean(),
  status: z.enum(['billed', 'pending']),
  sourceFile: z.string().max(260),
  importSessionId: uuid.optional(),
  classificationConfidence: z.number().min(0).max(1),
  userCorrected: z.boolean(),
  linkedBankTransactionId: uuid.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

/**
 * כל טבלאות **הנתונים** במקום אחד — מבטיח שגיבוי לא ישכח טבלה.
 *
 * ⚠️ `backupRecords` אינה כאן בכוונה. היא יומן מקומי של המכשיר ("מתי
 * גיבית"), לא נתון פיננסי. אילו הייתה נכללת, שחזור של קובץ ישן היה
 * דורס את יומן הגיבויים — כולל את הרישום של הגיבוי שנוצר רגע לפני
 * אותו שחזור, שהוא בדיוק רשת הביטחון.
 */
export const TABLE_SCHEMAS = {
  accounts: accountSchema,
  transactions: transactionSchema,
  categories: categorySchema,
  goals: financialGoalSchema,
  expectedIncomes: expectedIncomeSchema,
  plannedExpenses: plannedExpenseSchema,
  recurring: recurringTransactionSchema,
  merchantRules: merchantRuleSchema,
  importSessions: importSessionSchema,
  budgets: budgetSchema,
  settings: appSettingsSchema,
  cards: creditCardSchema,
  cardTransactions: cardTransactionSchema,
} as const;

export type TableName = keyof typeof TABLE_SCHEMAS;
export const TABLE_NAMES = Object.keys(TABLE_SCHEMAS) as TableName[];

export const backupDataSchema = z.object({
  accounts: z.array(accountSchema),
  transactions: z.array(transactionSchema),
  categories: z.array(categorySchema),
  goals: z.array(financialGoalSchema),
  expectedIncomes: z.array(expectedIncomeSchema),
  plannedExpenses: z.array(plannedExpenseSchema),
  recurring: z.array(recurringTransactionSchema),
  merchantRules: z.array(merchantRuleSchema),
  importSessions: z.array(importSessionSchema),
  budgets: z.array(budgetSchema),
  settings: z.array(appSettingsSchema),
  // ברירת מחדל ריקה: גיבוי שנוצר לפני תמיכה בכרטיסים עדיין נטען
  cards: z.array(creditCardSchema).default([]),
  cardTransactions: z.array(cardTransactionSchema).default([]),
});

export type BackupData = z.infer<typeof backupDataSchema>;

export const BACKUP_FORMAT = 'finance-manager-backup';

export const plainBackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.number().int().positive(),
  createdAt: timestamp,
  encrypted: z.literal(false),
  data: backupDataSchema,
});

export const encryptedBackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.number().int().positive(),
  createdAt: timestamp,
  encrypted: z.literal(true),
  kdf: z.object({
    name: z.literal('PBKDF2'),
    iterations: z.number().int().positive(),
    hash: z.literal('SHA-256'),
    salt: z.string().min(1),
  }),
  cipher: z.object({ name: z.literal('AES-GCM'), iv: z.string().min(1) }),
  payload: z.string().min(1),
});

export const backupFileSchema = z.discriminatedUnion('encrypted', [
  plainBackupSchema,
  encryptedBackupSchema,
]);

export type PlainBackup = z.infer<typeof plainBackupSchema>;
export type EncryptedBackup = z.infer<typeof encryptedBackupSchema>;
export type BackupFile = z.infer<typeof backupFileSchema>;
