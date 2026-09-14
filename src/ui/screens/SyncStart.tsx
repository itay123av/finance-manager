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
 *
 * ⚠️ **v3 — אותה שפה כמו לוח הבקרה.** "מה זה נותן" הוא הכרטיס שעולה על
 * הבאנר, עם שלושה אריחים. הקוד מוצג במסגרת מקווקוות, והאזהרה שלצידו
 * נשארת בולטת.
 */

import { useState } from 'react';
import { db } from '../../data/db';
import { formatPairingCode, isValidPairingCode } from '../../core/pairingCode';
import { connectWithCode, PairingError, startSync } from '../../data/sync/pairing';
import { SyncError } from '../../data/sync/client';
import { Banner, Button, Card, CardTitle, Field, Medallion, TextInput } from '../components/ui';
import { FeatureCard } from '../components/premium';
import { Icon, type IconName } from '../components/icons';

const PERKS: { icon: IconName; title: string; note: string }[] = [
  { icon: 'lock', title: 'מוצפן אצלך', note: 'לשרת אין את המפתח' },
  { icon: 'refresh', title: 'קורה לבד', note: 'כל שינוי עולה מעצמו' },
  { icon: 'laptop', title: 'טלפון ומחשב', note: 'אותם נתונים בשניהם' },
];

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
      <FeatureCard>
        <CardTitle icon="cloud" iconTone="brand">
          מה זה נותן
        </CardTitle>
        <p className="text-sm leading-relaxed text-slate-600">
          אותם נתונים בטלפון ובמחשב, וגיבוי שלא תלוי במכשיר אחד. מה שנשלח הוא בלוב אחד מוצפן —
          לשרת אין את המפתח, ומי שיסתכל שם יראה רצף תווים חסר משמעות.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          אין הרשמה, אין אימייל ואין סיסמה. במכשיר הזה לא צריך להקליד כלום.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {PERKS.map((perk) => (
            <div
              key={perk.title}
              className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 sm:flex-col sm:items-start"
            >
              <Medallion icon={perk.icon} tone="brand" className="size-9" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{perk.title}</p>
                <p className="text-xs text-slate-600">{perk.note}</p>
              </div>
            </div>
          ))}
        </div>
      </FeatureCard>

      {problem ? <Banner tone="caution" title="לא הצלחנו" body={problem} /> : null}

      {!connecting ? (
        <Card>
          <CardTitle icon="sparkles">להפעיל כאן</CardTitle>
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
          <CardTitle icon="keyboard">חיבור לקוד קיים</CardTitle>
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
                className="text-center font-mono text-lg tracking-widest"
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
            <p className="mt-2 text-xs text-slate-600">הקוד מכיל 16 תווים. עדיין חסרים כמה.</p>
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
      <CardTitle icon="laptop" iconTone="brand">
        לחבר מכשיר נוסף
      </CardTitle>
      <p className="text-sm leading-relaxed text-slate-600">
        בטלפון: פתח את אותה כתובת ← סנכרון ← "יש לי קוד", והקלד את הקוד הזה.
      </p>

      {shown ? (
        <p className="num mt-4 rounded-2xl border-2 border-dashed border-brand-500/50 bg-brand-50/50 p-5 text-center font-mono text-xl font-semibold tracking-widest text-slate-900">
          {formatPairingCode(code)}
        </p>
      ) : (
        <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-600">
          <Icon name="eye-off" className="size-4" />
          הקוד מוסתר
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setShown(!shown)}>
          <Icon name={shown ? 'eye-off' : 'eye'} className="size-4" />
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

      <div className="mt-4 flex gap-3 rounded-2xl border border-caution-300/60 bg-caution-100/40 p-4">
        <Icon name="alert-triangle" className="mt-0.5 size-5 shrink-0 text-caution-600" />
        <div>
          <p className="text-sm font-semibold text-slate-800">הקוד הזה הוא המפתח לנתונים</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            מי שמקבל אותו יכול לראות את כל ההיסטוריה הפיננסית שלך. אל תשלח אותו בצ׳אט ואל תצלם
            אותו. ואם תאבד אותו יחד עם כל המכשירים — הנתונים בענן אבודים, כי אין דרך לאפס אותו.
          </p>
        </div>
      </div>
    </Card>
  );
}
