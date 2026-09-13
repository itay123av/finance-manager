/**
 * שלד האפליקציה.
 *
 * ⚠️ **שני שלדי ניווט, לפי רוחב המסך.**
 *
 * בטלפון: שורה תחתונה של חמישה יעדים ומסך "עוד". עם עשרה מסכים,
 * שורה שמנסה להציג את כולם נותנת לכל אחד פחות מ-40 פיקסלים, וכל
 * לחיצה הופכת לניחוש. הסדר הוא סדר השימוש: בית (כמה יש) ← עסקאות
 * (מה קרה) ← תקציב (מה מותר) ← החלטות (מה אם) ← עוד.
 *
 * מ-1024 ומעלה: סרגל צד קבוע עם כל היעדים (`components/Sidebar.tsx`).
 * השורה התחתונה והכפתור הצף נעלמים — הם פותרים בעיה של אגודל, ובמסך
 * רחב אין להם מה לפתור.
 *
 * ⚠️ המעבר הוא `lg:` בלבד. כל מה שמתחת ל-1024 ממשיך לעבוד בדיוק כפי
 * שעבד בגרסה 1.0.
 */

import { useState } from 'react';
import { HashRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppDataProvider, useAppData } from './AppData';
import { SyncEngine } from './SyncEngine';
import { AppLockGate } from './AppLockGate';
import { ToastProvider } from './Toast';
import { useIsDesktop } from './useMediaQuery';
import { useTheme } from './useTheme';
import { Onboarding } from './screens/Onboarding';
import { Dashboard } from './screens/Dashboard';
import { Transactions } from './screens/Transactions';
import { Budget } from './screens/Budget';
import { Insights } from './screens/Insights';
import { Review } from './screens/Review';
import { Forecast } from './screens/Forecast';
import { CanIAfford } from './screens/CanIAfford';
import { Import } from './screens/Import';
import { Categories } from './screens/Categories';
import { Settings } from './screens/Settings';
import { Privacy } from './screens/Privacy';
import { Backup } from './screens/Backup';
import { Sync } from './screens/Sync';
import { More } from './screens/More';
import { IncomeIdeas } from './screens/IncomeIdeas';
import { ExpectedIncomes } from './screens/ExpectedIncomes';
import { TransactionForm } from './screens/TransactionForm';
import { UpdatePrompt } from './components/UpdatePrompt';
import { Sidebar } from './components/Sidebar';
import { LoadingState } from './components/ui';
import { Icon } from './components/icons';

const TABS = [
  { to: '/', label: 'בית', icon: 'home' },
  { to: '/transactions', label: 'עסקאות', icon: 'receipt' },
  { to: '/budget', label: 'תקציב', icon: 'target' },
  { to: '/forecast', label: 'החלטות', icon: 'trending-up' },
  { to: '/more', label: 'עוד', icon: 'more' },
] as const;

/** מסכים שנחשבים ל"עוד" — כדי שהלשונית תסומן כפעילה גם בתוכם. */
const UNDER_MORE = new Set([
  '/more',
  '/insights',
  '/review',
  '/expected-income',
  '/income-ideas',
  '/import',
  '/categories',
  '/backup',
  '/sync',
  '/settings',
  '/privacy',
]);

