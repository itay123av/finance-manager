/**
 * מסך התחזית.
 *
 * גרף אחד, שני תרחישים לכל היותר להשוואה. ארבעה טווחים.
 *
 * ⚠️ תחזית ל-12 חודשים אצל מי שרוב ההכנסה שלו בקיץ היא תרחיש ולא
 * חיזוי — ולכן היא מסומנת ככזו, תמיד.
 */

import { Page } from '../components/layout';
import { useMemo, useState } from 'react';
import { useAppData } from '../AppData';
import { useSimulationContext } from '../useSimulation';
import {
  HORIZONS,
  buildAllScenarios,
  bufferBreachMonth,
  unconfirmedOutlook,
  type Horizon,
  type ScenarioId,
} from '../../core/forecastScenarios';
import { assessGoalStability } from '../../core/goalStability';
import { confidenceLabelHe } from '../../core/confidence';
import { formatMonthHe } from '../../core/dates';
import { Link } from 'react-router-dom';
import {
  buttonClass,
  Card,
  CardTitle,
  EmptyState,
  LoadingState,
  Money,
  Row,
} from '../components/ui';

const HORIZON_LABELS: Record<Horizon, string> = {
  1: 'סוף החודש',
  3: '3 חודשים',
  6: '6 חודשים',
  12: 'שנה',
};

