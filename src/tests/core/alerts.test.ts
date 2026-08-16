import { describe, expect, it } from 'vitest';
import { buildAlerts, warningCount, type AlertInput } from '../../core/alerts';
import { safeToSpend } from '../../core/safeToSpend';
import { ILS, expectedIncome } from '../helpers';

const TODAY = '2026-08-07';

function sts(overrides: Parameters<typeof safeToSpend>[0] | null = null) {
  return safeToSpend(
    overrides ?? {
      today: TODAY,
      currentBalanceAgorot: ILS(1240),
      safetyBufferAgorot: ILS(500),
      plannedExpenses: [],
      recurringTransactions: [],
      expectedIncomes: [],
      reservedForFutureMonthsAgorot: 0,
      goalContributionAgorot: 0,
      goalSavedSoFarThisMonthAgorot: 0,
      plannedDiscretionarySpendAgorot: 0,
    },
  );
}

function input(overrides: Partial<AlertInput> = {}): AlertInput {
  return {
    today: TODAY,
    safeToSpend: sts(),
    budgetProgress: null,
    funBudget: null,
    anomalies: [],
    newlyDetectedRecurring: [],
    expectedIncomes: [],
    goalProgressPct: 25,
    safetyBufferAgorot: ILS(500),
    lastImportDate: null,
    ...overrides,
  };
}

describe('אין התראות מיותרות', () => {
  it('מצב תקין — אין התראות כלל', () => {
    expect(buildAlerts(input())).toEqual([]);
  });
});

