/**
 * מסך התקציב.
 *
 * שלושה מסלולים להשוואה, ותקציב מפורט לפי קטגוריה.
 *
 * ⚠️ שקיפות לגבי מה שלא ידוע: כשחלק מההיסטוריה הוא חיובי כרטיס ישן
 * בלי פירוט, המסך אומר את זה במפורש. תקציב שנראה מדויק יותר ממה
 * שהנתונים מצדיקים הוא תקציב שגורם להחלטות גרועות.
 */

import { Grid, Page } from '../components/layout';
import { useMemo, useState } from 'react';
import { useAppData } from '../AppData';
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
import {
  Button,
  Card,
  CardTitle,
  LoadingState,
  Money,
  ProgressBar,
  Row,
} from '../components/ui';

const PLAN_RATIOS: Record<ConcretePlanId, number> = {
  conservative: 0.75,
  balanced: 0.9,
  flexible: 1,
};

const PLAN_LABELS: Record<ConcretePlanId, { title: string; subtitle: string }> = {
  conservative: { title: 'שמרני', subtitle: 'להגיע ליעד מהר יותר' },
  balanced: { title: 'מאוזן', subtitle: 'מומלץ' },
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

  const { spendingConfidence } = dashboard;
  const { categoryBudget } = analysis;
  const activePlan = snapshot.settings.budgetPlanId;

  return (
    <Page title={`תקציב ${formatMonthHe(monthOf(snapshot.today))}`}>
      {/* עמודה אחת עד 1024, שתיים מעליו. הסדר בגריד זהה לסדר ב-DOM,
          ולכן פריסת המובייל נשמרת בדיוק. */}
      <Grid columns={2}>
        {/* ── כמה בטוח להוציא ─────────────────────────────────── */}
        <Card className="border-brand-500/40 ring-1 ring-brand-500/20 lg:col-span-2">
        <CardTitle icon="shield-check">בטוח להוציא עכשיו</CardTitle>
        {dashboard.safeToSpend.isOverspent ? (
          <p className="text-sm leading-relaxed text-caution-600">
            {dashboard.safeToSpend.messageHe}
          </p>
        ) : (
          <>
            <p className="text-3xl font-bold text-accent">
              <Money agorot={dashboard.safeToSpend.nowAgorot} />
            </p>
            <p className="mt-1 text-sm text-slate-600">
              השבוע: <Money agorot={dashboard.safeToSpend.weekAgorot} className="font-semibold" />
            </p>
          </>
        )}
      </Card>

      {/* ── ⭐ שתי רמות הביטחון ──────────────────────────────── */}
      <Card>
        <CardTitle hint="הסכום הכולל נגזר מהבנק ולכן מדויק. הפילוח לקטגוריות תלוי בכמה מההוצאות באמת מפורטות.">
          כמה אפשר לסמוך על המספרים
        </CardTitle>
        <Row label="הסכום הכולל">
          <span className="font-semibold">{confidenceLabelHe(spendingConfidence.total)}</span>
        </Row>
        <Row label="הפילוח לקטגוריות">
          <span className="font-semibold">{confidenceLabelHe(spendingConfidence.category)}</span>
        </Row>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>מפורט</span>
            <span className="num">{Math.round(spendingConfidence.detailedShare * 100)}%</span>
          </div>
          <ProgressBar
            pct={spendingConfidence.detailedShare * 100}
            tone={spendingConfidence.detailedShare >= 0.6 ? 'brand' : 'caution'}
          />
        </div>
        {spendingConfidence.disclaimerHe ? (
          <p className="mt-3 rounded-xl bg-caution-100/50 p-3 text-xs leading-relaxed text-slate-700">
            {spendingConfidence.disclaimerHe}
          </p>
        ) : null}
      </Card>

      {/* ── מסלולי התקציב ───────────────────────────────────── */}
      <Card>
        <CardTitle>מסלול התקציב</CardTitle>
        <div className="space-y-2">
          {analysis.planOptions.map(({ id, plan }) => {
            const active = id === activePlan;
            return (
              <button
                key={id}
                type="button"
                onClick={() => saveSettings(db, { budgetPlanId: id })}
                aria-pressed={active}
                className={`w-full rounded-xl border p-3 text-start transition ${
                  active
                    ? 'border-brand-700 bg-brand-50'
                    : 'border-slate-200 bg-surface hover:bg-slate-50'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold text-slate-900">
                    {PLAN_LABELS[id].title}
                    {id === 'balanced' ? (
                      <span className="ms-2 text-xs font-normal text-accent">מומלץ</span>
                    ) : null}
                  </span>
                  <Money agorot={plan.monthlySpendAgorot} className="font-bold" />
                </div>
                {/* slate-600 — הכרטיס הנבחר צבוע brand-50, ושם slate-500
                    יורד מתחת לסף הניגודיות */}
                <p className="mt-0.5 text-xs text-slate-600">{PLAN_LABELS[id].subtitle}</p>
                <div className="mt-2 flex gap-4 text-xs text-slate-600">
                  <span>
                    שבועי <Money agorot={plan.weeklySpendAgorot} />
                  </span>
                  <span>
                    בילויים <Money agorot={plan.funBudgetAgorot} />
                  </span>
                </div>
                {active ? (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    {plan.risk.summaryHe} {plan.risk.primaryReasonHe}.
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
        <Button variant="ghost" className="mt-2 -ms-2" onClick={() => setComparing((v) => !v)}>
          {comparing ? 'פחות פרטים' : 'מה ההבדל ביניהם?'}
        </Button>
        {comparing ? (
          <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
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
      <Card>
        <CardTitle hint="מבוסס על החציון החודשי שלך בכל קטגוריה, מהחודשים שיש בהם פירוט אמיתי.">
          לפי קטגוריה
        </CardTitle>

        {categoryBudget.lines.length === 0 ? (
          <p className="text-sm text-slate-500">
            {categoryBudget.noteHe ?? 'עדיין אין מספיק נתונים.'}
          </p>
        ) : (
          <>
            {categoryBudget.lines.map((line) => {
              const usedPct =
                line.plannedAgorot === 0
                  ? line.spentAgorot > 0
                    ? 100
                    : 0
                  : (line.spentAgorot / line.plannedAgorot) * 100;
              return (
                <div key={line.categoryId} className="border-b border-slate-100 py-2.5 last:border-0">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium text-slate-900">{line.categoryName}</span>
                    <span className="text-sm text-slate-600">
                      <Money agorot={line.spentAgorot} />
                      <span aria-hidden className="mx-1 text-slate-400">/</span>
                      <Money agorot={line.plannedAgorot} />
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar
                      pct={usedPct}
                      tone={usedPct > 100 ? 'danger' : usedPct > 80 ? 'caution' : 'brand'}
                    />
                  </div>
                  {line.remainingAgorot < 0 ? (
                    <p className="mt-1 text-xs text-caution-600">
                      חריגה של <Money agorot={-line.remainingAgorot} />
                    </p>
                  ) : null}
                </div>
              );
            })}

            {/* ⚠️ הסכומים מעוגלים יחד ולא כל אחד בנפרד, אחרת
                195 + 465 היה נראה כמו 660 לצד "סה״כ 659" */}
            {(() => {
              const [detailed, opaque] = apportionForDisplay([
                categoryBudget.totalPlannedAgorot,
                categoryBudget.opaqueMonthlyAgorot,
              ]);
              return (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <Row label="סך התקציב המפורט" strong>
                    <Money agorot={detailed ?? 0} />
                  </Row>
                  {categoryBudget.opaqueMonthlyAgorot > 0 ? (
                    <>
                      <Row label="כרטיס ישן — לא מפורט">
                        <Money agorot={opaque ?? 0} />
                      </Row>
                      <Row label="סה״כ צפוי לחודש" strong>
                        <Money agorot={categoryBudget.grandTotalAgorot} />
                      </Row>
                    </>
                  ) : null}
                </div>
              );
            })()}
          </>
        )}

        {categoryBudget.noteHe && categoryBudget.lines.length > 0 ? (
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            {categoryBudget.noteHe}
          </p>
        ) : null}
      </Card>

      {/* ── מה אפשר לצמצם ──────────────────────────────────── */}
      {spendingConfidence.categoryAdviceAllowed && reducibleLines(categoryBudget).length > 0 ? (
        <Card>
          <CardTitle hint="רק קטגוריות של הנאה או כאלה שקל לצמצם. חיוניות לא מופיעות כאן.">
            אם תרצה לצמצם
          </CardTitle>
          {reducibleLines(categoryBudget)
            .slice(0, 3)
            .map((line) => (
              <Row key={line.categoryId} label={line.categoryName}>
                <span className="text-xs text-slate-500">
                  הקטנה ב-10% ={' '}
                  <Money agorot={Math.round(line.plannedAgorot * 0.1)} className="font-semibold" />{' '}
                  בחודש
                </span>
              </Row>
            ))}
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

      {/* ── בילויים ─────────────────────────────────────────── */}
      <Card>
        <CardTitle icon="confetti">בילויים החודש</CardTitle>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold text-slate-900">
            <Money agorot={clampMin0(dashboard.fun.remainingAgorot)} />
          </span>
          <span className="text-sm text-slate-500">
            מתוך <Money agorot={dashboard.fun.plannedAgorot} />
          </span>
        </div>
        <div className="mt-3">
          <ProgressBar
            pct={dashboard.fun.usedPct}
            tone={dashboard.fun.usedPct > 100 ? 'danger' : dashboard.fun.usedPct > 75 ? 'caution' : 'brand'}
          />
        </div>
      </Card>
      </Grid>

      <p className="pb-4 text-center text-xs leading-relaxed text-slate-500">
        התקציב הוא הצעה שמבוססת על ההרגלים שלך, לא כלל. אפשר לשנות מסלול בכל רגע.
      </p>
    </Page>
  );
}
