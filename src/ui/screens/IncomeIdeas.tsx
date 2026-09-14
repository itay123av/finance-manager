/**
 * רעיונות להכנסה.
 *
 * הרשימה עצמה יושבת ב-`content/incomeIdeas.ts` — קבועה בקוד, בלי AI
 * בזמן ריצה. הסיבות שם.
 *
 * ⚠️ החיבור להכנסה צפויה נעשה בזהירות: רעיון שנבחר הופך ל-`possible`,
 * לא ל-`confirmed`. זו תוכנית, לא כסף — והיא לא נכנסת ל"בטוח להוציא"
 * עד שהיא מסומנת כהתקבלה בפועל.
 *
 * ⚠️ **v3 — אותה שפה כמו לוח הבקרה.** כל רעיון הוא כרטיס עם מדליון
 * וגלולת טווח, ובפתיחה הפרטים יושבים באריחים. הרשימה נשארת ה-`ul`
 * הראשון במסך — יש בדיקה שמאתרת אותה כך.
 */

import { Page } from '../components/layout';
import type { ReactNode } from 'react';
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
  Medallion,
  Sheet,
  TextInput,
} from '../components/ui';
import { FeatureCard, Pill } from '../components/premium';

/** ברירת מחדל לתאריך של תוכנית הכנסה חדשה — בעוד שבועיים. */
const PLAN_HORIZON_DAYS = 14;

function ApprovalChip({ idea }: { idea: IncomeIdea }) {
  return (
    <Pill tone={idea.parentApproval === 'required' ? 'caution' : 'neutral'} icon="users">
      {PARENT_APPROVAL_LABEL_HE[idea.parentApproval]}
    </Pill>
  );
}

function DetailTile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3.5">
      <p className="text-xs font-semibold text-slate-600">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-slate-800">{children}</p>
    </div>
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
    <Page
      title="רעיונות להכנסה"
      icon="sprout"
      subtitle="דרכים מציאותיות להרוויח בגיל שלך"
      width="reading"
      overlap
    >
      <FeatureCard>
        <div className="flex items-start gap-4">
          <Medallion icon="sprout" tone="brand" className="size-14" iconClassName="size-7" />
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-900">
              <span className="num">{INCOME_IDEAS.length}</span> רעיונות שנבחרו לגיל שלך
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              רוב ההכנסה שלך מגיעה בקיץ. הרעיונות כאן נבחרו כי הם מתאימים לגיל, חוקיים, ורובם עובדים
              גם בשאר השנה.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill tone="brand" icon="shield-check">
            מתאים לגיל
          </Pill>
          <Pill icon="book">רשימה קבועה, לא AI</Pill>
        </div>
      </FeatureCard>

      <Card tone="caution">
        <CardTitle icon="scale" iconTone="caution">
          לפני שמתחילים
        </CardTitle>
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
                  className="flex w-full items-start gap-3.5 text-start"
                >
                  <Medallion icon={idea.icon} tone="brand" className="size-12" iconClassName="size-6" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">{idea.titleHe}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-slate-600">
                      {idea.whatHe}
                    </span>
                    <span className="mt-2.5 flex flex-wrap gap-2">
                      {idea.estimate ? (
                        <Pill tone="brand">
                          <span className="num">
                            {formatILS(idea.estimate.lowAgorot)}–{formatILS(idea.estimate.highAgorot)}
                          </span>{' '}
                          {idea.estimate.unitHe}
                        </Pill>
                      ) : (
                        <Pill>סכום חד-פעמי — אין טווח שאפשר להצדיק</Pill>
                      )}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-transform duration-300 ${
                      expanded ? 'rotate-180' : ''
                    }`}
                  >
                    <Icon name="chevron-down" className="size-4" />
                  </span>
                </button>

                {expanded ? (
                  <div className="mt-4 animate-fade-in space-y-3 border-t border-slate-100 pt-4">
                    <div className="flex flex-wrap gap-2">
                      <ApprovalChip idea={idea} />
                      <Pill icon="clock">{idea.timeHe}</Pill>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <DetailTile title="מה צריך לדעת">{idea.needToKnowHe}</DetailTile>
                      <DetailTile title="עלות התחלה">{idea.startupCostHe}</DetailTile>
                    </div>

                    {idea.estimate ? (
                      <DetailTile title="מאיפה הטווח הזה">{idea.estimate.basisHe}</DetailTile>
                    ) : null}

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-2xl bg-brand-50/70 p-3.5">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-strong">
                          <Icon name="sparkles" className="size-3.5" />
                          יתרונות
                        </p>
                        <ul className="mt-1.5 list-inside list-disc space-y-1 text-sm leading-relaxed text-slate-700">
                          {idea.prosHe.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3.5">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                          <Icon name="info" className="size-3.5" />
                          חסרונות
                        </p>
                        <ul className="mt-1.5 list-inside list-disc space-y-1 text-sm leading-relaxed text-slate-700">
                          {idea.consHe.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <Button variant="secondary" full onClick={() => startPlan(idea)}>
                      <Icon name="plus" className="size-4" />
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
          <p className="flex gap-2.5 rounded-2xl bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-600">
            <Icon name="info" className="mt-0.5 size-4 shrink-0 text-slate-500" />
            <span>
              זה נשמר כהכנסה <strong>אפשרית</strong>. היא תופיע בתחזית כתרחיש, ולא תיכנס ל״בטוח
              להוציא״ — עד שתסמן שהכסף נכנס בפועל.
            </span>
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
