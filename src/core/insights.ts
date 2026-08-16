/**
 * תובנות — ומה מותר לומר.
 *
 * ⚠️ המודול הזה הוא בעיקר **שער**, לא מנוע.
 *
 * כשרק 25% מההוצאות מפורטות, אמירה כמו "אתה מוציא יותר מדי על אוכל"
 * מתבססת על רבע מהתמונה. היא נשמעת סמכותית ויכולה להיות שגויה לגמרי —
 * וזה גרוע יותר מלא לומר כלום, כי המשתמש יקבל החלטה על סמך רעש.
 *
 * לכן כל תובנה מסומנת במה שהיא דורשת:
 *   · `total`    — נשענת על הסכום הכולל, שמתאמת מול הבנק. כמעט עובדה.
 *   · `detailed` — עובדה על עסקאות מפורטות ("הסכום הזה חזר 3 פעמים").
 *   · `category` — דורשת פילוח אמין. נחסמת כשהביטחון הקטגוריאלי נמוך.
 *
 * ההבחנה בין `detailed` ל-`category` היא הלב: "GOOGLE חייב ₪74.90
 * שלושה חודשים ברצף" היא תצפית נכונה גם כשרוב ההיסטוריה אטומה.
 * "אתה מוציא הרבה על תקשורת" — לא.
 */

import {
  detectSubscriptions,
  monthOutliers,
  monthlyTotals,
  repeatMerchants,
  subscriptionsMonthlyTotal,
  type DetectedSubscription,
} from './detailedPatterns';
import { formatMonthHe } from './dates';
import { isOpaqueCategory, type EffectiveExpense } from './effectiveSpending';
import { clampMin0 } from './money';
import type { SpendingConfidence } from './spendingConfidence';
import type { Agorot, Category, ISODate } from './types';

/** על מה התובנה נשענת. */
export type InsightBasis = 'total' | 'detailed' | 'category';

export type InsightKind =
  | 'subscriptions_total'
  | 'subscription_stale'
  | 'repeat_merchant'
  | 'month_outlier'
  | 'negative_months'
  | 'reserve_depletion'
  | 'summer_dependency'
  | 'category_drift';

export type InsightTone = 'neutral' | 'positive' | 'caution';

export interface Insight {
  kind: InsightKind;
  basis: InsightBasis;
  tone: InsightTone;
  titleHe: string;
  bodyHe: string;
  /** על אילו נתונים התובנה מבוססת — מוצג למשתמש. */
  evidenceHe: string;
  /** חיסכון חודשי משוער, כשרלוונטי. */
  estimatedMonthlySavingAgorot?: Agorot;
}

export interface InsightsInput {
  today: ISODate;
  expenses: readonly EffectiveExpense[];
  categories: readonly Category[];
  confidence: SpendingConfidence;
  /** חודשים עם נטו שלילי מתוך סך החודשים. */
  negativeMonths: number;
  totalMonths: number;
  reservedForFutureMonthsAgorot: Agorot;
  monthlyAllowanceAgorot: Agorot;
  summerIncomeAgorot: Agorot;
  yearIncomeAgorot: Agorot;
}

export interface InsightsResult {
  insights: Insight[];
  /** תובנות שנחסמו בגלל ביטחון קטגוריאלי נמוך. */
  suppressedCount: number;
  suppressionNoteHe: string | null;
  subscriptions: DetectedSubscription[];
  subscriptionsMonthlyAgorot: Agorot;
}

/** מעל זה, ההכנסה מרוכזת בקיץ במידה שראוי להצביע עליה. */
const SUMMER_DEPENDENCY_SHARE = 0.6;

