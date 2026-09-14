/**
 * סיכום שבועי וחודשי.
 *
 * קצר בכוונה. סיכום שדורש גלילה ארוכה לא נקרא, וסיכום שלא נקרא
 * שווה לאותו דבר כמו סיכום שלא קיים.
 *
 * ⚠️ **v3 — אותה שפה כמו לוח הבקרה.** בחירת התקופה, הכותרת וההפרש
 * הגדול יושבים בכרטיס אחד שעולה על הבאנר. הקטגוריות הן פסים בצבע
 * הקטגוריה, והיתרה החודשית היא שני אריחים עם החץ ביניהם.
 */

import { Page } from '../components/layout';
import { useMemo, useState } from 'react';
import { useAppData } from '../AppData';
import {
  opaqueInPeriod,
  reserveUsedInPeriod,
  reviewMonth,
  reviewWeek,
  type PeriodReview,
} from '../../core/periodReview';
import { getEffectiveExpenses } from '../../core/effectiveSpending';
import { totalBalance } from '../../core/balance';
import { addDays, formatDateHe, formatMonthHe, monthOf, monthStart } from '../../core/dates';
import { Card, CardTitle, LoadingState, Money } from '../components/ui';
import { BigNumber, FeatureCard, Pill, Segmented, StatTile } from '../components/premium';
import { CategoryBars } from '../components/charts';
import { AnimatedMoney } from '../motion';

type Tab = 'week' | 'month';

function ReviewDetails({
  review,
  colors,
}: {
  review: PeriodReview;
  colors: ReadonlyMap<string, string>;
}) {
  return (
    <>
      {review.usedReserve ? (
        <Card tone="caution">
          <CardTitle icon="alert-triangle" iconTone="caution">
            נגעת בכסף ששמור לעתיד
          </CardTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            בתקופה הזו יצאו <Money agorot={review.usedReserveAgorot} className="font-semibold" /> מעבר
            להקצבה. זה לא אסון — אבל שווה לדעת, כי הכסף הזה היה מיועד לחודשים הבאים.
          </p>
        </Card>
      ) : null}

      {review.topCategories.length > 0 ? (
        <Card>
          <CardTitle icon="tag">הכי הרבה יצא על</CardTitle>
          <CategoryBars
            colors={colors}
            slices={review.topCategories.map((line) => ({
              categoryId: line.categoryId,
              categoryName: line.categoryName,
              amountAgorot: line.amountAgorot,
            }))}
          />
        </Card>
      ) : review.categoriesHiddenReasonHe ? (
        <Card>
          <CardTitle icon="info">הפילוח לקטגוריות</CardTitle>
          <p className="text-sm leading-relaxed text-slate-600">{review.categoriesHiddenReasonHe}</p>
        </Card>
      ) : null}
    </>
  );
}

