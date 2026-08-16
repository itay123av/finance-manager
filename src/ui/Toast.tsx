/**
 * הודעה קצרה, ובתוכה ביטול.
 *
 * ⚠️ למה בכלל Undo ולא דיאלוג אישור לפני כל מחיקה?
 *
 * דיאלוג "בטוח?" על כל פעולה נלמד תוך יומיים כמסך שצריך ללחוץ עליו
 * "כן", והוא מפסיק להגן. Undo אחרי הפעולה עולה למשתמש אפס קליקים
 * כשהוא צודק, ומציל אותו כשהוא טעה. לכן:
 *
 * - מחיקת עסקה, שינוי קטגוריה, הסתרת תובנה → Undo.
 * - מחיקת כל הנתונים, שחזור מגיבוי → אישור חזק, בלי Undo.
 *
 * הביטול מקבל את הפעולה ההופכית כפונקציה. אם היא נכשלת, ההודעה
 * אומרת זאת ולא מעמידה פנים שהמצב חזר לקדמותו.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const TOAST_MS = 7000;

interface ToastRequest {
  messageHe: string;
  /** כשמסופק — מוצג כפתור "ביטול" שמריץ אותו. */
  undo?: () => Promise<void> | void;
}

interface ToastState extends ToastRequest {
  id: number;
}

const ToastContext = createContext<((request: ToastRequest) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [failed, setFailed] = useState(false);
  const nextId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((request: ToastRequest) => {
    setFailed(false);
    setToast({ ...request, id: nextId.current++ });
  }, []);

  useEffect(() => {
    if (!toast) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-24 z-50 mx-auto flex w-[min(28rem,calc(100%-2rem))] items-center justify-between gap-3 rounded-2xl bg-inverse px-4 py-3 text-sm text-on-inverse shadow-lg"
        >
          <span>{failed ? 'הביטול לא הצליח. שום דבר לא השתנה בגללו.' : toast.messageHe}</span>
          {toast.undo && !failed ? (
            <button
              type="button"
              className="min-h-11 shrink-0 rounded-lg px-3 font-bold text-accent-on-inverse underline"
              onClick={async () => {
                try {
                  await toast.undo?.();
                  setToast(null);
                } catch {
                  // ⚠️ בלי פרטים טכניים ובלי סכומים — זו הודעה למשתמש.
                  setFailed(true);
                }
              }}
            >
              ביטול
            </button>
          ) : null}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): (request: ToastRequest) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast חייב לרוץ בתוך ToastProvider');
  return show;
}
