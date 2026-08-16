/**
 * גרפים.
 *
 * SVG בלבד, בלי ספריית גרפים: שלושה סוגי גרפים פשוטים לא מצדיקים
 * 100KB של תלות, והשליטה המלאה חשובה כאן — RTL, צבעים מהמערכת,
 * ונגישות לקורא מסך דרך `role="img"` ותיאור מילולי.
 *
 * ⚠️ כל גרף מקבל נתונים מחושבים מראש. אין כאן שום חישוב פיננסי.
 */

import { useMoneyFormatter } from '../AppData';
import { formatMonthHe } from '../../core/dates';
import type { Agorot, ISOMonth } from '../../core/types';

export interface MonthlyBar {
  month: ISOMonth;
  incomeAgorot: Agorot;
  expenseAgorot: Agorot;
  netAgorot: Agorot;
}

/**
 * הכנסות מול הוצאות לפי חודש.
 * עמודות זו לצד זו — קל לראות באיזה חודש יצא יותר ממה שנכנס.
 */
export function IncomeExpenseChart({ data }: { data: readonly MonthlyBar[] }) {
  const format = useMoneyFormatter();
  if (data.length === 0) return null;

  const max = Math.max(...data.flatMap((d) => [d.incomeAgorot, d.expenseAgorot]), 1);
  const barGroupWidth = 100 / data.length;

  return (
    <div>
      <svg
        viewBox="0 0 100 60"
        preserveAspectRatio="none"
        className="h-40 w-full"
        role="img"
        aria-label={`הכנסות מול הוצאות ב-${data.length} חודשים`}
      >
        {data.map((entry, index) => {
          const groupX = index * barGroupWidth;
          const incomeHeight = (entry.incomeAgorot / max) * 55;
          const expenseHeight = (entry.expenseAgorot / max) * 55;
          const barWidth = barGroupWidth * 0.32;
          return (
            <g key={entry.month}>
              <rect
                x={groupX + barGroupWidth * 0.14}
                y={58 - incomeHeight}
                width={barWidth}
                height={incomeHeight}
                className="fill-brand-500"
              />
              <rect
                x={groupX + barGroupWidth * 0.52}
                y={58 - expenseHeight}
                width={barWidth}
                height={expenseHeight}
                className="fill-slate-400"
              />
            </g>
          );
        })}
        <line x1={0} x2={100} y1={58} y2={58} className="stroke-slate-300" strokeWidth={0.3} />
      </svg>

      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        {data.map((entry) => (
          <span key={entry.month} className="flex-1 text-center">
            {entry.month.slice(5)}
          </span>
        ))}
      </div>

      <div className="mt-2 flex gap-4 text-xs text-slate-500">
        <span>
          <span className="inline-block size-2 bg-brand-500 align-middle" /> נכנס
        </span>
        <span>
          <span className="inline-block size-2 bg-slate-400 align-middle" /> יצא
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

  return (
    <div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-40 w-full"
        role="img"
        aria-label={`יתרה לאורך זמן, מ-${format(values[0]!)} ל-${format(values.at(-1)!)}`}
      >
        <line
          x1={0}
          x2={100}
          y1={y(targetAgorot)}
          y2={y(targetAgorot)}
          className="stroke-brand-500"
          strokeWidth={0.5}
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={0}
          x2={100}
          y1={y(safetyBufferAgorot)}
          y2={y(safetyBufferAgorot)}
          className="stroke-alertred-600"
          strokeWidth={0.5}
          strokeDasharray="1 3"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path}
          fill="none"
          className="stroke-brand-700"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{points[0]?.date.slice(0, 7)}</span>
        <span>{points.at(-1)?.date.slice(0, 7)}</span>
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
 */
export function CategoryBars({ slices }: { slices: readonly CategorySlice[] }) {
  const format = useMoneyFormatter();
  if (slices.length === 0) return null;

  const total = slices.reduce((sum, s) => sum + Math.abs(s.amountAgorot), 0);
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      {slices.map((slice) => {
        const share = (Math.abs(slice.amountAgorot) / total) * 100;
        const opaque =
          slice.categoryId === 'cat-card-retired' || slice.categoryId === 'cat-card-undetailed';
        return (
          <div key={slice.categoryId}>
            <div className="flex items-baseline justify-between text-sm">
              <span className={opaque ? 'text-slate-500' : 'text-slate-800'}>
                {slice.categoryName}
              </span>
              <span className="num sensitive text-slate-600">{format(slice.amountAgorot)}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${opaque ? 'bg-slate-300' : 'bg-brand-500'}`}
                style={{ width: `${share}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
