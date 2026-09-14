/**
 * הוספה ועריכה של עסקה.
 *
 * שלושה שדות חובה בלבד: סכום, סוג, קטגוריה. תאריך והחשבון מגיעים
 * עם ברירת מחדל, וכל השאר מוסתר מאחורי "פרטים נוספים".
 * המטרה: עסקה רגילה מהטלפון בכמה שניות, בזמן שיוצאים מהחנות.
 *
 * ⚠️ **v3 — אותה שפה כמו לוח הבקרה.** הסוג בבקרה עם מחוון שגולש, הסכום
 * בפאנל משלו, והקטגוריות הראשונות כגלולות לבחירה בלחיצה אחת. הרשימה
 * הנפתחת נשארת — היא השדה עם התווית "קטגוריה", ויש בה את כל השאר.
 */

import { useEffect, useMemo, useState } from 'react';
import { fromShekels, toShekels } from '../../core/money';
import { todayInIsrael } from '../../core/dates';
import { db } from '../../data/db';
import { isSelectableForManualEntry } from '../../content/categories.seed';
import { addTransaction, restoreTransaction, updateTransaction } from '../../data/repositories';
import { useAppData } from '../AppData';
import { useToast } from '../Toast';
import type { Transaction, TransactionType } from '../../core/types';
import { AmountInput, Button, Field, Select, Sheet, TextInput } from '../components/ui';
import { Segmented, Switch } from '../components/premium';
import { Icon } from '../components/icons';

/** כמה קטגוריות מוצגות כגלולות. יותר מזה כבר גולש לשלוש שורות בטלפון. */
const QUICK_CATEGORIES = 6;

export interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  restoreFocusTo?: HTMLElement | null;
  /** כשמסופקת — הטופס במצב עריכה. */
  editing?: Transaction | null;
}

export function TransactionForm({ open, onClose, restoreFocusTo, editing }: TransactionFormProps) {
  const { snapshot } = useAppData();
  const toast = useToast();
  const today = snapshot?.today ?? todayInIsrael(new Date());

  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(today);
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [planned, setPlanned] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categories = useMemo(
    () =>
      (snapshot?.categories ?? []).filter(
        (c) => !c.archivedAt && c.kind === type && isSelectableForManualEntry(c),
      ),
    [snapshot?.categories, type],
  );

  // איפוס בכל פתיחה, כדי שהטופס לא יזכור הזנה קודמת שנזנחה.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setShowMore(false);
    if (editing) {
      setAmount(String(toShekels(editing.amountAgorot)));
      setType(editing.type);
      setCategoryId(editing.categoryId);
      setAccountId(editing.accountId);
      setDate(editing.date);
      setMerchant(editing.merchant);
      setNote(editing.note ?? '');
      setPaymentMethod(editing.paymentMethod);
      setPlanned(editing.planned);
    } else {
      setAmount('');
      setType('expense');
      setCategoryId('');
      setAccountId(snapshot?.settings.lastAccountId ?? snapshot?.accounts[0]?.id ?? '');
      setDate(today);
      setMerchant('');
      setNote('');
      setPaymentMethod('');
      setPlanned(false);
    }
  }, [open, editing, snapshot?.settings.lastAccountId, snapshot?.accounts, today]);

  // קטגוריה שנבחרה מסוג אחר כבר לא תקפה אחרי החלפת הכיוון.
  useEffect(() => {
    if (categoryId && !categories.some((c) => c.id === categoryId)) setCategoryId('');
  }, [categories, categoryId]);

  async function submit() {
    const parsed = Number(amount.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('צריך להזין סכום גדול מאפס.');
      return;
    }
    if (!categoryId) {
      setError('צריך לבחור קטגוריה.');
      return;
    }
    if (!accountId) {
      setError('צריך לבחור חשבון.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        accountId,
        date,
        amountAgorot: fromShekels(parsed),
        type,
        categoryId,
        merchant,
        note,
        paymentMethod,
        planned,
      };
      if (editing) {
        // הרשומה המקורית נשמרת לפני הכתיבה — היא הביטול.
        const before = editing;
        await updateTransaction(db, editing.id, payload);
        toast({
          messageHe:
            before.categoryId === categoryId ? 'העסקה עודכנה.' : 'הקטגוריה של העסקה שונתה.',
          undo: () => restoreTransaction(db, before),
        });
      } else {
        await addTransaction(db, payload);
      }
      onClose();
    } catch {
      setError('לא הצלחנו לשמור. אפשר לנסות שוב.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'עריכת עסקה' : 'עסקה חדשה'}
      {...(restoreFocusTo !== undefined ? { restoreFocusTo } : {})}
    >
      <div className="space-y-4">
        {/* סוג — קודם, כי הוא קובע אילו קטגוריות יוצגו */}
        <Segmented
          ariaLabel="סוג העסקה"
          value={type}
          onChange={setType}
          options={[
            { value: 'expense', label: 'הוצאה' },
            { value: 'income', label: 'הכנסה' },
          ]}
        />

        <div className="rounded-[1.25rem] bg-slate-50 p-4">
          <Field label="סכום">
            {(id) => (
              <AmountInput
                id={id}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            )}
          </Field>
        </div>

        <div className="space-y-2.5">
          <Field label="קטגוריה">
            {(id) => (
              <Select id={id} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">בחר קטגוריה…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {categories.length > 0 ? (
            <div role="group" aria-label="בחירה מהירה" className="flex flex-wrap gap-2">
              {categories.slice(0, QUICK_CATEGORIES).map((c) => {
                const chosen = categoryId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => setCategoryId(c.id)}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition active:scale-95 ${
                      chosen
                        ? 'border-brand-700 bg-brand-50 text-accent-strong'
                        : 'border-slate-200 bg-surface text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="flex min-h-11 items-center gap-1.5 text-start text-sm font-semibold text-accent"
          aria-expanded={showMore}
        >
          {showMore ? 'פחות פרטים' : 'פרטים נוספים'}
          <Icon
            name="chevron-down"
            className={`size-4 transition-transform duration-300 ${showMore ? 'rotate-180' : ''}`}
          />
        </button>

        {showMore ? (
          // ⚠️ שתי עמודות רק מ-`sm`. בטלפון שדה חצי-רוחב הוא שדה
          // שמקלדת מכסה וקשה לכוון אליו.
          <div className="grid animate-fade-in gap-4 rounded-[1.25rem] bg-slate-50 p-4 sm:grid-cols-2">
            <Field label="תאריך">
              {(id) => (
                <TextInput
                  id={id}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              )}
            </Field>
            <Field label="חשבון">
              {(id) => (
                <Select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {(snapshot?.accounts ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="איפה?">
              {(id) => (
                <TextInput
                  id={id}
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  placeholder="שם המקום"
                />
              )}
            </Field>
            <Field label="אמצעי תשלום">
              {(id) => (
                <TextInput
                  id={id}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  placeholder="אשראי / מזומן / העברה"
                />
              )}
            </Field>
            <Field label="הערה">
              {(id) => (
                <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />
              )}
            </Field>
            <div className="sm:col-span-2">
              <Switch label="זו הוצאה שתכננתי מראש" checked={planned} onChange={setPlanned} />
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}

        <Button full onClick={submit} disabled={saving}>
          {saving ? 'שומר…' : editing ? 'לשמור שינויים' : 'להוסיף'}
        </Button>
      </div>
    </Sheet>
  );
}