export function Forecast() {
  const { snapshot, dashboard, loading } = useAppData();
  const { forecast } = useSimulationContext();
  const [primary, setPrimary] = useState<ScenarioId>('current');
  const [compare, setCompare] = useState<ScenarioId | null>('balanced');

  const scenarios = useMemo(
    () => (forecast ? buildAllScenarios(forecast) : []),
    [forecast],
  );

  const stability = useMemo(() => {
    if (!snapshot?.goal || !dashboard || scenarios.length === 0) return null;
    const balanced = scenarios.find((s) => s.scenarioId === 'balanced')!;
    return assessGoalStability({
      today: snapshot.today,
      currentBalanceAgorot: dashboard.balance.totalAgorot,
      targetAgorot: snapshot.goal.targetAgorot,
      minimumAfterReachedAgorot: snapshot.goal.minimumAfterReachedAgorot,
      projectedBalances: balanced.points,
      confidence: balanced.byHorizon[3].confidence,
    });
  }, [snapshot, dashboard, scenarios]);

  if (loading || !dashboard || !snapshot) return <LoadingState />;

  /**
   * ⚠️ שומר סף, לא מסלול רגיל.
   *
   * בפועל תמיד יש תרחיש: כשאין היסטוריה, `useSimulationContext` נופל
   * להערכה מהאונבורדינג, ורמת הביטחון מסומנת בהתאם. השורות האלה
   * מכסות מצב חריג — יעד חסר או נתונים פגומים — שבו הגרסה הקודמת
   * החזירה `LoadingState` **לנצח**. מסך שמסתובב בלי סוף נראה כמו
   * תקלה; מצב ריק שאומר מה חסר הוא לפחות מידע.
   */
  if (scenarios.length === 0) {
    return (
      <Page title="תחזית">
        <EmptyState
          title="צריך עוד קצת היסטוריה"
          body="תחזית נבנית מהקצב שלך — כמה נכנס וכמה יוצא בחודש. אחרי שיהיו נתונים של חודש-חודשיים היא תופיע כאן."
          action={
            <Link to="/import" className={buttonClass()}>
              לייבא קובץ מהבנק
            </Link>
          }
        />
      </Page>
    );
  }

  const primaryScenario = scenarios.find((s) => s.scenarioId === primary)!;
  const compareScenario = compare ? scenarios.find((s) => s.scenarioId === compare) : undefined;
  const outlook = unconfirmedOutlook(snapshot.expectedIncomes, snapshot.today);
  const breach = bufferBreachMonth(
    primaryScenario,
    dashboard.safeToSpend.breakdown.safetyBufferAgorot,
  );

  // ── גבולות הגרף ──────────────────────────────────────────────────
  const series = [primaryScenario, ...(compareScenario ? [compareScenario] : [])];
  const allValues = series.flatMap((s) => s.points.map((p) => p.balanceAgorot));
  const target = snapshot.goal!.targetAgorot;
  const buffer = dashboard.safeToSpend.breakdown.safetyBufferAgorot;
  const maxValue = Math.max(...allValues, target) * 1.05;
  const minValue = Math.min(...allValues, 0);
  const range = Math.max(1, maxValue - minValue);

  const x = (index: number) => (index / (primaryScenario.points.length - 1)) * 100;
  const y = (value: number) => 100 - ((value - minValue) / range) * 100;
  const path = (points: { balanceAgorot: number }[]) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.balanceAgorot)}`).join(' ');

  return (
    <Page title="תחזית">

      {/* ── מצב היעד ─────────────────────────────────────────── */}
      {stability ? (
        <Card tone={stability.phase === 'reached_stable' ? 'brand' : 'plain'}>
          <CardTitle icon="target">יעד ₪5,000</CardTitle>
          <p className="text-lg font-bold text-slate-900">{stability.headlineHe}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{stability.detailHe}</p>
          {stability.reached ? (
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              {stability.stable
                ? 'להגיע ליעד זה חצי מהעבודה. להחזיק אותו זה השאר.'
                : `כדי שייחשב יציב, היתרה צריכה להישאר מעל ${Math.round(stability.minimumAfterReachedAgorot / 100)} ש״ח לפחות ${stability.monthsChecked} חודשים.`}
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* ── בחירת תרחישים ───────────────────────────────────── */}
      <Card>
        <CardTitle>איזה תרחיש?</CardTitle>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {scenarios.map((scenario) => {
            const isPrimary = scenario.scenarioId === primary;
            const isCompare = scenario.scenarioId === compare;
            return (
              <button
                key={scenario.scenarioId}
                type="button"
                onClick={() => {
                  if (isPrimary) return;
                  if (isCompare) setCompare(null);
                  else if (compare === null) setCompare(scenario.scenarioId);
                  else setPrimary(scenario.scenarioId);
                }}
                aria-pressed={isPrimary || isCompare}
                className={`min-h-14 rounded-xl border p-2 text-start text-sm transition ${
                  isPrimary
                    ? 'border-brand-700 bg-brand-50 font-semibold text-accent-strong'
                    : isCompare
                      ? 'border-slate-400 bg-slate-50 font-medium text-slate-700'
                      : 'border-slate-200 bg-surface text-slate-600'
                }`}
              >
                {scenario.labelHe}
                {isPrimary ? <span className="block text-xs font-normal">ראשי</span> : null}
                {isCompare ? <span className="block text-xs font-normal">להשוואה</span> : null}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {primaryScenario.explanationHe}
        </p>
      </Card>

      {/* ── גרף אחד בלבד ─────────────────────────────────────── */}
      {/* ⚠️ הגרף גבוה יותר במסך רחב, לא רק רחב יותר. `preserveAspectRatio`
          הוא `none`, ולכן מתיחה לרוחב בלי גובה מוליכה לקווים כמעט
          שטוחים — ההבדל בין התרחישים היה נמחק בדיוק במסך שבו יש הכי
          הרבה מקום להראות אותו. */}
      <Card>
        <CardTitle>יתרה לאורך השנה</CardTitle>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-44 w-full lg:h-72 2xl:h-80"
          role="img"
          aria-label={`תחזית יתרה: ${primaryScenario.labelHe}`}
        >
          {/* חודשי קיץ */}
          {primaryScenario.points.map((point, index) =>
            point.isSummer ? (
              <rect
                key={point.month}
                x={x(index) - 4}
                y={0}
                width={8}
                height={100}
                className="fill-caution-100/50"
              />
            ) : null,
          )}
          {/* היעד */}
          <line
            x1={0}
            x2={100}
            y1={y(target)}
            y2={y(target)}
            className="stroke-brand-500"
            strokeWidth={0.5}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
          {/* סכום הביטחון */}
          <line
            x1={0}
            x2={100}
            y1={y(buffer)}
            y2={y(buffer)}
            className="stroke-alertred-600"
            strokeWidth={0.5}
            strokeDasharray="1 3"
            vectorEffect="non-scaling-stroke"
          />
          {compareScenario ? (
            <path
              d={path(compareScenario.points)}
              fill="none"
              className="stroke-slate-400"
              strokeWidth={1.5}
              strokeDasharray="3 2"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          <path
            d={path(primaryScenario.points)}
            fill="none"
            className="stroke-brand-700"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* חלופה טקסטואלית לגרף — קורא מסך לא רואה קווי SVG */}
        <table className="sr-only">
          <caption>תחזית יתרה לפי חודש — {primaryScenario.labelHe}</caption>
          <thead>
            <tr>
              <th>חודש</th>
              <th>יתרה צפויה</th>
            </tr>
          </thead>
          <tbody>
            {primaryScenario.points.map((point) => (
              <tr key={point.month}>
                <td>{formatMonthHe(point.month)}</td>
                <td>{Math.round(point.balanceAgorot / 100)} ש״ח</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>
            <span className="inline-block h-0.5 w-4 bg-brand-700 align-middle" />{' '}
            {primaryScenario.labelHe}
          </span>
          {compareScenario ? (
            <span>
              <span className="inline-block h-0.5 w-4 bg-slate-400 align-middle" />{' '}
              {compareScenario.labelHe}
            </span>
          ) : null}
          {/* מקרא: ריבוע צבע ולא תו טקסט. `▪` נשען על גופן, מקבל
              את צבע הטקסט ולא את צבע הסדרה, וגודלו משתנה בין מכשירים. */}
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-2.5 rounded-sm bg-brand-500" />
            יעד ₪{Math.round(target / 100).toLocaleString('en-US')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-2.5 rounded-sm bg-caution-300" />
            חודשי קיץ
          </span>
        </div>
      </Card>

      {/* ── טווחים ──────────────────────────────────────────── */}
      {/* ארבעת הטווחים זה לצד זה במסך רחב — כך רואים את כל התחזית
          במבט אחד במקום לגלול בין ארבע שורות. */}
      <Card>
        <CardTitle>{primaryScenario.labelHe}</CardTitle>
        <div className="lg:grid lg:grid-cols-4 lg:gap-4">
        {HORIZONS.map((horizon) => {
          const point = primaryScenario.byHorizon[horizon];
          return (
            <div
              key={horizon}
              className="border-b border-slate-100 py-2 last:border-0 lg:rounded-xl lg:border lg:border-slate-200 lg:p-3"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-700">{HORIZON_LABELS[horizon]}</span>
                <Money agorot={point.balanceAgorot} className="font-semibold" />
              </div>
              <p className="text-xs text-slate-500">
                {confidenceLabelHe(point.confidence)}
                {point.requiresFarHorizonWarning ? ' · תחזית רחוקה, משתנה מאוד' : ''}
              </p>
              {compareScenario ? (
                <p className="text-xs text-slate-500">
                  {compareScenario.labelHe}:{' '}
                  <Money agorot={compareScenario.byHorizon[horizon].balanceAgorot} />
                </p>
              ) : null}
            </div>
          );
        })}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {primaryScenario.disclaimerHe}
        </p>
      </Card>

      {breach ? (
        <Card tone="caution">
          <p className="text-sm leading-relaxed text-slate-800">
            בתרחיש הזה, היתרה צפויה לרדת מתחת לסכום הביטחון ב־{formatMonthHe(breach)}.
          </p>
        </Card>
      ) : null}

      {outlook.noteHe ? (
        <Card>
          <CardTitle>הכנסות שעדיין לא בטוחות</CardTitle>
          {outlook.likelyAgorot > 0 ? (
            <Row label="סביר שיגיע">
              <Money agorot={outlook.likelyAgorot} />
            </Row>
          ) : null}
          {outlook.possibleAgorot > 0 ? (
            <Row label="אולי יגיע">
              <Money agorot={outlook.possibleAgorot} />
            </Row>
          ) : null}
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{outlook.noteHe}</p>
        </Card>
      ) : null}
    </Page>
  );
}
