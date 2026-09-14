/**
 * מסך התחזית.
 *
 * גרף אחד, שני תרחישים לכל היותר להשוואה. ארבעה טווחים.
 *
 * ⚠️ תחזית ל-12 חודשים אצל מי שרוב ההכנסה שלו בקיץ היא תרחיש ולא
 * חיזוי — ולכן היא מסומנת ככזו, תמיד.
 *
 * ⚠️ **v3 — אותה שפה כמו לוח הבקרה.** התשובה לשאלה "כמה יהיה לי בסוף
 * החודש" היא מספר גדול שעולה על הבאנר, ושאר הטווחים הם אריחים לידו.
 * הגרף מקבל שטח ממולא שמצטייר, ותוויות חודשים מתחת לציר.
 */

import { Page } from '../components/layout';
import { useId, useMemo, useState } from 'react';
import { useAppData } from '../AppData';
import { useSimulationContext } from '../useSimulation';
import { AnimatedMoney, useDrawn } from '../motion';
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
import { buttonClass, Card, CardTitle, EmptyState, LoadingState, Money } from '../components/ui';
import { BigNumber, FeatureCard, Pill, StatTile } from '../components/premium';

const HORIZON_LABELS: Record<Horizon, string> = {
  1: 'סוף החודש',
  3: '3 חודשים',
  6: '6 חודשים',
  12: 'שנה',
};

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/** שם החודש בלבד ("ספטמבר") — לתוויות הציר, שבהן השנה היא רעש. */
const monthName = (month: string) => formatMonthHe(month).split(' ')[0] ?? month;