function BottomNav() {
  const { pathname } = useLocation();
  const activeIndex = TABS.findIndex((tab) =>
    tab.to === '/more' ? UNDER_MORE.has(pathname) : pathname === tab.to,
  );
  return (
    // ⚠️ זכוכית חלבית ולא משטח אטום: התוכן שנגלל מתחת נראה במעומעם,
    // והשורה מרגישה כחלק מהמסך ולא כפס שהודבק לתחתיתו.
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-surface/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150"
    >
      <ul className="relative mx-auto flex max-w-md">
        {/*
          ⚠️ גלולה אחת שגולשת בין הלשוניות, ולא גלולה לכל לשונית. התנועה
          אומרת "עברת מכאן לשם" — מה שהחלפת צבע לבדה לא אומרת.

          `start-0` הוא הקצה הימני ב-RTL, ו-translateX שלילי מזיז שמאלה,
          לכיוון הלשוניות הבאות. האחוזים הם מרוחב הגלולה עצמה, שהיא בדיוק
          חמישית מהשורה. הפריטים `relative` כדי שיצטיירו מעליה.
        */}
        <span
          aria-hidden
          className={`pointer-events-none absolute start-0 top-2 flex h-7 w-1/5 justify-center transition-[transform,opacity] duration-300 ease-out ${
            activeIndex < 0 ? 'opacity-0' : ''
          }`}
          style={{ transform: `translateX(${-Math.max(activeIndex, 0) * 100}%)` }}
        >
          <span className="h-full w-14 rounded-full bg-brand-50" />
        </span>
        {TABS.map((tab, index) => {
          const active = index === activeIndex;
          return (
            <li key={tab.to} className="relative flex-1">
              <Link
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs transition ${
                  active ? 'font-semibold text-accent' : 'font-medium text-slate-500'
                }`}
              >
                {/* ⚠️ הלשונית הפעילה מסומנת בגלולה, במשקל ובגודל האייקון —
                    לא בצבע בלבד. צבע לבד לא מספיק כסימן (WCAG 1.4.1). */}
                <span className="flex h-7 w-14 items-center justify-center">
                  <Icon
                    name={tab.icon}
                    className={`size-[1.375rem] transition-transform duration-300 ${active ? 'scale-110' : ''}`}
                  />
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // הסימן ‎+‎ מוסתר מקוראי מסך, ולכן השם הנגיש נקבע במפורש.
      aria-label="הוספת עסקה"
      className="fixed bottom-[5.5rem] end-4 z-30 flex min-h-14 items-center gap-2 rounded-full bg-brand-700 ps-4 pe-5 text-sm font-semibold text-white elev-fab transition hover:bg-brand-900 active:scale-[0.98]"
    >
      <Icon name="plus" />
      עסקה
    </button>
  );
}

/**
 * מסכים שבהם הכפתור הצף מוסתר.
 *
 * במסך הייבוא הוא חיפה על כפתור "לקלוט" וגנב ממנו את הלחיצה — הפעולה
 * המרכזית של המסך פשוט לא עבדה. בכל מקרה, בזמן ייבוא, גיבוי או שינוי
 * הגדרות הוספת עסקה ידנית אינה הפעולה הבאה הסבירה.
 */
const HIDE_ADD_BUTTON_ON = new Set([
  '/import',
  '/settings',
  '/privacy',
  '/categories',
  '/backup',
  '/more',
  '/income-ideas',
  '/expected-income',
  // במסך התקציב הוא חיפה על כפתור בחירת המסלול "גמיש"
  '/budget',
]);

/** המסכים שמכשיר חדש צריך עוד לפני שיש בו נתונים. */
const RESTORE_ROUTES = new Set(['/sync', '/backup']);

function Shell() {
  const { loading, onboarded, settings } = useAppData();
  const { pathname } = useLocation();
  const isDesktop = useIsDesktop();

  // ⚠️ נקרא לפני כל `return` מוקדם — גם מסך הטעינה ומסך האונבורדינג
  // צריכים את הערכה הנכונה, אחרת יש הבזק לבן לפני שהיא נטענת.
  useTheme(settings?.theme);
  const [adding, setAdding] = useState(false);
  const [addingTrigger, setAddingTrigger] = useState<HTMLElement | null>(null);
  const [asking, setAsking] = useState(false);
  const [askingTrigger, setAskingTrigger] = useState<HTMLElement | null>(null);

  /**
   * ⚠️ הכפתור שפתח נשמר בפירוש.
   *
   * שני הדיאלוגים האלה יושבים ברמת השלד, והכפתורים שפותחים אותם
   * נמצאים במסכים שעוברים render באותה פעולה. בלי לשמור את המקור,
   * המיקוד אחרי הסגירה קופץ לתחילת הדף — ומי שמנווט במקלדת מתחיל
   * את כל הדרך מחדש.
   */
  const openTransactionForm = () => {
    setAddingTrigger(document.activeElement as HTMLElement | null);
    setAdding(true);
  };

  const openCanIAfford = () => {
    setAskingTrigger(document.activeElement as HTMLElement | null);
    setAsking(true);
  };

  if (loading) return <LoadingState label="פותח את המערכת…" />;

  /**
   * ⚠️ שני מסכים נגישים **לפני** האונבורדינג, ובכוונה.
   *
   * מכשיר חדש שכל מטרתו למשוך נתונים קיימים — מהענן או מקובץ גיבוי —
   * לא אמור להיאלץ להמציא קודם יתרות ויעד. זה גם מייצר נתונים שנדרסים
   * מיד אחר כך, וגם הופך "התקנתי בטלפון החדש" למסלול מבלבל.
   *
   * שאר המסכים חסומים כרגיל: בלי חשבונות ויעד אין מה להציג בהם.
   */
  if (!onboarded && !RESTORE_ROUTES.has(pathname)) return <Onboarding />;

  return (
    <AppLockGate>
      {/*
        ⚠️ `lg:flex` ולא `flex`. מתחת ל-1024 אין סרגל צד כלל, והמעטפת
        חייבת להישאר בלוק רגיל — אחרת `mx-auto` של המסכים היה מפסיק
        למרכז אותם.

        `min-w-0` על אזור התוכן הוא ההבדל בין טבלה שגוללת בתוך עצמה
        לבין טבלה שדוחפת את כל העמוד לרוחב. ילד של flex לא מתכווץ
        מתחת לתוכן שלו בלי זה.
      */}
      <div className={`lg:flex ${settings?.discreetMode ? 'discreet' : ''}`}>
        {/* הילה עדינה בראש המסך — שכבה קבועה מאחורי התוכן. */}
        <div aria-hidden className="page-glow" />
        {isDesktop ? <Sidebar onAddTransaction={openTransactionForm} /> : null}

        <div className="min-w-0 flex-1">
        {/*
          ⚠️ `key` לפי הנתיב מרכיב את המסך מחדש בכל מעבר, ולכן אנימציות
          הכניסה (הבאנר והכרטיסים, ב-`Page`) רצות פעם אחת בכל מעבר — ולא
          בכל שינוי בנתונים.

          ⚠️ בלי אנימציה על העטיפה הזו עצמה. היא כבר הייתה כאן, ויחד עם
          הכניסה המדורגת כל כרטיס זז פעמיים.
        */}
        <div key={pathname}>
        <Routes>
          <Route
            path="/"
            element={
              <Dashboard onAddTransaction={openTransactionForm} onAsk={openCanIAfford} />
            }
          />
          <Route
            path="/transactions"
            element={<Transactions onAddTransaction={openTransactionForm} />}
          />
          <Route path="/budget" element={<Budget />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/review" element={<Review />} />
          <Route path="/forecast" element={<Forecast />} />
          <Route path="/import" element={<Import />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/backup" element={<Backup />} />
          <Route path="/sync" element={<Sync />} />
          <Route path="/more" element={<More />} />
          <Route path="/income-ideas" element={<IncomeIdeas />} />
          <Route path="/expected-income" element={<ExpectedIncomes />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </div>
        </div>

        {/* הכפתור הצף והשורה התחתונה פותרים בעיה של אגודל. במסך רחב
            אין להם מה לפתור, והפעולה עברה לראש סרגל הצד. */}
        {!isDesktop && !HIDE_ADD_BUTTON_ON.has(pathname) ? (
          <AddButton onClick={openTransactionForm} />
        ) : null}
        {!isDesktop ? <BottomNav /> : null}
        <UpdatePrompt />
        <TransactionForm
          open={adding}
          onClose={() => setAdding(false)}
          restoreFocusTo={addingTrigger}
        />
        <CanIAfford
          open={asking}
          onClose={() => setAsking(false)}
          restoreFocusTo={askingTrigger}
        />
      </div>
    </AppLockGate>
  );
}

export function App() {
  return (
    // HashRouter — האפליקציה עשויה לרוץ מקובץ מקומי או מתת-נתיב,
    // ושם ניתוב מבוסס history שובר רענון דף.
    <HashRouter>
      <AppDataProvider>
        <ToastProvider>
          {/*
            ⚠️ מתחת ל-`AppDataProvider` ובכוונה: המנוע מגיב לאותו
            `useLiveQuery` שמזין את המסכים, ולכן כל מסלול כתיבה מכוסה
            בלי שאף מסך יצטרך לקרוא לסנכרון בעצמו.
          */}
          <SyncEngine />
          <Shell />
        </ToastProvider>
      </AppDataProvider>
    </HashRouter>
  );
}
