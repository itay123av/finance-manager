/**
 * "למה בטוח להוציא ירד?"
 *
 * ⚠️ מספר שמשתנה בלי הסבר הוא מספר שמפסיקים להאמין לו.
 *
 * "בטוח להוציא ירד מ-₪418 ל-₪280" בלי הסבר נראה שרירותי. עם פירוט —
 * "הוצאה חדשה ‎-₪90, הרזרבה גדלה ‎-₪30, התקציב השתנה ‎-₪18" — המשתמש
 * מבין שהמערכת עקבית, וגם לומד מה משפיע על מה.
 *
 * המודול משווה שני צילומי מצב של פירוק ה-`safeToSpend` ומייצר רשימת
 * גורמים ממוינת לפי גודל ההשפעה.
 */

import type { Agorot } from './types';

/** הרכיבים של `safeToSpendNow`, כפי שהם מוחזרים ב-`breakdown`. */
export interface SafeToSpendComponents {
  currentBalanceAgorot: Agorot;
  safetyBufferAgorot: Agorot;
  committedLeftAgorot: Agorot;
  reservedForFutureMonthsAgorot: Agorot;
  goalDueThisMonthAgorot: Agorot;
  resultAgorot: Agorot;
}

export type ChangeFactorKind =
  | 'balance'
  | 'buffer'
  | 'committed'
  | 'reserve'
  | 'goal';

export interface ChangeFactor {
  kind: ChangeFactorKind;
  labelHe: string;
  /** ההשפעה על `safeToSpend`. שלילי = הקטין. */
  effectAgorot: Agorot;
}

export interface ChangeExplanation {
  fromAgorot: Agorot;
  toAgorot: Agorot;
  deltaAgorot: Agorot;
  /** האם השינוי מספיק גדול כדי להציג הסבר. */
  significant: boolean;
  factors: ChangeFactor[];
  headlineHe: string;
  /** סכום ההשפעות חייב להיות שווה להפרש. */
  reconciles: boolean;
}

/** מתחת לזה, השינוי הוא רעש ולא שווה הסבר. */
export const SIGNIFICANT_CHANGE_AGOROT = 2_000; // ₪20

const LABELS: Record<ChangeFactorKind, { increase: string; decrease: string }> = {
  balance: { increase: 'נכנס כסף', decrease: 'הוצאה חדשה' },
  buffer: { increase: 'סכום הביטחון קטן', decrease: 'סכום הביטחון גדל' },
  committed: { increase: 'פחות הוצאות חובה', decrease: 'נוספו הוצאות חובה' },
  reserve: { increase: 'פחות כסף שמור לעתיד', decrease: 'הרזרבה לחודשים הבאים גדלה' },
  goal: { increase: 'תרומה קטנה יותר ליעד', decrease: 'התרומה ליעד גדלה' },
};

function factor(kind: ChangeFactorKind, effectAgorot: Agorot): ChangeFactor {
  return {
    kind,
    labelHe: effectAgorot >= 0 ? LABELS[kind].increase : LABELS[kind].decrease,
    effectAgorot,
  };
}

/**
 * מסביר את השינוי ב-`safeToSpendNow` בין שני מצבים.
 *
 * הכיוונים מכוונים: עלייה ביתרה מגדילה את הכסף הפנוי; עלייה בביטחון,
 * בהתחייבויות, ברזרבה או בתרומה ליעד — מקטינה אותו.
 */
export function explainSafeToSpendChange(
  before: SafeToSpendComponents,
  after: SafeToSpendComponents,
): ChangeExplanation {
  const delta = after.resultAgorot - before.resultAgorot;

  const raw: ChangeFactor[] = [
    factor('balance', after.currentBalanceAgorot - before.currentBalanceAgorot),
    factor('buffer', -(after.safetyBufferAgorot - before.safetyBufferAgorot)),
    factor('committed', -(after.committedLeftAgorot - before.committedLeftAgorot)),
    factor(
      'reserve',
      -(after.reservedForFutureMonthsAgorot - before.reservedForFutureMonthsAgorot),
    ),
    factor('goal', -(after.goalDueThisMonthAgorot - before.goalDueThisMonthAgorot)),
  ];

  const factors = raw
    .filter((f) => f.effectAgorot !== 0)
    .sort((a, b) => Math.abs(b.effectAgorot) - Math.abs(a.effectAgorot));

  const sum = factors.reduce((total, f) => total + f.effectAgorot, 0);

  return {
    fromAgorot: before.resultAgorot,
    toAgorot: after.resultAgorot,
    deltaAgorot: delta,
    significant: Math.abs(delta) >= SIGNIFICANT_CHANGE_AGOROT,
    factors,
    // הפירוק חייב להסתכם בדיוק בהפרש; אחרת חסר גורם
    reconciles: sum === delta,
    headlineHe:
      delta === 0
        ? 'שום דבר לא השתנה.'
        : delta > 0
          ? `בטוח להוציא עלה ב-${formatAgorot(Math.abs(delta))}`
          : `בטוח להוציא ירד ב-${formatAgorot(Math.abs(delta))}`,
  };
}

function formatAgorot(agorot: Agorot): string {
  return `₪${Math.round(agorot / 100).toLocaleString('en-US')}`;
}
