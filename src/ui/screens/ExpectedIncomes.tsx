/**
 * הכנסות צפויות.
 *
 * ⚠️ הכלל שמגדיר את המסך: **הכנסה צפויה אינה כסף שיש לך.** היא לא
 * נכנסת ל"בטוח להוציא", גם כשהיא ודאית ומחר. רק "הכסף נכנס" יוצר
 * עסקה אמיתית שמזיזה את היתרה.
 *
 * ⚠️ הסכום שנשמר הוא **נטו**. אם יש הוצאות שקשורות לעבודה — נסיעות,
 * ציוד — הן יורדות כאן, לפני שהמספר משפיע על תחזית כלשהי.
 *
 * ⚠️ **v3 — אותה שפה כמו לוח הבקרה.** הכלל עצמו הוא הכרטיס שעולה על
 * הבאנר. כל הכנסה היא שורה עם מדליון וגלולת ודאות. בבאנר רק ספירות —
 * סכום של הכנסות צפויות הוא חישוב פיננסי, והוא לא שייך למסך.
 */

import { Page } from '../components/layout';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAppData } from '../AppData';
import { useToast } from '../Toast';
import { db } from '../../data/db';
import {
  addExpectedIncome,
  deleteExpectedIncome,
  markIncomeReceived,
  netExpectedIncome,
  undoIncomeReceived,
} from '../../data/expectedIncome';
import { BANK_ACCOUNT_ID } from '../../data/repositories';
import { formatDateHe } from '../../core/dates';
import { fromShekels } from '../../core/money';
import type { ExpectedIncome } from '../../core/types';
import {
  AmountInput,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  LoadingState,
  Medallion,
  Money,
  Sheet,
  TextInput,
} from '../components/ui';
import { FeatureCard, Pill, Segmented, type PillTone } from '../components/premium';

const CERTAINTY: Record<
  ExpectedIncome['certainty'],
  { short: string; label: string; tone: PillTone }
> = {
  confirmed: { short: 'בטוח', label: 'בטוח — סוכם ומאושר', tone: 'brand' },
  likely: { short: 'סביר', label: 'סביר — כנראה יקרה', tone: 'neutral' },
  possible: { short: 'אפשרי', label: 'אפשרי — עוד לא ברור', tone: 'caution' },
};

/** הקטגוריה שאליה נרשמת ההכנסה כשהיא מתקבלת. */
const INCOME_CATEGORY_ID = 'cat-work';

function CountBadge({ count }: { count: number }) {
  return (
    <span className="num rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
      {count}
    </span>
  );
}

