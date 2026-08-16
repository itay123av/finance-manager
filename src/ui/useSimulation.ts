/**
 * הכנת הקלט לסימולציה מתוך מצב האפליקציה.
 *
 * ⚠️ אין כאן חישוב. כל החישוב יושב ב-`core/` — ההוק הזה רק אוסף את
 * המספרים ומעביר אותם. זה מה שמבטיח שהמסך והדשבורד מציגים בדיוק את
 * אותו `safeToSpend`, ולא שתי גרסאות שנפרדו בשקט.
 */

import { useMemo } from 'react';
import { useAppData } from './AppData';
import { monthlyExpenseAverage, monthlyNetAverage } from '../core/averages';
import { periodSummary } from '../core/periods';
import { lastRelevantSummerYear } from '../core/dashboard';
import { clampMin0 } from '../core/money';
import type { PurchaseSimulationInput } from '../core/purchaseSimulation';
import type { ForecastScenariosInput } from '../core/forecastScenarios';

export interface SimulationContext {
  purchase: PurchaseSimulationInput | null;
  forecast: ForecastScenariosInput | null;
}

export function useSimulationContext(): SimulationContext {
  const { snapshot, dashboard } = useAppData();

  return useMemo(() => {
    if (!snapshot?.goal || !dashboard) return { purchase: null, forecast: null };

    const regularNet = monthlyNetAverage(snapshot.transactions, snapshot.today, {
      excludeSummer: true,
    });
    const summerYear = lastRelevantSummerYear(snapshot.today);
    const summerNet = periodSummary(
      snapshot.transactions,
      `${summerYear}-07-01`,
      `${summerYear}-08-31`,
    ).netAgorot;

    const historicalConfidence = dashboard.spendingConfidence.total;

    // ⚠️ ההוצאה ההיסטורית, לא התקציב.
    //
    // אם נעביר כאן את התקציב, התרחיש "הקצב הנוכחי" והתרחיש "התקציב
    // המאוזן" ייתנו בדיוק אותם מספרים — וההשוואה ביניהם, שהיא כל
    // הנקודה של המסך, תהיה חסרת ערך.
    const expenseAverage = monthlyExpenseAverage(snapshot.transactions, snapshot.today);
    const averageMonthlyExpense =
      expenseAverage.agorot ?? snapshot.settings.estimatedMonthlySpendAgorot;

    const purchase: PurchaseSimulationInput = {
      today: snapshot.today,
      amountAgorot: 0,
      balanceAgorot: dashboard.balance.totalAgorot,
      safeToSpendNowAgorot: dashboard.safeToSpend.nowAgorot,
      reservedForFutureMonthsAgorot:
        dashboard.safeToSpend.breakdown.reservedForFutureMonthsAgorot,
      safetyBufferAgorot: dashboard.safeToSpend.breakdown.safetyBufferAgorot,
      targetAgorot: snapshot.goal.targetAgorot,
      regularMonthlyNetAgorot: regularNet.agorot ?? 0,
      summerTotalNetAgorot: clampMin0(summerNet),
      monthEndForecastAgorot: dashboard.forecast.monthEnd.endBalanceAgorot,
      threeMonthForecastAgorot: dashboard.forecast.threeMonths.endBalanceAgorot,
      expectedIncomes: snapshot.expectedIncomes,
      historicalConfidence,
    };

    const forecast: ForecastScenariosInput = {
      today: snapshot.today,
      currentBalanceAgorot: dashboard.balance.totalAgorot,
      averageMonthlyExpenseAgorot: averageMonthlyExpense,
      averageRegularMonthlyIncomeAgorot: clampMin0(
        (regularNet.agorot ?? 0) + averageMonthlyExpense,
      ),
      budgetMonthlySpendAgorot: dashboard.budgetPlan.monthlySpendAgorot,
      summerTotalNetAgorot: clampMin0(summerNet),
      expectedIncomes: snapshot.expectedIncomes,
      historicalConfidence,
    };

    return { purchase, forecast };
  }, [snapshot, dashboard]);
}
