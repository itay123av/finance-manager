/**
 * מסך הפתיחה.
 *
 * חמש שאלות, ואף אחת מהן אינה פרט מזהה. אין שם, אין אימייל, אין טלפון.
 * המטרה היא שתוך פחות מדקה תהיה תמונה ראשונה על המסך.
 *
 * ⚠️ **v3 — אותה שפה כמו לוח הבקרה.** הכרטיס הראשון עולה על הבאנר, כל
 * שאלה ממוספרת, ונקודת הפתיחה מוצגת כמספר הגדול — הרושם הראשון של
 * האפליקציה צריך להיראות כמו האפליקציה.
 */

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fromShekels } from '../../core/money';
import { todayInIsrael } from '../../core/dates';
import { SAFETY_BUFFER_PRESETS_AGOROT, DEFAULT_SAFETY_BUFFER_AGOROT } from '../../core/types';
import { db } from '../../data/db';
import { completeOnboarding } from '../../data/repositories';
import {
  AmountInput,
  BrandMark,
  Button,
  buttonClass,
  Card,
  ChoiceGroup,
  Field,
  Money,
  TextInput,
} from '../components/ui';
import { BigNumber } from '../components/premium';
import { Icon } from '../components/icons';

const DEFAULT_TARGET_AGOROT = 500_000; // ₪5,000
const DEFAULT_MILESTONES = [100_000, 250_000, 500_000];

function parseShekels(value: string): number | null {
  const cleaned = value.replace(/[^\d.-]/g, '');
  if (cleaned === '') return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return fromShekels(parsed);
}

/** שאלה ממוספרת. ⚠️ המספר קישוט — התווית של השדה היא מה שנשמע. */
function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <Card>
      <div className="flex gap-3.5">
        <span
          aria-hidden
          className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-accent-strong"
        >
          {n}
        </span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </Card>
  );
}

