/**
 * התראות.
 *
 * התראה טובה מגיעה בזמן שאפשר עוד לעשות משהו. לכן "נשארו ₪40 בתקציב
 * הבילויים" שווה יותר מ"חרגת ב-₪80" — הראשונה מאפשרת החלטה, השנייה
 * רק מדווחת על עובדה.
 *
 * הטון: מדווח, לא נוזף. אף התראה לא אומרת "לא היית צריך".
 */

import { formatDateHe, diffDays } from './dates';
import { formatILS } from './money';
import type { Anomaly } from './patterns';
import type { BudgetProgress } from './budget';
import type { SafeToSpendResult } from './safeToSpend';
import type { SubscriptionNotice } from './recurring';
import type { Agorot, ExpectedIncome, ISODate } from './types';

export type AlertType =
  | 'category_over_budget'
  | 'fun_budget_low'
  | 'unusual_transaction'
  | 'new_recurring_detected'
  | 'below_safety_buffer_forecast'
  | 'approaching_goal'
  | 'month_ending'
  | 'expected_income_overdue'
  | 'import_stale';

export type AlertSeverity = 'info' | 'warn';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  titleHe: string;
  bodyHe: string;
  /** גבוה = מוצג קודם. */
  priority: number;
}

/** מתי להתריע שתקציב הבילויים עומד להיגמר. */
export const FUN_BUDGET_LOW_SHARE = 0.25;
/** מתי מתחילים להזכיר שהחודש נגמר. */
export const MONTH_ENDING_DAYS = 3;
/** אחרי כמה ימים בלי ייבוא כדאי להזכיר לעדכן. */
export const IMPORT_STALE_DAYS = 21;
/** מתי היעד נחשב "קרוב" ושווה לעודד. */
export const APPROACHING_GOAL_SHARE = 0.85;

export interface AlertInput {
  today: ISODate;
  safeToSpend: SafeToSpendResult;
  budgetProgress: BudgetProgress | null;
  funBudget: { plannedAgorot: Agorot; spentAgorot: Agorot } | null;
  anomalies: readonly Anomaly[];
  newlyDetectedRecurring: readonly SubscriptionNotice[];
  expectedIncomes: readonly ExpectedIncome[];
  goalProgressPct: number;
  safetyBufferAgorot: Agorot;
  lastImportDate: ISODate | null;
}

