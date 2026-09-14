/**
 * גרפיקה קטנה בלוח הבקרה — טבעת יעד, קו מגמה ומד תקציב.
 *
 * ⚠️ **כל אחד מהם מציג נתון אמיתי, ואף אחד מהם אינו הדרך היחידה לקבל
 * אותו.** הטבעת יושבת ליד האחוז במספרים, הקו ליד היתרה, והמד ליד
 * "נשאר בתקציב". גרפיקה שהיא המקור היחיד למידע היא מחסום למי שלא רואה
 * אותה; כאן היא רק דרך מהירה יותר לקלוט את מה שכבר כתוב.
 *
 * ⚠️ כולם נמתחים לערך בפעם הראשונה (`useDrawn`), ולמי שביקש פחות
 * תנועה — מופיעים ישר במצב הסופי.
 */

import { useId, type ReactNode } from 'react';
import { useDrawn } from '../motion';

const clamp = (pct: number) => Math.max(0, Math.min(100, pct));

/** מזהה שבטוח לשימוש בתוך `url(#…)`. מזהי React כוללים תווים שלא תמיד עוברים שם. */
function useSvgId(prefix: string): string {
  return prefix + useId().replace(/[^a-zA-Z0-9]/g, '');
}

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

// ---------------------------------------------------------------------------
// טבעת יעד
// ---------------------------------------------------------------------------

/**
 * ⚠️ `role="progressbar"` על הטבעת, עם הערך המעוגל. יש בדיקה שמוודאת
 * שמד ההתקדמות ליעד נגיש — והוא חייב להיות הראשון במסך, לפני כל מד
 * אחר (למשל מד התקציב שבהמשך).
 */
export function GoalRing({
  pct,
  label,
  size = 128,
  tone = 'brand',
  children,
}: {
  pct: number;
  label: string;
  size?: number;
  /** `caution` — לחריגה, למשל תקציב שנוצל יותר מהקצב. */
  tone?: 'brand' | 'caution';
  children?: ReactNode;
}) {
  const stops =
    tone === 'caution'
      ? ['var(--color-caution-600)', 'var(--color-caution-700)']
      : ['var(--color-brand-500)', 'var(--color-brand-700)'];
  const clamped = clamp(pct);
  const drawn = useDrawn();
  const gradientId = useSvgId('ring');
  const stroke = 11;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (drawn ? clamped : 0) / 100);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={stops[0]} />
            <stop offset="100%" stopColor={stops[1]} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke={`url(#${gradientId})`}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: `stroke-dashoffset 1.4s ${EASE}` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// קו מגמה
// ---------------------------------------------------------------------------

/**
 * קו מגמה קטן, לשימוש על משטח הגיבור הכהה.
 *
 * ⚠️ ציר הזמן משמאל לימין גם בממשק בעברית — כך נקראים גרפים בכל
 * אפליקציה פיננסית בעברית, וכך גם הגרף המלא במסך התובנות. היפוך היה
 * גורם לאותו נתון להיראות הפוך בשני מסכים.
 *
 * ⚠️ הנקודה האחרונה מסומנת בנקודה חיה. היא יושבת בדיוק על היתרה הנוכחית
 * — הערכים מחושבים ב-`totalBalance`, אותה פונקציה שמחשבת את המספר הגדול.
 */
export function Sparkline({ values, className = '' }: { values: readonly number[]; className?: string }) {
  const drawn = useDrawn();
  const areaId = useSvgId('area');
  if (values.length < 2) return null;

  const W = 300;
  const H = 64;
  const PAD = 5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = PAD + (i * (W - 2 * PAD)) / (values.length - 1);
    const y = H - PAD - ((v - min) / span) * (H - 2 * PAD);
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const area = `${line} L${last[0].toFixed(1)},${H} L${first[0].toFixed(1)},${H} Z`;

  return (
    <div className={`relative ${className}`} dir="ltr" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="size-full overflow-visible">
        <defs>
          <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.26" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={area}
          fill={`url(#${areaId})`}
          style={{ opacity: drawn ? 1 : 0, transition: 'opacity 1.2s ease 0.5s' }}
        />
        <path
          d={line}
          fill="none"
          stroke="oklch(0.88 0.11 163)"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={drawn ? 0 : 1}
          style={{ transition: `stroke-dashoffset 1.6s ${EASE}` }}
        />
      </svg>
      {/* ⚠️ הנקודה ב-HTML ולא ב-SVG: `preserveAspectRatio="none"` מותח
          את הגרף לרוחב, ועיגול בתוכו היה נמתח לאליפסה. */}
      <span
        className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 transition-opacity delay-1000 duration-500"
        style={{ left: `${(last[0] / W) * 100}%`, top: `${(last[1] / H) * 100}%`, opacity: drawn ? 1 : 0 }}
      >
        <span className="absolute inset-0 animate-ping rounded-full bg-white/60" />
        <span className="absolute inset-0 rounded-full bg-white" />
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// מד תקציב
// ---------------------------------------------------------------------------

/**
 * כמה מהתקציב יצא, מול כמה מהחודש עבר.
 *
 * ⚠️ הקו הדק הוא "איפה היית אמור להיות". פס שעובר אותו אומר "מהר מדי"
 * בלי מילה — וזה בדיוק המידע ש-`isAheadOfPace` מחשב.
 */
export function BudgetMeter({
  spentPct,
  elapsedPct,
  tone,
}: {
  spentPct: number;
  elapsedPct: number;
  tone: 'brand' | 'caution';
}) {
  const drawn = useDrawn();
  const width = clamp(spentPct);
  return (
    <div className="relative pt-1">
      <div
        role="progressbar"
        aria-label="ניצול התקציב החודשי"
        aria-valuenow={Math.round(width)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2.5 overflow-hidden rounded-full bg-slate-200/80"
      >
        <div
          className={`h-full rounded-full ${tone === 'caution' ? 'bg-caution-600' : 'bg-brand-500'}`}
          style={{ width: `${drawn ? width : 0}%`, transition: `width 1.2s ${EASE}` }}
        />
      </div>
      <span
        aria-hidden="true"
        className="absolute top-0 h-[1.125rem] w-0.5 -translate-x-1/2 rounded-full bg-slate-600"
        style={{ insetInlineStart: `${clamp(elapsedPct)}%` }}
      />
    </div>
  );
}
