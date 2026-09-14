/**
 * מסך התובנות.
 *
 * ⚠️ המסך הזה מסודר לפי **מידת הוודאות** ולא לפי מה שמעניין.
 *
 * קודם מה שידוע בוודאות (סכומים כוללים שמתאמתים מול הבנק), אחר כך
 * עובדות על העסקאות המפורטות, ורק אם הפילוח אמין — גם תובנות
 * קטגוריאליות. כשהן חסומות, המסך אומר את זה במפורש במקום להשתיק
 * בשקט.
 *
 * ⚠️ **v3 — אותה שפה כמו לוח הבקרה.** "התמונה הגדולה" עולה על הבאנר
 * עם אריחי מספרים, כל תובנה מקבלת מדליון לפי הטון שלה, והגרפים צומחים
 * ומצטיירים.
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
import { Card, CardTitle, LoadingState, Medallion, Money } from '../components/ui';
import { FeatureCard, Pill, StatTile } from '../components/premium';
import { BalanceChart, CategoryBars, IncomeExpenseChart } from '../components/charts';

const TONE_STYLES = {
  neutral: { box: 'bg-slate-50', icon: 'info', medallion: 'neutral' },
  positive: { box: 'bg-brand-50/70', icon: 'sparkles', medallion: 'brand' },
  caution: { box: 'bg-caution-100/40', icon: 'alert-triangle', medallion: 'caution' },
} as const;

function InsightCard({ insight }: { insight: Insight }) {
  const tone = TONE_STYLES[insight.tone];
  return (
    <div className={`flex gap-3 rounded-2xl p-4 ${tone.box}`}>
      <Medallion icon={tone.icon} tone={tone.medallion} className="size-9" />
      <div className="min-w-0">
        <p className="font-semibold text-slate-900">{insight.titleHe}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{insight.bodyHe}</p>
        {/* slate-600 ולא slate-500: הראיה מופיעה גם על כרטיס מגוון,
            ושם slate-500 יורד ל-4.36:1 — מתחת לסף. */}
        <p className="mt-2 text-xs text-slate-600">מבוסס על: {insight.evidenceHe}</p>
      </div>
    </div>
  );
}

