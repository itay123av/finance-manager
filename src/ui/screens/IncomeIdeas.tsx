/**
 * רעיונות להכנסה.
 *
 * הרשימה עצמה יושבת ב-`content/incomeIdeas.ts` — קבועה בקוד, בלי AI
 * בזמן ריצה. הסיבות שם.
 *
 * ⚠️ החיבור להכנסה צפויה נעשה בזהירות: רעיון שנבחר הופך ל-`possible`,
 * לא ל-`confirmed`. זו תוכנית, לא כסף — והיא לא נכנסת ל"בטוח להוציא"
 * עד שהיא מסומנת כהתקבלה בפועל.
 */

import { Page } from '../components/layout';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { addExpectedIncome } from '../../data/expectedIncome';
import { useAppData } from '../AppData';
import { useToast } from '../Toast';
import { addDays } from '../../core/dates';
import { fromShekels, formatILS } from '../../core/money';
import { Icon } from '../components/icons';
import {
  INCOME_IDEAS,
  LEGAL_NOTE_HE,
  PARENT_APPROVAL_LABEL_HE,
  type IncomeIdea,
} from '../../content/incomeIdeas';
import {
  AmountInput,
  Button,
  Card,
  CardTitle,
  Field,
  LoadingState,
  Sheet,
  TextInput,
} from '../components/ui';

/** ברירת מחדל לתאריך של תוכנית הכנסה חדשה — בעוד שבועיים. */
const PLAN_HORIZON_DAYS = 14;

function ApprovalChip({ idea }: { idea: IncomeIdea }) {
  const strong = idea.parentApproval === 'required';
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        strong ? 'bg-caution-100 text-caution-600' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {PARENT_APPROVAL_LABEL_HE[idea.parentApproval]}
    </span>
  );
}

export function IncomeIdeas() {
  const { snapshot, loading } = useAppData();
  const toast = useToast();
  const navigate = useNavigate();

  const [openId, setOpenId] = useState<string | null>(null);
  const [planFor, setPlanFor] = useState<IncomeIdea | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading || !snapshot) return <LoadingState />;

  function startPlan(idea: IncomeIdea) {
    setPlanFor(idea);
    setAmount(idea.estimate ? String(Math.round(idea.estimate.lowAgorot / 100)) : '');
    setDate(addDays(snapshot!.today, PLAN_HORIZON_DAYS));
  }

  async function savePlan() {
    if (!planFor || busy) return;
    const parsed = Number(amount.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(parsed) || parsed <= 0 || !date) return;

    setBusy(true);
    try {
      await addExpectedIncome(db, {
        label: planFor.titleHe,
        expectedAmountAgorot: fromShekels(parsed),
        expectedDate: date,
        // ⚠️ `possible` ולא יותר. רעיון אינו התחייבות של אף אחד.
        certainty: 'possible',
      });
      setPlanFor(null);
      toast({ messageHe: 'נוסף לתוכניות ההכנסה. זה עדיין לא כסף שיש לך.' });
      navigate('/expected-income');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="רעיונות להכנסה" width="reading">

      <Card tone="brand">
        <p className="text-sm leading-relaxed text-accent-strong">
          רוב ההכנסה שלך מגיעה בקיץ. הרעיונות כאן נבחרו כי הם מתאימים לגיל, חוקיים, ורובם עובדים
          גם בשאר השנה.
        </p>
      </Card>

      <Card tone="caution">
        <CardTitle icon="scale">לפני שמתחילים</CardTitle>
        <p className="text-sm leading-relaxed text-slate-700">{LEGAL_NOTE_HE}</p>
        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-800">
          וכלל אחד שלא משתנה: עבודה אמיתית לא דורשת ממך לשלם כדי להתחיל.
        </p>
      </Card>

      <ul className="space-y-3">
        {INCOME_IDEAS.map((idea) => {
          const expanded = openId === idea.id;
          return (
            <li key={idea.id}>
              <Card>
                <button
                  type="button"
                  onClick={() => setOpenId(expanded ? null : idea.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-start gap-3 text-start"
                >
                  <Icon name={idea.icon} className="size-6 text-slate-500" />
                  <span className="flex-1">
                    <span className="block font-semibold text-slate-900">{idea.titleHe}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-slate-600">
                      {idea.whatHe}
                    </span>
                    {idea.estimate ? (
                      <span className="mt-1.5 block text-sm font-medium text-accent">
                        <span className="num">
                          {formatILS(idea.estimate.lowAgorot)}–{formatILS(idea.estimate.highAgorot)}
                        </span>{' '}
                        {idea.estimate.unitHe}
                      </span>
                    ) : (
                      <span className="mt-1.5 block text-sm text-slate-500">
                        סכום חד-פעמי — אין טווח שאפשר להצדיק
                      </span>
                    )}
                  </span>
                  <Icon name={expanded ? 'chevron-up' : 'chevron-down'} className="size-4 text-slate-500" />
                </button>

                {expanded ? (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                    <div className="flex flex-wrap gap-2">
                      <ApprovalChip idea={idea} />
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                        <Icon name="clock" className="size-3.5" />{idea.timeHe}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-500">מה צריך לדעת</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-700">
                        {idea.needToKnowHe}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-500">עלות התחלה</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-700">
                        {idea.startupCostHe}
                      </p>
                    </div>

                    {idea.estimate ? (
                      <div>
                        <p className="text-xs font-semibold text-slate-500">מאיפה הטווח הזה</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-slate-700">
                          {idea.estimate.basisHe}
                        </p>
                      </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold text-accent">יתרונות</p>
                        <ul className="mt-1 list-inside list-disc space-y-1 text-sm leading-relaxed text-slate-700">
                          {idea.prosHe.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500">חסרונות</p>
                        <ul className="mt-1 list-inside list-disc space-y-1 text-sm leading-relaxed text-slate-700">
                          {idea.consHe.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <Button variant="secondary" full onClick={() => startPlan(idea)}>
                      להוסיף כתוכנית הכנסה
                    </Button>
                  </div>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>

      <p className="px-2 pb-4 text-center text-xs leading-relaxed text-slate-500">
        הרשימה קבועה ולא נוצרת על ידי AI. אין כאן המלצות השקעה, מסחר או הלוואות — ולא יהיו.
      </p>

      {/* ── הוספה כתוכנית ────────────────────────────────────── */}
      <Sheet
        open={planFor !== null}
        onClose={() => setPlanFor(null)}
        title={planFor ? `תוכנית: ${planFor.titleHe}` : 'תוכנית הכנסה'}
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">
            זה נשמר כהכנסה <strong>אפשרית</strong>. היא תופיע בתחזית כתרחיש, ולא תיכנס ל״בטוח
            להוציא״ — עד שתסמן שהכסף נכנס בפועל.
          </p>

          <Field label="כמה אתה מעריך שייכנס">
            {(id) => (
              <AmountInput id={id} value={amount} onChange={(e) => setAmount(e.target.value)} />
            )}
          </Field>

          <Field label="מתי, בערך">
            {(id) => (
              <TextInput
                id={id}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>

          <Button full onClick={savePlan} disabled={busy}>
            {busy ? 'שומר…' : 'להוסיף לתוכניות'}
          </Button>
        </div>
      </Sheet>
    </Page>
  );
}
