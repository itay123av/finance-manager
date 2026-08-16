/**
 * הוספה ועריכה של עסקה.
 *
 * שלושה שדות חובה בלבד: סכום, סוג, קטגוריה. תאריך והחשבון מגיעים
 * עם ברירת מחדל, וכל השאר מוסתר מאחורי "פרטים נוספים".
 * המטרה: עסקה רגילה מהטלפון בכמה שניות, בזמן שיוצאים מהחנות.
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
        <div role="radiogroup" aria-label="סוג העסקה" className="flex gap-2">
          {(
            [
              { value: 'expense', label: 'הוצאה' },
              { value: 'income', label: 'הכנסה' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={type === option.value}
              onClick={() => setType(option.value)}
              className={`min-h-11 flex-1 rounded-xl border text-sm font-semibold transition ${
                type === option.value
                  ? 'border-brand-700 bg-brand-50 text-accent-strong'
                  : 'border-slate-300 bg-surface text-slate-600'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

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

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="min-h-11 text-start text-sm font-semibold text-accent"
          aria-expanded={showMore}
        >
          {showMore ? 'פחות פרטים' : 'פרטים נוספים'}
        </button>

        {showMore ? (
          // ⚠️ שתי עמודות רק מ-`sm`. בטלפון שדה חצי-רוחב הוא שדה
          // שמקלדת מכסה וקשה לכוון אליו.
          <div className="grid gap-4 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
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
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={planned}
                onChange={(e) => setPlanned(e.target.checked)}
                className="size-4"
              />
              זו הוצאה שתכננתי מראש
            </label>
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