export function Forecast() {
  const { snapshot, dashboard, loading } = useAppData();
  const { forecast } = useSimulationContext();
  const [primary, setPrimary] = useState<ScenarioId>('current');
  const [compare, setCompare] = useState<ScenarioId | null>('balanced');
  // ⚠️ לפני כל `return` מוקדם — React דורש את אותו סדר hooks בכל רינדור.
  const drawn = useDrawn();
  const areaId = 'area' + useId().replace(/[^a-zA-Z0-9]/g, '');

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
      <Page title="תחזית" icon="trending-up" subtitle="לאן היתרה הולכת — לפי תרחישים">
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
  const monthEndPoint = primaryScenario.byHorizon[1];

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

  const points = primaryScenario.points;
  const axisLabels = [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]];

  const stabilityPill = stability
    ? stability.stable
      ? { tone: 'brand' as const, label: 'יעד יציב' }
      : stability.reached
        ? { tone: 'brand' as const, label: 'היעד הושג' }
        : { tone: 'neutral' as const, label: 'בדרך ליעד' }
    : null;

  return (
    <Page title="תחזית" icon="trending-up" subtitle="לאן היתרה הולכת — לפי תרחישים" overlap>
      {/* ── ⭐ כמה יהיה בסוף החודש ────────────────────────────── */}
      <FeatureCard>
        <CardTitle icon="trending-up" iconTone="brand">
          {primaryScenario.labelHe}
        </CardTitle>
        <p className="text-xs text-slate-600">צפי ליתרה בסוף החודש</p>
        <div className="mt-1.5">
          <BigNumber>
            <AnimatedMoney agorot={monthEndPoint.balanceAgorot} />
          </BigNumber>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Pill tone="neutral">{confidenceLabelHe(monthEndPoint.confidence)}</Pill>
          {breach ? (
            <Pill tone="caution" icon="alert-triangle">
              מתחת לסכום הביטחון ב־{formatMonthHe(breach)}
            </Pill>
          ) : (
            <Pill tone="brand" icon="shield-check">
              מעל סכום הביטחון
            </Pill>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {HORIZONS.filter((h) => h !== 1).map((horizon) => {
            const point = primaryScenario.byHorizon[horizon];
            return (
              <StatTile
                key={horizon}
                label={HORIZON_LABELS[horizon]}
                value={<Money agorot={point.balanceAgorot} />}
                sub={point.requiresFarHorizonWarning ? 'משתנה מאוד' : confidenceLabelHe(point.confidence)}
              />
            );
          })}
        </div>

        {compareScenario ? (
          <p className="mt-3 text-xs leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-800">{compareScenario.labelHe}:</span> סוף החודש{' '}
            <Money agorot={compareScenario.byHorizon[1].balanceAgorot} className="font-semibold" /> ·
            שנה <Money agorot={compareScenario.byHorizon[12].balanceAgorot} className="font-semibold" />
          </p>
        ) : null}
        <p className="mt-3 text-xs leading-relaxed text-slate-500">{primaryScenario.disclaimerHe}</p>
      </FeatureCard>

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
                className={`min-h-16 rounded-2xl border p-3 text-start text-sm transition duration-200 ${
                  isPrimary
                    ? 'border-brand-700 bg-brand-50 font-semibold text-accent-strong ring-1 ring-brand-700'
                    : isCompare
                      ? 'border-slate-400 bg-slate-50 font-medium text-slate-800'
                      : 'border-slate-200 bg-surface text-slate-700 elev-1 hover:-translate-y-0.5 hover:border-slate-300'
                }`}
              >
                <span className="flex items-center gap-2">
                  {/* דוגמת הקו כפי שהוא בגרף — מלא לראשי, מקווקו להשוואה */}
                  <span
                    aria-hidden
                    className={`h-0.5 w-4 shrink-0 rounded-full ${
                      isPrimary
                        ? 'bg-brand-700'
                        : isCompare
                          ? 'border-t-2 border-dashed border-slate-500 bg-transparent'
                          : 'bg-slate-300'
                    }`}
                  />
                  {scenario.labelHe}
                </span>
                {isPrimary ? <span className="mt-1 block text-xs font-normal">ראשי</span> : null}
                {isCompare ? <span className="mt-1 block text-xs font-normal">להשוואה</span> : null}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-600">{primaryScenario.explanationHe}</p>
      </Card>

      {/* ── גרף אחד בלבד ─────────────────────────────────────── */}
      {/* ⚠️ הגרף גבוה יותר במסך רחב, לא רק רחב יותר. `preserveAspectRatio`
          הוא `none`, ולכן מתיחה לרוחב בלי גובה מוליכה לקווים כמעט
          שטוחים — ההבדל בין התרחישים היה נמחק בדיוק במסך שבו יש הכי
          הרבה מקום להראות אותו. */}
      <Card>
        <CardTitle icon="calendar">יתרה לאורך השנה</CardTitle>
        <div dir="ltr">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-48 w-full overflow-visible lg:h-72 2xl:h-80"
            role="img"
            aria-label={`תחזית יתרה: ${primaryScenario.labelHe}`}
          >
            <defs>
              <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* חודשי קיץ */}
            {points.map((point, index) =>
              point.isSummer ? (
                <rect
                  key={point.month}
                  x={x(index) - 4}
                  y={0}
                  width={8}
                  height={100}
                  className="fill-caution-100/60"
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
              strokeWidth={1}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
            {/* סכום הביטחון */}
            <line
              x1={0}
              x2={100}
              y1={y(buffer)}
              y2={y(buffer)}
              className="stroke-alertred-600"
              strokeWidth={1}
              strokeDasharray="2 5"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={`${path(points)} L 100 100 L 0 100 Z`}
              fill={`url(#${areaId})`}
              style={{ opacity: drawn ? 1 : 0, transition: 'opacity 1.2s ease 0.4s' }}
            />
            {compareScenario ? (
              <path
                d={path(compareScenario.points)}
                fill="none"
                className="stroke-slate-400"
                strokeWidth={1.75}
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <path
              d={path(points)}
              fill="none"
              className="stroke-brand-700"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={drawn ? 0 : 1}
              style={{ transition: `stroke-dashoffset 1.6s ${EASE}` }}
            />
          </svg>
          {/* ⚠️ ציר הזמן משמאל לימין גם בממשק בעברית — כמו קו המגמה בלוח
              הבקרה והגרף במסך התובנות. */}
          <div className="mt-2 flex justify-between text-xs text-slate-500" aria-hidden="true">
            {axisLabels.map((point, i) => (
              <span key={`${point?.month}-${i}`}>{point ? monthName(point.month) : ''}</span>
            ))}
          </div>
        </div>

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
            {points.map((point) => (
              <tr key={point.month}>
                <td>{formatMonthHe(point.month)}</td>
                <td>{Math.round(point.balanceAgorot / 100)} ש״ח</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex flex-wrap gap-2">
          <Pill>
            <span aria-hidden className="inline-block h-0.5 w-3.5 rounded-full bg-brand-700" />
            {primaryScenario.labelHe}
          </Pill>
          {compareScenario ? (
            <Pill>
              <span aria-hidden className="inline-block w-3.5 border-t-2 border-dashed border-slate-500" />
              {compareScenario.labelHe}
            </Pill>
          ) : null}
          <Pill>
            <span aria-hidden className="inline-block size-2.5 rounded-sm bg-brand-500" />
            יעד ₪{Math.round(target / 100).toLocaleString('en-US')}
          </Pill>
          <Pill>
            <span aria-hidden className="inline-block size-2.5 rounded-sm bg-caution-300" />
            חודשי קיץ
          </Pill>
        </div>
      </Card>

      {/* ── מצב היעד ─────────────────────────────────────────── */}
      {stability && stabilityPill ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <CardTitle icon="target" iconTone="brand">
              יעד ₪5,000
            </CardTitle>
            <Pill tone={stabilityPill.tone}>{stabilityPill.label}</Pill>
          </div>
          <p className="text-lg font-semibold leading-snug text-slate-900">{stability.headlineHe}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{stability.detailHe}</p>
          {stability.reached ? (
            <p className="mt-3 rounded-2xl bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600">
              {stability.stable
                ? 'להגיע ליעד זה חצי מהעבודה. להחזיק אותו זה השאר.'
                : `כדי שייחשב יציב, היתרה צריכה להישאר מעל ${Math.round(stability.minimumAfterReachedAgorot / 100)} ש״ח לפחות ${stability.monthsChecked} חודשים.`}
            </p>
          ) : null}
        </Card>
      ) : null}

      {outlook.noteHe ? (
        <Card>
          <CardTitle icon="wallet">הכנסות שעדיין לא בטוחות</CardTitle>
          <div className="grid grid-cols-2 gap-2">
            {outlook.likelyAgorot > 0 ? (
              <StatTile label="סביר שיגיע" dot="brand" value={<Money agorot={outlook.likelyAgorot} />} />
            ) : null}
            {outlook.possibleAgorot > 0 ? (
              <StatTile label="אולי יגיע" dot="slate" value={<Money agorot={outlook.possibleAgorot} />} />
            ) : null}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">{outlook.noteHe}</p>
        </Card>
      ) : null}

      {/* ⚠️ אין כאן כרטיס נפרד על ירידה מתחת לסכום הביטחון: הגלולה בכרטיס
          הראשי כבר אומרת את זה, בראש המסך. פעמיים זה רעש. */}
    </Page>
  );
}
