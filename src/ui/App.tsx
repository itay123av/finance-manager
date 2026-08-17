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
  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = tab.to === '/more' ? UNDER_MORE.has(pathname) : pathname === tab.to;
          return (
            <li key={tab.to} className="flex-1">
              <Link
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                  active ? 'text-accent' : 'text-slate-500'
                }`}
              >
                <Icon name={tab.icon} />
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
      className="fixed bottom-20 end-4 z-30 flex min-h-14 items-center gap-2 rounded-full bg-brand-700 px-5 text-sm font-bold text-white shadow-lg shadow-brand-900/20 hover:bg-brand-900"
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
  if (!onboarded) return <Onboarding />;

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
        {isDesktop ? <Sidebar onAddTransaction={openTransactionForm} /> : null}

        <div className="min-w-0 flex-1">
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
          <Shell />
        </ToastProvider>
      </AppDataProvider>
    </HashRouter>
  );
}
