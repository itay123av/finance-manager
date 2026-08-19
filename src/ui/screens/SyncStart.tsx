/**
 * הפעלת סנכרון וחיבור מכשיר — המסך שהחליף אימייל וסיסמאות.
 *
 * ⚠️ למה זה נראה כך:
 *
 * המשתמש הוא היחיד עם גישה לנתונים שלו, ולכן "הרשמה" במובן הרגיל
 * לא נותנת לו כלום — היא רק שלוש שדות בין מה שהוא רוצה לבין מה
 * שהוא מקבל. מה שהשרת באמת צריך זה **מזהה**, ומזהה אפשר להגריל.
 *
 * לכן: במכשיר הראשון אין שום הקלדה. במכשיר השני מקלידים דבר אחד,
 * פעם אחת בחיים.
 *
 * ⚠️ הקוד שמוצג כאן הוא גם המפתח לנתונים. לכן הוא מוצג עם אזהרה
 * ולא כמו "קוד הזמנה" חביב — מי שמעביר אותו הלאה מעביר גישה מלאה.
 */

import { useState } from 'react';
import { db } from '../../data/db';
import { formatPairingCode, isValidPairingCode } from '../../core/pairingCode';
import { connectWithCode, PairingError, startSync } from '../../data/sync/pairing';
import { SyncError } from '../../data/sync/client';
import { Banner, Button, Card, CardTitle, Field, TextInput } from '../components/ui';

function messageOf(error: unknown): string {
  if (error instanceof PairingError || error instanceof SyncError) return error.message;
  return 'לא הצלחנו להתחבר. בדוק חיבור לאינטרנט ונסה שוב.';
}

export function SyncStart({ onDone }: { onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [code, setCode] = useState('');

  async function begin() {
    if (busy) return;
    setBusy('מפעיל סנכרון…');
    setProblem(null);
    try {
      await startSync(db);
      await onDone();
    } catch (e) {
      setProblem(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  async function connect() {
    if (busy) return;
    setBusy('מחבר את המכשיר…');
    setProblem(null);
    try {
      await connectWithCode(db, code);
      await onDone();
    } catch (e) {
      setProblem(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Card>
        <CardTitle>מה זה נותן</CardTitle>
        <p className="text-sm leading-relaxed text-slate-600">
          אותם נתונים בטלפון ובמחשב, וגיבוי שלא תלוי במכשיר אחד. מה שנשלח הוא בלוב אחד מוצפן —
          לשרת אין את המפתח, ומי שיסתכל שם יראה רצף תווים חסר משמעות.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          אין הרשמה, אין אימייל ואין סיסמה. במכשיר הזה לא צריך להקליד כלום.
        </p>
      </Card>

      {problem ? <Banner tone="caution" title="לא הצלחנו" body={problem} /> : null}

      {!connecting ? (
        <Card>
          <CardTitle>להפעיל כאן</CardTitle>
          <p className="text-sm leading-relaxed text-slate-600">
            המכשיר הזה יהפוך למקור. אחר כך תוכל לחבר אליו את הטלפון בעזרת קוד קצר.
          </p>
          <div className="mt-4 space-y-2">
            <Button full disabled={Boolean(busy)} onClick={() => void begin()}>
              {busy ?? 'להפעיל סנכרון'}
            </Button>
            <Button variant="ghost" full disabled={Boolean(busy)} onClick={() => setConnecting(true)}>
              כבר הפעלתי במכשיר אחר — יש לי קוד
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <CardTitle>חיבור לקוד קיים</CardTitle>
          <Field
            label="קוד חיבור"
            hint="מופיע במסך הסנכרון של המכשיר שבו הפעלת. מקפים ואותיות קטנות לא משנים."
          >
            {(id) => (
              <TextInput
                id={id}
                dir="ltr"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="text-center font-mono tracking-widest"
              />
            )}
          </Field>

          <div className="mt-4 space-y-2">
            <Button
              full
              disabled={Boolean(busy) || !isValidPairingCode(code)}
              onClick={() => void connect()}
            >
              {busy ?? 'לחבר את המכשיר'}
            </Button>
            <Button variant="ghost" full disabled={Boolean(busy)} onClick={() => setConnecting(false)}>
              חזרה
            </Button>
          </div>

          {code !== '' && !isValidPairingCode(code) ? (
            <p className="mt-2 text-xs text-slate-500">הקוד מכיל 16 תווים. עדיין חסרים כמה.</p>
          ) : null}
        </Card>
      )}
    </>
  );
}

/**
 * מציג את הקוד לחיבור מכשיר נוסף.
 *
 * ⚠️ מוסתר כברירת מחדל. הקוד הזה שווה ערך לגישה מלאה לנתונים, ואין
 * סיבה שהוא ישב גלוי על המסך כשחבר מסתכל או כשמשתפים מסך.
 */
export function PairingCodeCard({ code }: { code: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <Card>
      <CardTitle>לחבר מכשיר נוסף</CardTitle>
      <p className="text-sm leading-relaxed text-slate-600">
        בטלפון: פתח את אותה כתובת ← סנכרון ← "יש לי קוד", והקלד את הקוד הזה.
      </p>

      {shown ? (
        <p className="num mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center font-mono text-lg tracking-widest text-slate-900">
          {formatPairingCode(code)}
        </p>
      ) : (
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-sm text-slate-500">
          הקוד מוסתר
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setShown(!shown)}>
          {shown ? 'להסתיר' : 'להציג את הקוד'}
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(formatPairingCode(code));
            setCopied(true);
          }}
        >
          {copied ? 'הועתק' : 'להעתיק'}
        </Button>
      </div>

      <div className="mt-4 rounded-xl border border-caution-300 bg-caution-100/40 p-3">
        <p className="text-sm font-semibold text-slate-800">הקוד הזה הוא המפתח לנתונים</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          מי שמקבל אותו יכול לראות את כל ההיסטוריה הפיננסית שלך. אל תשלח אותו בצ׳אט ואל תצלם
          אותו. ואם תאבד אותו יחד עם כל המכשירים — הנתונים בענן אבודים, כי אין דרך לאפס אותו.
        </p>
      </div>
    </Card>
  );
}
