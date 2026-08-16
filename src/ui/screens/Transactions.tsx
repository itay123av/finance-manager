/**
 * רשימת העסקאות.
 *
 * מסודרת מהחדשה לישנה ומקובצת לפי תאריך, כי ככה מחפשים עסקה בפועל:
 * "מה קניתי אתמול", ולא "מה מספר העסקה".
 *
 * ⚠️ **כרטיסים בטלפון, טבלה במסך רחב.**
 *
 * בטלפון טבלה של שש עמודות הופכת לגלילה אופקית, וכל שורה נקראת
 * בשברים. במסך רחב ההפך: כרטיס אחד לשורה מבזבז 1200 פיקסלים כדי
 * להראות שדה אחד, וההשוואה בין שורות — שהיא כל מה שעושים ברשימת
 * עסקאות — הופכת לבלתי אפשרית.
 *
 * שתי התצוגות נבנות מאותם נתונים ומפעילות את אותן פונקציות
 * (`setEditing`, `remove`, `setExpandedCharge`). אין כאן שני מסלולי
 * נתונים — יש סידור אחר לאותו מסלול.
 */

import { Fragment, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAppData } from '../AppData';
import { useIsDesktop } from '../useMediaQuery';
import { useToast } from '../Toast';
import { db } from '../../data/db';
import { deleteTransaction, restoreTransaction } from '../../data/repositories';
import { detectCardCharge } from '../../core/cardCharges';
import { formatDateHe, formatWeekdayHe, monthOf } from '../../core/dates';
import { formatMonthHe } from '../../core/dates';
import type { CardTransaction, Transaction } from '../../core/types';
import { Page } from '../components/layout';
import { Button, Card, EmptyState, LoadingState, Money, Select } from '../components/ui';
import { TransactionForm } from './TransactionForm';
import { Icon } from '../components/icons';

type DirectionFilter = 'all' | 'income' | 'expense';
type SourceFilter = 'all' | 'bank' | 'cash' | 'card';

