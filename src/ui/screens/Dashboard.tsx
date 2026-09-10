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
 * ⚠️ **היררכיה ויזואלית (v1.5).** היתרה היא המשטח הכהה היחיד במסך —
 * כרטיס "ארנק". "בטוח להוציא" מקבל את המספר הירוק הגדול ואת הצל העמוק
 * ביותר מבין הכרטיסים הלבנים. כל השאר שקט יותר. קודם כל הכרטיסים היו
 * באותו משקל, והעין לא ידעה מאיפה להתחיל.
 */

import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../AppData';
import { useIsDesktop } from '../useMediaQuery';
import { db } from '../../data/db';
import { saveSettings } from '../../data/repositories';
import { AlertList, topAlerts } from '../components/AlertList';
import { BackupReminderBanner } from '../components/BackupReminderBanner';
import { SyncBanner } from '../components/SyncBanner';
import { StorageBanner } from '../components/StorageBanner';
import { Page, Stack } from '../components/layout';
import { confidenceLabelHe } from '../../core/confidence';
import { formatDateHe, formatMonthHe } from '../../core/dates';
import { Icon, type IconName } from '../components/icons';
import {
  BrandMark,
  Button,
  Card,
  CardTitle,
  DiscreetToggle,
  EmptyState,
  KpiCard,
  LoadingState,
  Medallion,
  Money,
  ProgressBar,
  Row,
  Sheet,
} from '../components/ui';

/** כמה התראות במסך הראשי. השאר במסך התובנות. */
const DASHBOARD_ALERTS = 1;

/**
 * ברכה לפי שעה.
 *
 * ⚠️ נגזרת משעון המכשיר, ובכוונה — זה טקסט תצוגה ולא חישוב. שום מספר
 * פיננסי לא תלוי בו, ולכן אין כאן את הבעיה של שעון מקומי מול שעון שרת.
 */
function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 17) return 'צהריים טובים';
  if (hour >= 17 && hour < 22) return 'ערב טוב';
  return 'לילה טוב';
}

