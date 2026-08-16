/**
 * מסך הפתיחה.
 *
 * חמש שאלות, ואף אחת מהן אינה פרט מזהה. אין שם, אין אימייל, אין טלפון.
 * המטרה היא שתוך פחות מדקה תהיה תמונה ראשונה על המסך.
 */

import { useState } from 'react';
import { fromShekels } from '../../core/money';
import { todayInIsrael } from '../../core/dates';
import { SAFETY_BUFFER_PRESETS_AGOROT, DEFAULT_SAFETY_BUFFER_AGOROT } from '../../core/types';
import { db } from '../../data/db';
import { completeOnboarding } from '../../data/repositories';
import { AmountInput, Button, Card, ChoiceGroup, Field, Money, TextInput } from '../components/ui';

const DEFAULT_TARGET_AGOROT = 500_000; // ₪5,000
const DEFAULT_MILESTONES = [100_000, 250_000, 500_000];

function parseShekels(value: string): number | null {
  const cleaned = value.replace(/[^\d.-]/g, '');
  if (cleaned === '') return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return fromShekels(parsed);
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
    <main className="mx-auto max-w-md space-y-5 p-5 pb-24">
      <header className="pt-4">
        <h1 className="text-2xl font-bold text-slate-900">נתחיל</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          חמש שאלות קצרות, ואז תראה את התמונה המלאה.
          <br />
          הנתונים נשמרים רק במכשיר הזה.
        </p>
      </header>

      <Card>
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
      </Card>

      <Card>
        <Field label="וכמה מזומן?" hint="אם אין — אפשר להשאיר ריק">
          {(id) => <AmountInput id={id} value={cash} onChange={(e) => setCash(e.target.value)} />}
        </Field>
      </Card>

      <Card>
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
      </Card>

      <Card>
        <Field label="מה היעד?" hint="ברירת המחדל היא ₪5,000. אפשר לשנות.">
          {(id) => (
            <AmountInput id={id} value={target} onChange={(e) => setTarget(e.target.value)} />
          )}
        </Field>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          יעדי ביניים: <span className="num">₪1,000</span> ← <span className="num">₪2,500</span> ←{' '}
          <span className="num">
            {targetAgorot ? `₪${(targetAgorot / 100).toLocaleString('en-US')}` : '₪5,000'}
          </span>
        </p>
      </Card>

      <Card>
        <Field
          label="בערך כמה אתה מוציא בחודש?"
          hint="ניחוש גס מספיק. אחרי חודש-חודשיים המערכת תחשב את זה לבד מהנתונים."
        >
          {(id) => (
            <AmountInput id={id} value={estimate} onChange={(e) => setEstimate(e.target.value)} />
          )}
        </Field>
      </Card>

      {bankAgorot !== null && cashAgorot !== null ? (
        <Card tone="brand">
          <p className="text-sm text-accent-strong">
            נקודת הפתיחה שלך: <Money agorot={bankAgorot + cashAgorot} className="font-bold" />
          </p>
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