export function buildInsights(input: InsightsInput): InsightsResult {
  const insights: Insight[] = [];
  let suppressed = 0;

  const push = (insight: Insight) => {
    // ⭐ השער: תובנה קטגוריאלית נחסמת כשהפילוח אינו אמין
    if (insight.basis === 'category' && !input.confidence.categoryAdviceAllowed) {
      suppressed++;
      return;
    }
    insights.push(insight);
  };

  // ── מנויים (מפורט) ────────────────────────────────────────────────
  const subscriptions = detectSubscriptions({
    expenses: input.expenses,
    today: input.today,
  });
  const subsMonthly = subscriptionsMonthlyTotal(subscriptions);
  const active = subscriptions.filter((s) => !s.possiblyStale);

  if (active.length > 0) {
    push({
      kind: 'subscriptions_total',
      basis: 'detailed',
      tone: 'neutral',
      titleHe: `${active.length} חיובים חוזרים`,
      bodyHe:
        `יחד הם ${money(subsMonthly)} בחודש — ${money(subsMonthly * 12)} בשנה. ` +
        'שווה לעבור עליהם פעם בכמה חודשים ולוודא שאתה עדיין משתמש בכולם.',
      evidenceHe: active
        .map((s) => `${s.merchant} ${money(s.typicalAmountAgorot)}`)
        .join(' · '),
      estimatedMonthlySavingAgorot: subsMonthly,
    });
  }

  for (const stale of subscriptions.filter((s) => s.possiblyStale)) {
    push({
      kind: 'subscription_stale',
      basis: 'detailed',
      tone: 'caution',
      titleHe: `${stale.merchant} — לא הופיע ${stale.daysSinceLast} ימים`,
      bodyHe:
        `החיוב הזה היה ${money(stale.typicalAmountAgorot)} בחודש. ` +
        'ייתכן שהופסק, וייתכן שפשוט טרם הופיע בקובץ האחרון.',
      evidenceHe: `${stale.occurrences} חיובים, האחרון ב-${stale.lastDate}`,
    });
  }

  // ── בתי עסק חוזרים (מפורט) ────────────────────────────────────────
  const repeats = repeatMerchants(input.expenses, 3).filter(
    (m) => m.visits >= 3 && !subscriptions.some((s) => s.merchant === m.merchant),
  );
  const topRepeat = repeats[0];
  if (topRepeat) {
    push({
      kind: 'repeat_merchant',
      basis: 'detailed',
      tone: 'neutral',
      titleHe: `${topRepeat.merchant} — ${topRepeat.visits} פעמים`,
      bodyHe:
        `בממוצע ${money(topRepeat.averageAgorot)} לפעם, ובסך הכל ${money(topRepeat.totalAgorot)}. ` +
        'סכומים קטנים שחוזרים מצטברים למשהו שקשה לראות בעסקה בודדת.',
      evidenceHe: `${topRepeat.visits} עסקאות מפורטות`,
    });
  }

  // ── חודשים חריגים (סכום כולל) ─────────────────────────────────────
  const totals = monthlyTotals(input.expenses);
  const outlier = monthOutliers(totals)[0];
  if (outlier) {
    push({
      kind: 'month_outlier',
      basis: 'total',
      tone: outlier.direction === 'higher' ? 'caution' : 'positive',
      titleHe:
        outlier.direction === 'higher'
          ? `${formatMonthHe(outlier.month)} היה חודש יקר`
          : `${formatMonthHe(outlier.month)} היה חודש חסכוני`,
      bodyHe:
        `הוצאת ${money(outlier.totalAgorot)}, לעומת ${money(outlier.medianAgorot)} בחודש רגיל — ` +
        `הפרש של ${money(Math.abs(outlier.differenceAgorot))}.`,
      evidenceHe: `חציון של ${totals.length} חודשים`,
    });
  }

  // ── מגמת הנטו (סכום כולל) ─────────────────────────────────────────
  if (input.totalMonths >= 3 && input.negativeMonths > input.totalMonths / 2) {
    push({
      kind: 'negative_months',
      basis: 'total',
      tone: 'caution',
      titleHe: `ב-${input.negativeMonths} מתוך ${input.totalMonths} חודשים יצא יותר ממה שנכנס`,
      bodyHe:
        'זה אומר שהיתרה נשענת על ההכנסה של הקיץ ולא על מה שקורה במהלך השנה. ' +
        'לא בהכרח בעיה — אבל שווה לדעת שזה המצב.',
      evidenceHe: 'נטו חודשי מתוך תנועות הבנק, שמתאמתות ליתרה',
    });
  }

  // ── תלות בקיץ (סכום כולל) ─────────────────────────────────────────
  if (input.yearIncomeAgorot > 0) {
    const share = input.summerIncomeAgorot / input.yearIncomeAgorot;
    if (share >= SUMMER_DEPENDENCY_SHARE) {
      push({
        kind: 'summer_dependency',
        basis: 'total',
        tone: 'neutral',
        titleHe: `${Math.round(share * 100)}% מההכנסה שלך הגיעה בקיץ`,
        bodyHe:
          `לכן הכסף צריך להימתח על פני השנה. כרגע ${money(input.reservedForFutureMonthsAgorot)} ` +
          `שמורים לחודשים הבאים, שזה בערך ${money(input.monthlyAllowanceAgorot)} לחודש.`,
        evidenceHe: `הכנסות יולי-אוגוסט מול סך ההכנסות`,
      });
    }
  }

  // ── התרוקנות הרזרבה (סכום כולל) ───────────────────────────────────
  if (input.reservedForFutureMonthsAgorot > 0 && input.monthlyAllowanceAgorot > 0) {
    const monthsLeft = Math.floor(
      input.reservedForFutureMonthsAgorot / input.monthlyAllowanceAgorot,
    );
    if (monthsLeft <= 3) {
      push({
        kind: 'reserve_depletion',
        basis: 'total',
        tone: 'caution',
        titleHe: `הכסף השמור מספיק לעוד כ-${monthsLeft} חודשים`,
        bodyHe: 'אחרי זה, ההוצאות יצטרכו להתכסות מהכנסה חדשה.',
        evidenceHe: `${money(input.reservedForFutureMonthsAgorot)} חלקי ${money(input.monthlyAllowanceAgorot)} לחודש`,
      });
    }
  }

  // ── סחיפת קטגוריה (דורש ביטחון קטגוריאלי) ─────────────────────────
  //
  // נבנית תמיד ונחסמת בשער — כדי שהספירה של "כמה תובנות הוסתרו" תהיה
  // אמיתית, ולא הערכה.
  const drift = categoryDriftInsight(input);
  if (drift) push(drift);

  return {
    insights,
    suppressedCount: suppressed,
    suppressionNoteHe:
      suppressed > 0
        ? 'חלק מההוצאות ההיסטוריות שייכות לכרטיס ישן ללא פירוט, ולכן ההמלצות לפי קטגוריה מבוססות בעיקר על הנתונים המפורטים יותר.'
        : null,
    subscriptions,
    subscriptionsMonthlyAgorot: subsMonthly,
  };
}

