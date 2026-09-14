/**
 * "אפשר לקנות את זה?"
 *
 * סכום → תשובה. בלי טופס מסובך: זו השאלה שנשאלת בעמידה בחנות, ואם
 * היא לוקחת יותר מכמה שניות היא לא תישאל בכלל.
 *
 * ⚠️ המסך לא מחשב כלום — הכל מגיע מ-`core/purchaseSimulation.ts`.
 *
 * ⚠️ **v3 — אותה שפה כמו לוח הבקרה.** הסכום בפאנל משלו עם סכומים
 * מהירים כגלולות, התשובה בכרטיס עם מדליון בצבע ההחלטה, והמספרים
 * שאחרי הרכישה באריחים.
 */

import { useState } from 'react';
import { useAppData } from '../AppData';
import { useSimulationContext } from '../useSimulation';
import {
  simulatePurchase,
  whatIfReceive,
  whatIfSaveMonthly,
  type PurchaseVerdict,
} from '../../core/purchaseSimulation';
import { fromShekels } from '../../core/money';
import { formatDateHe, formatMonthHe } from '../../core/dates';
import { Icon, type IconName } from '../components/icons';
import {
  AmountInput,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Medallion,
  Money,
  Row,
  Sheet,
  type MedallionTone,
} from '../components/ui';
import { StatTile } from '../components/premium';

const QUICK_AMOUNTS = [50, 100, 150, 250, 500];

const VERDICT_ICON: Record<PurchaseVerdict, IconName> = {
  affordable: 'shield-check',
  tight: 'info',
  uses_reserve: 'alert-triangle',
  over_safe: 'alert-triangle',
};

/**
 * ⚠️ האייקון והצבע נגזרים מ-`verdict`, לא מהטקסט. הם קישוט של אותה
 * החלטה שכבר התקבלה בשכבת החישוב — ולכן אי אפשר שהם ייפרדו ממנה.
 */
const VERDICT_MEDALLION: Record<PurchaseVerdict, MedallionTone> = {
  affordable: 'brand',
  tight: 'caution',
  uses_reserve: 'caution',
  over_safe: 'danger',
};

const VERDICT_SURFACE: Record<PurchaseVerdict, string> = {
  affordable: 'border-brand-100 bg-brand-50/70',
  tight: 'border-caution-300/50 bg-caution-100/40',
  uses_reserve: 'border-caution-300/70 bg-caution-100/60',
  over_safe: 'border-alertred-100 bg-alertred-100/50',
};

