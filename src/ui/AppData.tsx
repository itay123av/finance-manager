/**
 * מקור הנתונים היחיד של הממשק.
 *
 * הממשק לא מחשב כלום. הוא טוען תמונת מצב מ-IndexedDB, מעביר אותה
 * ל-`core/dashboard.ts`, ומציג את מה שחוזר. כל שינוי בבסיס הנתונים
 * מפעיל חישוב מחדש אוטומטית דרך `useLiveQuery` — ולכן הוספת עסקה
 * מעדכנת מיד את היתרה, את "בטוח להוציא" ואת ההתקדמות ליעד.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { loadSnapshot, type Snapshot } from '../data/repositories';
import { buildDashboard, type DashboardData } from '../core/dashboard';
import { formatILS, type FormatMoneyOptions } from '../core/money';
import type { AppSettings } from '../core/types';

interface AppDataValue {
  loading: boolean;
  snapshot: Snapshot | undefined;
  dashboard: DashboardData | undefined;
  settings: AppSettings | undefined;
  onboarded: boolean;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const snapshot = useLiveQuery(() => loadSnapshot(db, new Date()), []);

  const dashboard = useMemo(() => {
    if (!snapshot?.goal) return undefined;
    return buildDashboard({
      today: snapshot.today,
      accounts: snapshot.accounts,
      transactions: snapshot.transactions,
      categories: snapshot.categories,
      goal: snapshot.goal,
      settings: snapshot.settings,
      expectedIncomes: snapshot.expectedIncomes,
      plannedExpenses: snapshot.plannedExpenses,
      recurringTransactions: snapshot.recurring,
      cardTransactions: snapshot.cardTransactions,
      cards: snapshot.cards,
      lastImportDate: snapshot.lastImportDate,
    });
  }, [snapshot]);

  const value: AppDataValue = {
    loading: snapshot === undefined,
    snapshot,
    dashboard,
    settings: snapshot?.settings,
    onboarded: Boolean(snapshot?.settings.onboardingCompletedAt && snapshot.goal),
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData חייב לרוץ בתוך AppDataProvider');
  return value;
}

/** עיצוב סכומים לפי העדפת האגורות של המשתמש. */
export function useMoneyFormatter() {
  const { settings } = useAppData();
  const showAgorot = settings?.showAgorot ?? false;
  return (agorot: number, options: FormatMoneyOptions = {}) =>
    formatILS(agorot, { showAgorot, ...options });
}