export function ExpectedIncomes() {
  const { snapshot, loading } = useAppData();
  const toast = useToast();
  const incomes = useLiveQuery(() => db.expectedIncomes.toArray(), []);

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState('');
  const [costs, setCosts] = useState('');
  const [date, setDate] = useState('');
  const [certainty, setCertainty] = useState<ExpectedIncome['certainty']>('likely');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading || !snapshot || incomes === undefined) return <LoadingState />;

  const num = (value: string) => {
    const parsed = Number(value.replace(/[^\d.]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  const hoursNum = num(hours);
  const rateNum = num(rate);
  const amountNum = num(amount);
  const costsNum = num(costs);

  const previewNet =
    hoursNum !== undefined || amountNum !== undefined
      ? netExpectedIncome({
          expectedAmountAgorot: fromShekels(amountNum ?? 0),
          ...(hoursNum !== undefined ? { hours: hoursNum } : {}),
          ...(rateNum !== undefined ? { hourlyRateAgorot: fromShekels(rateNum) } : {}),
          ...(costsNum !== undefined ? { relatedCostsAgorot: fromShekels(costsNum) } : {}),
        })
      : 0;

  const pending = incomes
    .filter((i) => !i.received)
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
  const overdue = pending.filter((i) => i.expectedDate < snapshot.today);
  const upcoming = pending.filter((i) => i.expectedDate >= snapshot.today);
  const received = incomes
    .filter((i) => i.received)
    .sort((a, b) => b.expectedDate.localeCompare(a.expectedDate));

  function reset() {
    setLabel('');
    setAmount('');
    setHours('');
    setRate('');
    setCosts('');
    setDate('');
    setCertainty('likely');
    setError(null);
  }

  async function submit() {
    if (busy) return;
    if (!label.trim()) return setError('צריך שם — משהו שתזהה בעוד חודש.');
    if (!date) return setError('צריך תאריך משוער.');
    if (previewNet <= 0) return setError('צריך סכום, או שעות ותעריף לשעה.');

    setBusy(true);
    try {
      await addExpectedIncome(db, {
        label: label.trim(),
        expectedAmountAgorot: fromShekels(amountNum ?? 0),
        expectedDate: date,
        certainty,
        ...(hoursNum !== undefined ? { hours: hoursNum } : {}),
        ...(rateNum !== undefined ? { hourlyRateAgorot: fromShekels(rateNum) } : {}),
        ...(costsNum !== undefined ? { relatedCostsAgorot: fromShekels(costsNum) } : {}),
      });
      setOpen(false);
      reset();
    } catch {
      setError('לא הצלחנו לשמור. שום דבר לא השתנה.');
    } finally {
      setBusy(false);
    }
  }

  async function receive(income: ExpectedIncome) {
    await markIncomeReceived(db, income.id, {
      accountId: snapshot!.settings.lastAccountId ?? BANK_ACCOUNT_ID,
      categoryId: INCOME_CATEGORY_ID,
      actualDate: snapshot!.today,
    });
    toast({
      messageHe: 'נרשמה הכנסה חדשה ביתרה.',
      undo: () => undoIncomeReceived(db, income.id),
    });
  }

  function renderIncome(income: ExpectedIncome) {
    const level = CERTAINTY[income.certainty];
    return (
      <div key={income.id} className="py-3">
        <div className="flex items-center gap-3">
          <Medallion
            icon={income.received ? 'shield-check' : 'calendar'}
            tone={income.received ? 'brand' : 'neutral'}
            className="size-10"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{income.label}</p>
            <p className="mt-0.5 text-xs text-slate-600">{formatDateHe(income.expectedDate)}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Money agorot={income.expectedAmountAgorot} className="text-sm font-semibold text-slate-900" />
            {!income.received ? <Pill tone={level.tone}>{level.short}</Pill> : null}
          </div>
        </div>
        {!income.received ? (
          <div className="mt-2.5 flex gap-2 ps-[3.25rem]">
            <Button variant="secondary" onClick={() => void receive(income)}>
              הכסף נכנס
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await deleteExpectedIncome(db, income.id);
                toast({ messageHe: 'ההכנסה הצפויה נמחקה.' });
              }}
            >
              למחוק
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Page
      title="הכנסות צפויות"
      icon="wallet"
      subtitle="כסף שבדרך — ולמה הוא עוד לא נספר"
      width="reading"
      overlap
      stats={[
        { label: 'בדרך', value: <span className="num">{pending.length}</span> },
        { label: 'התקבלו', value: <span className="num">{received.length}</span> },
      ]}
    >
      {/* ── ⭐ הכלל ──────────────────────────────────────────── */}
      <FeatureCard>
        <div className="flex items-start gap-4">
          <Medallion icon="wallet" tone="brand" className="size-14" iconClassName="size-7" />
          <p className="text-sm leading-relaxed text-slate-700">
            כסף שעוד לא הגיע <strong>לא נספר</strong> ב״בטוח להוציא״. הוא משפיע רק על התחזית — עד
            שתסמן שהוא נכנס.
          </p>
        </div>
        <Button full className="mt-4" onClick={() => setOpen(true)}>
          + הכנסה צפויה
        </Button>
      </FeatureCard>

      {overdue.length > 0 ? (
        <Card tone="caution">
          <CardTitle icon="clock" iconTone="caution">
            התאריך עבר — האם הכסף נכנס?
          </CardTitle>
          <p className="mb-1 text-xs leading-relaxed text-slate-600">
            כל עוד זה לא מסומן, התחזית ממשיכה לספור את הכסף הזה כאילו הוא עוד לפנינו.
          </p>
          <div className="divide-y divide-caution-300/40">{overdue.map(renderIncome)}</div>
        </Card>
      ) : null}

      <Card>
        <CardTitle icon="calendar" iconTone="brand">
          בדרך <CountBadge count={upcoming.length} />
        </CardTitle>
        {upcoming.length === 0 ? (
          <p className="py-2 text-sm text-slate-600">אין כרגע הכנסות צפויות.</p>
        ) : (
          <div className="divide-y divide-slate-100">{upcoming.map(renderIncome)}</div>
        )}
      </Card>

      {received.length > 0 ? (
        <Card>
          <CardTitle icon="shield-check">
            שכבר התקבלו <CountBadge count={received.length} />
          </CardTitle>
          <div className="divide-y divide-slate-100">{received.slice(0, 8).map(renderIncome)}</div>
        </Card>
      ) : null}

      {incomes.length === 0 ? (
        <EmptyState
          title="עוד אין כאן הכנסות צפויות"
          body="עבודה שסוכמה, תשלום שמגיע, או שיעור פרטי שנקבע — הוסף אותם כדי שהתחזית תדע עליהם."
        />
      ) : null}

      {/* ── הוספה ────────────────────────────────────────────── */}
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="הכנסה צפויה"
      >
        <div className="space-y-4">
          <Field label="מה זה" {...(error && !label.trim() ? { error } : {})}>
            {(id) => (
              <TextInput
                id={id}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="למשל: שיעור פרטי"
              />
            )}
          </Field>

          <div className="space-y-4 rounded-2xl bg-slate-50 p-3.5">
            <Field label="סכום" hint="אפשר להשאיר ריק ולמלא במקום זה שעות ותעריף.">
              {(id) => (
                <AmountInput id={id} value={amount} onChange={(e) => setAmount(e.target.value)} />
              )}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="שעות">
                {(id) => (
                  <TextInput
                    id={id}
                    inputMode="decimal"
                    dir="ltr"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                )}
              </Field>
              <Field label="לשעה">
                {(id) => (
                  <TextInput
                    id={id}
                    inputMode="decimal"
                    dir="ltr"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                )}
              </Field>
            </div>

            <Field label="הוצאות קשורות" hint="נסיעות, ציוד. יורדות מהסכום — זה לא כסף שנשאר ביד.">
              {(id) => (
                <TextInput
                  id={id}
                  inputMode="decimal"
                  dir="ltr"
                  value={costs}
                  onChange={(e) => setCosts(e.target.value)}
                />
              )}
            </Field>
          </div>

          <Field label="מתי צפוי להיכנס">
            {(id) => (
              <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            )}
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">כמה זה בטוח</p>
            <Segmented
              ariaLabel="כמה זה בטוח"
              value={certainty}
              onChange={setCertainty}
              options={(Object.keys(CERTAINTY) as ExpectedIncome['certainty'][]).map((key) => ({
                value: key,
                label: CERTAINTY[key].short,
              }))}
            />
            <p className="mt-2 text-xs text-slate-600">{CERTAINTY[certainty].label}</p>
          </div>

          {previewNet > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-50/70 p-4">
              <span className="text-sm font-semibold text-slate-700">ייכנס בפועל (נטו)</span>
              <Money agorot={previewNet} className="text-lg font-semibold text-accent-strong" />
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}

          <Button full onClick={submit} disabled={busy}>
            {busy ? 'שומר…' : 'לשמור'}
          </Button>
        </div>
      </Sheet>
    </Page>
  );
}