export function Onboarding() {
  const [bank, setBank] = useState('');
  const [cash, setCash] = useState('');
  const [buffer, setBuffer] = useState<number>(DEFAULT_SAFETY_BUFFER_AGOROT);
  const [customBuffer, setCustomBuffer] = useState('');
  const [target, setTarget] = useState(String(DEFAULT_TARGET_AGOROT / 100));
  const [estimate, setEstimate] = useState('400');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const bankAgorot = parseShekels(bank);
  const cashAgorot = parseShekels(cash);
  const targetAgorot = parseShekels(target);
  const estimateAgorot = parseShekels(estimate);
  const customAgorot = customBuffer === '' ? null : parseShekels(customBuffer);
  const effectiveBuffer = customAgorot !== null && customAgorot > 0 ? customAgorot : buffer;

  async function submit() {
    if (bankAgorot === null || cashAgorot === null || targetAgorot === null || estimateAgorot === null) {
      setError('אחד הסכומים לא תקין. אפשר להזין רק מספרים חיוביים.');
      return;
    }
    if (targetAgorot <= 0) {
      setError('סכום היעד צריך להיות גדול מאפס.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await completeOnboarding(db, {
        bankBalanceAgorot: bankAgorot,
        cashBalanceAgorot: cashAgorot,
        safetyBufferAgorot: effectiveBuffer,
        targetAgorot,
        milestones: DEFAULT_MILESTONES.filter((m) => m < targetAgorot).concat(targetAgorot),
        estimatedMonthlySpendAgorot: estimateAgorot,
        openingDate: todayInIsrael(new Date()),
      });
    } catch {
      setError('משהו השתבש בשמירה. אפשר לנסות שוב.');
      setSaving(false);
    }
  }

  return (
    <main className="stagger mx-auto max-w-md space-y-4 p-5 pb-24 sm:max-w-lg">
      {/* הרושם הראשון של האפליקציה — אותו באנר כמו בשאר המסכים. */}
      <header className="hero-surface hero-sheen relative isolate -mx-5 -mt-5 overflow-hidden rounded-b-[2rem] px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-20 text-white sm:mx-0 sm:mt-0 sm:rounded-[1.75rem]">
        <span aria-hidden className="aurora-blob aurora-a" />
        <span aria-hidden className="aurora-blob aurora-b" />
        <div className="relative">
          <BrandMark className="size-12" />
          <h1 className="mt-5 text-[2rem] leading-tight font-bold tracking-tight">נתחיל</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/90">
            חמש שאלות קצרות, ואז תראה את התמונה המלאה.
            <br />
            הנתונים נשמרים רק במכשיר הזה.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white">
              <Icon name="clock" className="size-3.5" />
              פחות מדקה
            </span>
            <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white">
              <Icon name="lock" className="size-3.5" />
              בלי שם, אימייל או טלפון
            </span>
          </div>
        </div>
      </header>

      {/*
        ⚠️ מכשיר חדש שכבר יש לו נתונים במקום אחר לא אמור למלא את
        הטופס הזה. מילוי ואז שחזור מייצר נתונים שנדרסים מיד, ובדרך
        גם מבלבל — לכן המוצא נמצא כאן, למעלה, ולא מוסתר בסוף.

        ⚠️ `relative z-10` — הכרטיס עולה על הבאנר, שיש לו `isolate`.
      */}
      <Card className="relative z-10 -mt-16 elev-2">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-[0.625rem] bg-brand-50 text-accent"
          >
            <Icon name="refresh" className="size-5" />
          </span>
          <p className="text-sm leading-relaxed text-slate-700">
            כבר יש לך נתונים במכשיר אחר או בקובץ גיבוי?
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/sync" className={buttonClass('secondary')}>
            שחזור מהענן
          </Link>
          <Link to="/backup" className={buttonClass('ghost')}>
            שחזור מקובץ
          </Link>
        </div>
      </Card>

      <Step n={1}>
        <Field label="כמה כסף יש כרגע בחשבון הבנק?" hint="אפשר להזין בערך — אפשר לתקן אחר כך">
          {(id) => (
            <AmountInput
              id={id}
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              aria-describedby={`${id}-unit`}
            />
          )}
        </Field>
      </Step>

      <Step n={2}>
        <Field label="וכמה מזומן?" hint="אם אין — אפשר להשאיר ריק">
          {(id) => <AmountInput id={id} value={cash} onChange={(e) => setCash(e.target.value)} />}
        </Field>
      </Step>

      <Step n={3}>
        <Field
          label="כמה כסף לא לגעת בו?"
          hint="סכום ביטחון למקרה של הפתעה. הוא לא ייספר בתור כסף פנוי, ואפשר לשנות אותו מתי שתרצה."
        >
          {() => (
            <div className="space-y-3">
              <ChoiceGroup
                ariaLabel="סכום ביטחון"
                value={customAgorot ? null : buffer}
                onChange={(value) => {
                  setBuffer(value);
                  setCustomBuffer('');
                }}
                options={SAFETY_BUFFER_PRESETS_AGOROT.map((value) => ({
                  value,
                  label: `₪${value / 100}`,
                  ...(value === DEFAULT_SAFETY_BUFFER_AGOROT ? { note: 'מומלץ' } : {}),
                }))}
              />
              <TextInput
                inputMode="decimal"
                dir="ltr"
                placeholder="או סכום אחר"
                value={customBuffer}
                onChange={(e) => setCustomBuffer(e.target.value)}
                aria-label="סכום ביטחון מותאם אישית"
              />
            </div>
          )}
        </Field>
      </Step>

      <Step n={4}>
        <Field label="מה היעד?" hint="ברירת המחדל היא ₪5,000. אפשר לשנות.">
          {(id) => (
            <AmountInput id={id} value={target} onChange={(e) => setTarget(e.target.value)} />
          )}
        </Field>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
          יעדי ביניים:
          <span className="num rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">₪1,000</span>
          <span aria-hidden>←</span>
          <span className="num rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">₪2,500</span>
          <span aria-hidden>←</span>
          <span className="num rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-accent-strong">
            {targetAgorot ? `₪${(targetAgorot / 100).toLocaleString('en-US')}` : '₪5,000'}
          </span>
        </div>
      </Step>

      <Step n={5}>
        <Field
          label="בערך כמה אתה מוציא בחודש?"
          hint="ניחוש גס מספיק. אחרי חודש-חודשיים המערכת תחשב את זה לבד מהנתונים."
        >
          {(id) => (
            <AmountInput id={id} value={estimate} onChange={(e) => setEstimate(e.target.value)} />
          )}
        </Field>
      </Step>

      {bankAgorot !== null && cashAgorot !== null ? (
        <Card className="relative overflow-hidden elev-2">
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-1"
            style={{
              background:
                'linear-gradient(to left, var(--color-brand-500), var(--color-brand-700) 60%, transparent)',
            }}
          />
          <p className="text-xs text-slate-600">נקודת הפתיחה שלך</p>
          <div className="mt-2">
            <BigNumber tone="accent">
              <Money agorot={bankAgorot + cashAgorot} />
            </BigNumber>
          </div>
        </Card>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <Button full onClick={submit} disabled={saving}>
        {saving ? 'רגע…' : 'יאללה, בוא נתחיל'}
      </Button>

      <p className="pb-4 text-center text-xs leading-relaxed text-slate-500">
        אחרי שהמערכת נפתחת בטלפון, כדאי להוסיף אותה למסך הבית.
        <br />
        זה גם נוח יותר, וגם מה שמונע מהדפדפן למחוק את הנתונים.
      </p>
    </main>
  );
}
