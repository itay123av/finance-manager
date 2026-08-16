/**
 * "אפשר לקנות את זה?"
 *
 * סכום → תשובה. בלי טופס מסובך: זו השאלה שנשאלת בעמידה בחנות, ואם
 * היא לוקחת יותר מכמה שניות היא לא תישאל בכלל.
 *
 * ⚠️ המסך לא מחשב כלום — הכל מגיע מ-`core/purchaseSimulation.ts`.
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
  Money,
  Row,
  Sheet,
} from '../components/ui';

const QUICK_AMOUNTS = [50, 100, 150, 250, 500];

const VERDICT_ICON: Record<PurchaseVerdict, IconName> = {
  affordable: 'shield-check',
  tight: 'info',
  uses_reserve: 'alert-triangle',
  over_safe: 'alert-triangle',
};

const VERDICT_ICON_TONE: Record<PurchaseVerdict, string> = {
  affordable: 'size-5 text-accent',
  tight: 'size-5 text-caution-600',
  uses_reserve: 'size-5 text-caution-600',
  over_safe: 'size-5 text-danger',
};

const VERDICT_TONE: Record<PurchaseVerdict, string> = {
  affordable: 'border-brand-500/50 bg-brand-50',
  tight: 'border-caution-600/40 bg-caution-100/40',
  uses_reserve: 'border-caution-600/60 bg-caution-100/60',
  over_safe: 'border-alertred-600/40 bg-alertred-100/50',
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
          <AmountInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            aria-label="סכום הרכישה"
            placeholder="כמה זה עולה?"
          />

          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((quick) => (
              <button
                key={quick}
                type="button"
                onClick={() => setAmount(String(quick))}
                className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-surface px-3 text-sm font-semibold text-slate-700"
              >
                <span className="num">₪{quick}</span>
              </button>
            ))}
          </div>

          {/* ── התשובה ──────────────────────────────────────── */}
          {result ? (
            <>
              <div className={`rounded-2xl border p-4 ${VERDICT_TONE[result.verdict]}`}>
                {/* ⚠️ האייקון נגזר מ-`verdict`, לא מהטקסט. הצבע והצורה
                    הם קישוט של אותה החלטה שכבר התקבלה בשכבת החישוב —
                    ולכן אי אפשר שהם ייפרדו ממנה. */}
                <p className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <Icon name={VERDICT_ICON[result.verdict]} className={VERDICT_ICON_TONE[result.verdict]} />
                  {result.headlineHe}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">
                  {result.explanationHe}
                </p>
              </div>

              <Card>
                <CardTitle>אחרי הרכישה</CardTitle>
                <Row label="יתרה">
                  <Money agorot={result.after.balanceAgorot} />
                </Row>
                <Row label="בטוח להוציא" strong>
                  <Money agorot={result.after.safeToSpendNowAgorot} signed />
                </Row>
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
                <div className="my-2 border-t border-slate-100" />
                <Row label="נשאר עד היעד">
                  <Money agorot={result.after.goalGapAgorot} />
                </Row>
                {result.goalDelayDays > 0 ? (
                  <Row label="היעד נדחה ב־">{result.goalDelayDays} ימים</Row>
                ) : null}
                {result.after.goalReachMonth ? (
                  <Row label="תאריך יעד משוער">
                    {formatMonthHe(result.after.goalReachMonth)}
                  </Row>
                ) : null}
                <div className="my-2 border-t border-slate-100" />
                <Row label="תחזית סוף החודש">
                  <Money agorot={result.after.monthEndForecastAgorot} />
                </Row>
                <Row label="תחזית 3 חודשים">
                  <Money agorot={result.after.threeMonthForecastAgorot} />
                </Row>
              </Card>

              {/* ── הכנסה צפויה, בנפרד ──────────────────────── */}
              {result.ifExpectedIncomeArrives ? (
                <Card>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <Icon name="sparkles" className="size-3.5" />לא כסף שיש לך עכשיו
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
                  <CardTitle>אפשרויות</CardTitle>
                  {result.alternatives.map((alternative, index) => (
                    <div
                      key={alternative.kind}
                      className="border-b border-slate-100 py-2.5 last:border-0"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {String.fromCharCode(1488 + index)}׳ · {alternative.labelHe}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                        {alternative.detailHe}
                      </p>
                    </div>
                  ))}
                  <p className="mt-3 text-xs leading-relaxed text-slate-500">
                    אלה לא הוראות — רק המספרים. ההחלטה שלך.
                  </p>
                </Card>
              ) : null}
            </>
          ) : (
            <Card>
              <CardTitle>המצב עכשיו</CardTitle>
              <Row label="יתרה">
                <Money agorot={dashboard.balance.totalAgorot} />
              </Row>
              <Row label="בטוח להוציא" strong>
                <Money agorot={dashboard.safeToSpend.nowAgorot} />
              </Row>
              <Row label="שמור לחודשים הבאים">
                <Money agorot={dashboard.safeToSpend.breakdown.reservedForFutureMonthsAgorot} />
              </Row>
              <Row label="סכום ביטחון">
                <Money agorot={dashboard.safeToSpend.breakdown.safetyBufferAgorot} />
              </Row>
              <Row label="נשאר עד היעד">
                <Money agorot={dashboard.goalProgress.gapAgorot} />
              </Row>
            </Card>
          )}

          <Button variant="ghost" full onClick={() => setShowWhatIf((v) => !v)}>
            {showWhatIf ? 'פחות' : 'מה יקרה אם…?'}
          </Button>

          {showWhatIf && purchase ? (
            <Card>
              {[
                whatIfSaveMonthly(purchase, fromShekels(100)),
                whatIfReceive(purchase, fromShekels(500)),
              ].map((whatIf) => (
                <div key={whatIf.labelHe} className="border-b border-slate-100 py-2 last:border-0">
                  <p className="text-sm font-medium text-slate-900">{whatIf.labelHe}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                    {whatIf.summaryHe}
                  </p>
                </div>
              ))}
            </Card>
          ) : null}

          <p className="pb-2 text-center text-xs text-slate-500">
            זו סימולציה בלבד — שום עסקה לא נוצרת.
          </p>
        </div>
      )}
    </Sheet>
  );
}
