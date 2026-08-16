/**
 * סיכום שבועי וחודשי.
 *
 * קצר בכוונה. סיכום שדורש גלילה ארוכה לא נקרא, וסיכום שלא נקרא
 * שווה לאותו דבר כמו סיכום שלא קיים.
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
import { Card, CardTitle, LoadingState, Money, Row } from '../components/ui';

type Tab = 'week' | 'month';

function ReviewBody({ review }: { review: PeriodReview }) {
  return (
    <>
      <Card>
        <p className="text-sm font-medium text-slate-800">{review.headlineHe}</p>
        <div className="mt-3">
          <Row label="נכנס">
            <Money agorot={review.incomeAgorot} />
          </Row>
          <Row label="יצא">
            <Money agorot={review.expenseAgorot} />
          </Row>
          <Row label="ההפרש" strong>
            <Money agorot={review.netAgorot} signed />
          </Row>
        </div>
        {review.comparison.changeSharePct !== null ? (
          <p className="mt-2 text-xs text-slate-500">
            בתקופה הקודמת יצאו <Money agorot={review.comparison.previousExpenseAgorot} />
          </p>
        ) : null}
      </Card>

      {review.usedReserve ? (
        <Card tone="caution">
          <CardTitle>נגעת בכסף ששמור לעתיד</CardTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            בתקופה הזו יצאו <Money agorot={review.usedReserveAgorot} /> מעבר להקצבה. זה לא אסון —
            אבל שווה לדעת, כי הכסף הזה היה מיועד לחודשים הבאים.
          </p>
        </Card>
      ) : null}

      {review.topCategories.length > 0 ? (
        <Card>
          <CardTitle>הכי הרבה יצא על</CardTitle>
          {review.topCategories.map((line) => (
            <Row key={line.categoryId} label={line.categoryName}>
              <Money agorot={line.amountAgorot} />
            </Row>
          ))}
        </Card>
      ) : review.categoriesHiddenReasonHe ? (
        <Card>
          <p className="text-sm leading-relaxed text-slate-600">
            {review.categoriesHiddenReasonHe}
          </p>
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
      <Page title="סיכום">
        <Card>
          <p className="text-sm text-slate-600">אחרי כמה עסקאות יופיע כאן סיכום.</p>
        </Card>
      </Page>
    );
  }

  const active = tab === 'week' ? reviews.week : reviews.month;

  return (
    <Page title="סיכום">

      <div role="tablist" aria-label="תקופת הסיכום" className="flex gap-2">
        {(
          [
            { id: 'week' as const, label: 'השבוע' },
            { id: 'month' as const, label: formatMonthHe(monthOf(snapshot.today)) },
          ]
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={tab === option.id}
            onClick={() => setTab(option.id)}
            className={`min-h-11 flex-1 rounded-xl border text-sm font-semibold transition ${
              tab === option.id
                ? 'border-brand-700 bg-brand-50 text-accent-strong'
                : 'border-slate-300 bg-surface text-slate-600'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="px-1 text-xs text-slate-500">
        {formatDateHe(active.from)} – {formatDateHe(active.to)}
      </p>

      <ReviewBody review={active} />

      {tab === 'month' ? (
        <Card>
          <CardTitle>היתרה החודש</CardTitle>
          <Row label="בתחילת החודש">
            <Money agorot={reviews.month.openingBalanceAgorot} />
          </Row>
          <Row label="עכשיו" strong>
            <Money agorot={reviews.month.closingBalanceAgorot} />
          </Row>
          {reviews.month.metBudget !== null ? (
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              {reviews.month.metBudget
                ? `ניצלת ${reviews.month.budgetUsedPct}% מהתקציב — בתוך המסגרת.`
                : `ניצלת ${reviews.month.budgetUsedPct}% מהתקציב. החודש הבא מתחיל מחדש.`}
            </p>
          ) : null}
          {reviews.opaqueThisMonth > 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
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
