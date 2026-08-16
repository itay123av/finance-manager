/**
 * לוח הבקרה.
 *
 * ⚠️ המסך הזה נמדד בחמש שניות. תוך חמש שניות צריך לדעת: כמה יש, כמה
 * בטוח להוציא, כמה שמור לעתיד, איפה אני מול היעד, והאם משהו דורש
 * תשומת לב. כל דבר נוסף מתחרה על אותן חמש שניות.
 *
 * לכן ירדו מכאן בשלב הליטוש: תקציב הבילויים (יש לו מסך), הפילוח לפי
 * קטגוריה (יש לו מסך), והתחזית לשלושה חודשים (יש לה מסך). הם לא
 * נמחקו — הם רק לא במסך שנפתח שלושים פעם ביום.
 *
 * ⚠️ **שתי פריסות, אותם כרטיסים.**
 *
 * כל כרטיס הוא קומפוננטה אחת, והיא נבנית פעם אחת. מה שמשתנה בין
 * מובייל לדסקטופ הוא **הסידור בלבד** — ולכן אין סיכוי ששתי הפריסות
 * יציגו מספרים שונים.
 *
 * למה לא סידור אחד עם `grid` רספונסיבי: סדר הכרטיסים במובייל נבחר
 * בקפידה (התראות מיד אחרי "בטוח להוציא", לפני היעד), וגריד שמעביר
 * כרטיסים לעמודה צדדית בדסקטופ היה משנה גם את סדר המובייל. פיצול
 * מפורש שומר על שניהם.
 */

import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../AppData';
import { useIsDesktop } from '../useMediaQuery';
import { db } from '../../data/db';
import { saveSettings } from '../../data/repositories';
import { AlertList, topAlerts } from '../components/AlertList';
import { BackupReminderBanner } from '../components/BackupReminderBanner';
import { Page, Stack } from '../components/layout';
import { confidenceLabelHe } from '../../core/confidence';
import { formatDateHe, formatMonthHe } from '../../core/dates';
import { Icon } from '../components/icons';
import {
  Button,
  buttonClass,
  Card,
  CardTitle,
  DiscreetToggle,
  EmptyState,
  KpiCard,
  LoadingState,
  Money,
  ProgressBar,
  Row,
  Sheet,
} from '../components/ui';

/** כמה התראות במסך הראשי. השאר במסך התובנות. */
const DASHBOARD_ALERTS = 1;

