/**
 * ════════════════════════════════════════════════════════════════════════
 *  נתוני דוגמה — פיקטיביים לחלוטין.
 *
 *  ⚠️ אין כאן שום נתון אמיתי, ולעולם לא יהיה.
 *     הקובץ נטען רק במצב פיתוח, מאחורי פעולה מפורשת.
 *     נתונים אמיתיים חיים אך ורק ב-IndexedDB של המשתמש.
 * ════════════════════════════════════════════════════════════════════════
 *
 * הפרופיל: בן 16, יתרה התחלתית נמוכה, רוב ההכנסה ביולי-אוגוסט.
 * מקרי הקצה שנבנו לתוך הנתונים בכוונה:
 *   • פברואר 2026 — חודש **בלי שום הכנסה**
 *   • יולי-אוגוסט 2025 ו-2026 — הכנסה גדולה שמעוותת ממוצע רגיל
 *   • מרץ 2026 — רכישה גדולה חד-פעמית (₪380) לבדיקת זיהוי חריגות
 *   • Spotify — מנוי חודשי רץ, לבדיקת זיהוי הוצאות חוזרות
 *   • עסקאות מזומן לצד הבנק — לבדיקת ריבוי חשבונות
 *
 * הנתונים דטרמיניסטיים (PRNG עם זרע קבוע), כדי שהבדיקות יהיו יציבות.
 */

import { DEFAULT_CATEGORIES } from '../../content/categories.seed';
import { addMonthsToMonth, daysInMonth, makeISODate, monthOf } from '../../core/dates';
import { fromShekels } from '../../core/money';
import type {
  Account,
  Category,
  ExpectedIncome,
  FinancialGoal,
  ISODate,
  ISOMonth,
  PlannedExpense,
  RecurringTransaction,
  Transaction,
} from '../../core/types';

/** תאריך קבוע לכל הבדיקות. אין קריאה לשעון בשום מקום. */
export const SEED_TODAY: ISODate = '2026-08-07';
export const SEED_START_MONTH: ISOMonth = '2025-06';

// ---------------------------------------------------------------------------
// מחולל אקראיות דטרמיניסטי
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// חשבונות ויעד
// ---------------------------------------------------------------------------

export const SEED_ACCOUNTS: Account[] = [
  {
    id: 'acc-bank',
    name: 'חשבון בנק',
    type: 'bank',
    openingBalanceAgorot: fromShekels(620),
    openingDate: '2025-06-01',
  },
  {
    id: 'acc-cash',
    name: 'מזומן',
    type: 'cash',
    openingBalanceAgorot: fromShekels(80),
    openingDate: '2025-06-01',
  },
];

export const SEED_GOAL: FinancialGoal = {
  id: 'goal-primary',
  name: 'יעד 5,000 ש״ח',
  targetAgorot: fromShekels(5000),
  startingBalanceAgorot: fromShekels(700),
  startDate: '2025-06-01',
  targetDate: '2027-06-30',
  minimumAfterReachedAgorot: fromShekels(4500),
  milestones: [fromShekels(1000), fromShekels(2500), fromShekels(5000)],
  isPrimary: true,
};

export const SEED_RECURRING: RecurringTransaction[] = [
  {
    id: 'rec-spotify',
    label: 'Spotify',
    amountAgorot: fromShekels(22),
    type: 'expense',
    categoryId: 'cat-phone',
    frequency: 'monthly',
    dayOfCycle: 12,
    active: true,
    lastSeenDate: '2026-07-12',
    detectedAutomatically: true,
  },
];

export const SEED_EXPECTED_INCOMES: ExpectedIncome[] = [
  {
    id: 'inc-aug-second',
    label: 'משכורת שנייה מהעבודה בקיץ',
    expectedAmountAgorot: fromShekels(1100),
    expectedDate: '2026-08-28',
    certainty: 'confirmed',
    hours: 55,
    hourlyRateAgorot: fromShekels(20),
    received: false,
  },
  {
    id: 'inc-babysitting',
    label: 'שמירה על ילדים אצל השכנים',
    expectedAmountAgorot: fromShekels(180),
    expectedDate: '2026-08-22',
    certainty: 'likely',
    received: false,
  },
  {
    id: 'inc-maybe-tutoring',
    label: 'שיעור פרטי אפשרי',
    expectedAmountAgorot: fromShekels(120),
    expectedDate: '2026-08-25',
    certainty: 'possible',
    received: false,
  },
];

export const SEED_PLANNED_EXPENSES: PlannedExpense[] = [
  {
    id: 'plan-schoolbooks',
    label: 'ספרי לימוד',
    amountAgorot: fromShekels(240),
    dueDate: '2026-08-25',
    categoryId: 'cat-study',
    priority: 'must',
    paid: false,
  },
  {
    id: 'plan-shoes',
    label: 'נעליים חדשות',
    amountAgorot: fromShekels(300),
    dueDate: '2026-08-30',
    categoryId: 'cat-clothes',
    priority: 'want',
    paid: false,
  },
];

