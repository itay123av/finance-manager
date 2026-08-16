/**
 * המלצות לצמצום הוצאות.
 *
 * שלושה כללים שכל המלצה חייבת לעמוד בהם:
 *  1. **מבוססת על ראיה מהנתונים שלי** — כל המלצה נושאת `evidence` שמוצג
 *     למשתמש. "כדאי לחסוך יותר" בלי מספר הוא לא המלצה, זו הטפה.
 *  2. **מציגה חיסכון משוער והשפעה על היעד** — אחרת אין דרך להחליט אם
 *     שווה לוותר.
 *  3. **לא מציעה לבטל בילויים.** מציעה החלפות: להפחית יציאה אחת, לקבוע
 *     תקרה, לדחות רכישה. מי שמבטל הכל חוזר להוציא הכל תוך שבועיים.
 */

import { formatILS, clampMin0 } from './money';
import { projectGoal, type GoalSimulationInput } from './goal';
import type { CategoryDrift, SmallPurchaseAccumulation } from './patterns';
import type { SubscriptionNotice } from './recurring';
import type { BudgetProgress } from './budget';
import type { Agorot, Category, UUID } from './types';

export type RecommendationType =
  | 'reduce_category'
  | 'small_purchases'
  | 'review_subscription'
  | 'stale_recurring'
  | 'pace_warning'
  | 'celebrate'
  | 'categorize_pending';

export interface Evidence {
  labelHe: string;
  valueHe: string;
}

export interface Recommendation {
  id: string;
  type: RecommendationType;
  titleHe: string;
  bodyHe: string;
  /** על אילו נתונים ההמלצה מבוססת — מוצג למשתמש, לא רק בקוד. */
  evidence: Evidence[];
  estimatedMonthlySavingAgorot: Agorot | null;
  /** בכמה חודשים החיסכון הזה מקרב את היעד. `null` = לא ניתן לחישוב. */
  goalImpactMonths: number | null;
  /** גבוה = דחוף יותר. משמש למיון בלוח הבקרה. */
  priority: number;
}

/**
 * בכמה חודשים חיסכון חודשי קבוע מקדים את היעד.
 * זה המספר שהופך "לחסוך ₪50" למשהו ששווה לשקול.
 */
export function goalImpactOfMonthlySaving(
  goal: GoalSimulationInput,
  monthlySavingAgorot: Agorot,
): number | null {
  if (monthlySavingAgorot <= 0) return null;
  const before = projectGoal(goal);
  const after = projectGoal({
    ...goal,
    regularMonthlyNetAgorot: goal.regularMonthlyNetAgorot + monthlySavingAgorot,
  });
  if (before.monthsToGoal === null || after.monthsToGoal === null) return null;
  return before.monthsToGoal - after.monthsToGoal;
}

export interface RecommendationInput {
  goal: GoalSimulationInput;
  categories: readonly Category[];
  categoryDrifts: readonly CategoryDrift[];
  smallPurchases: SmallPurchaseAccumulation | null;
  subscriptions: readonly SubscriptionNotice[];
  staleRecurring: readonly SubscriptionNotice[];
  budgetProgress: BudgetProgress | null;
  funBudget: { plannedAgorot: Agorot; spentAgorot: Agorot } | null;
  /** כמה עסקאות עדיין מחכות לסיווג ידני. */
  unclassifiedCount: number;
}

const REDUCIBLE_NATURES = new Set(['fun', 'reducible']);

