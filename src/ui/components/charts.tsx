/**
 * גרפים.
 *
 * SVG בלבד, בלי ספריית גרפים: שלושה סוגי גרפים פשוטים לא מצדיקים
 * 100KB של תלות, והשליטה המלאה חשובה כאן — RTL, צבעים מהמערכת,
 * ונגישות לקורא מסך דרך `role="img"` ותיאור מילולי.
 *
 * ⚠️ כל גרף מקבל נתונים מחושבים מראש. אין כאן שום חישוב פיננסי.
 *
 * ⚠️ **v3 — אותה שפה כמו לוח הבקרה.** עמודות עם פינות מעוגלות שצומחות
 * מלמטה, קו יתרה שמצטייר עם שטח ממולא ונקודת סיום, ופסי קטגוריה בצבע
 * של הקטגוריה עצמה. כל התנועה כבויה למי שביקש פחות תנועה (`useDrawn`).
 */

import { useId } from 'react';
import { useMoneyFormatter } from '../AppData';
import { formatMonthHe } from '../../core/dates';
import type { Agorot, ISOMonth } from '../../core/types';
import { useDrawn } from '../motion';

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/** מזהה שבטוח לשימוש בתוך `url(#…)`. */
function useSvgId(prefix: string): string {
  return prefix + useId().replace(/[^a-zA-Z0-9]/g, '');
}

/** שם חודש מקוצר לציר ("ספט"). השנה והשם המלא הם רעש בתווית של 30 פיקסלים. */
const shortMonth = (month: string) => (formatMonthHe(month).split(' ')[0] ?? month).slice(0, 3);

export interface MonthlyBar {
  month: ISOMonth;
  incomeAgorot: Agorot;
  expenseAgorot: Agorot;
  netAgorot: Agorot;
}

/**
 * הכנסות מול הוצאות לפי חודש.
 * עמודות זו לצד זו — קל לראות באיזה חודש יצא יותר ממה שנכנס.
 *
 * ⚠️ ציר הזמן משמאל לימין (`dir="ltr"`) גם בממשק בעברית, כמו בכל שאר
 * הגרפים באפליקציה.
 */