const TODAY_FORMAT = new Intl.DateTimeFormat('he-IL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * אריח פעולה מהירה.
 *
 * ⚠️ אריח אחד בלבד מלא בצבע — הוספת עסקה, הפעולה שעושים הכי הרבה.
 * ארבעה אריחים ירוקים היו שקולים לאפס.
 */
function tileClass(primary: boolean): string {
  return `flex min-h-[5.5rem] flex-col items-start justify-between gap-3 rounded-2xl border p-3.5 text-start text-sm font-semibold transition duration-150 active:scale-[0.98] ${
    primary
      ? 'border-transparent bg-brand-700 text-white elev-btn hover:bg-brand-900'
      : 'border-slate-200/70 bg-surface text-slate-800 elev-1 hover:border-slate-300 hover:bg-slate-50'
  }`;
}

function TileIcon({ name, primary = false }: { name: IconName; primary?: boolean }) {
  if (!primary) return <Medallion icon={name} tone="brand" />;
  return (
    <span
      aria-hidden
      className="flex size-8 items-center justify-center rounded-[0.625rem] bg-white/15"
    >
      <Icon name={name} className="size-[1.125rem]" />
    </span>
  );
}

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
  const now = new Date();

  // ── ראש המסך ────────────────────────────────────────────────────

  /**
   * ⚠️ הלוגו מופיע רק בטלפון. בדסקטופ הוא כבר בראש סרגל הצד, ושני
   * לוגואים באותו מסך הם רעש.
   */
  const header = (
    <div className="flex items-center gap-3">
      <BrandMark className="size-10 lg:hidden" />
      <div className="leading-tight">
        <p className="text-xs font-medium text-slate-600">{TODAY_FORMAT.format(now)}</p>
        <p className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900 lg:text-2xl">
          {greetingFor(now.getHours())}
        </p>
      </div>
    </div>
  );

  // ── הכרטיסים ────────────────────────────────────────────────────

  /**
   * ⚠️ המשטח הכהה היחיד במסך. הטקסט עליו לבן, והמשני לבן ב-85%
   * שקיפות. נמדד: 70% נתן 4.1:1 בנקודה הבהירה ביותר של ההילה — מתחת לסף — ולכן 85%.
   */
  const balanceCard = (
    <section
      aria-label="היתרה"
      className="hero-surface relative overflow-hidden rounded-[1.5rem] border border-white/10 p-6 text-white"
    >
      <p className="text-sm font-medium text-white/85">יש לך</p>
      <p className="num-display mt-3 text-[2.75rem] leading-none font-semibold">
        <Money agorot={balance.totalAgorot} />
      </p>
      <div className="mt-6 flex items-center gap-5">
        <div>
          <p className="text-xs text-white/85">בנק</p>
          <p className="mt-1 text-base font-semibold">
            <Money agorot={bank?.balanceAgorot ?? 0} />
          </p>
        </div>
        <span aria-hidden className="h-9 w-px bg-white/15" />
        <div>
          <p className="text-xs text-white/85">מזומן</p>
          <p className="mt-1 text-base font-semibold">
            <Money agorot={cash?.balanceAgorot ?? 0} />
          </p>
        </div>
      </div>
    </section>
  );

  const safeToSpendCard = (
    <Card className="elev-2">
      <CardTitle
        hint="הסכום שאפשר להוציא בלי לפגוע בהוצאות שכבר מתוכננות, בסכום הביטחון, ובכסף ששמור לחודשים הבאים."
        icon="shield-check"
        iconTone="brand"
      >
        בטוח להוציא עכשיו
      </CardTitle>

      {safeToSpend.isOverspent ? (
        <>
          <p className="text-lg font-semibold text-caution-600">{safeToSpend.headlineHe}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{safeToSpend.messageHe}</p>
        </>
      ) : (
        <>
          <p className="num-display text-[2.75rem] leading-none font-semibold text-accent">
            <Money agorot={safeToSpend.nowAgorot} />
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
              השבוע: <Money agorot={safeToSpend.weekAgorot} className="font-semibold text-slate-900" />
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
              נשארו{' '}
              <span className="num font-semibold text-slate-900">{safeToSpend.daysLeftInMonth}</span>{' '}
              ימים בחודש
            </span>
          </div>
        </>
      )}

      <Button variant="ghost" className="mt-3 -ms-3" onClick={() => setShowBreakdown(true)}>
        איך חישבנו את זה?
      </Button>

      {/* התחזית מופרדת ויזואלית — היא לא כסף שיש */}
      {safeToSpend.projection.confirmedIncomeLeftAgorot > 0 ? (
        <div className="mt-3 border-t border-dashed border-slate-200 pt-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Icon name="sparkles" className="size-3.5" />
            תחזית — לא כסף שיש לך
          </p>
          <p className="mt-1.5 text-sm text-slate-600">
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
    <Card>
      <CardTitle icon="sun" iconTone="caution">
        שמור לחודשים הבאים
      </CardTitle>
      <p className="num-display text-[2rem] leading-none font-semibold text-slate-900">
        <Money agorot={seasonal.reservedAgorot} />
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{seasonal.explanationHe}</p>
      <div className="mt-3 border-t border-slate-100 pt-1">
        <Row label="הקצבה חודשית" strong>
          <Money agorot={seasonal.allocation.monthlyAllowanceAgorot} />
        </Row>
      </div>
    </Card>
  ) : null;

  const goalCard = (
    <Card>
      <CardTitle icon="target" iconTone="brand">
        היעד
      </CardTitle>
      <div className="flex items-center justify-between gap-3">
        <span className="num-display text-[2rem] leading-none font-semibold text-slate-900">
          <Money agorot={goalProgress.targetAgorot} />
        </span>
        {/* גם האחוז מוסתר במצב דיסקרטי — 88% ליד יעד של ₪5,000
            מגלה את היתרה בדיוק כמו הצגת היתרה עצמה. */}
        <span className="num sensitive rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-accent">
          {goalProgress.progressPct}%
        </span>
      </div>
      <div className="mt-4">
        <ProgressBar pct={goalProgress.progressPct} />
      </div>
      <div className="mt-3 divide-y divide-slate-100">
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

      <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
        {goalProjection.reachMonth ? (
          <>
            בקצב הנוכחי:{' '}
            <strong className="font-semibold text-slate-900">
              {formatMonthHe(goalProjection.reachMonth)}
            </strong>
            <span className="mx-1 text-slate-500">·</span>
            <span className="text-xs">{confidenceLabelHe(goalProjection.confidence)}</span>
            <p className="mt-1.5 text-xs text-slate-500">
              זו תחזית לפי הנתונים שלך — לא תאריך יעד ולא הבטחה. היא זזה כשההרגלים משתנים.
            </p>
          </>
        ) : (
          <>
            בקצב הנוכחי עוד לא מגיעים ליעד — וזה בסדר גמור בשלב הזה.
            <p className="mt-1.5 text-xs text-slate-500">
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
        <Link
          to="/insights"
          className="flex min-h-11 items-center gap-1 px-1 text-sm font-semibold text-accent"
        >
          עוד <span className="num">{moreAlerts}</span> דברים ששווה לראות ←
        </Link>
      ) : null}
    </>
  );

  /**
   * ⚠️ שלושת המספרים של החודש בשורה אחת, ולא בשלוש שורות תווית–ערך:
   * "נכנס, יצא, ההפרש" הם השוואה, והשוואה נקראת טוב יותר כשהמספרים
   * זה לצד זה.
   */
  const monthStats: { label: string; agorot: number; signed?: boolean }[] = [
    { label: 'נכנס', agorot: month.incomeAgorot },
    { label: 'יצא', agorot: month.expenseAgorot },
    { label: 'ההפרש', agorot: month.netAgorot, signed: true },
  ];

  const monthCard = (
    <Card>
      <CardTitle icon="calendar">החודש</CardTitle>
      <div className="grid grid-cols-3 gap-2">
        {monthStats.map((stat) => (
          <div key={stat.label} className="rounded-2xl bg-slate-50 px-3 py-3">
            <p className="text-xs text-slate-600">{stat.label}</p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              <Money agorot={stat.agorot} {...(stat.signed ? { signed: true } : {})} />
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 divide-y divide-slate-100">
        <Row label="תקציב החודש">
          <Money agorot={budgetPlan.monthlySpendAgorot} />
        </Row>
        <Row label="נשאר בתקציב" strong>
          <Money agorot={budgetProgress.remainingAgorot} />
        </Row>
      </div>
      {budgetProgress.isAheadOfPace && !budgetProgress.isOverBudget ? (
        <p className="mt-2 text-xs leading-relaxed text-caution-600">
          הקצב קצת מהיר לעומת החלק שעבר מהחודש. עוד אפשר לאזן.
        </p>
      ) : null}
      <Link
        to="/budget"
        className="mt-2 flex min-h-11 items-center text-sm font-semibold text-accent"
      >
        לתקציב המלא ←
      </Link>
    </Card>
  );

  /**
   * ⚠️ ה-"+" בשמות הנגישים נשאר (`sr-only`), גם כשרואים אייקון במקומו:
   * קורא מסך צריך לשמוע "+ עסקה" ולא רק "עסקה", שנשמע כמו קישור
   * לרשימת העסקאות.
   */
  const quickActions = (
    <Card>
      <CardTitle>פעולות מהירות</CardTitle>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={onAddTransaction} className={tileClass(true)}>
          <TileIcon name="plus" primary />
          <span>
            <span className="sr-only">+ </span>עסקה
          </span>
        </button>
        <button type="button" onClick={onAsk} className={tileClass(false)}>
          <TileIcon name="calculator" />
          אפשר לקנות?
        </button>
        <Link to="/expected-income" className={tileClass(false)}>
          <TileIcon name="wallet" />
          <span>
            <span className="sr-only">+ </span>הכנסה צפויה
          </span>
        </Link>
        <Link to="/backup" className={tileClass(false)}>
          <TileIcon name="save" />
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
      <SyncBanner />
      <StorageBanner />
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
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 xl:gap-5">
        <KpiCard
          tone="hero"
          label="יש לך"
          value={<Money agorot={balance.totalAgorot} />}
          sub={
            <>
              בנק <Money agorot={bank?.balanceAgorot ?? 0} className="font-semibold text-white" />
              <span aria-hidden className="mx-2 text-white/60">
                ·
              </span>
              מזומן <Money agorot={cash?.balanceAgorot ?? 0} className="font-semibold text-white" />
            </>
          }
        />
        <KpiCard
          label="בטוח להוציא עכשיו"
          value={
            safeToSpend.isOverspent ? (
              <span className="text-2xl text-caution-600">חריגה</span>
            ) : (
              <span className="text-accent">
                <Money agorot={safeToSpend.nowAgorot} />
              </span>
            )
          }
          sub={
            <>
              השבוע <Money agorot={safeToSpend.weekAgorot} className="font-semibold text-slate-900" />{' '}
              · <span className="num">{safeToSpend.daysLeftInMonth}</span> ימים בחודש
            </>
          }
        />
        <KpiCard
          label="שמור לחודשים הבאים"
          value={<Money agorot={seasonal.reservedAgorot} />}
          sub={
            seasonal.allocation ? (
              <>
                הקצבה חודשית{' '}
                <Money
                  agorot={seasonal.allocation.monthlyAllowanceAgorot}
                  className="font-semibold text-slate-900"
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
              נשאר <Money agorot={goalProgress.gapAgorot} className="font-semibold text-slate-900" />{' '}
              מתוך <Money agorot={goalProgress.targetAgorot} />
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
          <SyncBanner />
          <StorageBanner />
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
      leading={header}
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
        <div className="divide-y divide-slate-100 text-slate-700">
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
        </div>
        <div className="mt-2 rounded-2xl bg-brand-50 px-4 py-1">
          <Row label="בטוח להוציא" strong>
            <Money agorot={safeToSpend.breakdown.resultAgorot} />
          </Row>
        </div>

        {safeToSpend.breakdown.committedItems.length > 0 ? (
          <div className="mt-6">
            <p className="mb-1 text-sm font-semibold text-slate-600">הוצאות החובה שנותרו</p>
            <div className="divide-y divide-slate-100">
              {safeToSpend.breakdown.committedItems.map((item, i) => (
                <Row
                  key={`${item.label}-${i}`}
                  label={`${item.label} · ${formatDateHe(item.dueDate)}`}
                >
                  <Money agorot={item.amountAgorot} />
                </Row>
              ))}
            </div>
          </div>
        ) : null}

        {safeToSpend.breakdown.reservedForFutureMonthsAgorot > 0 ? (
          <p className="mt-5 rounded-2xl bg-caution-100/50 p-4 text-xs leading-relaxed text-slate-700">
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