describe('סוגי התראות', () => {
  it('חריגה מהתקציב', () => {
    const alerts = buildAlerts(
      input({
        budgetProgress: {
          month: '2026-08',
          plannedAgorot: ILS(400),
          spentAgorot: ILS(450),
          remainingAgorot: ILS(-50),
          spentSharePct: 112.5,
          monthElapsedPct: 22.6,
          isAheadOfPace: true,
          isOverBudget: true,
        },
      }),
    );
    const alert = alerts.find((a) => a.type === 'category_over_budget');
    expect(alert?.severity).toBe('warn');
    expect(alert?.bodyHe).toContain('לתקן את המסלול');
  });

  it('תקציב בילויים מתקרב לסוף', () => {
    const alerts = buildAlerts(
      input({ funBudget: { plannedAgorot: ILS(300), spentAgorot: ILS(240) } }),
    );
    const alert = alerts.find((a) => a.type === 'fun_budget_low');
    expect(alert?.bodyHe).toContain('₪60');
  });

  it('תקציב בילויים שנגמר לגמרי — לא מתריע על "מתקרב"', () => {
    const alerts = buildAlerts(
      input({ funBudget: { plannedAgorot: ILS(300), spentAgorot: ILS(320) } }),
    );
    expect(alerts.some((a) => a.type === 'fun_budget_low')).toBe(false);
  });

  it('תקציב בילויים אפס לא גורם לחלוקה באפס', () => {
    const alerts = buildAlerts(input({ funBudget: { plannedAgorot: 0, spentAgorot: 0 } }));
    expect(alerts.some((a) => a.type === 'fun_budget_low')).toBe(false);
  });

  it('עסקה חריגה — רק הבולטת ביותר', () => {
    const alerts = buildAlerts(
      input({
        anomalies: [
          {
            transactionId: 'tx-1',
            date: '2026-08-03',
            merchant: 'אוזניות',
            categoryId: 'cat-shopping',
            amountAgorot: ILS(380),
            typicalAgorot: ILS(30),
            method: 'sparse',
            messageHe: 'אוזניות — ₪380.',
          },
          {
            transactionId: 'tx-2',
            date: '2026-08-04',
            merchant: 'מסעדה',
            categoryId: 'cat-food-out',
            amountAgorot: ILS(200),
            typicalAgorot: ILS(45),
            method: 'robust',
            messageHe: 'מסעדה — ₪200.',
          },
        ],
      }),
    );
    expect(alerts.filter((a) => a.type === 'unusual_transaction')).toHaveLength(1);
    expect(alerts.find((a) => a.type === 'unusual_transaction')?.bodyHe).toContain('אוזניות');
  });

  it('הוצאה חוזרת חדשה שזוהתה', () => {
    const alerts = buildAlerts(
      input({
        newlyDetectedRecurring: [
          {
            merchantNormalized: 'spotify',
            label: 'Spotify',
            monthlyAgorot: ILS(22),
            yearlyAgorot: ILS(264),
            occurrences: 3,
            lastSeenDate: '2026-07-12',
            messageHe: '',
          },
        ],
      }),
    );
    expect(alerts.find((a) => a.type === 'new_recurring_detected')?.bodyHe).toContain('Spotify');
  });

  it('תחזית ירידה מתחת לסכום הביטחון — עם הבהרה שעוד לא קרה כלום', () => {
    const alerts = buildAlerts(
      input({
        safeToSpend: sts({
          today: TODAY,
          currentBalanceAgorot: ILS(600),
          safetyBufferAgorot: ILS(500),
          plannedExpenses: [],
          recurringTransactions: [],
          expectedIncomes: [],
          reservedForFutureMonthsAgorot: 0,
          goalContributionAgorot: 0,
          goalSavedSoFarThisMonthAgorot: 0,
          plannedDiscretionarySpendAgorot: ILS(200),
        }),
      }),
    );
    const alert = alerts.find((a) => a.type === 'below_safety_buffer_forecast');
    expect(alert?.severity).toBe('warn');
    expect(alert?.bodyHe).toContain('עוד לא קרה כלום');
  });

  it('מתקרבים ליעד — עידוד', () => {
    const alerts = buildAlerts(input({ goalProgressPct: 90 }));
    expect(alerts.find((a) => a.type === 'approaching_goal')?.bodyHe).toContain('90%');
  });

  it('יעד שהושג כבר לא מייצר התראת "מתקרב"', () => {
    expect(buildAlerts(input({ goalProgressPct: 100 })).some((a) => a.type === 'approaching_goal')).toBe(false);
  });

  it('סוף חודש', () => {
    const alerts = buildAlerts(input({ today: '2026-08-30', safeToSpend: sts({
      today: '2026-08-30',
      currentBalanceAgorot: ILS(1240),
      safetyBufferAgorot: ILS(500),
      plannedExpenses: [],
      recurringTransactions: [],
      expectedIncomes: [],
      reservedForFutureMonthsAgorot: 0,
      goalContributionAgorot: 0,
      goalSavedSoFarThisMonthAgorot: 0,
      plannedDiscretionarySpendAgorot: 0,
    }) }));
    expect(alerts.some((a) => a.type === 'month_ending')).toBe(true);
  });

  it('הכנסה שעבר תאריכה ולא סומנה כהתקבלה', () => {
    const alerts = buildAlerts(
      input({
        expectedIncomes: [
          expectedIncome({ label: 'משכורת', expectedDate: '2026-08-01', received: false }),
          expectedIncome({ label: 'התקבלה', expectedDate: '2026-08-01', received: true }),
          expectedIncome({ label: 'עתידית', expectedDate: '2026-08-25', received: false }),
        ],
      }),
    );
    const overdue = alerts.filter((a) => a.type === 'expected_income_overdue');
    expect(overdue).toHaveLength(1);
    expect(overdue[0]?.bodyHe).toContain('משכורת');
    expect(overdue[0]?.bodyHe).toContain('01/08/2026');
  });

  it('קובץ בנק שלא עודכן זמן רב', () => {
    expect(buildAlerts(input({ lastImportDate: '2026-08-01' })).some((a) => a.type === 'import_stale')).toBe(false);
    const stale = buildAlerts(input({ lastImportDate: '2026-07-01' })).find((a) => a.type === 'import_stale');
    expect(stale?.bodyHe).toContain('37 ימים');
  });
});

describe('טון ומיון', () => {
  const busy = input({
    budgetProgress: {
      month: '2026-08',
      plannedAgorot: ILS(400),
      spentAgorot: ILS(450),
      remainingAgorot: ILS(-50),
      spentSharePct: 112,
      monthElapsedPct: 22,
      isAheadOfPace: true,
      isOverBudget: true,
    },
    funBudget: { plannedAgorot: ILS(300), spentAgorot: ILS(240) },
    goalProgressPct: 90,
    lastImportDate: '2026-07-01',
  });

  it('ממוין לפי עדיפות', () => {
    const alerts = buildAlerts(busy);
    for (let i = 1; i < alerts.length; i++) {
      expect(alerts[i - 1]!.priority).toBeGreaterThanOrEqual(alerts[i]!.priority);
    }
  });

  it('אף התראה לא נוזפת', () => {
    for (const alert of buildAlerts(busy)) {
      expect(`${alert.titleHe} ${alert.bodyHe}`).not.toMatch(/בזבזת|לא היית צריך|אשמתך|תפסיק/);
      expect(alert.bodyHe.length).toBeGreaterThan(0);
    }
  });

  it('warningCount סופר רק את החמורות', () => {
    const alerts = buildAlerts(busy);
    expect(warningCount(alerts)).toBe(alerts.filter((a) => a.severity === 'warn').length);
    expect(warningCount(alerts)).toBeGreaterThan(0);
  });
});