// ---------------------------------------------------------------------------
// מחולל העסקאות
// ---------------------------------------------------------------------------

interface SpendPattern {
  categoryId: string;
  merchants: string[];
  timesPerMonth: [min: number, max: number];
  amountShekels: [min: number, max: number];
  account: 'acc-bank' | 'acc-cash';
}

/**
 * דפוסי ההוצאה מכוילים כך שהתמונה תהיה "צפוף אבל אפשרי":
 * בחודש רגיל יש שחיקה קלה, ובקיץ קפיצה שמכסה אותה ומקדמת ליעד.
 *
 * כיול גבוה מדי היה מייצר משתמש שאצלו "בטוח להוציא" שלילי לצמיתות
 * והיעד בלתי-אפשרי — מקרה קצה תקף שנבדק בנפרד, אבל בסיס גרוע להדגמה.
 */
const SPEND_PATTERNS: SpendPattern[] = [
  { categoryId: 'cat-friends', merchants: ['סינמה סיטי', 'באולינג', 'פארק מים', 'אסקייפ רום'], timesPerMonth: [1, 3], amountShekels: [30, 75], account: 'acc-bank' },
  { categoryId: 'cat-food-out', merchants: ['ארומה', 'מקדונלדס', 'פיצה האט', 'קופיקס', 'שווארמה הכיכר'], timesPerMonth: [3, 5], amountShekels: [20, 45], account: 'acc-bank' },
  { categoryId: 'cat-transport', merchants: ['רב קו', 'רב קו', 'Gett'], timesPerMonth: [3, 5], amountShekels: [12, 22], account: 'acc-bank' },
  { categoryId: 'cat-shopping', merchants: ['רמי לוי', 'שופרסל', 'AliExpress'], timesPerMonth: [1, 2], amountShekels: [15, 40], account: 'acc-cash' },
  { categoryId: 'cat-games', merchants: ['Steam', 'Google Play'], timesPerMonth: [0, 1], amountShekels: [19, 35], account: 'acc-bank' },
];

interface SeedIncome {
  month: ISOMonth;
  day: number;
  label: string;
  categoryId: string;
  shekels: number;
}

/** פברואר 2026 מושמט בכוונה — חודש בלי שום הכנסה. */
const SEED_INCOMES: SeedIncome[] = [
  { month: '2025-07', day: 5, label: 'עבודה בעסק מקומי', categoryId: 'cat-work', shekels: 2400 },
  { month: '2025-08', day: 5, label: 'עבודה בעסק מקומי', categoryId: 'cat-work', shekels: 1850 },
  { month: '2025-09', day: 18, label: 'החזר על טיול כיתה', categoryId: 'cat-refunds', shekels: 90 },
  { month: '2025-11', day: 8, label: 'מתנת יום הולדת', categoryId: 'cat-family-money', shekels: 300 },
  { month: '2025-12', day: 22, label: 'עזרה לשכן במחשב', categoryId: 'cat-work', shekels: 120 },
  { month: '2026-01', day: 14, label: 'שמירה על ילדים', categoryId: 'cat-work', shekels: 150 },
  // 2026-02 — אין הכנסה. מקרה הקצה המרכזי.
  { month: '2026-03', day: 9, label: 'כסף מההורים', categoryId: 'cat-family-money', shekels: 200 },
  { month: '2026-04', day: 20, label: 'שיעור פרטי במתמטיקה', categoryId: 'cat-work', shekels: 160 },
  { month: '2026-05', day: 11, label: 'עזרה בסידור מחסן', categoryId: 'cat-work', shekels: 140 },
  { month: '2026-06', day: 26, label: 'כסף מההורים', categoryId: 'cat-family-money', shekels: 200 },
  { month: '2026-07', day: 6, label: 'עבודה בעסק מקומי', categoryId: 'cat-work', shekels: 2400 },
  { month: '2026-08', day: 5, label: 'עבודה בעסק מקומי', categoryId: 'cat-work', shekels: 1200 },
];

/** רכישה גדולה חד-פעמית — לבדיקת זיהוי חריגות וחוסן החציון. */
const BIG_PURCHASE = {
  date: '2026-03-14' as ISODate,
  label: 'אוזניות אלחוטיות',
  categoryId: 'cat-shopping',
  shekels: 380,
};

function makeTransaction(
  index: number,
  fields: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'merchantNormalized'> & {
    merchantNormalized?: string;
  },
): Transaction {
  const stamp = `${fields.date}T09:00:00.000Z`;
  return {
    id: `seed-tx-${String(index).padStart(4, '0')}`,
    merchantNormalized: fields.merchantNormalized ?? normalizeMerchant(fields.merchant),
    createdAt: stamp,
    updatedAt: stamp,
    ...fields,
  };
}

