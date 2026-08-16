/**
 * מסך התובנות.
 *
 * ⚠️ המסך הזה מסודר לפי **מידת הוודאות** ולא לפי מה שמעניין.
 *
 * קודם מה שידוע בוודאות (סכומים כוללים שמתאמתים מול הבנק), אחר כך
 * עובדות על העסקאות המפורטות, ורק אם הפילוח אמין — גם תובנות
 * קטגוריאליות. כשהן חסומות, המסך אומר את זה במפורש במקום להשתיק
 * בשקט.
 */

import { Grid, Page } from '../components/layout';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../AppData';
import { buildInsights, insightsByBasis, type Insight } from '../../core/insights';
import { monthlyTotals } from '../../core/detailedPatterns';
import { getEffectiveExpenses, effectiveExpensesByCategory } from '../../core/effectiveSpending';
import { periodSummary } from '../../core/periods';
import { eachMonth, monthEnd, monthOf, monthStart, formatMonthHe } from '../../core/dates';
import { confidenceLabelHe } from '../../core/confidence';
import { Card, CardTitle, LoadingState, Money, Row } from '../components/ui';
import { BalanceChart, CategoryBars, IncomeExpenseChart } from '../components/charts';

const TONE_STYLES = {
  neutral: 'border-slate-200 bg-surface',
  positive: 'border-brand-100 bg-brand-50',
  caution: 'border-caution-100 bg-caution-100/40',
} as const;

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className={`rounded-2xl border p-4 ${TONE_STYLES[insight.tone]}`}>
      <p className="font-semibold text-slate-900">{insight.titleHe}</p>
      <p className="mt-1 text-sm leading-relaxed text-slate-700">{insight.bodyHe}</p>
      {/* slate-600 ולא slate-500: הראיה מופיעה גם על כרטיס מגוון,
          ושם slate-500 יורד ל-4.36:1 — מתחת לסף. */}
      <p className="mt-2 text-xs text-slate-600">מבוסס על: {insight.evidenceHe}</p>
    </div>
  );
}

