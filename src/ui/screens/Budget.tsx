/**
 * מסך התקציב.
 *
 * שלושה מסלולים להשוואה, ותקציב מפורט לפי קטגוריה.
 *
 * ⚠️ שקיפות לגבי מה שלא ידוע: כשחלק מההיסטוריה הוא חיובי כרטיס ישן
 * בלי פירוט, המסך אומר את זה במפורש. תקציב שנראה מדויק יותר ממה
 * שהנתונים מצדיקים הוא תקציב שגורם להחלטות גרועות.
 *
 * ⚠️ **v3 — אותה שפה כמו לוח הבקרה.** טבעת ניצול שעולה על הבאנר,
 * מסלולים ככרטיסי בחירה, ופסי קטגוריה בצבע הקטגוריה. הבאנר עצמו בלי
 * מדדים: אותם שלושה מספרים כבר בטבעת, ופעמיים זה רעש.
 */

import { Grid, Page } from '../components/layout';
import { useMemo, useState } from 'react';
import { useAppData } from '../AppData';
import { AnimatedMoney } from '../motion';
import { db } from '../../data/db';
import { saveSettings } from '../../data/repositories';
import { buildBudgetPlan, type ConcretePlanId } from '../../core/budget';
import { buildCategoryBudget, reducibleLines } from '../../core/categoryBudget';
import { getEffectiveExpenses } from '../../core/effectiveSpending';
import { monthlyExpenseAverage } from '../../core/averages';
import { fixedMonthlyCommitments } from '../../core/recurring';
import { confidenceLabelHe } from '../../core/confidence';
import { formatMonthHe, monthOf } from '../../core/dates';
import { apportionForDisplay, clampMin0 } from '../../core/money';
import { Button, Card, CardTitle, LoadingState, Money, ProgressBar, Row } from '../components/ui';
import { BigNumber, FeatureCard, Pill, StatTile } from '../components/premium';
import { GoalRing } from '../components/visuals';

const PLAN_RATIOS: Record<ConcretePlanId, number> = {
  conservative: 0.75,
  balanced: 0.9,
  flexible: 1,
};

const PLAN_LABELS: Record<ConcretePlanId, { title: string; subtitle: string }> = {
  conservative: { title: 'שמרני', subtitle: 'להגיע ליעד מהר יותר' },
  balanced: { title: 'מאוזן', subtitle: 'צמצום קטן שאפשר לעמוד בו' },
  flexible: { title: 'גמיש', subtitle: 'יותר מקום, יעד רחוק יותר' },
};

