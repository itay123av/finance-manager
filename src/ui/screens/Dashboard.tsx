/**
 * לוח הבקרה.
 *
 * ⚠️ המסך הזה נמדד בחמש שניות. תוך חמש שניות צריך לדעת: כמה יש, כמה
 * בטוח להוציא, כמה שמור לעתיד, איפה אני מול היעד, והאם משהו דורש
 * תשומת לב. כל דבר נוסף מתחרה על אותן חמש שניות.
 *
 * ⚠️ **שתי פריסות, אותם כרטיסים.** כל כרטיס נבנה פעם אחת; מה שמשתנה
 * בין מובייל לדסקטופ הוא הסידור בלבד — ולכן אין סיכוי ששתי הפריסות
 * יציגו מספרים שונים.
 *
 * ⚠️ **v2 — "שזה ייראה ממש אחרת".** המשתמש לא ראה הבדל בגרסה הקודמת,
 * וביקש משהו שאי אפשר לפספס:
 *
 * • **באנר גיבור לכל רוחב המסך** — אזמרגד כהה עם הילות שנעות לאט וברק
 *   שחוצה אותו, כמו כרטיס מתכת. היתרה סופרת עד הערך, ולצידה קו מגמה.
 * • **"בטוח להוציא" עולה על הבאנר**, כמו באפליקציות בנק — הוא המספר
 *   שבגללו פותחים את המסך, והחפיפה מושכת אליו את העין מיד.
 * • **טבעת יעד** במקום פס, **מד תקציב** עם סימון קצב, ו**פעולות מהירות**
 *   בעיגולים.
 * • **כרטיסים שעולים בזה אחר זה** — פעם אחת בכניסה, לא בכל רינדור.
 *
 * כל התנועה מכבדת את הגדרת "הפחתת תנועה" של המערכת. ראה `motion.tsx`.
 */

import { useMemo, useState, type ReactNode } from 'react';
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
import { totalBalance } from '../../core/balance';
import {
  addMonthsToMonth,
  eachMonth,
  formatDateHe,
  formatMonthHe,
  monthEnd,
  monthOf,
} from '../../core/dates';
import { Icon, type IconName } from '../components/icons';
import { AnimatedMoney, stagger, useCountUp } from '../motion';
import { BudgetMeter, GoalRing, Sparkline } from '../components/visuals';
import {
  BrandMark,
  Button,
  Card,
  CardTitle,
  DiscreetToggle,
  EmptyState,
  LoadingState,
  Money,
  Row,
  Sheet,
} from '../components/ui';

/** כמה התראות במסך הראשי. השאר במסך התובנות. */
const DASHBOARD_ALERTS = 1;

/** אורך קו המגמה בבאנר, בחודשים. */
const TREND_MONTHS = 6;

/**
 * ברכה לפי שעה.
 *
 * ⚠️ נגזרת משעון המכשיר, ובכוונה — זה טקסט תצוגה ולא חישוב. שום מספר
 * פיננסי לא תלוי בו.
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
 * פעולה מהירה — עיגול עם תווית מתחתיו.
 *
 * ⚠️ רק אחת מלאה בצבע: הוספת עסקה, הפעולה שעושים הכי הרבה.
 */
const QUICK_ITEM = 'group flex flex-col items-center gap-2 rounded-2xl p-1.5 text-center';
const QUICK_LABEL = 'text-xs leading-tight font-semibold text-slate-700';

