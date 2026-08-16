/**
 * הכנסות צפויות.
 *
 * ⚠️ הכלל שמגדיר את המסך: **הכנסה צפויה אינה כסף שיש לך.** היא לא
 * נכנסת ל"בטוח להוציא", גם כשהיא ודאית ומחר. רק "הכסף נכנס" יוצר
 * עסקה אמיתית שמזיזה את היתרה.
 *
 * ⚠️ הסכום שנשמר הוא **נטו**. אם יש הוצאות שקשורות לעבודה — נסיעות,
 * ציוד — הן יורדות כאן, לפני שהמספר משפיע על תחזית כלשהי.
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
  Money,
  Row,
  Select,
  Sheet,
  TextInput,
} from '../components/ui';

const CERTAINTY_LABEL: Record<ExpectedIncome['certainty'], string> = {
  confirmed: 'בטוח — סוכם ומאושר',
  likely: 'סביר — כנראה יקרה',
  possible: 'אפשרי — עוד לא ברור',
};

/** הקטגוריה שאליה נרשמת ההכנסה כשהיא מתקבלת. */
const INCOME_CATEGORY_ID = 'cat-work';

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

  const IncomeRow = ({ income }: { income: ExpectedIncome }) => (
    <div className="border-b border-slate-100 py-3 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-slate-800">{income.label}</span>
        <Money agorot={income.expectedAmountAgorot} className="font-semibold" />
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {formatDateHe(income.expectedDate)}
        <span aria-hidden className="mx-1.5 text-slate-400">·</span>
        {CERTAINTY_LABEL[income.certainty]}
      </p>
      {!income.received ? (
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" onClick={() => receive(income)}>
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

  return (
    <Page title="הכנסות צפויות" width="reading">

      <Card tone="brand">
        <p className="text-sm leading-relaxed text-accent-strong">
          כסף שעוד לא הגיע <strong>לא נספר</strong> ב״בטוח להוציא״. הוא משפיע רק על התחזית — עד
          שתסמן שהוא נכנס.
        </p>
      </Card>

      <Button full onClick={() => setOpen(true)}>
        + הכנסה צפויה
      </Button>

      {overdue.length > 0 ? (
        <Card tone="caution">
          <CardTitle>התאריך עבר — האם הכסף נכנס?</CardTitle>
          <p className="mb-2 text-xs leading-relaxed text-slate-600">
            כל עוד זה לא מסומן, התחזית ממשיכה לספור את הכסף הזה כאילו הוא עוד לפנינו.
          </p>
          {overdue.map((income) => (
            <IncomeRow key={income.id} income={income} />
          ))}
        </Card>
      ) : null}

      <Card>
        <CardTitle>בדרך</CardTitle>
        {upcoming.length === 0 ? (
          <p className="py-2 text-sm text-slate-500">אין כרגע הכנסות צפויות.</p>
        ) : (
          upcoming.map((income) => <IncomeRow key={income.id} income={income} />)
        )}
      </Card>

      {received.length > 0 ? (
        <Card>
          <CardTitle>שכבר התקבלו</CardTitle>
          {received.slice(0, 8).map((income) => (
            <Row key={income.id} label={`${income.label} · ${formatDateHe(income.expectedDate)}`}>
              <Money agorot={income.expectedAmountAgorot} />
            </Row>
          ))}
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

          <Field label="מתי צפוי להיכנס">
            {(id) => (
              <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            )}
          </Field>

          <Field label="כמה זה בטוח">
            {(id) => (
              <Select
                id={id}
                value={certainty}
                onChange={(e) => setCertainty(e.target.value as ExpectedIncome['certainty'])}
              >
                {(Object.keys(CERTAINTY_LABEL) as ExpectedIncome['certainty'][]).map((key) => (
                  <option key={key} value={key}>
                    {CERTAINTY_LABEL[key]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {previewNet > 0 ? (
            <Row label="ייכנס בפועל (נטו)" strong>
              <Money agorot={previewNet} />
            </Row>
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