export function Review() {
  const { snapshot, dashboard, loading } = useAppData();
  const [tab, setTab] = useState<Tab>('week');

  const reviews = useMemo(() => {
    if (!snapshot?.goal || !dashboard) return null;

    const dates = snapshot.transactions.map((t) => t.date).sort();
    if (dates.length === 0) return null;

    const expenses = getEffectiveExpenses({
      transactions: snapshot.transactions,
      cardTransactions: snapshot.cardTransactions,
      cards: snapshot.cards,
      from: dates[0]!,
      to: snapshot.today,
    });

    const monthlyAllowance =
      dashboard.seasonal.allocation?.monthlyAllowanceAgorot ??
      dashboard.budgetPlan.monthlySpendAgorot;

    const shared = {
      transactions: snapshot.transactions,
      expenses,
      categories: snapshot.categories,
      confidence: dashboard.spendingConfidence,
    };

    const month = monthOf(snapshot.today);
    const monthFrom = monthStart(month);

    return {
      week: reviewWeek({
        ...shared,
        today: snapshot.today,
        budgetAgorot: dashboard.budgetPlan.weeklySpendAgorot,
        reserveUsedAgorot: reserveUsedInPeriod(
          snapshot.transactions,
          addDays(snapshot.today, -6),
          snapshot.today,
          monthlyAllowance,
        ),
      }),
      month: reviewMonth({
        ...shared,
        month,
        budgetAgorot: dashboard.budgetPlan.monthlySpendAgorot,
        reserveUsedAgorot: reserveUsedInPeriod(
          snapshot.transactions,
          monthFrom,
          snapshot.today,
          monthlyAllowance,
        ),
        // היתרה בסוף היום שלפני תחילת החודש
        openingBalanceAgorot: totalBalance(
          snapshot.accounts,
          snapshot.transactions,
          addDays(monthFrom, -1),
        ).totalAgorot,
        closingBalanceAgorot: dashboard.balance.totalAgorot,
      }),
      opaqueThisMonth: opaqueInPeriod(expenses, monthFrom, snapshot.today),
    };
  }, [snapshot, dashboard]);

  if (loading || !snapshot || !dashboard) return <LoadingState />;

  if (!reviews) {
    return (
      <Page title="סיכום" icon="calendar" subtitle="מה קרה השבוע ומה קרה החודש">
        <Card>
          <p className="text-sm text-slate-600">אחרי כמה עסקאות יופיע כאן סיכום.</p>
        </Card>
      </Page>
    );
  }

  const active = tab === 'week' ? reviews.week : reviews.month;
  const colorById = new Map(snapshot.categories.map((c) => [c.id, c.color]));
  const { comparison } = active;

  return (
    <Page title="סיכום" icon="calendar" subtitle="מה קרה השבוע ומה קרה החודש" overlap>
      {/* ── ⭐ התקופה ────────────────────────────────────────────── */}
      <FeatureCard>
        <Segmented
          role="tablist"
          ariaLabel="תקופת הסיכום"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'week', label: 'השבוע' },
            { value: 'month', label: formatMonthHe(monthOf(snapshot.today)) },
          ]}
        />

        <p className="mt-4 text-xs text-slate-500">
          <span className="num">{formatDateHe(active.from)}</span> –{' '}
          <span className="num">{formatDateHe(active.to)}</span>
        </p>
        <p className="mt-1 text-base font-semibold leading-snug text-slate-900">{active.headlineHe}</p>

        <p className="mt-4 text-xs text-slate-600">ההפרש בתקופה</p>
        <div className="mt-1">
          <BigNumber tone={active.netAgorot < 0 ? 'caution' : 'accent'}>
            <AnimatedMoney agorot={active.netAgorot} signed />
          </BigNumber>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <StatTile label="נכנס" dot="brand" value={<Money agorot={active.incomeAgorot} />} />
          <StatTile label="יצא" dot="slate" value={<Money agorot={active.expenseAgorot} />} />
        </div>

        {comparison.changeSharePct !== null ? (
          <div className="mt-3">
            <Pill tone={comparison.changeSharePct > 0 ? 'caution' : 'brand'}>
              בתקופה הקודמת יצאו <Money agorot={comparison.previousExpenseAgorot} />
            </Pill>
          </div>
        ) : null}
      </FeatureCard>

      <ReviewDetails review={active} colors={colorById} />

      {tab === 'month' ? (
        <Card>
          <CardTitle icon="wallet" iconTone="brand">
            היתרה החודש
          </CardTitle>
          <div className="flex items-stretch gap-2">
            <StatTile
              className="flex-1"
              label="בתחילת החודש"
              value={<Money agorot={reviews.month.openingBalanceAgorot} />}
            />
            <span aria-hidden className="flex items-center text-lg text-slate-400">
              ←
            </span>
            <StatTile
              className="flex-1"
              label="עכשיו"
              dot="brand"
              value={<Money agorot={reviews.month.closingBalanceAgorot} />}
            />
          </div>
          {reviews.month.metBudget !== null ? (
            <div className="mt-3">
              <Pill tone={reviews.month.metBudget ? 'brand' : 'caution'}>
                ניצלת <span className="num">{reviews.month.budgetUsedPct}%</span> מהתקציב
                {reviews.month.metBudget ? ' — בתוך המסגרת' : ''}
              </Pill>
              {reviews.month.metBudget ? null : (
                <p className="mt-2 text-xs leading-relaxed text-slate-600">החודש הבא מתחיל מחדש.</p>
              )}
            </div>
          ) : null}
          {reviews.opaqueThisMonth > 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              מתוכם <Money agorot={reviews.opaqueThisMonth} /> חיובי כרטיס בלי פירוט.
            </p>
          ) : null}
        </Card>
      ) : null}

      <p className="pb-4 text-center text-xs leading-relaxed text-slate-500">
        הסיכום מתעדכן לבד. אין כאן ציונים ואין מה &quot;לעבור&quot;.
      </p>
    </Page>
  );
}
