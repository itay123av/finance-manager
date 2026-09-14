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
 *
 * ⚠️ **v3 — חמש רשימות נפתחות הפכו לשתיים.** סוג העסקה הוא בקרה
 * מקוטעת, החודש נשאר גלוי, ושלושת המסננים הנדירים (קטגוריה, חשבון,
 * מקור) עברו לגיליון "סינון" עם מונה. חמש רשימות נפתחות בראש המסך
 * נראו כמו טופס, והיו רוב המסך בטלפון.
 */

import { Fragment, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAppData } from '../AppData';
import { AnimatedMoney } from '../motion';
import { useIsDesktop } from '../useMediaQuery';
import { useToast } from '../Toast';
import { db } from '../../data/db';
import { deleteTransaction, restoreTransaction } from '../../data/repositories';
import { detectCardCharge } from '../../core/cardCharges';
import { formatDateHe, formatWeekdayHe, monthOf } from '../../core/dates';
import { formatMonthHe } from '../../core/dates';
import type { CardTransaction, Transaction } from '../../core/types';
import { Page } from '../components/layout';
import { Button, Card, EmptyState, Field, LoadingState, Money, Select, Sheet } from '../components/ui';
import { FeatureCard, IconButton, Segmented, StatTile } from '../components/premium';
import { TransactionForm } from './TransactionForm';

type DirectionFilter = 'all' | 'income' | 'expense';
type SourceFilter = 'all' | 'bank' | 'cash' | 'card';

/**
 * ריבוע מעוגל בצבע הקטגוריה, עם האות הראשונה של שם העסקה.
 *
 * ⚠️ `aria-hidden` — השם והקטגוריה כבר כתובים בשורה. העיגול הוא דרך
 * לסרוק רשימה ארוכה בעין, לא מידע נוסף.
 *
 * ⚠️ צבע האות מעורבב עם `slate-900`, שמתהפך בין הערכות: בבהיר האות
 * מתכהה ובכהה מתבהרת. צבע הקטגוריה הגולמי (למשל ענבר) על רקע ענבר בהיר
 * היה כמעט בלתי נראה.
 */
function CategoryAvatar({ color, label }: { color: string | undefined; label: string }) {
  const tint = color ?? 'var(--color-slate-500)';
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-[0.875rem] text-sm font-bold"
      style={{
        background: `color-mix(in oklab, ${tint} 18%, transparent)`,
        color: `color-mix(in oklab, ${tint} 55%, var(--color-slate-900))`,
      }}
    >
      {label.trim().charAt(0)}
    </span>
  );
}

const DIRECTION_OPTIONS: { value: DirectionFilter; label: string }[] = [
  { value: 'all', label: 'הכל' },
  { value: 'expense', label: 'הוצאות' },
  { value: 'income', label: 'הכנסות' },
];