export function Transactions({ onAddTransaction }: { onAddTransaction: () => void }) {
  const { snapshot, loading } = useAppData();
  const isDesktop = useIsDesktop();
  const toast = useToast();
  const [month, setMonth] = useState<string>('all');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [accountId, setAccountId] = useState<string>('all');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [expandedCharge, setExpandedCharge] = useState<string | null>(null);

  // עסקאות הכרטיס נטענות בנפרד — הן אינן תנועות בנק
  const cardTransactions = useLiveQuery(() => db.cardTransactions.toArray(), []) ?? [];
  const cards = useLiveQuery(() => db.cards.toArray(), []) ?? [];

  /** פירוט הכרטיס, מקובץ לפי החיוב בבנק שהוא מחליף. */
  const detailByCharge = useMemo(() => {
    const map = new Map<string, typeof cardTransactions>();
    for (const t of cardTransactions) {
      if (!t.linkedBankTransactionId) continue;
      const list = map.get(t.linkedBankTransactionId);
      if (list) list.push(t);
      else map.set(t.linkedBankTransactionId, [t]);
    }
    return map;
  }, [cardTransactions]);

  const last4ById = useMemo(() => new Map(cards.map((c) => [c.id, c.last4])), [cards]);

  const transactions = snapshot?.transactions ?? [];
  const categories = snapshot?.categories ?? [];
  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const accountName = useMemo(
    () => new Map((snapshot?.accounts ?? []).map((a) => [a.id, a.name])),
    [snapshot?.accounts],
  );

  const months = useMemo(() => {
    const set = new Set(transactions.map((t) => monthOf(t.date)));
    return [...set].sort().reverse();
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => month === 'all' || monthOf(t.date) === month)
      .filter((t) => categoryId === 'all' || t.categoryId === categoryId)
      .filter((t) => direction === 'all' || t.type === direction)
      .filter((t) => accountId === 'all' || t.accountId === accountId)
      .filter((t) => {
        if (sourceFilter === 'all') return true;
        const account = snapshot?.accounts.find((a) => a.id === t.accountId);
        if (sourceFilter === 'card') return detectCardCharge(t.merchant) !== null;
        if (sourceFilter === 'cash') return account?.type === 'cash';
        return account?.type === 'bank' && detectCardCharge(t.merchant) === null;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [transactions, month, categoryId, direction, accountId, sourceFilter, snapshot?.accounts]);

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const list = map.get(t.date);
      if (list) list.push(t);
      else map.set(t.date, [t]);
    }
    return [...map.entries()];
  }, [filtered]);

  const totals = useMemo(
    () => ({
      income: filtered.filter((t) => t.type === 'income').reduce((s, t) => s + t.amountAgorot, 0),
      expense: filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amountAgorot, 0),
    }),
    [filtered],
  );

  if (loading) return <LoadingState />;

  /**
   * ⚠️ מחיקה בלי דיאלוג "בטוח?", ועם ביטול אחריה.
   *
   * דיאלוג אישור על כל מחיקה נלמד תוך יומיים כמסך שלוחצים עליו "כן",
   * ואז הוא כבר לא מגן על כלום. ביטול שנשאר על המסך כמה שניות עולה
   * אפס כשהמשתמש צודק, ומציל אותו כשלחץ על השורה הלא נכונה.
   */
  async function remove(transaction: Transaction) {
    await deleteTransaction(db, transaction.id);
    toast({
      messageHe: 'העסקה נמחקה.',
      undo: () => restoreTransaction(db, transaction),
    });
  }

  /** פירוט הכרטיס — משותף לשתי התצוגות. */
  const cardDetailRows = (detail: CardTransaction[]) => (
    <>
      {detail.map((d) => (
        <div key={d.id} className="flex items-baseline justify-between gap-2 py-1">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-slate-800">{d.merchant}</span>
            <span className="text-xs text-slate-500">
              {formatDateHe(d.purchaseDate)}
              <span aria-hidden className="mx-1.5 text-slate-400">
                ·
              </span>
              {categoryName.get(d.categoryId) ?? 'אחר'}
              {d.originalCurrency ? (
                <span className="ms-1.5 text-slate-500">
                  {d.originalCurrency} {(d.originalAmountAgorot ?? 0) / 100}
                </span>
              ) : null}
              {d.installmentCount ? (
                <span className="ms-1.5 text-slate-500">
                  תשלום {d.installmentNumber}/{d.installmentCount}
                </span>
              ) : null}
            </span>
          </span>
          <Money
            agorot={d.amountAgorot}
            className={`text-sm ${d.isRefund ? 'text-accent' : 'text-slate-900'}`}
          />
        </div>
      ))}
      <p className="mt-1 border-t border-slate-200 pt-1 text-xs text-slate-500">
        כרטיס •••{last4ById.get(detail[0]!.cardId) ?? ''} · הסכום כבר ירד מהחשבון
      </p>
    </>
  );

  const emptyState = (
    <EmptyState
      title={transactions.length === 0 ? 'עוד אין עסקאות' : 'אין עסקאות שמתאימות לסינון'}
      body={
        transactions.length === 0
          ? 'כל עסקה שתוסיף תשפר את דיוק המספרים בלוח הבקרה.'
          : 'אפשר לשנות את הסינון למעלה.'
      }
      action={
        transactions.length === 0 ? <Button onClick={onAddTransaction}>להוסיף עסקה</Button> : null
      }
    />
  );

  /**
   * טבלת דסקטופ.
   *
   * ⚠️ `overflow-x-auto` על העטיפה, לא על העמוד. אם הטבלה צרה מדי
   * לתוכן שלה (חלון של 1024 עם שמות ארוכים), היא גוללת בתוך עצמה —
   * ולא דוחפת את כל הדף לרוחב.
   */
  const desktopTable = (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        {/* ⚠️ `min-w` נמוך מספיק כדי להיכנס ב-1024 בלי גלילה פנימית,
            וגבוה מספיק כדי שהעמודות לא ייצמדו זו לזו. מתחת לזה
            העטיפה גוללת — הדף עצמו לעולם לא. */}
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <caption className="sr-only">רשימת העסקאות, מהחדשה לישנה</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-start">
              <th scope="col" className="px-4 py-3 text-start font-semibold text-slate-600">
                תאריך
              </th>
              <th scope="col" className="px-4 py-3 text-start font-semibold text-slate-600">
                תיאור
              </th>
              <th scope="col" className="px-4 py-3 text-start font-semibold text-slate-600">
                קטגוריה
              </th>
              <th scope="col" className="px-4 py-3 text-start font-semibold text-slate-600">
                חשבון
              </th>
              <th scope="col" className="px-4 py-3 text-end font-semibold text-slate-600">
                סכום
              </th>
              <th scope="col" className="px-4 py-3 text-end font-semibold text-slate-600">
                <span className="sr-only">פעולות</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const cardCharge = detectCardCharge(t.merchant);
              const detail = detailByCharge.get(t.id) ?? [];
              const isExpanded = expandedCharge === t.id;
              const hasDetail = cardCharge !== null && detail.length > 0;

              return (
                <Fragment key={t.id}>
                  <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 align-top text-slate-600">
                      <span className="num">{formatDateHe(t.date)}</span>
                      <span className="block text-xs text-slate-500">{formatWeekdayHe(t.date)}</span>
                    </td>
                    <td className="max-w-xs px-4 py-3 align-top">
                      {hasDetail ? (
                        <button
                          type="button"
                          onClick={() => setExpandedCharge(isExpanded ? null : t.id)}
                          aria-expanded={isExpanded}
                          className="text-start font-medium text-slate-900"
                        >
                          כרטיס {cardCharge.last4 ?? ''}
                          <span className="block text-xs font-semibold text-accent">
                            {detail.length} עסקאות <span aria-hidden>{isExpanded ? '▲' : '▼'}</span>
                          </span>
                        </button>
                      ) : (
                        <>
                          <span className="block truncate font-medium text-slate-900">
                            {t.merchant || categoryName.get(t.categoryId) || 'ללא שם'}
                          </span>
                          {t.note ? (
                            <span className="block truncate text-xs text-slate-500">{t.note}</span>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-600">
                      {categoryName.get(t.categoryId) ?? 'לא ידוע'}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-600">
                      {accountName.get(t.accountId) ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-end align-top">
                      <Money
                        agorot={t.type === 'income' ? t.amountAgorot : -t.amountAgorot}
                        signed
                        className={`font-semibold ${
                          t.type === 'income' ? 'text-accent' : 'text-slate-900'
                        }`}
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(t)}
                          aria-label={`עריכת ${t.merchant || 'עסקה'}`}
                          className="flex size-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                        >
                          <Icon name="pencil" className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(t)}
                          aria-label={`מחיקת ${t.merchant || 'עסקה'}`}
                          className="flex size-11 items-center justify-center rounded-lg text-slate-500 hover:bg-alertred-100"
                        >
                          <Icon name="trash" className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded ? (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={6} className="px-4 py-2">
                        {cardDetailRows(detail)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const mobileList = grouped.map(([date, items]) => (
    <section key={date}>
      <h2 className="mb-1.5 px-1 text-xs font-semibold text-slate-500">
        {formatWeekdayHe(date)} · {formatDateHe(date)}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-surface">
        {items.map((t, i) => {
          const cardCharge = detectCardCharge(t.merchant);
          const detail = detailByCharge.get(t.id) ?? [];
          const isExpanded = expandedCharge === t.id;

          return (
            <div key={t.id} className={i > 0 ? 'border-t border-slate-100' : ''}>
              <div className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  {/* חיוב כרטיס עם פירוט מוצג כשם הכרטיס, ופותח את הפירוט */}
                  {cardCharge && detail.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setExpandedCharge(isExpanded ? null : t.id)}
                      aria-expanded={isExpanded}
                      className="text-start"
                    >
                      <p className="truncate font-medium text-slate-900">
                        כרטיס {cardCharge.last4 ?? ''}
                      </p>
                      <p className="text-xs font-semibold text-accent">
                        {detail.length} עסקאות {isExpanded ? '▲' : '▼'}
                      </p>
                    </button>
                  ) : (
                    <>
                      <p className="truncate font-medium text-slate-900">
                        {t.merchant || categoryName.get(t.categoryId) || 'ללא שם'}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {categoryName.get(t.categoryId) ?? 'לא ידוע'}
                        <span aria-hidden className="mx-1.5 text-slate-400">
                          ·
                        </span>
                        {accountName.get(t.accountId) ?? '—'}
                        {t.note ? (
                          <>
                            <span aria-hidden className="mx-1.5 text-slate-400">
                              ·
                            </span>
                            {t.note}
                          </>
                        ) : null}
                      </p>
                    </>
                  )}
                </div>
                <div className="text-end">
                  <Money
                    agorot={t.type === 'income' ? t.amountAgorot : -t.amountAgorot}
                    signed
                    className={`font-semibold ${
                      t.type === 'income' ? 'text-accent' : 'text-slate-900'
                    }`}
                  />
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    aria-label={`עריכת ${t.merchant || 'עסקה'}`}
                    className="flex size-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                  >
                    <Icon name="pencil" className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(t)}
                    aria-label={`מחיקת ${t.merchant || 'עסקה'}`}
                    className="flex size-11 items-center justify-center rounded-lg text-slate-500 hover:bg-alertred-100"
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </div>
              </div>

              {/* פירוט הכרטיס — מה באמת נקנה */}
              {isExpanded ? (
                <div className="border-t border-slate-100 bg-slate-50 px-3 py-2">
                  {cardDetailRows(detail)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  ));

  return (
    <Page title="עסקאות">
      <Card>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="סינון לפי חודש"
          >
            <option value="all">כל החודשים</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonthHe(m)}
              </option>
            ))}
          </Select>
          <Select
            value={direction}
            onChange={(e) => setDirection(e.target.value as DirectionFilter)}
            aria-label="סינון לפי סוג"
          >
            <option value="all">הכל</option>
            <option value="expense">הוצאות</option>
            <option value="income">הכנסות</option>
          </Select>
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="סינון לפי קטגוריה"
          >
            <option value="all">כל הקטגוריות</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            aria-label="סינון לפי חשבון"
          >
            <option value="all">כל החשבונות</option>
            {(snapshot?.accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            aria-label="סינון לפי מקור"
          >
            <option value="all">כל המקורות</option>
            <option value="bank">בנק</option>
            <option value="cash">מזומן</option>
            <option value="card">כרטיס אשראי</option>
          </Select>
        </div>

        <p className="mt-3 text-sm text-slate-600">
          {filtered.length} עסקאות · נכנס <Money agorot={totals.income} className="font-semibold" />{' '}
          · יצא <Money agorot={totals.expense} className="font-semibold" />
        </p>
      </Card>

      {grouped.length === 0 ? emptyState : isDesktop ? desktopTable : mobileList}

      <TransactionForm open={editing !== null} editing={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}