function QuickIcon({ name, primary = false }: { name: IconName; primary?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-14 items-center justify-center rounded-2xl transition duration-200 group-hover:-translate-y-0.5 group-active:scale-95 ${
        primary ? 'bg-brand-700 text-white elev-btn' : 'bg-brand-50 text-accent'
      }`}
    >
      <Icon name={name} className="size-6" />
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
  const { dashboard, snapshot, loading, settings } = useAppData();
  const isDesktop = useIsDesktop();
  const [showBreakdown, setShowBreakdown] = useState(false);

  // ⚠️ ה-hooks לפני כל `return` מוקדם — React דורש את אותו סדר בכל רינדור.
  const goalPctShown = Math.round(useCountUp(dashboard?.goalProgress.progressPct ?? 0));

  /**
   * קו המגמה: היתרה בסוף כל חודש, והנקודה האחרונה — היום.
   *
   * ⚠️ מחושב ב-`totalBalance`, **אותה** פונקציה שמחשבת את המספר הגדול
   * בבאנר. כך הקו נגמר בדיוק על היתרה המוצגת. חישוב נפרד (למשל סכום
   * מצטבר של הכנסות פחות הוצאות) היה יכול להיגמר במספר אחר.
   *
   * ⚠️ לא לפני תאריך הפתיחה של החשבון המוקדם ביותר — לפני כן אין יתרה
   * מוגדרת, ונקודה שם הייתה ממציאה נתון.
   */
  const trend = useMemo(() => {
    if (!snapshot) return [];
    const opening = snapshot.accounts.map((a) => a.openingDate).sort()[0];
    if (!opening) return [];
    const thisMonth = monthOf(snapshot.today);
    const windowStart = addMonthsToMonth(thisMonth, -(TREND_MONTHS - 1));
    const from = monthOf(opening) > windowStart ? monthOf(opening) : windowStart;
    return eachMonth(from, thisMonth).map((month) => {
      const asOf = month === thisMonth ? snapshot.today : monthEnd(month);
      return totalBalance(snapshot.accounts, snapshot.transactions, asOf).totalAgorot;
    });
  }, [snapshot]);

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

  // ── באנר הגיבור ─────────────────────────────────────────────────

  /**
   * ⚠️ טקסט משני ישירות על הבאנר — לבן ב-90%; על משטחי הזכוכית — לבן מלא. ההילות מבהירות את
   * הרקע בנקודות מסוימות: נמדד ש-70% יורד שם מתחת ל-4.5:1, ובכהה גם 90% על זכוכית נתן רק 4.40:1.
   *
   * ⚠️ בטלפון הבאנר נמתח עד קצות המסך (`-mx-4 -mt-4` מבטלים את ריווח
   * הדף) ומתעגל רק למטה. בדסקטופ הוא כרטיס מעוגל רגיל.
   */
  const desktopStats = isDesktop ? (
    <div className="relative mt-8 grid grid-cols-3 gap-3">
      <div className="glass rounded-2xl p-4">
        <p className="text-sm text-white">בטוח להוציא עכשיו</p>
        <p className="num-display mt-2 text-[1.75rem] leading-none font-semibold">
          {safeToSpend.isOverspent ? 'חריגה' : <AnimatedMoney agorot={safeToSpend.nowAgorot} />}
        </p>
        <p className="mt-2 text-xs text-white">
          השבוע <Money agorot={safeToSpend.weekAgorot} className="font-semibold text-white" /> ·{' '}
          <span className="num">{safeToSpend.daysLeftInMonth}</span> ימים בחודש
        </p>
      </div>
      <div className="glass rounded-2xl p-4">
        <p className="text-sm text-white">שמור לחודשים הבאים</p>
        <p className="num-display mt-2 text-[1.75rem] leading-none font-semibold">
          <Money agorot={seasonal.reservedAgorot} />
        </p>
        <p className="mt-2 text-xs text-white">
          {seasonal.allocation ? (
            <>
              הקצבה חודשית{' '}
              <Money
                agorot={seasonal.allocation.monthlyAllowanceAgorot}
                className="font-semibold text-white"
              />
            </>
          ) : (
            'אין כרגע כסף עונתי בצד'
          )}
        </p>
      </div>
      <div className="glass rounded-2xl p-4">
        <p className="text-sm text-white">היעד</p>
        <p className="num-display mt-2 text-[1.75rem] leading-none font-semibold">
          <span className="num sensitive">{goalPctShown}%</span>
        </p>
        <p className="mt-2 text-xs text-white">
          נשאר <Money agorot={goalProgress.gapAgorot} className="font-semibold text-white" /> מתוך{' '}
          <Money agorot={goalProgress.targetAgorot} />
        </p>
      </div>
    </div>
  ) : null;

  const hero = (
    <section
      aria-label="היתרה"
      className="hero-surface hero-sheen relative isolate -mx-4 -mt-4 overflow-hidden rounded-b-[2rem] px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-20 text-white lg:mx-0 lg:mt-0 lg:rounded-[1.75rem] lg:px-8 lg:pt-7 lg:pb-8"
    >
      <span aria-hidden className="aurora-blob aurora-a" />
      <span aria-hidden className="aurora-blob aurora-b" />

      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* בדסקטופ הלוגו כבר בראש סרגל הצד — שניים באותו מסך הם רעש. */}
          <BrandMark className="size-10 lg:hidden" />
          <div className="leading-tight">
            <p className="text-xs font-medium text-white/90">{TODAY_FORMAT.format(now)}</p>
            <p className="mt-0.5 text-lg font-semibold tracking-tight lg:text-2xl">
              {greetingFor(now.getHours())}
            </p>
          </div>
        </div>
        <DiscreetToggle
          tone="glass"
          on={settings?.discreetMode ?? false}
          onToggle={() => saveSettings(db, { discreetMode: !settings?.discreetMode })}
        />
      </div>

      <div className="relative mt-8 lg:flex lg:items-end lg:justify-between lg:gap-10">
        <div>
          <p className="text-sm font-medium text-white/90">יש לך</p>
          <p className="num-display mt-2 text-[3.25rem] leading-none font-semibold lg:text-[4rem]">
            <AnimatedMoney agorot={balance.totalAgorot} />
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="glass rounded-full px-3 py-1.5 text-sm">
              <span className="text-white">בנק</span>{' '}
              <Money agorot={bank?.balanceAgorot ?? 0} className="font-semibold" />
            </span>
            <span className="glass rounded-full px-3 py-1.5 text-sm">
              <span className="text-white">מזומן</span>{' '}
              <Money agorot={cash?.balanceAgorot ?? 0} className="font-semibold" />
            </span>
          </div>
        </div>

        {trend.length >= 2 ? (
          <div className="mt-7 lg:mt-0 lg:w-[22rem]">
            <Sparkline values={trend} className="h-16 w-full" />
            <p className="mt-2 text-xs text-white">
              מגמת היתרה · <span className="num">{trend.length}</span> חודשים אחרונים
            </p>
          </div>
        ) : null}
      </div>

      {desktopStats}
    </section>
  );

  // ── הכרטיסים ────────────────────────────────────────────────────

  const safeToSpendCard = (
    <Card className="relative overflow-hidden elev-2">
      {/* פס צבע דק בראש הכרטיס — הסימן לכך שזה הכרטיס החשוב. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{
          background:
            'linear-gradient(to left, var(--color-brand-500), var(--color-brand-700) 60%, transparent)',
        }}
      />
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
          <p className="num-display text-[3rem] leading-none font-semibold text-accent">
            <AnimatedMoney agorot={safeToSpend.nowAgorot} />
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

  /**
   * ⚠️ הטבעת היא מד ההתקדמות הראשון במסך (`role="progressbar"`), לפני
   * מד התקציב שבכרטיס החודש. יש בדיקה שתלויה בסדר הזה.
   */
  const goalCard = (
    <Card>
      <CardTitle icon="target" iconTone="brand">
        היעד
      </CardTitle>
      <div className="flex items-center gap-5">
        <GoalRing pct={goalProgress.progressPct} label="התקדמות ליעד">
          {/* גם האחוז מוסתר במצב דיסקרטי — 88% ליד יעד של ₪5,000
              מגלה את היתרה בדיוק כמו הצגת היתרה עצמה. */}
          <span className="num sensitive num-display text-[1.75rem] leading-none font-semibold text-slate-900">
            {goalPctShown}%
          </span>
          <span className="mt-1 text-xs text-slate-600">הושג</span>
        </GoalRing>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-xs text-slate-600">סכום היעד</p>
            <p className="num-display mt-0.5 text-2xl font-semibold text-slate-900">
              <Money agorot={goalProgress.targetAgorot} />
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-600">נשאר עד היעד</p>
            <p className="mt-0.5 text-base font-semibold text-slate-900">
              <Money agorot={goalProgress.gapAgorot} />
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 divide-y divide-slate-100">
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

  const alertsSection =
    alerts.length > 0 ? (
      <div>
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
      </div>
    ) : null;

  /**
   * ⚠️ שלושת המספרים של החודש בשורה אחת: "נכנס, יצא, ההפרש" הם השוואה,
   * והשוואה נקראת טוב יותר כשהמספרים זה לצד זה.
   */
  const monthStats: { label: string; agorot: number; dot: string; signed?: boolean }[] = [
    { label: 'נכנס', agorot: month.incomeAgorot, dot: 'bg-brand-500' },
    { label: 'יצא', agorot: month.expenseAgorot, dot: 'bg-slate-400' },
    // ⚠️ הנקודה לפי הסימן: ענבר על הפרש חיובי היה אומר "אזהרה" על תוצאה טובה.
    {
      label: 'ההפרש',
      agorot: month.netAgorot,
      dot: month.netAgorot >= 0 ? 'bg-brand-500' : 'bg-caution-600',
      signed: true,
    },
  ];

  const budgetTone =
    budgetProgress.isOverBudget || budgetProgress.isAheadOfPace ? 'caution' : 'brand';

  const monthCard = (
    <Card>
      <CardTitle icon="calendar">החודש</CardTitle>
      <div className="grid grid-cols-3 gap-2">
        {monthStats.map((stat) => (
          <div key={stat.label} className="rounded-2xl bg-slate-50 px-3 py-3">
            <p className="flex items-center gap-1.5 text-xs text-slate-600">
              <span aria-hidden className={`size-1.5 rounded-full ${stat.dot}`} />
              {stat.label}
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              <Money agorot={stat.agorot} {...(stat.signed ? { signed: true } : {})} />
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="text-slate-600">ניצול התקציב</span>
          <span className="num font-semibold text-slate-900">
            {Math.round(budgetProgress.spentSharePct)}%
          </span>
        </div>
        <BudgetMeter
          spentPct={budgetProgress.spentSharePct}
          elapsedPct={budgetProgress.monthElapsedPct}
          tone={budgetTone}
        />
        <p className="mt-2 text-xs text-slate-600">הקו הדק מסמן כמה מהחודש כבר עבר.</p>
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
      <div className="grid grid-cols-4 gap-1">
        <button type="button" onClick={onAddTransaction} className={QUICK_ITEM}>
          <QuickIcon name="plus" primary />
          <span className={QUICK_LABEL}>
            <span className="sr-only">+ </span>עסקה
          </span>
        </button>
        <button type="button" onClick={onAsk} className={QUICK_ITEM}>
          <QuickIcon name="calculator" />
          <span className={QUICK_LABEL}>אפשר לקנות?</span>
        </button>
        <Link to="/expected-income" className={QUICK_ITEM}>
          <QuickIcon name="wallet" />
          <span className={QUICK_LABEL}>
            <span className="sr-only">+ </span>הכנסה צפויה
          </span>
        </Link>
        <Link to="/backup" className={QUICK_ITEM}>
          <QuickIcon name="save" />
          <span className={QUICK_LABEL}>גיבוי</span>
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

  /** עוטף כרטיס בכניסה מדורגת. `null` נשאר `null` — בלי עטיפה ריקה. */
  const rise = (key: string, node: ReactNode, index: number) =>
    node ? (
      <div key={key} className="animate-rise" style={stagger(index)}>
        {node}
      </div>
    ) : null;

  /**
   * מובייל — הסדר של גרסה 1.0, מתחת לבאנר.
   *
   * ⚠️ `-mt-16` מעלה את הכרטיסים לתוך הריווח התחתון של הבאנר (`pb-20`),
   * כך ש"בטוח להוציא" חופף אותו. `z-10` שומר אותם מעליו.
   */
  const mobileLayout: ReactNode = (
    <>
      {rise('hero', hero, 0)}
      <div className="relative z-10 -mt-16 space-y-4">
        {rise('safe', safeToSpendCard, 1)}
        {rise('reserve', reserveCard, 2)}
        {rise('goal', goalCard, 3)}
        {rise('alerts', alertsSection, 4)}
        <BackupReminderBanner />
        <SyncBanner />
        <StorageBanner />
        {rise('month', monthCard, 5)}
        {rise('quick', quickActions, 6)}
        {emptyState}
      </div>
    </>
  );

  /** דסקטופ — הבאנר עם שלושת המדדים, ומתחתיו שתי עמודות. */
  const desktopLayout: ReactNode = (
    <>
      {rise('hero', hero, 0)}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Stack className="xl:col-span-2">
          {rise('safe', safeToSpendCard, 1)}
          {rise('goal', goalCard, 2)}
          {rise('month', monthCard, 3)}
        </Stack>
        <Stack>
          {rise('alerts', alertsSection, 2)}
          <BackupReminderBanner />
          <SyncBanner />
          <StorageBanner />
          {rise('reserve', reserveCard, 3)}
          {rise('quick', quickActions, 4)}
          {emptyState}
        </Stack>
      </div>
    </>
  );

  return (
    <Page title="לוח הבקרה" showTitle={false}>
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