export function Budget() {
  const { snapshot, dashboard, loading } = useAppData();
  const [comparing, setComparing] = useState(false);

  const analysis = useMemo(() => {
    if (!snapshot?.goal || !dashboard) return null;

    const dates = snapshot.transactions.map((t) => t.date).sort();
    const expenses = getEffectiveExpenses({
      transactions: snapshot.transactions,
      cardTransactions: snapshot.cardTransactions,
      cards: snapshot.cards,
      from: dates[0] ?? snapshot.today,
      to: snapshot.today,
    });

    const expenseAverage = monthlyExpenseAverage(snapshot.transactions, snapshot.today);
    const fixedCommitmentsAgorot = fixedMonthlyCommitments(snapshot.transactions, snapshot.today);

    const planOptions = (Object.keys(PLAN_RATIOS) as ConcretePlanId[]).map((id) => ({
      id,
      plan: buildBudgetPlan(id, {
        today: snapshot.today,
        historicalMonthlySpend: expenseAverage,
        estimatedMonthlySpendAgorot: snapshot.settings.estimatedMonthlySpendAgorot,
        fixedCommitmentsAgorot,
        expectedMonthlyIncomeAgorot: dashboard.month.incomeAgorot,
        receivedMonthlyIncomeAgorot: dashboard.month.incomeAgorot,
        currentBalanceAgorot: dashboard.balance.totalAgorot,
        unconfirmedIncomeShare: 0,
      }),
    }));

    const categoryBudget = buildCategoryBudget({
      expenses,
      categories: snapshot.categories,
      today: snapshot.today,
      planRatio: PLAN_RATIOS[snapshot.settings.budgetPlanId],
    });

    return { planOptions, categoryBudget, expenses };
  }, [snapshot, dashboard]);

  if (loading || !snapshot || !dashboard || !analysis) return <LoadingState />;

  const { spendingConfidence, budgetProgress, safeToSpend, fun } = dashboard;
  const { categoryBudget } = analysis;
  const activePlan = snapshot.settings.budgetPlanId;
  const colorById = new Map(snapshot.categories.map((c) => [c.id, c.color]));
  const stretched = budgetProgress.isOverBudget || budgetProgress.isAheadOfPace;

  return (
    <Page
      title={`תקציב ${formatMonthHe(monthOf(snapshot.today))}`}
      icon="target"
      subtitle="כמה מתוכנן, כמה יצא, ומה נשאר"
      overlap
    >
      {/* עמודה אחת עד 1024, שתיים מעליו. הסדר בגריד זהה לסדר ב-DOM,
          ולכן פריסת המובייל נשמרת בדיוק. */}
      <Grid columns={2}>
        {/* ── ⭐ ניצול החודש ────────────────────────────────────── */}
        <FeatureCard className="lg:col-span-2">
          <CardTitle icon="target" iconTone={stretched ? 'caution' : 'brand'}>
            החודש שלך
          </CardTitle>
          <div className="flex items-center gap-5 lg:gap-10">
            <GoalRing
              pct={budgetProgress.spentSharePct}
              label="ניצול התקציב החודשי"
              tone={stretched ? 'caution' : 'brand'}
            >
              <span className="num num-display text-[1.75rem] leading-none font-semibold text-slate-900">
                {Math.round(budgetProgress.spentSharePct)}%
              </span>
              <span className="mt-1 text-xs text-slate-600">נוצל</span>
            </GoalRing>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-xs text-slate-600">יצא החודש</p>
                <p className="num-display mt-0.5 text-2xl font-semibold text-slate-900">
                  <AnimatedMoney agorot={budgetProgress.spentAgorot} />
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:max-w-md">
                <StatTile label="תקציב" dot="slate" value={<Money agorot={budgetProgress.plannedAgorot} />} />
                <StatTile
                  label="נשאר"
                  dot={budgetProgress.remainingAgorot < 0 ? 'caution' : 'brand'}
                  value={<Money agorot={budgetProgress.remainingAgorot} />}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill icon="calendar">
              עבר <span className="num">{Math.round(budgetProgress.monthElapsedPct)}%</span> מהחודש
            </Pill>
            {budgetProgress.isOverBudget ? (
              <Pill tone="caution" icon="alert-triangle">
                חריגה מהתקציב
              </Pill>
            ) : budgetProgress.isAheadOfPace ? (
              <Pill tone="caution" icon="alert-triangle">
                הקצב מהיר מהחודש
              </Pill>
            ) : (
              <Pill tone="brand" icon="shield-check">
                בקצב
              </Pill>
            )}
          </div>
        </FeatureCard>

        {/* ── כמה בטוח להוציא ─────────────────────────────────── */}
        <Card>
          <CardTitle icon="shield-check" iconTone="brand">
            בטוח להוציא עכשיו
          </CardTitle>
          {safeToSpend.isOverspent ? (
            <p className="text-sm leading-relaxed text-caution-600">{safeToSpend.messageHe}</p>
          ) : (
            <>
              <BigNumber tone="accent" size="md">
                <AnimatedMoney agorot={safeToSpend.nowAgorot} />
              </BigNumber>
              <div className="mt-3">
                <Pill>
                  השבוע: <Money agorot={safeToSpend.weekAgorot} />
                </Pill>
              </div>
            </>
          )}
        </Card>

        {/* ── בילויים ─────────────────────────────────────────── */}
        <Card>
          <CardTitle icon="confetti" iconTone="caution">
            בילויים החודש
          </CardTitle>
          <div className="flex items-baseline justify-between gap-3">
            <BigNumber size="md">
              <Money agorot={clampMin0(fun.remainingAgorot)} />
            </BigNumber>
            <span className="text-sm text-slate-600">
              מתוך <Money agorot={fun.plannedAgorot} className="font-semibold text-slate-900" />
            </span>
          </div>
          <div className="mt-4">
            <ProgressBar
              pct={fun.usedPct}
              tone={fun.usedPct > 100 ? 'danger' : fun.usedPct > 75 ? 'caution' : 'brand'}
            />
          </div>
          <p className="mt-2 text-xs text-slate-600">נשאר לבילויים עד סוף החודש</p>
        </Card>

        {/* ── ⭐ שתי רמות הביטחון ──────────────────────────────── */}
        <Card>
          <CardTitle hint="הסכום הכולל נגזר מהבנק ולכן מדויק. הפילוח לקטגוריות תלוי בכמה מההוצאות באמת מפורטות.">
            כמה אפשר לסמוך על המספרים
          </CardTitle>
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="הסכום הכולל" value={confidenceLabelHe(spendingConfidence.total)} />
            <StatTile label="הפילוח לקטגוריות" value={confidenceLabelHe(spendingConfidence.category)} />
          </div>
          <div className="mt-4">
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-slate-600">הוצאות מפורטות</span>
              <span className="num font-semibold text-slate-900">
                {Math.round(spendingConfidence.detailedShare * 100)}%
              </span>
            </div>
            <ProgressBar
              pct={spendingConfidence.detailedShare * 100}
              tone={spendingConfidence.detailedShare >= 0.6 ? 'brand' : 'caution'}
            />
          </div>
          {spendingConfidence.disclaimerHe ? (
            <p className="mt-3 rounded-2xl bg-caution-100/50 p-3.5 text-xs leading-relaxed text-slate-700">
              {spendingConfidence.disclaimerHe}
            </p>
          ) : null}
        </Card>

        {/* ── מסלולי התקציב ───────────────────────────────────── */}
        <Card>
          <CardTitle>מסלול התקציב</CardTitle>
          <div className="space-y-2.5">
            {analysis.planOptions.map(({ id, plan }) => {
              const active = id === activePlan;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => saveSettings(db, { budgetPlanId: id })}
                  aria-pressed={active}
                  className={`w-full rounded-2xl border p-4 text-start transition duration-200 ${
                    active
                      ? 'border-brand-700 bg-brand-50 ring-1 ring-brand-700'
                      : 'border-slate-200 bg-surface elev-1 hover:-translate-y-0.5 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* סימן בחירה — עיגול מלא לנבחר, טבעת ריקה לשאר */}
                    <span
                      aria-hidden
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        active ? 'border-brand-700' : 'border-slate-300'
                      }`}
                    >
                      {active ? <span className="size-2.5 rounded-full bg-brand-700" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{PLAN_LABELS[id].title}</span>
                        {id === 'balanced' ? <Pill tone="brand">מומלץ</Pill> : null}
                      </span>
                      {/* slate-600 — הכרטיס הנבחר צבוע brand-50, ושם slate-500
                          יורד מתחת לסף הניגודיות */}
                      <span className="mt-0.5 block text-xs text-slate-600">{PLAN_LABELS[id].subtitle}</span>
                    </span>
                    <span className="num-display text-xl font-semibold text-slate-900">
                      <Money agorot={plan.monthlySpendAgorot} />
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 ps-8 text-xs text-slate-600">
                    <span>
                      שבועי <Money agorot={plan.weeklySpendAgorot} className="font-semibold text-slate-900" />
                    </span>
                    <span aria-hidden className="text-slate-400">
                      ·
                    </span>
                    <span>
                      בילויים <Money agorot={plan.funBudgetAgorot} className="font-semibold text-slate-900" />
                    </span>
                  </div>
                  {active ? (
                    <p className="mt-2 ps-8 text-xs leading-relaxed text-slate-600">
                      {plan.risk.summaryHe} {plan.risk.primaryReasonHe}.
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
          <Button variant="ghost" className="mt-2 -ms-3" onClick={() => setComparing((v) => !v)}>
            {comparing ? 'פחות פרטים' : 'מה ההבדל ביניהם?'}
          </Button>
          {comparing ? (
            <div className="mt-2 space-y-2 rounded-2xl bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600">
              <p>
                <strong>שמרני</strong> — 75% ממה שאתה רגיל להוציא. מגיע ליעד מהר יותר, אבל דורש
                ויתורים אמיתיים.
              </p>
              <p>
                <strong>מאוזן</strong> — 90%. צמצום קטן שאפשר לעמוד בו לאורך זמן.
              </p>
              <p>
                <strong>גמיש</strong> — כמו שאתה מוציא היום. היעד יתרחק, אבל לא תרגיש בלחץ.
              </p>
            </div>
          ) : null}
        </Card>

        {/* ── ⭐ תקציב לפי קטגוריה ─────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardTitle hint="מבוסס על החציון החודשי שלך בכל קטגוריה, מהחודשים שיש בהם פירוט אמיתי.">
            לפי קטגוריה
          </CardTitle>

          {categoryBudget.lines.length === 0 ? (
            <p className="text-sm text-slate-600">
              {categoryBudget.noteHe ?? 'עדיין אין מספיק נתונים.'}
            </p>
          ) : (
            <>
              <div className="lg:grid lg:grid-cols-2 lg:gap-x-10">
                {categoryBudget.lines.map((line) => {
                  const usedPct =
                    line.plannedAgorot === 0
                      ? line.spentAgorot > 0
                        ? 100
                        : 0
                      : (line.spentAgorot / line.plannedAgorot) * 100;
                  const color = colorById.get(line.categoryId) ?? 'var(--color-slate-400)';
                  return (
                    <div key={line.categoryId} className="border-b border-slate-100 py-3 last:border-0">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                          {line.categoryName}
                        </span>
                        <span className="text-sm text-slate-600">
                          <Money agorot={line.spentAgorot} className="font-semibold text-slate-900" />
                          <span aria-hidden className="mx-1 text-slate-400">
                            /
                          </span>
                          <Money agorot={line.plannedAgorot} />
                        </span>
                      </div>
                      <div className="mt-2 ps-5">
                        <ProgressBar
                          pct={usedPct}
                          tone={usedPct > 100 ? 'danger' : usedPct > 80 ? 'caution' : 'brand'}
                        />
                      </div>
                      {line.remainingAgorot < 0 ? (
                        <div className="mt-2 ps-5">
                          <Pill tone="caution" icon="alert-triangle">
                            חריגה של <Money agorot={-line.remainingAgorot} />
                          </Pill>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* ⚠️ הסכומים מעוגלים יחד ולא כל אחד בנפרד, אחרת
                  195 + 465 היה נראה כמו 660 לצד "סה״כ 659" */}
              {(() => {
                const [detailed, opaque] = apportionForDisplay([
                  categoryBudget.totalPlannedAgorot,
                  categoryBudget.opaqueMonthlyAgorot,
                ]);
                return (
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <StatTile label="סך התקציב המפורט" value={<Money agorot={detailed ?? 0} />} />
                    {categoryBudget.opaqueMonthlyAgorot > 0 ? (
                      <>
                        <StatTile label="כרטיס ישן — לא מפורט" value={<Money agorot={opaque ?? 0} />} />
                        <StatTile
                          label="סה״כ צפוי לחודש"
                          dot="brand"
                          value={<Money agorot={categoryBudget.grandTotalAgorot} />}
                        />
                      </>
                    ) : null}
                  </div>
                );
              })()}
            </>
          )}

          {categoryBudget.noteHe && categoryBudget.lines.length > 0 ? (
            <p className="mt-3 rounded-2xl bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600">
              {categoryBudget.noteHe}
            </p>
          ) : null}
        </Card>

        {/* ── מה אפשר לצמצם ──────────────────────────────────── */}
        {spendingConfidence.categoryAdviceAllowed && reducibleLines(categoryBudget).length > 0 ? (
          <Card>
            <CardTitle
              icon="sprout"
              iconTone="brand"
              hint="רק קטגוריות של הנאה או כאלה שקל לצמצם. חיוניות לא מופיעות כאן."
            >
              אם תרצה לצמצם
            </CardTitle>
            <div className="divide-y divide-slate-100">
              {reducibleLines(categoryBudget)
                .slice(0, 3)
                .map((line) => (
                  <Row key={line.categoryId} label={line.categoryName}>
                    <span className="text-xs font-normal text-slate-600">
                      10% פחות ={' '}
                      <Money agorot={Math.round(line.plannedAgorot * 0.1)} className="font-semibold text-accent" />{' '}
                      בחודש
                    </span>
                  </Row>
                ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              אלה לא הוראות — רק כמה זה שווה. אתה מחליט אם זה שווה לך.
            </p>
          </Card>
        ) : null}

        {!spendingConfidence.categoryAdviceAllowed && spendingConfidence.opaqueAgorot > 0 ? (
          <Card tone="caution">
            <p className="text-sm leading-relaxed text-slate-700">
              רוב ההוצאות ההיסטוריות עדיין לא מפורטות, ולכן לא נציע המלצות לפי קטגוריה — הן היו
              מבוססות על מדגם קטן מדי.
            </p>
          </Card>
        ) : null}
      </Grid>

      <p className="pb-4 text-center text-xs leading-relaxed text-slate-500">
        התקציב הוא הצעה שמבוססת על ההרגלים שלך, לא כלל. אפשר לשנות מסלול בכל רגע.
      </p>
    </Page>
  );
}