export function Insights() {
  const { snapshot, dashboard, loading } = useAppData();

  const analysis = useMemo(() => {
    if (!snapshot?.goal || !dashboard) return null;

    const dates = snapshot.transactions.map((t) => t.date).sort();
    if (dates.length === 0) return null;

    const from = dates[0]!;
    const to = snapshot.today;

    const expenses = getEffectiveExpenses({
      transactions: snapshot.transactions,
      cardTransactions: snapshot.cardTransactions,
      cards: snapshot.cards,
      from,
      to,
    });

    // ── נתונים חודשיים לגרפים ────────────────────────────────────────
    const months = eachMonth(monthOf(from), monthOf(to));
    const monthlyBars = months.map((month) => {
      const summary = periodSummary(
        snapshot.transactions,
        monthStart(month),
        monthEnd(month),
      );
      return {
        month,
        incomeAgorot: summary.incomeAgorot,
        expenseAgorot: summary.expenseAgorot,
        netAgorot: summary.netAgorot,
      };
    });

    // ── יתרה מצטברת לאורך הזמן ───────────────────────────────────────
    const openingAgorot = snapshot.accounts.reduce(
      (sum, account) => sum + account.openingBalanceAgorot,
      0,
    );
    let running = openingAgorot;
    const balancePoints = monthlyBars.map((bar) => {
      running += bar.netAgorot;
      return { date: monthEnd(bar.month), balanceAgorot: running };
    });

    const negativeMonths = monthlyBars.filter((b) => b.netAgorot < 0).length;
    const summerIncome = monthlyBars
      .filter((b) => ['07', '08'].includes(b.month.slice(5, 7)))
      .reduce((sum, b) => sum + b.incomeAgorot, 0);
    const yearIncome = monthlyBars.reduce((sum, b) => sum + b.incomeAgorot, 0);

    const insights = buildInsights({
      today: snapshot.today,
      expenses,
      categories: snapshot.categories,
      confidence: dashboard.spendingConfidence,
      negativeMonths,
      totalMonths: monthlyBars.length,
      reservedForFutureMonthsAgorot:
        dashboard.safeToSpend.breakdown.reservedForFutureMonthsAgorot,
      monthlyAllowanceAgorot:
        dashboard.seasonal.allocation?.monthlyAllowanceAgorot ??
        dashboard.budgetPlan.monthlySpendAgorot,
      summerIncomeAgorot: summerIncome,
      yearIncomeAgorot: yearIncome,
    });

    return {
      insights,
      monthlyBars,
      balancePoints,
      categorySlices: effectiveExpensesByCategory(expenses, snapshot.categories),
      totals: monthlyTotals(expenses),
    };
  }, [snapshot, dashboard]);

  if (loading || !snapshot || !dashboard) return <LoadingState />;

  if (!analysis) {
    return (
      <Page title="תובנות">
        <Card>
          <p className="text-sm leading-relaxed text-slate-600">
            אחרי שיהיו כמה חודשים של נתונים, כאן יופיעו הדפוסים שהמערכת מזהה.
          </p>
        </Card>
      </Page>
    );
  }

  const { insights, monthlyBars, balancePoints, categorySlices } = analysis;
  const byBasis = insightsByBasis(insights.insights);
  const { spendingConfidence } = dashboard;

  return (
    <Page
      title="תובנות"
      actions={
        <Link to="/review" className="inline-block py-2 text-sm font-semibold text-accent">
          סיכום שבועי וחודשי ←
        </Link>
      }
    >
      {/* עמודה אחת עד 1024, שתיים מעליו — ובסדר זהה. הגרפים והתובנות
          מרוויחים מהרוחב יותר מכל מסך אחר: שני גרפים זה לצד זה נקראים
          כהשוואה, ואחד מתחת לשני נקראים כשני עמודים. */}
      <Grid columns={2}>
        {/* ── מה ידוע בוודאות ─────────────────────────────────── */}
        {byBasis.total.length > 0 ? (
          <section className="space-y-3 lg:col-span-2">
            <h2 className="flex items-baseline gap-2 px-1 text-sm font-semibold text-slate-500">
              התמונה הגדולה
              <span className="text-xs font-normal text-slate-500">
                {confidenceLabelHe(spendingConfidence.total)}
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {byBasis.total.map((insight, i) => (
                <InsightCard key={`${insight.kind}-${i}`} insight={insight} />
              ))}
            </div>
          </section>
        ) : null}

      {/* ── גרף הכנסות מול הוצאות ───────────────────────────── */}
      <Card>
        <CardTitle>נכנס מול יצא, לפי חודש</CardTitle>
        <IncomeExpenseChart data={monthlyBars} />
        <div className="mt-3 space-y-1">
          {monthlyBars.slice(-3).map((bar) => (
            <Row key={bar.month} label={formatMonthHe(bar.month)}>
              <Money agorot={bar.netAgorot} signed />
            </Row>
          ))}
        </div>
      </Card>

      {/* ── גרף יתרה ────────────────────────────────────────── */}
      <Card>
        <CardTitle hint="הקו המקווקו הירוק הוא היעד, והאדום הוא סכום הביטחון.">
          היתרה לאורך הזמן
        </CardTitle>
        <BalanceChart
          points={balancePoints}
          targetAgorot={dashboard.goalProgress.targetAgorot}
          safetyBufferAgorot={dashboard.safeToSpend.breakdown.safetyBufferAgorot}
        />
      </Card>

      {/* ── עובדות מהפירוט ──────────────────────────────────── */}
      {byBasis.detailed.length > 0 ? (
        <section className="space-y-3">
          <h2 className="px-1 text-sm font-semibold text-slate-500">
            מהעסקאות המפורטות
          </h2>
          {byBasis.detailed.map((insight, i) => (
            <InsightCard key={`${insight.kind}-${i}`} insight={insight} />
          ))}
        </section>
      ) : null}

      {/* ── מנויים ──────────────────────────────────────────── */}
      {insights.subscriptions.length > 0 ? (
        <Card>
          <CardTitle hint="חיובים שחוזרים כל חודש באותו סכום בערך. מזוהים רק מתוך פירוט כרטיס.">
            חיובים חוזרים
          </CardTitle>
          {insights.subscriptions.map((sub) => (
            <div
              key={sub.merchantNormalized}
              className="flex items-baseline justify-between border-b border-slate-100 py-2 last:border-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-900">{sub.merchant}</span>
                <span className="text-xs text-slate-500">
                  {sub.occurrences} חיובים
                  {sub.possiblyStale ? (
                    <span className="ms-1.5 text-caution-600">
                      · לא הופיע {sub.daysSinceLast} ימים
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="text-end">
                <Money agorot={sub.typicalAmountAgorot} className="text-sm font-semibold" />
                <span className="block text-xs text-slate-500">
                  <Money agorot={sub.yearlyAgorot} /> בשנה
                </span>
              </span>
            </div>
          ))}
        </Card>
      ) : null}

      {/* ── פילוח קטגוריות ──────────────────────────────────── */}
      <Card>
        <CardTitle hint="הפילוח מסתמך על מה שמפורט. חיובים ללא פירוט מוצגים באפור.">
          לאן הכסף הלך
        </CardTitle>
        <CategoryBars slices={categorySlices.slice(0, 8)} />
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {Math.round(spendingConfidence.detailedShare * 100)}% מההוצאות מפורטות ·{' '}
          {confidenceLabelHe(spendingConfidence.category)}
        </p>
      </Card>

      {/* ── תובנות קטגוריאליות, או ההסבר למה אין ─────────────── */}
      {byBasis.category.length > 0 ? (
        <section className="space-y-3">
          <h2 className="px-1 text-sm font-semibold text-slate-500">לפי קטגוריה</h2>
          {byBasis.category.map((insight, i) => (
            <InsightCard key={`${insight.kind}-${i}`} insight={insight} />
          ))}
        </section>
      ) : insights.suppressedCount > 0 ? (
        <Card tone="caution">
          <CardTitle>למה אין כאן המלצות לפי קטגוריה</CardTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            {insights.suppressionNoteHe}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            המלצה כמו &quot;אתה מוציא הרבה על X&quot; שמבוססת על רבע מהתמונה יכולה להיות שגויה
            לגמרי — ולכן עדיף לא לומר אותה. ככל שיתווסף פירוט, זה ישתפר לבד.
          </p>
        </Card>
      ) : null}
      </Grid>

      <p className="pb-4 text-center text-xs leading-relaxed text-slate-500">
        התובנות כאן הן תצפיות על הנתונים שלך, לא הוראות. אתה מחליט מה לעשות איתן.
      </p>
    </Page>
  );
}
