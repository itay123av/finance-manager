/**
 * תנועה — ספירה של מספרים, ציור של טבעות ופסים.
 *
 * ⚠️ **שלושה כללים שכל מה שכאן נשען עליהם:**
 *
 * 1. **מי שביקש פחות תנועה — לא מקבל תנועה.** ההגדרה במערכת ההפעלה
 *    מכובדת בכל רכיב, לא רק ב-CSS. מספר שסופר מאפס הוא בדיוק סוג
 *    התנועה שמטרידה אנשים עם רגישות וסטיבולרית.
 * 2. **הערך הסופי זמין לקורא מסך מהרגע הראשון.** בזמן הספירה המספר
 *    הנראה מוסתר מטכנולוגיה מסייעת, ולצידו יושב הערך האמיתי. אחרת מי
 *    שמגיע למספר באמצע הספירה היה שומע סכום שגוי.
 * 3. **בלי `matchMedia` אין תנועה.** כך זה בבדיקות (jsdom), ולכן כל
 *    בדיקה שקוראת סכום מקבלת את הסכום הסופי מיד, ולא 0.
 */

import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from './useMediaQuery';
import { Money } from './components/ui';
import type { FormatMoneyOptions } from '../core/money';

/** "מותר לזוז" — ההפך מ-`reduce`. בלי תמיכה בשאילתה התשובה היא לא. */
export const MOTION_OK_QUERY = '(prefers-reduced-motion: no-preference)';

export function useMotionOk(): boolean {
  return useMediaQuery(MOTION_OK_QUERY);
}

/** האטה בסוף — מספר שמאט לפני שהוא נעצר נקרא כמו "הגענו". */
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * ערך שנע בהדרגה אל היעד.
 *
 * בעלייה הראשונה — מאפס. אחר כך — מהערך הקודם לחדש, כך שהוספת עסקה
 * גורמת ליתרה "לזוז" אל המספר החדש במקום לקפוץ אליו.
 */
export function useCountUp(target: number, duration = 1100): number {
  const motionOk = useMotionOk();
  const [value, setValue] = useState(() => (motionOk ? 0 : target));
  const current = useRef(value);
  current.current = value;

  useEffect(() => {
    // ⚠️ טאב מוסתר לא מריץ פריימים. בלי הקפיצה הזו המספר היה נשאר
    // על 0 עד שהמשתמש חוזר.
    if (!motionOk || (typeof document !== 'undefined' && document.hidden)) {
      setValue(target);
      return;
    }
    const from = current.current;
    if (from === target) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(from + (target - from) * easeOutCubic(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, motionOk, duration]);

  return value;
}

/**
 * סכום שסופר עד הערך.
 *
 * כשהספירה מסתיימת — ובבדיקות, ולמי שביקש פחות תנועה, מההתחלה — זה
 * `Money` רגיל לגמרי, בלי שום עטיפה.
 */
export function AnimatedMoney({
  agorot,
  className = '',
  ...options
}: { agorot: number; className?: string } & FormatMoneyOptions) {
  const shown = Math.round(useCountUp(agorot));
  if (shown === agorot) return <Money agorot={agorot} className={className} {...options} />;
  return (
    <>
      <span aria-hidden="true">
        <Money agorot={shown} className={className} {...options} />
      </span>
      <span className="sr-only">
        <Money agorot={agorot} {...options} />
      </span>
    </>
  );
}

/**
 * `true` מהפריים השני ואילך.
 *
 * ⚠️ מעבר CSS צריך מצב התחלה ומצב סיום. בלי פריים ביניהם הדפדפן רואה
 * רק את הסיום, ושום דבר לא זז. למי שביקש פחות תנועה — `true` מיד.
 */
export function useDrawn(): boolean {
  const motionOk = useMotionOk();
  const [drawn, setDrawn] = useState(!motionOk);

  useEffect(() => {
    if (!motionOk) {
      setDrawn(true);
      return;
    }
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
    return () => cancelAnimationFrame(frame);
  }, [motionOk]);

  return drawn;
}

/**
 * השהיה מדורגת לכניסת כרטיסים.
 *
 * ⚠️ תקרה של שש מדרגות. אחרי ~400ms העין כבר לא קוראת את זה כ"כניסה
 * מדורגת" אלא כ"המסך איטי".
 */
export function stagger(index: number): { animationDelay: string } {
  return { animationDelay: `${Math.min(index, 6) * 65}ms` };
}