export function buildAlerts(input: AlertInput): Alert[] {
  const alerts: Alert[] = [];

  // ── חריגה מתקציב ────────────────────────────────────────────────────
  if (input.budgetProgress?.isOverBudget) {
    alerts.push({
      id: 'category_over_budget',
      type: 'category_over_budget',
      severity: 'warn',
      titleHe: 'עברת את התקציב החודשי',
      bodyHe: `הוצאת ${formatILS(input.budgetProgress.spentAgorot)} מתוך ${formatILS(input.budgetProgress.plannedAgorot)} שתוכננו. אפשר לתקן את המסלול בחודש הבא.`,
      priority: 80,
    });
  }

  // ── תקציב הבילויים עומד להיגמר ──────────────────────────────────────
  if (input.funBudget && input.funBudget.plannedAgorot > 0) {
    const remaining = input.funBudget.plannedAgorot - input.funBudget.spentAgorot;
    const share = remaining / input.funBudget.plannedAgorot;
    if (share <= FUN_BUDGET_LOW_SHARE && remaining > 0) {
      alerts.push({
        id: 'fun_budget_low',
        type: 'fun_budget_low',
        severity: 'info',
        titleHe: 'תקציב הבילויים מתקרב לסוף',
        bodyHe: `נשארו ${formatILS(remaining)} עד סוף החודש. שווה לתכנן איתם.`,
        priority: 65,
      });
    }
  }

  // ── עסקה חריגה ──────────────────────────────────────────────────────
  const topAnomaly = input.anomalies[0];
  if (topAnomaly) {
    alerts.push({
      id: `unusual_${topAnomaly.transactionId}`,
      type: 'unusual_transaction',
      severity: 'info',
      titleHe: 'עסקה חריגה',
      bodyHe: `${topAnomaly.messageHe} שווה לוודא שהיא נכונה.`,
      priority: 60,
    });
  }

  // ── הוצאה חוזרת חדשה שזוהתה ─────────────────────────────────────────
  for (const rec of input.newlyDetectedRecurring) {
    alerts.push({
      id: `new_recurring_${rec.merchantNormalized}`,
      type: 'new_recurring_detected',
      severity: 'info',
      titleHe: 'זוהתה הוצאה חוזרת חדשה',
      // ⚠️ בלי הבטחות על פעולות שלא בוצעו. המערכת מזהה — היא לא מוסיפה
      // לתקציב בעצמה, וטקסט שאומר שכן היה שקר קטן שנצבר לאי-אמון.
      bodyHe: `${rec.label} חוזר כל חודש — ${formatILS(rec.monthlyAgorot)}, כלומר ${formatILS(rec.yearlyAgorot)} בשנה.`,
      priority: 45,
    });
  }

  // ── תחזית לרדת מתחת לסכום הביטחון ───────────────────────────────────
  if (input.safeToSpend.projection.monthEndBalanceAgorot < input.safetyBufferAgorot) {
    alerts.push({
      id: 'below_safety_buffer_forecast',
      type: 'below_safety_buffer_forecast',
      severity: 'warn',
      titleHe: 'התחזית מראה ירידה מתחת לסכום הביטחון',
      bodyHe:
        `לפי הקצב הנוכחי, בסוף החודש היתרה תהיה בערך ` +
        `${formatILS(input.safeToSpend.projection.monthEndBalanceAgorot)}, מתחת ל-${formatILS(input.safetyBufferAgorot)} שהגדרת. ` +
        `עוד לא קרה כלום — יש זמן לשנות.`,
      priority: 88,
    });
  }

  // ── מתקרבים ליעד ────────────────────────────────────────────────────
  if (input.goalProgressPct >= APPROACHING_GOAL_SHARE * 100 && input.goalProgressPct < 100) {
    alerts.push({
      id: 'approaching_goal',
      type: 'approaching_goal',
      severity: 'info',
      titleHe: 'אתה קרוב ליעד',
      bodyHe: `${Math.round(input.goalProgressPct)}% מהדרך ל-₪5,000. השלב האחרון הוא הכי קל להתלהב ממנו.`,
      priority: 70,
    });
  }

  // ── סוף חודש ────────────────────────────────────────────────────────
  if (input.safeToSpend.daysLeftInMonth <= MONTH_ENDING_DAYS) {
    alerts.push({
      id: 'month_ending',
      type: 'month_ending',
      severity: 'info',
      titleHe: 'החודש עומד להיגמר',
      bodyHe: `נשארו ${input.safeToSpend.daysLeftInMonth} ימים. שווה להעיף מבט על הסיכום החודשי.`,
      priority: 35,
    });
  }

  // ── הכנסה צפויה שעבר תאריכה ולא סומנה כהתקבלה ───────────────────────
  for (const income of input.expectedIncomes) {
    if (income.received || income.expectedDate >= input.today) continue;
    alerts.push({
      id: `income_overdue_${income.id}`,
      type: 'expected_income_overdue',
      severity: 'warn',
      titleHe: 'הכנסה שהייתה אמורה להיכנס',
      bodyHe: `${income.label} — ${formatILS(income.expectedAmountAgorot)}, היה צפוי ב-${formatDateHe(income.expectedDate)}. אם הגיע, שווה לסמן; אם לא, אולי כדאי לברר.`,
      priority: 75,
    });
  }

  // ── לא יובא קובץ מזה זמן ────────────────────────────────────────────
  if (input.lastImportDate) {
    const days = diffDays(input.lastImportDate, input.today);
    if (days >= IMPORT_STALE_DAYS) {
      alerts.push({
        id: 'import_stale',
        type: 'import_stale',
        severity: 'info',
        titleHe: 'הנתונים לא עודכנו מזה זמן',
        bodyHe: `הייבוא האחרון היה לפני ${days} ימים. ייבוא קובץ חדש מהבנק יחזיר את המספרים לדיוק.`,
        priority: 55,
      });
    }
  }

  return alerts.sort((a, b) => b.priority - a.priority);
}

/** מספר ההתראות שדורשות תשומת לב — לתצוגת המונה בלוח הבקרה. */
export function warningCount(alerts: readonly Alert[]): number {
  return alerts.filter((a) => a.severity === 'warn').length;
}