export function IncomeExpenseChart({ data }: { data: readonly MonthlyBar[] }) {
  const format = useMoneyFormatter();
  const drawn = useDrawn();
  const incomeId = useSvgId('inc');
  if (data.length === 0) return null;

  const max = Math.max(...data.flatMap((d) => [d.incomeAgorot, d.expenseAgorot]), 1);
  const barGroupWidth = 100 / data.length;
  /** במסך צר, יותר משמונה תוויות נדחקות — מציגים כל תווית שנייה. */
  const labelEvery = data.length > 8 ? 2 : 1;

  return (
    <div>
      <div dir="ltr">
        <svg
          viewBox="0 0 100 60"
          preserveAspectRatio="none"
          className="h-44 w-full lg:h-52"
          role="img"
          aria-label={`הכנסות מול הוצאות ב-${data.length} חודשים`}
        >
          <defs>
            <linearGradient id={incomeId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-500)" />
              <stop offset="100%" stopColor="var(--color-brand-700)" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={0}
              x2={100}
              y1={58 - f * 55}
              y2={58 - f * 55}
              className="stroke-slate-200"
              strokeWidth={1}
              strokeDasharray="2 4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {data.map((entry, index) => {
            const groupX = index * barGroupWidth;
            const incomeHeight = (entry.incomeAgorot / max) * 55;
            const expenseHeight = (entry.expenseAgorot / max) * 55;
            const barWidth = barGroupWidth * 0.32;
            const grow = (delay: number) => ({
              transformBox: 'fill-box' as const,
              transformOrigin: 'bottom',
              transform: drawn ? 'scaleY(1)' : 'scaleY(0)',
              transition: `transform 900ms ${EASE} ${delay}ms`,
            });
            return (
              <g key={entry.month}>
                <rect
                  x={groupX + barGroupWidth * 0.14}
                  y={58 - incomeHeight}
                  width={barWidth}
                  height={incomeHeight}
                  rx={0.9}
                  fill={`url(#${incomeId})`}
                  style={grow(index * 45)}
                />
                <rect
                  x={groupX + barGroupWidth * 0.52}
                  y={58 - expenseHeight}
                  width={barWidth}
                  height={expenseHeight}
                  rx={0.9}
                  className="fill-slate-300"
                  style={grow(index * 45 + 80)}
                />
              </g>
            );
          })}
          <line
            x1={0}
            x2={100}
            y1={58}
            y2={58}
            className="stroke-slate-300"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="mt-1.5 flex text-[11px] text-slate-500" aria-hidden="true">
          {data.map((entry, index) => (
            <span key={entry.month} className="flex-1 text-center">
              {index % labelEvery === 0 ? shortMonth(entry.month) : ''}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex gap-2 text-xs font-semibold text-slate-700">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1">
          <span aria-hidden className="size-2.5 rounded-sm bg-brand-500" /> נכנס
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1">
          <span aria-hidden className="size-2.5 rounded-sm bg-slate-300" /> יצא
        </span>
      </div>

      {/* טבלה נגישה — קורא מסך לא רואה SVG */}
      <table className="sr-only">
        <caption>הכנסות והוצאות לפי חודש</caption>
        <thead>
          <tr>
            <th>חודש</th>
            <th>נכנס</th>
            <th>יצא</th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry) => (
            <tr key={entry.month}>
              <td>{formatMonthHe(entry.month)}</td>
              <td>{format(entry.incomeAgorot)}</td>
              <td>{format(entry.expenseAgorot)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface BalancePoint {
  date: string;
  balanceAgorot: Agorot;
}

/** יתרה לאורך זמן, עם קו היעד וקו סכום הביטחון. */
export function BalanceChart({
  points,
  targetAgorot,
  safetyBufferAgorot,
}: {
  points: readonly BalancePoint[];
  targetAgorot: Agorot;
  safetyBufferAgorot: Agorot;
}) {
  const format = useMoneyFormatter();
  const drawn = useDrawn();
  const areaId = useSvgId('bal');
  if (points.length < 2) return null;

  const values = points.map((p) => p.balanceAgorot);
  const max = Math.max(...values, targetAgorot) * 1.05;
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);

  const x = (index: number) => (index / (points.length - 1)) * 100;
  const y = (value: number) => 100 - ((value - min) / range) * 100;
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.balanceAgorot)}`)
    .join(' ');
  const last = points[points.length - 1]!;

  return (
    <div>
      <div dir="ltr" className="relative">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-44 w-full overflow-visible lg:h-52"
          role="img"
          aria-label={`יתרה לאורך זמן, מ-${format(values[0]!)} ל-${format(values.at(-1)!)}`}
        >
          <defs>
            <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line
            x1={0}
            x2={100}
            y1={y(targetAgorot)}
            y2={y(targetAgorot)}
            className="stroke-brand-500"
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={0}
            x2={100}
            y1={y(safetyBufferAgorot)}
            y2={y(safetyBufferAgorot)}
            className="stroke-alertred-600"
            strokeWidth={1}
            strokeDasharray="2 5"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={`${path} L 100 100 L 0 100 Z`}
            fill={`url(#${areaId})`}
            style={{ opacity: drawn ? 1 : 0, transition: 'opacity 1.2s ease 0.4s' }}
          />
          <path
            d={path}
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
        {/* ⚠️ הנקודה ב-HTML ולא ב-SVG: `preserveAspectRatio="none"` היה מותח
            עיגול בתוך הגרף לאליפסה. */}
        <span
          aria-hidden
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand-700 transition-opacity delay-700 duration-500"
          style={{ left: '100%', top: `${y(last.balanceAgorot)}%`, opacity: drawn ? 1 : 0 }}
        />
        <div className="mt-1.5 flex justify-between text-[11px] text-slate-500" aria-hidden="true">
          <span>{formatMonthHe(points[0]!.date.slice(0, 7))}</span>
          <span>{formatMonthHe(last.date.slice(0, 7))}</span>
        </div>
      </div>

      {/* חלופה טקסטואלית — `role="img"` נותן שם לגרף, לא את הנתונים שבו */}
      <table className="sr-only">
        <caption>יתרה לאורך זמן</caption>
        <thead>
          <tr>
            <th>תאריך</th>
            <th>יתרה</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <td>{point.date}</td>
              <td>{format(point.balanceAgorot)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface CategorySlice {
  categoryId: string;
  categoryName: string;
  amountAgorot: Agorot;
}

/**
 * פילוח קטגוריות כפסים אופקיים.
 *
 * ⚠️ לא עוגה: השוואת גדלים בעוגה קשה לעין, ובעברית התוויות נדחקות.
 * פסים אופקיים נקראים ישירות ועובדים טוב ב-RTL.
 *
 * ⚠️ `colors` — צבע הקטגוריה, כמו בעיגולים שברשימת העסקאות. בלעדיו
 * כל הפסים ירוקים, והקשר בין "אוכל בחוץ" כאן לבין אותה קטגוריה ברשימה
 * אובד.
 */
export function CategoryBars({
  slices,
  colors,
}: {
  slices: readonly CategorySlice[];
  colors?: ReadonlyMap<string, string>;
}) {
  const format = useMoneyFormatter();
  const drawn = useDrawn();
  if (slices.length === 0) return null;

  const total = slices.reduce((sum, s) => sum + Math.abs(s.amountAgorot), 0);
  if (total === 0) return null;
  const largest = Math.max(...slices.map((s) => Math.abs(s.amountAgorot)));

  return (
    <div className="space-y-3.5">
      {slices.map((slice, index) => {
        const share = (Math.abs(slice.amountAgorot) / total) * 100;
        // ⚠️ רוחב הפס יחסית לקטגוריה הגדולה ולא לסך הכל: כך הגדולה
        // ממלאת את השורה, וההבדלים בין השאר נראים. האחוז שבטקסט נשאר
        // מהסך הכל — זה המספר שיש לו משמעות.
        const width = (Math.abs(slice.amountAgorot) / largest) * 100;
        const opaque =
          slice.categoryId === 'cat-card-retired' || slice.categoryId === 'cat-card-undetailed';
        const color = opaque
          ? 'var(--color-slate-300)'
          : (colors?.get(slice.categoryId) ?? 'var(--color-brand-500)');
        return (
          <div key={slice.categoryId}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                <span className={`truncate ${opaque ? 'text-slate-600' : 'font-medium text-slate-800'}`}>
                  {slice.categoryName}
                </span>
              </span>
              <span className="shrink-0 text-slate-600">
                <span className="num sensitive font-semibold text-slate-900">{format(slice.amountAgorot)}</span>
                <span className="num ms-1.5 text-xs">{Math.round(share)}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${drawn ? width : 0}%`,
                  background: color,
                  transition: `width 1s ${EASE} ${index * 60}ms`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