/** נירמול פשוט לצורכי הזרע. הגרסה המלאה תיבנה ב-`src/import/normalize.ts`. */
export function normalizeMerchant(merchant: string): string {
  return merchant.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface SeedData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  goal: FinancialGoal;
  expectedIncomes: ExpectedIncome[];
  plannedExpenses: PlannedExpense[];
  recurring: RecurringTransaction[];
  today: ISODate;
}

export function buildSeedData(today: ISODate = SEED_TODAY): SeedData {
  const random = mulberry32(20260807);
  const randInt = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;

  const transactions: Transaction[] = [];
  let index = 0;

  const currentMonth = monthOf(today);
  const months: ISOMonth[] = [];
  for (let m = SEED_START_MONTH; m <= currentMonth; m = addMonthsToMonth(m, 1)) {
    months.push(m);
  }

  for (const month of months) {
    const isCurrentMonth = month === currentMonth;
    // בחודש הנוכחי מייצרים רק עד היום — הוא חלקי.
    const lastDay = isCurrentMonth ? Number(today.slice(8, 10)) : daysInMonth(month);
    const year = Number(month.slice(0, 4));
    const monthNum = Number(month.slice(5, 7));

    // ── הכנסות ────────────────────────────────────────────────────────
    for (const income of SEED_INCOMES) {
      if (income.month !== month || income.day > lastDay) continue;
      transactions.push(
        makeTransaction(index++, {
          accountId: 'acc-bank',
          date: makeISODate(year, monthNum, income.day),
          amountAgorot: fromShekels(income.shekels),
          type: 'income',
          merchant: income.label,
          categoryId: income.categoryId,
          paymentMethod: 'העברה בנקאית',
          recurrence: 'one_time',
          planned: true,
          source: 'manual',
          classificationConfidence: 1,
          userCorrected: true,
          status: 'actual',
          kind: 'normal',
        }),
      );
    }

    // ── מנוי חודשי קבוע ───────────────────────────────────────────────
    if (12 <= lastDay) {
      transactions.push(
        makeTransaction(index++, {
          accountId: 'acc-bank',
          date: makeISODate(year, monthNum, 12),
          amountAgorot: fromShekels(22),
          type: 'expense',
          merchant: 'Spotify',
          merchantNormalized: 'spotify',
          categoryId: 'cat-phone',
          paymentMethod: 'כרטיס אשראי',
          recurrence: 'recurring',
          recurringId: 'rec-spotify',
          planned: true,
          source: 'manual',
          classificationConfidence: 0.95,
          userCorrected: false,
          status: 'actual',
          kind: 'normal',
        }),
      );
    }

    // ── הוצאות שוטפות ─────────────────────────────────────────────────
    for (const pattern of SPEND_PATTERNS) {
      const count = randInt(pattern.timesPerMonth[0], pattern.timesPerMonth[1]);
      for (let i = 0; i < count; i++) {
        const day = randInt(1, lastDay);
        transactions.push(
          makeTransaction(index++, {
            accountId: pattern.account,
            date: makeISODate(year, monthNum, day),
            amountAgorot: fromShekels(randInt(pattern.amountShekels[0], pattern.amountShekels[1])),
            type: 'expense',
            merchant: pick(pattern.merchants),
            categoryId: pattern.categoryId,
            paymentMethod: pattern.account === 'acc-cash' ? 'מזומן' : 'כרטיס אשראי',
            recurrence: 'one_time',
            planned: false,
            source: 'manual',
            classificationConfidence: 0.8,
            userCorrected: false,
            status: 'actual',
            kind: 'normal',
          }),
        );
      }
    }

    // ── הרכישה הגדולה ─────────────────────────────────────────────────
    if (monthOf(BIG_PURCHASE.date) === month) {
      transactions.push(
        makeTransaction(index++, {
          accountId: 'acc-bank',
          date: BIG_PURCHASE.date,
          amountAgorot: fromShekels(BIG_PURCHASE.shekels),
          type: 'expense',
          merchant: BIG_PURCHASE.label,
          categoryId: BIG_PURCHASE.categoryId,
          paymentMethod: 'כרטיס אשראי',
          recurrence: 'one_time',
          planned: false,
          note: 'חסכתי לזה כמה חודשים',
          source: 'manual',
          classificationConfidence: 1,
          userCorrected: true,
          status: 'actual',
          kind: 'normal',
        }),
      );
    }
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  return {
    accounts: SEED_ACCOUNTS,
    categories: DEFAULT_CATEGORIES,
    transactions,
    goal: SEED_GOAL,
    expectedIncomes: SEED_EXPECTED_INCOMES,
    plannedExpenses: SEED_PLANNED_EXPENSES,
    recurring: SEED_RECURRING,
    today,
  };
}