export function CanIAfford({
  open,
  onClose,
  restoreFocusTo,
}: {
  open: boolean;
  onClose: () => void;
  /** הכפתור שפתח — הוא חי במסך אחר, ולכן צריך להימסר במפורש. */
  restoreFocusTo?: HTMLElement | null;
}) {
  const { dashboard } = useAppData();
  const { purchase } = useSimulationContext();
  const [amount, setAmount] = useState('');
  const [showWhatIf, setShowWhatIf] = useState(false);

  const parsed = Number(amount.replace(/[^\d.]/g, ''));
  const valid = Number.isFinite(parsed) && parsed > 0;
  const result =
    purchase && valid ? simulatePurchase({ ...purchase, amountAgorot: fromShekels(parsed) }) : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="אפשר לקנות את זה?"
      width="wide"
      {...(restoreFocusTo !== undefined ? { restoreFocusTo } : {})}
    >
      {/* ⚠️ בלי יעד או בלי נתונים אין מה לדמות — וזה מצב ריק, לא טעינה.
          מסך שמסתובב בלי סוף נראה כמו תקלה. */}
      {!dashboard || !purchase ? (
        <EmptyState
          title="עוד אין מספיק נתונים"
          body="כדי לענות על השאלה צריך לדעת כמה יש, מה שמור, ומה הקצב שלך. אחרי כמה עסקאות זה יעבוד."
        />
      ) : (
        <div className="space-y-4">
          <div className="rounded-[1.25rem] bg-slate-50 p-4">
            <AmountInput
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              aria-label="סכום הרכישה"
              placeholder="כמה זה עולה?"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((quick) => {
                const chosen = amount === String(quick);
                return (
                  <button
                    key={quick}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => setAmount(String(quick))}
                    className={`min-h-10 flex-1 rounded-full px-3 text-sm font-semibold transition active:scale-95 ${
                      chosen
                        ? 'bg-brand-700 text-white elev-btn'
                        : 'bg-surface text-slate-700 elev-1 hover:text-slate-900'
                    }`}
                  >
                    <span className="num">₪{quick}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── התשובה ──────────────────────────────────────── */}
          {result ? (
            <>
              <div
                key={result.verdict}
                className={`animate-rise rounded-[1.25rem] border p-5 ${VERDICT_SURFACE[result.verdict]}`}
              >
                <div className="flex items-start gap-3.5">
                  <Medallion
                    icon={VERDICT_ICON[result.verdict]}
                    tone={VERDICT_MEDALLION[result.verdict]}
                    className="size-12"
                    iconClassName="size-6"
                  />
                  <div className="min-w-0">
                    <p className="text-lg leading-snug font-bold text-slate-900">{result.headlineHe}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-700">
                      {result.explanationHe}
                    </p>
                  </div>
                </div>
              </div>

              <Card>
                <CardTitle icon="calculator">אחרי הרכישה</CardTitle>
                <div className="grid grid-cols-2 gap-2">
                  <StatTile
                    label="יתרה"
                    dot="slate"
                    value={<Money agorot={result.after.balanceAgorot} />}
                  />
                  <StatTile
                    label="בטוח להוציא"
                    dot={result.after.safeToSpendNowAgorot < 0 ? 'danger' : 'brand'}
                    value={<Money agorot={result.after.safeToSpendNowAgorot} signed />}
                  />
                  <StatTile
                    label="תחזית סוף החודש"
                    value={<Money agorot={result.after.monthEndForecastAgorot} />}
                  />
                  <StatTile
                    label="תחזית 3 חודשים"
                    value={<Money agorot={result.after.threeMonthForecastAgorot} />}
                  />
                </div>

                <div className="mt-3 divide-y divide-slate-100">
                  {result.reserveNeededAgorot > 0 ? (
                    <Row label="מהכסף השמור לעתיד">
                      <Money agorot={result.reserveNeededAgorot} />
                    </Row>
                  ) : null}
                  {result.bufferBreachAgorot > 0 ? (
                    <Row label="מסכום הביטחון">
                      <Money agorot={result.bufferBreachAgorot} />
                    </Row>
                  ) : null}
                  <Row label="נשאר עד היעד">
                    <Money agorot={result.after.goalGapAgorot} />
                  </Row>
                  {result.goalDelayDays > 0 ? (
                    <Row label="היעד נדחה ב־">
                      <span className="num">{result.goalDelayDays}</span> ימים
                    </Row>
                  ) : null}
                  {result.after.goalReachMonth ? (
                    <Row label="תאריך יעד משוער">{formatMonthHe(result.after.goalReachMonth)}</Row>
                  ) : null}
                </div>
              </Card>

              {/* ── הכנסה צפויה, בנפרד ──────────────────────── */}
              {result.ifExpectedIncomeArrives ? (
                <Card>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <Icon name="sparkles" className="size-3.5" />
                    לא כסף שיש לך עכשיו
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    אם ההכנסה הצפויה תיכנס (
                    <Money agorot={result.ifExpectedIncomeArrives.amountAgorot} /> ב־
                    {formatDateHe(result.ifExpectedIncomeArrives.date!)}), בטוח להוציא יהיה{' '}
                    <Money
                      agorot={result.ifExpectedIncomeArrives.safeToSpendThenAgorot}
                      className="font-semibold"
                    />
                    .
                  </p>
                </Card>
              ) : null}

              {/* ── חלופות ──────────────────────────────────── */}
              {result.alternatives.length > 0 ? (
                <Card>
                  <CardTitle icon="lightbulb">אפשרויות</CardTitle>
                  <div className="space-y-3">
                    {result.alternatives.map((alternative, index) => (
                      <div key={alternative.kind} className="flex gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                          {String.fromCharCode(1488 + index)}׳
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{alternative.labelHe}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                            {alternative.detailHe}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs leading-relaxed text-slate-600">
                    אלה לא הוראות — רק המספרים. ההחלטה שלך.
                  </p>
                </Card>
              ) : null}
            </>
          ) : (
            <Card>
              <CardTitle icon="wallet">המצב עכשיו</CardTitle>
              <div className="grid grid-cols-2 gap-2">
                <StatTile label="יתרה" dot="slate" value={<Money agorot={dashboard.balance.totalAgorot} />} />
                <StatTile
                  label="בטוח להוציא"
                  dot="brand"
                  value={<Money agorot={dashboard.safeToSpend.nowAgorot} />}
                />
                <StatTile
                  label="שמור לחודשים הבאים"
                  value={
                    <Money agorot={dashboard.safeToSpend.breakdown.reservedForFutureMonthsAgorot} />
                  }
                />
                <StatTile
                  label="סכום ביטחון"
                  value={<Money agorot={dashboard.safeToSpend.breakdown.safetyBufferAgorot} />}
                />
                <StatTile
                  className="col-span-2"
                  label="נשאר עד היעד"
                  value={<Money agorot={dashboard.goalProgress.gapAgorot} />}
                />
              </div>
            </Card>
          )}

          <Button variant="ghost" full onClick={() => setShowWhatIf((v) => !v)}>
            <Icon name="sparkles" className="size-4" />
            {showWhatIf ? 'פחות' : 'מה יקרה אם…?'}
          </Button>

          {showWhatIf && purchase ? (
            <div className="grid animate-fade-in gap-2 sm:grid-cols-2">
              {[
                whatIfSaveMonthly(purchase, fromShekels(100)),
                whatIfReceive(purchase, fromShekels(500)),
              ].map((whatIf) => (
                <div key={whatIf.labelHe} className="rounded-2xl bg-slate-50 p-3.5">
                  <p className="text-sm font-semibold text-slate-900">{whatIf.labelHe}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{whatIf.summaryHe}</p>
                </div>
              ))}
            </div>
          ) : null}

          <p className="pb-2 text-center text-xs text-slate-500">
            זו סימולציה בלבד — שום עסקה לא נוצרת.
          </p>
        </div>
      )}
    </Sheet>
  );
}