export function Transactions({ onAddTransaction }: { onAddTransaction: () => void }) {
  const { snapshot, dashboard, loading } = useAppData();
  const isDesktop = useIsDesktop();
  const toast = useToast();
  const [month, setMonth] = useState<string>('all');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [accountId, setAccountId] = useState<string>('all');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [expandedCharge, setExpandedCharge] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  const categoryColor = useMemo(
    () => new Map(categories.map((c) => [c.id, c.color])),
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

  /** כמה מהמסננים שבגיליון פעילים — מוצג כמונה על הכפתור. */
  const extraFilters = [categoryId, accountId, sourceFilter].filter((v) => v !== 'all').length;

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

  const signedAmount = (t: Transaction) => (
    <Money
      agorot={t.type === 'income' ? t.amountAgorot : -t.amountAgorot}
      signed
      className={`text-[0.9375rem] font-semibold ${t.type === 'income' ? 'text-accent' : 'text-slate-900'}`}
    />
  );

  /** פירוט הכרטיס — משותף לשתי התצוגות. */
  const cardDetailRows = (detail: CardTransaction[]) => (
    <>
      {detail.map((d) => (
        <div key={d.id} className="flex items-baseline justify-between gap-2 py-1.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-800">{d.merchant}</span>
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
            className={`text-sm font-medium ${d.isRefund ? 'text-accent' : 'text-slate-900'}`}
          />
        </div>
      ))}
      <p className="mt-1 border-t border-slate-200 pt-1.5 text-xs text-slate-500">
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

  /** שם תצוגה, או כפתור שפותח את פירוט הכרטיס. */
  const title = (t: Transaction, detail: CardTransaction[], expanded: boolean) => {
    const cardCharge = detectCardCharge(t.merchant);
    if (cardCharge && detail.length > 0) {
      return (
        <button
          type="button"
          onClick={() => setExpandedCharge(expanded ? null : t.id)}
          aria-expanded={expanded}
          className="block max-w-full text-start"
        >
          <span className="block truncate font-semibold text-slate-900">
            כרטיס {cardCharge.last4 ?? ''}
          </span>
          <span className="block text-xs font-semibold text-accent">
            {detail.length} עסקאות <span aria-hidden>{expanded ? '▲' : '▼'}</span>
          </span>
        </button>
      );
    }
    return null;
  };

  /**
   * טבלת דסקטופ.
   *
   * ⚠️ `overflow-x-auto` על העטיפה, לא על העמוד. אם הטבלה צרה מדי
   * לתוכן שלה (חלון של 1024 עם שמות ארוכים), היא גוללת בתוך עצמה —
   * ולא דוחפת את כל הדף לרוחב.
   *
   * ⚠️ שורה אחת בטבלה לכל עסקה, בלי שורות כותרת לתאריכים. יש בדיקה
   * שסופרת שורות, וקיבוץ בתוך טבלה גם שובר ניווט בקורא מסך.
   */
  const desktopTable = (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <caption className="sr-only">רשימת העסקאות, מהחדשה לישנה</caption>
          <thead>
            <tr className="border-b border-slate-200/70 bg-slate-50/80 text-start">
              <th scope="col" className="px-5 py-3 text-start text-xs font-semibold text-slate-600">
                תאריך
              </th>
              <th scope="col" className="px-5 py-3 text-start text-xs font-semibold text-slate-600">
                תיאור
              </th>
              <th scope="col" className="px-5 py-3 text-start text-xs font-semibold text-slate-600">
                קטגוריה
              </th>
              <th scope="col" className="px-5 py-3 text-start text-xs font-semibold text-slate-600">
                חשבון
              </th>
              <th scope="col" className="px-5 py-3 text-end text-xs font-semibold text-slate-600">
                סכום
              </th>
              <th scope="col" className="px-5 py-3 text-end text-xs font-semibold text-slate-600">
                <span className="sr-only">פעולות</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const detail = detailByCharge.get(t.id) ?? [];
              const isExpanded = expandedCharge === t.id;
              const color = categoryColor.get(t.categoryId);

              return (
                <Fragment key={t.id}>
                  <tr className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70">
                    <td className="px-5 py-3 align-middle text-slate-600">
                      <span className="num block font-medium text-slate-800">{formatDateHe(t.date)}</span>
                      <span className="block text-xs text-slate-500">{formatWeekdayHe(t.date)}</span>
                    </td>
                    <td className="max-w-xs px-5 py-3 align-middle">
                      <div className="flex items-center gap-3">
                        <CategoryAvatar
                          color={color}
                          label={t.merchant || categoryName.get(t.categoryId) || '?'}
                        />
                        <div className="min-w-0">
                          {title(t, detail, isExpanded) ?? (
                            <>
                              <span className="block truncate font-semibold text-slate-900">
                                {t.merchant || categoryName.get(t.categoryId) || 'ללא שם'}
                              </span>
                              {t.note ? (
                                <span className="block truncate text-xs text-slate-500">{t.note}</span>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 align-middle">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        <span
                          aria-hidden
                          className="size-1.5 rounded-full"
                          style={{ background: color ?? 'var(--color-slate-400)' }}
                        />
                        {categoryName.get(t.categoryId) ?? 'לא ידוע'}
                      </span>
                    </td>
                    <td className="px-5 py-3 align-middle text-slate-600">
                      {accountName.get(t.accountId) ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-end align-middle">{signedAmount(t)}</td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex justify-end gap-0.5">
                        <IconButton
                          icon="pencil"
                          label={`עריכת ${t.merchant || 'עסקה'}`}
                          onClick={() => setEditing(t)}
                        />
                        <IconButton
                          icon="trash"
                          tone="danger"
                          label={`מחיקת ${t.merchant || 'עסקה'}`}
                          onClick={() => void remove(t)}
                        />
                      </div>
                    </td>
                  </tr>

                  {isExpanded ? (
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <td colSpan={6} className="px-5 py-2">
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

  /**
   * ⚠️ כל יום הוא ילד ישיר של המסך, ולא כולם בתוך עטיפה אחת — כך הימים
   * עולים בזה אחר זה (`.stagger`) במקום שכל הרשימה תקפוץ בבת אחת.
   *
   * ⚠️ שם החשבון ירד מהשורה בטלפון. עם עיגול הקטגוריה הוא נחתך בכל
   * שורה; הקטגוריה חשובה יותר, והחשבון זמין בסינון ובעריכה.
   */
  const mobileList = grouped.map(([date, items]) => (
    <section key={date}>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold text-slate-900">{formatWeekdayHe(date)}</h2>
        <span className="num text-xs text-slate-500">{formatDateHe(date)}</span>
      </div>
      <div className="overflow-hidden rounded-[1.25rem] border border-slate-200/70 bg-surface elev-1">
        {items.map((t, i) => {
          const detail = detailByCharge.get(t.id) ?? [];
          const isExpanded = expandedCharge === t.id;

          return (
            <div key={t.id} className={i > 0 ? 'border-t border-slate-100' : ''}>
              <div className="flex items-center gap-3 py-3 ps-3.5 pe-1.5">
                <CategoryAvatar
                  color={categoryColor.get(t.categoryId)}
                  label={t.merchant || categoryName.get(t.categoryId) || '?'}
                />
                <div className="min-w-0 flex-1">
                  {title(t, detail, isExpanded) ?? (
                    <>
                      <p className="truncate font-semibold text-slate-900">
                        {t.merchant || categoryName.get(t.categoryId) || 'ללא שם'}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {categoryName.get(t.categoryId) ?? 'לא ידוע'}
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
                <div className="shrink-0 text-end">{signedAmount(t)}</div>
                <div className="flex shrink-0">
                  <IconButton
                    icon="pencil"
                    label={`עריכת ${t.merchant || 'עסקה'}`}
                    onClick={() => setEditing(t)}
                  />
                  <IconButton
                    icon="trash"
                    tone="danger"
                    label={`מחיקת ${t.merchant || 'עסקה'}`}
                    onClick={() => void remove(t)}
                  />
                </div>
              </div>

              {/* פירוט הכרטיס — מה באמת נקנה */}
              {isExpanded ? (
                <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2">
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
    <Page
      title="עסקאות"
      icon="receipt"
      subtitle="כל מה שנכנס ויצא, לפי תאריך"
      overlap
      {...(dashboard
        ? {
            stats: [
              { label: 'נכנס החודש', value: <AnimatedMoney agorot={dashboard.month.incomeAgorot} /> },
              { label: 'יצא החודש', value: <AnimatedMoney agorot={dashboard.month.expenseAgorot} /> },
            ],
          }
        : {})}
    >
      <FeatureCard>
        <Segmented
          ariaLabel="סינון לפי סוג"
          value={direction}
          onChange={setDirection}
          options={DIRECTION_OPTIONS}
        />

        <div className="mt-3 flex gap-2">
          <Select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="סינון לפי חודש"
            className="flex-1"
          >
            <option value="all">כל החודשים</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonthHe(m)}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => setFiltersOpen(true)} className="min-h-12 shrink-0">
            סינון
            {extraFilters > 0 ? (
              <span className="num flex size-5 items-center justify-center rounded-full bg-brand-700 text-xs text-white">
                {extraFilters}
              </span>
            ) : null}
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatTile label="עסקאות" value={<span className="num">{filtered.length}</span>} />
          <StatTile label="נכנס" dot="brand" value={<Money agorot={totals.income} />} />
          <StatTile label="יצא" dot="slate" value={<Money agorot={totals.expense} />} />
        </div>
      </FeatureCard>

      {grouped.length === 0 ? emptyState : isDesktop ? desktopTable : mobileList}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="סינון">
        <div className="space-y-4">
          <Field label="קטגוריה">
            {(id) => (
              <Select
                id={id}
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
            )}
          </Field>
          <Field label="חשבון">
            {(id) => (
              <Select
                id={id}
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
            )}
          </Field>
          <Field label="מקור">
            {(id) => (
              <Select
                id={id}
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
                aria-label="סינון לפי מקור"
              >
                <option value="all">כל המקורות</option>
                <option value="bank">בנק</option>
                <option value="cash">מזומן</option>
                <option value="card">כרטיס אשראי</option>
              </Select>
            )}
          </Field>
          <div className="flex gap-2 pt-2">
            <Button
              variant="secondary"
              full
              onClick={() => {
                setCategoryId('all');
                setAccountId('all');
                setSourceFilter('all');
              }}
            >
              איפוס
            </Button>
            <Button full onClick={() => setFiltersOpen(false)}>
              להציג <span className="num">{filtered.length}</span> עסקאות
            </Button>
          </div>
        </div>
      </Sheet>

      <TransactionForm open={editing !== null} editing={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}