/** כותרת קבוצת תובנות, עם מונה. */
function GroupTitle({ children, count }: { children: string; count: number }) {
  return (
    <h2 className="flex items-center gap-2 px-1 text-sm font-semibold text-slate-700">
      {children}
      <span className="num rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
        {count}
      </span>
    </h2>
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
      negativeMonths,
      summerIncome,
      categorySlices: effectiveExpensesByCategory(expenses, snapshot.categories),
      totals: monthlyTotals(expenses),
    };
  }, [snapshot, dashboard]);

  if (loading || !snapshot || !dashboard) return <LoadingState />;

  if (!analysis) {
    return (
      <Page title="תובנות" icon="lightbulb" subtitle="דפוסים שהמערכת מזהה בהוצאות שלך">
        <Card>
          <p className="text-sm leading-relaxed text-slate-600">
            אחרי שיהיו כמה חודשים של נתונים, כאן יופיעו הדפוסים שהמערכת מזהה.
          </p>
        </Card>
      </Page>
    );
  }

  const { insights, monthlyBars, balancePoints, categorySlices, negativeMonths, summerIncome } = analysis;
  const byBasis = insightsByBasis(insights.insights);
  const { spendingConfidence } = dashboard;
  const colorById = new Map(snapshot.categories.map((c) => [c.id, c.color]));

  return (
    <Page
      title="תובנות"
      icon="lightbulb"
      subtitle="דפוסים שהמערכת מזהה בהוצאות שלך"
      overlap
      actions={
        <Link
          to="/review"
          className="glass inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-white transition hover:bg-white/15"
        >
          סיכום שבועי וחודשי ←
        </Link>
      }
    >
      {/* עמודה אחת עד 1024, שתיים מעליו — ובסדר זהה. הגרפים והתובנות
          מרוויחים מהרוחב יותר מכל מסך אחר: שני גרפים זה לצד זה נקראים
          כהשוואה, ואחד מתחת לשני נקראים כשני עמודים. */}
      <Grid columns={2}>
        {/* ── ⭐ מה ידוע בוודאות ────────────────────────────────── */}
        <FeatureCard className="lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle icon="lightbulb" iconTone="brand">
              התמונה הגדולה
            </CardTitle>
            <Pill tone="brand" icon="shield-check">
              {confidenceLabelHe(spendingConfidence.total)}
            </Pill>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <StatTile label="חודשים בנתונים" value={<span className="num">{monthlyBars.length}</span>} />
            <StatTile
              label="חודשים במינוס"
              dot={negativeMonths > 0 ? 'caution' : 'brand'}
              value={<span className="num">{negativeMonths}</span>}
            />
            <StatTile label="הכנסה בקיץ" dot="brand" value={<Money agorot={summerIncome} />} />
            <StatTile
              label="הוצאות מפורטות"
              value={<span className="num">{Math.round(spendingConfidence.detailedShare * 100)}%</span>}
            />
          </div>
          {byBasis.total.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
              {byBasis.total.map((insight, i) => (
                <InsightCard key={`${insight.kind}-${i}`} insight={insight} />
              ))}
            </div>
          ) : null}
        </FeatureCard>

        {/* ── גרף הכנסות מול הוצאות ───────────────────────────── */}
        <Card>
          <CardTitle icon="receipt">נכנס מול יצא, לפי חודש</CardTitle>
          <IncomeExpenseChart data={monthlyBars} />
          <div className="mt-4 grid grid-cols-3 gap-2">
            {monthlyBars.slice(-3).map((bar) => (
              <StatTile
                key={bar.month}
                label={formatMonthHe(bar.month).split(' ')[0] ?? bar.month}
                dot={bar.netAgorot < 0 ? 'caution' : 'brand'}
                value={<Money agorot={bar.netAgorot} signed />}
              />
            ))}
          </div>
        </Card>

        {/* ── גרף יתרה ────────────────────────────────────────── */}
        <Card>
          <CardTitle icon="trending-up" hint="הקו המקווקו הירוק הוא היעד, והאדום הוא סכום הביטחון.">
            היתרה לאורך הזמן
          </CardTitle>
          <BalanceChart
            points={balancePoints}
            targetAgorot={dashboard.goalProgress.targetAgorot}
            safetyBufferAgorot={dashboard.safeToSpend.breakdown.safetyBufferAgorot}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill>
              <span aria-hidden className="inline-block w-3.5 border-t-2 border-dashed border-brand-500" />
              יעד
            </Pill>
            <Pill>
              <span aria-hidden className="inline-block w-3.5 border-t-2 border-dotted border-alertred-600" />
              סכום ביטחון
            </Pill>
          </div>
        </Card>

        {/* ── עובדות מהפירוט ──────────────────────────────────── */}
        {byBasis.detailed.length > 0 ? (
          <section className="space-y-3">
            <GroupTitle count={byBasis.detailed.length}>מהעסקאות המפורטות</GroupTitle>
            {byBasis.detailed.map((insight, i) => (
              <InsightCard key={`${insight.kind}-${i}`} insight={insight} />
            ))}
          </section>
        ) : null}

        {/* ── מנויים ──────────────────────────────────────────── */}
        {insights.subscriptions.length > 0 ? (
          <Card>
            <CardTitle
              icon="refresh"
              hint="חיובים שחוזרים כל חודש באותו סכום בערך. מזוהים רק מתוך פירוט כרטיס."
            >
              חיובים חוזרים
            </CardTitle>
            <div className="divide-y divide-slate-100">
              {insights.subscriptions.map((sub) => (
                <div key={sub.merchantNormalized} className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-[0.875rem] bg-slate-100 text-sm font-bold text-slate-700"
                  >
                    {sub.merchant.trim().charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {sub.merchant}
                    </span>
                    <span className="text-xs text-slate-600">
                      <span className="num">{sub.occurrences}</span> חיובים
                      {sub.possiblyStale ? (
                        <span className="ms-1.5 font-medium text-caution-600">
                          · לא הופיע <span className="num">{sub.daysSinceLast}</span> ימים
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <Money agorot={sub.typicalAmountAgorot} className="text-sm font-semibold text-slate-900" />
                    <span className="block text-xs text-slate-600">
                      <Money agorot={sub.yearlyAgorot} /> בשנה
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {/* ── פילוח קטגוריות ──────────────────────────────────── */}
        <Card>
          <CardTitle icon="tag" hint="הפילוח מסתמך על מה שמפורט. חיובים ללא פירוט מוצגים באפור.">
            לאן הכסף הלך
          </CardTitle>
          <CategoryBars slices={categorySlices.slice(0, 8)} colors={colorById} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill>
              <span className="num">{Math.round(spendingConfidence.detailedShare * 100)}%</span> מפורט
            </Pill>
            <Pill>{confidenceLabelHe(spendingConfidence.category)}</Pill>
          </div>
        </Card>

        {/* ── תובנות קטגוריאליות, או ההסבר למה אין ─────────────── */}
        {byBasis.category.length > 0 ? (
          <section className="space-y-3">
            <GroupTitle count={byBasis.category.length}>לפי קטגוריה</GroupTitle>
            {byBasis.category.map((insight, i) => (
              <InsightCard key={`${insight.kind}-${i}`} insight={insight} />
            ))}
          </section>
        ) : insights.suppressedCount > 0 ? (
          <Card tone="caution">
            <CardTitle icon="scale" iconTone="caution">
              למה אין כאן המלצות לפי קטגוריה
            </CardTitle>
            <p className="text-sm leading-relaxed text-slate-700">{insights.suppressionNoteHe}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
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