export function Dashboard({
  onAddTransaction,
  onAsk,
}: {
  onAddTransaction: () => void;
  onAsk: () => void;
}) {
  const { dashboard, loading, settings } = useAppData();
  const isDesktop = useIsDesktop();
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (loading) return <LoadingState />;
  if (!dashboard) return <LoadingState label="מכין את הנתונים…" />;

  const {
    balance,
    goalProgress,
    goalProjection,
    safeToSpend,
    month,
    budgetPlan,
    budgetProgress,
    seasonal,
    alerts,
  } = dashboard;

  const bank = balance.byAccount.find((a) => a.type === 'bank');
  const cash = balance.byAccount.find((a) => a.type === 'cash');
  const hasTransactions = balance.breakdown.countedTransactions > 0;
  const moreAlerts = alerts.length - DASHBOARD_ALERTS;

  // ── הכרטיסים ────────────────────────────────────────────────────

  const balanceCard = (
    <Card tone="brand">
      <p className="text-sm text-accent">יש לך</p>
      <p className="mt-1 text-4xl font-bold text-accent-strong">
        <Money agorot={balance.totalAgorot} />
      </p>
      <p className="mt-2 text-sm text-accent">
        בנק <Money agorot={bank?.balanceAgorot ?? 0} className="font-semibold" />
        <span aria-hidden className="mx-2 text-brand-500">
          ·
        </span>
        מזומן <Money agorot={cash?.balanceAgorot ?? 0} className="font-semibold" />
      </p>
    </Card>
  );

  const safeToSpendCard = (
    <Card className="border-brand-500/40 ring-1 ring-brand-500/20">
      <CardTitle hint="הסכום שאפשר להוציא בלי לפגוע בהוצאות שכבר מתוכננות, בסכום הביטחון, ובכסף ששמור לחודשים הבאים." icon="shield-check">
        בטוח להוציא עכשיו
      </CardTitle>

      {safeToSpend.isOverspent ? (
        <>
          <p className="text-lg font-bold text-caution-600">{safeToSpend.headlineHe}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{safeToSpend.messageHe}</p>
        </>
      ) : (
        <>
          <p className="text-4xl font-bold text-accent">
            <Money agorot={safeToSpend.nowAgorot} />
          </p>
          <p className="mt-2 text-sm text-slate-600">
            השבוע: <Money agorot={safeToSpend.weekAgorot} className="font-semibold" />
            <span aria-hidden className="mx-2 text-slate-400">
              ·
            </span>
            נשארו <span className="num">{safeToSpend.daysLeftInMonth}</span> ימים בחודש
          </p>
        </>
      )}

      <Button variant="ghost" className="mt-3 -ms-2" onClick={() => setShowBreakdown(true)}>
        איך חישבנו את זה?
      </Button>

      {/* התחזית מופרדת ויזואלית — היא לא כסף שיש */}
      {safeToSpend.projection.confirmedIncomeLeftAgorot > 0 ? (
        <div className="mt-3 border-t border-dashed border-slate-200 pt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Icon name="sparkles" className="size-3.5" />תחזית — לא כסף שיש לך</p>
          <p className="mt-1 text-sm text-slate-500">
            אם ההכנסה הצפויה תיכנס (
            <Money agorot={safeToSpend.projection.confirmedIncomeLeftAgorot} /> ב־
            {formatDateHe(
              safeToSpend.projection.confirmedIncomeItems[0]?.expectedDate ?? dashboard.today,
            )}
            ) → <Money agorot={safeToSpend.projection.byMonthEndAgorot} className="font-semibold" />
          </p>
        </div>
      ) : null}
    </Card>
  );

  const reserveCard = seasonal.allocation ? (
    <Card tone="caution">
      <CardTitle icon="sun">שמור לחודשים הבאים</CardTitle>
      <p className="text-3xl font-bold text-slate-900">
        <Money agorot={seasonal.reservedAgorot} />
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{seasonal.explanationHe}</p>
      <Row label="הקצבה חודשית" strong>
        <Money agorot={seasonal.allocation.monthlyAllowanceAgorot} />
      </Row>
    </Card>
  ) : null;

  const goalCard = (
    <Card>
      <CardTitle icon="target">היעד</CardTitle>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold text-slate-900">
          <Money agorot={goalProgress.targetAgorot} />
        </span>
        {/* גם האחוז מוסתר במצב דיסקרטי — 88% ליד יעד של ₪5,000
            מגלה את היתרה בדיוק כמו הצגת היתרה עצמה. */}
        <span className="num sensitive text-lg font-semibold text-accent">
          {goalProgress.progressPct}%
        </span>
      </div>
      <div className="mt-3">
        <ProgressBar pct={goalProgress.progressPct} />
      </div>
      <div className="mt-3 space-y-1">
        <Row label="נשאר עד היעד">
          <Money agorot={goalProgress.gapAgorot} />
        </Row>
        {goalProgress.nextMilestone ? (
          <Row label="יעד הביניים הבא">
            <Money agorot={goalProgress.nextMilestone.amountAgorot} />
          </Row>
        ) : null}
        <Row label="מאז שהתחלת">
          <Money agorot={goalProgress.sinceStartAgorot} signed />
        </Row>
      </div>

      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">
        {goalProjection.reachMonth ? (
          <>
            בקצב הנוכחי:{' '}
            <strong className="text-slate-800">{formatMonthHe(goalProjection.reachMonth)}</strong>
            <span className="mx-1 text-slate-500">·</span>
            <span className="text-xs">{confidenceLabelHe(goalProjection.confidence)}</span>
            <p className="mt-1 text-xs text-slate-500">
              זו תחזית לפי הנתונים שלך — לא תאריך יעד ולא הבטחה. היא זזה כשההרגלים משתנים.
            </p>
          </>
        ) : (
          <>
            בקצב הנוכחי עוד לא מגיעים ליעד — וזה בסדר גמור בשלב הזה.
            <p className="mt-1 text-xs text-slate-500">
              כל חודש שבו נשאר משהו בצד מקרב אותו. אפשר גם לכוון קודם ל-
              <span className="num">₪1,000</span>.
            </p>
          </>
        )}
      </div>
    </Card>
  );

  const alertsSection = (
    <>
      {/* התראה אחת בלבד. רשימה של שבע נגללת ולא נקראת, והתוצאה היא
          שגם החשובה שבהן לא מגיעה. השאר נמצאות במסך התובנות. */}
      <AlertList alerts={topAlerts(alerts, DASHBOARD_ALERTS)} />
      {moreAlerts > 0 ? (
        <Link to="/insights" className="block py-2 text-sm font-semibold text-accent">
          עוד <span className="num">{moreAlerts}</span> דברים ששווה לראות ←
        </Link>
      ) : null}
    </>
  );

  const monthCard = (
    <Card>
      <CardTitle>החודש</CardTitle>
      <Row label="נכנס">
        <Money agorot={month.incomeAgorot} />
      </Row>
      <Row label="יצא">
        <Money agorot={month.expenseAgorot} />
      </Row>
      <Row label="ההפרש" strong>
        <Money agorot={month.netAgorot} signed />
      </Row>
      <div className="my-2 border-t border-slate-100" />
      <Row label="תקציב החודש">
        <Money agorot={budgetPlan.monthlySpendAgorot} />
      </Row>
      <Row label="נשאר בתקציב" strong>
        <Money agorot={budgetProgress.remainingAgorot} />
      </Row>
      {budgetProgress.isAheadOfPace && !budgetProgress.isOverBudget ? (
        <p className="mt-2 text-xs leading-relaxed text-caution-600">
          הקצב קצת מהיר לעומת החלק שעבר מהחודש. עוד אפשר לאזן.
        </p>
      ) : null}
      <Link to="/budget" className="mt-3 inline-block py-2 text-sm font-semibold text-accent">
        לתקציב המלא ←
      </Link>
    </Card>
  );

  const quickActions = (
    <Card>
      <CardTitle>פעולות מהירות</CardTitle>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={onAddTransaction}>+ עסקה</Button>
        <Button variant="secondary" onClick={onAsk}>
          אפשר לקנות?
        </Button>
        <Link to="/expected-income" className={buttonClass('secondary', true)}>
          + הכנסה צפויה
        </Link>
        <Link to="/backup" className={buttonClass('secondary', true)}>
          גיבוי
        </Link>
      </div>
    </Card>
  );

  const emptyState = !hasTransactions ? (
    <EmptyState
      title="עוד אין עסקאות"
      body="ברגע שתוסיף כמה, המספרים כאן יתחילו להיות מדויקים באמת."
      action={<Button onClick={onAddTransaction}>להוסיף עסקה ראשונה</Button>}
    />
  ) : null;

  // ── הפריסות ─────────────────────────────────────────────────────

  /** מובייל — בדיוק הסדר של גרסה 1.0. */
  const mobileLayout: ReactNode = (
    <>
      {balanceCard}
      {safeToSpendCard}
      {reserveCard}
      {goalCard}
      {alertsSection}
      <BackupReminderBanner />
      {monthCard}
      {quickActions}
      {emptyState}
    </>
  );

  /**
   * דסקטופ — שורת KPI ואז שתי עמודות.
   *
   * ⚠️ ארבעת המספרים חוזרים גם בכרטיסים שמתחת, וזה בכוונה: השורה
   * העליונה עונה על "כמה?" במבט אחד, והכרטיסים עונים על "למה?".
   * שניהם נגזרים מאותו אובייקט, ולכן אינם יכולים להיפרד.
   */
  const desktopLayout: ReactNode = (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 xl:gap-6">
        <KpiCard
          tone="brand"
          label="יש לך"
          value={<Money agorot={balance.totalAgorot} />}
          sub={
            <>
              בנק <Money agorot={bank?.balanceAgorot ?? 0} className="font-semibold" />
              <span aria-hidden className="mx-2 text-brand-500">
                ·
              </span>
              מזומן <Money agorot={cash?.balanceAgorot ?? 0} className="font-semibold" />
            </>
          }
        />
        <KpiCard
          label="בטוח להוציא עכשיו"
          value={
            safeToSpend.isOverspent ? (
              <span className="text-2xl text-caution-600">חריגה</span>
            ) : (
              <Money agorot={safeToSpend.nowAgorot} />
            )
          }
          sub={
            <>
              השבוע <Money agorot={safeToSpend.weekAgorot} className="font-semibold" /> ·{' '}
              <span className="num">{safeToSpend.daysLeftInMonth}</span> ימים בחודש
            </>
          }
        />
        <KpiCard
          tone="caution"
          label="שמור לחודשים הבאים"
          value={<Money agorot={seasonal.reservedAgorot} />}
          sub={
            seasonal.allocation ? (
              <>
                הקצבה חודשית{' '}
                <Money
                  agorot={seasonal.allocation.monthlyAllowanceAgorot}
                  className="font-semibold"
                />
              </>
            ) : (
              'אין כרגע כסף עונתי בצד'
            )
          }
        />
        <KpiCard
          label="היעד"
          value={
            <span className="num sensitive text-accent">{goalProgress.progressPct}%</span>
          }
          sub={
            <>
              נשאר <Money agorot={goalProgress.gapAgorot} className="font-semibold" /> מתוך{' '}
              <Money agorot={goalProgress.targetAgorot} />
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Stack className="xl:col-span-2">
          {safeToSpendCard}
          {goalCard}
          {monthCard}
        </Stack>
        <Stack>
          {alertsSection}
          <BackupReminderBanner />
          {reserveCard}
          {quickActions}
          {emptyState}
        </Stack>
      </div>
    </>
  );

  return (
    <Page
      title="לוח הבקרה"
      showTitle={false}
      actions={
        <DiscreetToggle
          on={settings?.discreetMode ?? false}
          onToggle={() => saveSettings(db, { discreetMode: !settings?.discreetMode })}
        />
      }
    >
      {isDesktop ? desktopLayout : mobileLayout}

      {/* ── פירוט החישוב ─────────────────────────────────────── */}
      <Sheet open={showBreakdown} onClose={() => setShowBreakdown(false)} title="איך חישבנו">
        <div className="space-y-1 text-slate-700">
          <Row label="יתרה קיימת">
            <Money agorot={safeToSpend.breakdown.currentBalanceAgorot} />
          </Row>
          <Row label="− סכום ביטחון">
            <Money agorot={safeToSpend.breakdown.safetyBufferAgorot} />
          </Row>
          <Row label="− הוצאות חובה שנותרו">
            <Money agorot={safeToSpend.breakdown.committedLeftAgorot} />
          </Row>
          <Row label="− שמור לחודשים הבאים">
            <Money agorot={safeToSpend.breakdown.reservedForFutureMonthsAgorot} />
          </Row>
          <Row label="− תרומה ליעד החודש">
            <Money agorot={safeToSpend.breakdown.goalDueThisMonthAgorot} />
          </Row>
          <div className="my-2 border-t border-slate-200" />
          <Row label="בטוח להוציא" strong>
            <Money agorot={safeToSpend.breakdown.resultAgorot} />
          </Row>
        </div>

        {safeToSpend.breakdown.committedItems.length > 0 ? (
          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold text-slate-500">הוצאות החובה שנותרו</p>
            {safeToSpend.breakdown.committedItems.map((item, i) => (
              <Row
                key={`${item.label}-${i}`}
                label={`${item.label} · ${formatDateHe(item.dueDate)}`}
              >
                <Money agorot={item.amountAgorot} />
              </Row>
            ))}
          </div>
        ) : null}

        {safeToSpend.breakdown.reservedForFutureMonthsAgorot > 0 ? (
          <p className="mt-5 rounded-xl bg-caution-100/50 p-3 text-xs leading-relaxed text-slate-700">
            <strong>למה יש כסף שמור?</strong> {seasonal.explanationHe}
          </p>
        ) : null}

        {safeToSpend.projection.unconfirmedIncomeAgorot > 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            יש גם <Money agorot={safeToSpend.projection.unconfirmedIncomeAgorot} /> בהכנסות שעוד לא
            בטוחות. הן לא נספרות כאן בכוונה — כדי שלא תוציא כסף שאולי לא יגיע.
          </p>
        ) : null}
      </Sheet>
    </Page>
  );
}