export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const out: Recommendation[] = [];
  const natureById = new Map<UUID, Category['nature']>(
    input.categories.map((c) => [c.id, c.nature]),
  );

  // ── א׳. קטגוריה שגדלה — ההמלצה היחידה שמציעה לצמצם ──────────────────
  for (const drift of input.categoryDrifts) {
    if (drift.direction !== 'up') continue;
    const nature = natureById.get(drift.categoryId);
    if (!nature || !REDUCIBLE_NATURES.has(nature)) continue;

    // מציעים לחזור לרגיל, לא לרדת מתחתיו.
    const saving = clampMin0(drift.deltaAgorot);
    const impact = goalImpactOfMonthlySaving(input.goal, saving);

    out.push({
      id: `reduce_${drift.categoryId}`,
      type: 'reduce_category',
      titleHe: `${drift.categoryName} — לחזור לרמה הרגילה`,
      bodyHe:
        `החודש הוצאת ${formatILS(drift.deltaAgorot)} יותר מהרגיל. ` +
        `לא צריך לוותר על הקטגוריה — מספיק להוריד יציאה אחת או לקבוע תקרה לכל פעם.`,
      evidence: [
        { labelHe: 'החודש', valueHe: formatILS(drift.thisMonthAgorot) },
        { labelHe: 'בדרך כלל', valueHe: formatILS(drift.typicalMonthlyAgorot) },
        { labelHe: 'הפרש', valueHe: formatILS(drift.deltaAgorot, { signed: true }) },
      ],
      estimatedMonthlySavingAgorot: saving,
      goalImpactMonths: impact,
      priority: 70 + Math.min(20, Math.round(saving / 5_000)),
    });
  }

  // ── ב׳. רכישות קטנות שמצטברות ───────────────────────────────────────
  if (input.smallPurchases) {
    const monthlyEquivalent = Math.round((input.smallPurchases.totalAgorot * 30) / 7);
    const halfSaving = Math.round(monthlyEquivalent / 2);
    out.push({
      id: 'small_purchases',
      type: 'small_purchases',
      titleHe: 'רכישות קטנות מצטברות',
      bodyHe:
        `${input.smallPurchases.messageHe} ` +
        `אם חצי מהן היו נשארות בכיס, זה ${formatILS(halfSaving)} בחודש — בלי לוותר על כלום גדול.`,
      evidence: [
        { labelHe: 'מספר רכישות', valueHe: String(input.smallPurchases.count) },
        { labelHe: 'סך הכל', valueHe: formatILS(input.smallPurchases.totalAgorot) },
        { labelHe: 'בקצב חודשי', valueHe: formatILS(monthlyEquivalent) },
      ],
      estimatedMonthlySavingAgorot: halfSaving,
      goalImpactMonths: goalImpactOfMonthlySaving(input.goal, halfSaving),
      priority: 60,
    });
  }

  // ── ג׳. מנויים ששווה לבדוק ──────────────────────────────────────────
  for (const sub of input.subscriptions) {
    out.push({
      id: `subscription_${sub.merchantNormalized}`,
      type: 'review_subscription',
      titleHe: `${sub.label} — ${formatILS(sub.yearlyAgorot)} בשנה`,
      bodyHe: `${sub.messageHe} אם כן — הכל בסדר, זה חלק מהתקציב. אם לא — זה כסף פנוי.`,
      evidence: [
        { labelHe: 'לחודש', valueHe: formatILS(sub.monthlyAgorot) },
        { labelHe: 'לשנה', valueHe: formatILS(sub.yearlyAgorot) },
        { labelHe: 'חיובים עד כה', valueHe: String(sub.occurrences) },
      ],
      estimatedMonthlySavingAgorot: sub.monthlyAgorot,
      goalImpactMonths: goalImpactOfMonthlySaving(input.goal, sub.monthlyAgorot),
      priority: 50 + Math.min(20, Math.round(sub.monthlyAgorot / 1_000)),
    });
  }

  // ── ד׳. הוצאה חוזרת שהפסיקה — כסף שאפשר לשחרר בתקציב ────────────────
  for (const stale of input.staleRecurring) {
    out.push({
      id: `stale_${stale.merchantNormalized}`,
      type: 'stale_recurring',
      titleHe: `${stale.label} כבר לא מחויב`,
      bodyHe: stale.messageHe,
      evidence: [
        { labelHe: 'חיוב אחרון', valueHe: stale.lastSeenDate },
        { labelHe: 'סכום', valueHe: formatILS(stale.monthlyAgorot) },
      ],
      estimatedMonthlySavingAgorot: null,
      goalImpactMonths: null,
      priority: 40,
    });
  }

  // ── ה׳. חריגה מקצב התקציב ───────────────────────────────────────────
  if (input.budgetProgress?.isAheadOfPace) {
    const p = input.budgetProgress;
    out.push({
      id: 'pace_warning',
      type: 'pace_warning',
      titleHe: 'הקצב החודש מהיר מהמתוכנן',
      bodyHe:
        `הוצאת ${p.spentSharePct}% מהתקציב, ועבר ${p.monthElapsedPct}% מהחודש. ` +
        `נשארו ${formatILS(clampMin0(p.remainingAgorot))} — עדיין אפשר לסיים את החודש בתוך התוכנית.`,
      evidence: [
        { labelHe: 'תוקצב', valueHe: formatILS(p.plannedAgorot) },
        { labelHe: 'הוצאת', valueHe: formatILS(p.spentAgorot) },
      ],
      estimatedMonthlySavingAgorot: null,
      goalImpactMonths: null,
      priority: 85,
    });
  }

  // ── ו׳. עסקאות שמחכות לסיווג — פעולה קטנה שמשפרת הכל ─────────────────
  if (input.unclassifiedCount > 0) {
    out.push({
      id: 'categorize_pending',
      type: 'categorize_pending',
      titleHe: `${input.unclassifiedCount} עסקאות מחכות לסיווג`,
      bodyHe:
        'סיווג שלהן ייקח דקה, וישפר את כל הממוצעים וההמלצות. ' +
        'המערכת גם תזכור את הבחירות שלך לפעם הבאה.',
      evidence: [{ labelHe: 'ממתינות', valueHe: String(input.unclassifiedCount) }],
      estimatedMonthlySavingAgorot: null,
      goalImpactMonths: null,
      priority: 90,
    });
  }

  // ── ז׳. מה שהלך טוב — לא רק ביקורת ──────────────────────────────────
  const improved = input.categoryDrifts.filter((d) => d.direction === 'down');
  const best = improved[0];
  if (best) {
    out.push({
      id: `celebrate_${best.categoryId}`,
      type: 'celebrate',
      titleHe: `הורדת את ההוצאות על ${best.categoryName}`,
      bodyHe: `${formatILS(-best.deltaAgorot)} פחות מהרגיל החודש. זה בדיוק מה שמקרב את היעד.`,
      evidence: [
        { labelHe: 'החודש', valueHe: formatILS(best.thisMonthAgorot) },
        { labelHe: 'בדרך כלל', valueHe: formatILS(best.typicalMonthlyAgorot) },
      ],
      estimatedMonthlySavingAgorot: null,
      goalImpactMonths: null,
      priority: 30,
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}

/** הפעולה או שתיים שמוצגות בלוח הבקרה תחת "מה כדאי לעשות עכשיו". */
export function topActions(recommendations: readonly Recommendation[], count = 2): Recommendation[] {
  return recommendations.slice(0, count);
}