/**
 * הקטגוריה שגדלה הכי הרבה מול החודש הקודם.
 * תמיד `basis: 'category'` — ולכן נחסמת כשהפילוח אינו אמין.
 */
function categoryDriftInsight(input: InsightsInput): Insight | null {
  const totals = monthlyTotals(input.expenses);
  if (totals.length < 2) return null;

  const current = totals[totals.length - 1]!.month;
  const previous = totals[totals.length - 2]!.month;

  const sumFor = (month: string, categoryId: string) =>
    input.expenses
      .filter(
        (e) =>
          e.date.startsWith(month) &&
          e.categoryId === categoryId &&
          !isOpaqueCategory(e.categoryId),
      )
      .reduce((sum, e) => sum + e.amountAgorot, 0);

  const categoryIds = [
    ...new Set(
      input.expenses.filter((e) => !isOpaqueCategory(e.categoryId)).map((e) => e.categoryId),
    ),
  ];

  let biggest: { categoryId: string; delta: Agorot } | null = null;
  for (const categoryId of categoryIds) {
    const delta = sumFor(current, categoryId) - sumFor(previous, categoryId);
    if (delta > 0 && (!biggest || delta > biggest.delta)) biggest = { categoryId, delta };
  }

  if (!biggest || biggest.delta < 5_000) return null;

  const name =
    input.categories.find((c) => c.id === biggest!.categoryId)?.name ?? 'קטגוריה';

  return {
    kind: 'category_drift',
    basis: 'category',
    tone: 'caution',
    titleHe: `${name} — עלייה של ${money(biggest.delta)}`,
    bodyHe: `לעומת ${formatMonthHe(previous)}. שווה לבדוק אם זה חד-פעמי או מגמה.`,
    evidenceHe: 'השוואה בין שני החודשים האחרונים',
    estimatedMonthlySavingAgorot: clampMin0(biggest.delta),
  };
}

function money(agorot: Agorot): string {
  return `₪${Math.round(agorot / 100).toLocaleString('en-US')}`;
}

/** תובנות לפי בסיס — לתצוגה מקובצת. */
export function insightsByBasis(insights: readonly Insight[]) {
  return {
    total: insights.filter((i) => i.basis === 'total'),
    detailed: insights.filter((i) => i.basis === 'detailed'),
    category: insights.filter((i) => i.basis === 'category'),
  };
}
