/**
 * סנכרון בין מכשירים.
 *
 * ⚠️ ארבע החלטות שמגדירות את המסך הזה:
 *
 * 1. **אין אימייל ואין סיסמאות.** המשתמש הוא היחיד עם גישה לנתונים
 *    שלו, ולכן הרשמה במובן הרגיל רק עמדה בינו לבין מה שהוא רצה. מה
 *    שהשרת באמת צריך הוא מזהה — ומזהה אפשר להגריל. קוד אחד נותן גם
 *    את הזהות וגם את מפתח ההצפנה (`data/sync/identity.ts`).
 *
 * 2. **הקוד לעולם אינו נשלח לשרת.** נשלחים רק ערכים שנגזרו ממנו
 *    חד־כיוונית, ולכן השרת לא יכול להגיע ממה שיש לו למפתח ההצפנה.
 *
 * 3. **דריסה לא קורית בלי מסך.** משיכה מציגה כמה רשומות נכנסות מול
 *    כמה יש, ומה ייווצר גיבוי. גם משיכה "בטוחה" עוברת דרך האישור הזה.
 *
 * 4. **בהתנגשות אין ברירת מחדל.** שני הכפתורים שקולים בעיצוב, ושניהם
 *    אומרים במפורש מה נמחק. כפתור ראשי אחד היה הופך בחירה להרגל.
 */

import { useCallback, useEffect, useState } from 'react';
import { Page } from '../components/layout';
import { db } from '../../data/db';
import { downloadFile } from '../download';
import { Icon } from '../components/icons';
import { useToast } from '../Toast';
import { formatDateHe } from '../../core/dates';
import { deleteRemoteVault, SyncError } from '../../data/sync/client';
import { ensureSession } from '../../data/sync/pairing';
import {
  applyPull,
  checkSync,
  preparePull,
  push,
  type PendingPull,
  type SyncStatus,
} from '../../data/sync/sync';
import { disableSync, readSyncState } from '../../data/sync/state';
import { VaultError } from '../../data/sync/vault';
import { SyncStart, PairingCodeCard } from './SyncStart';
import {
  Banner,
  Button,
  Card,
  CardTitle,
  ConfirmDialog,
  LoadingState,
  Row,
  Sheet,
} from '../components/ui';

function messageOf(error: unknown): string {
  if (error instanceof VaultError || error instanceof SyncError) return error.message;
  return 'משהו השתבש. הנתונים במכשיר לא השתנו.';
}

export function Sync() {
  const toast = useToast();

  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** ⚠️ נגזר מהקוד ולא מוקלד. המשתמש לא רואה אותו ולא צריך לראות. */
  const [passphrase, setPassphrase] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingPull | null>(null);
  const [localCount, setLocalCount] = useState(0);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmDeleteRemote, setConfirmDeleteRemote] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      // ⚠️ מנסה לחדש סשן שפג מהקוד השמור, לפני שמסיקים 'לא מחובר'.
      // אחרת המסך היה מבקש להדביק קוד שכבר שמור במכשיר.
      const session = await ensureSession(db);
      const stored = await readSyncState(db);
      setLocalCount(await db.transactions.count());

      // ⚠️ "מחובר" = גם סשן וגם מפתח. סשן בלי מפתח אינו מצב שמישהו
      // יכול לעשות איתו משהו — הוא רק ייראה תקין ויכשל בכל פעולה.
      const ready = session && stored.rememberedPassphrase !== null;
      setConnected(ready);
      setPassphrase(stored.rememberedPassphrase ?? '');
      setPairingCode(stored.pairingCode);

      setStatus(ready ? await checkSync(db) : null);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (checking && !status && !connected) return <LoadingState label="בודק מצב סנכרון…" />;

  return (
    <Page title="סנכרון" width="reading">
      {error ? <Banner tone="caution" title="לא הצלחנו" body={error} /> : null}

      {!connected ? (
        <SyncStart
          onDone={async () => {
            await refresh();
            toast({ messageHe: 'הסנכרון פעיל. מכאן זה קורה לבד.' });
          }}
        />
      ) : (
        <>
          <StatusCard
            status={status}
            localCount={localCount}
            busy={busy}
            onRefresh={refresh}
          />

          <ActionsCard
            status={status}
            passphrase={passphrase}
            busy={busy}
            localCount={localCount}
            onBusy={setBusy}
            onError={setError}
            onPending={setPending}
            onRefresh={refresh}
          />

          {pairingCode ? <PairingCodeCard code={pairingCode} /> : null}

          <Card>
            <CardTitle>כיבוי</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setConfirmDisable(true)}>
                לנתק את המכשיר הזה
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDeleteRemote(true)}>
                מחיקת העותק בענן
              </Button>
            </div>
          </Card>
        </>
      )}

      <PullSheet
        pending={pending}
        localCount={localCount}
        busy={busy}
        onClose={() => setPending(null)}
        onApply={async (p) => {
          setBusy('משחזר מהענן…');
          setError(null);
          try {
            const result = await applyPull(db, p);
            if (result.safetyBackup) {
              downloadFile(
                result.safetyBackup.content,
                result.safetyBackup.fileName,
                'application/json',
              );
            }
            setPending(null);
            await refresh();
            toast({ messageHe: `נכנסו ${result.restored} רשומות. גיבוי המצב הקודם ירד למכשיר.` });
          } catch (e) {
            setError(messageOf(e));
          } finally {
            setBusy(null);
          }
        }}
      />

      <ConfirmDialog
        open={confirmDisable}
        title="לנתק את המכשיר הזה מהסנכרון?"
        body="הנתונים כאן נשארים, והעותק בענן נשאר גם הוא. כדי לחבר מחדש תצטרך את קוד החיבור — ודא שיש לך אותו."
        confirmLabel="לנתק"
        onConfirm={async () => {
          await disableSync(db);
          setConfirmDisable(false);
          await refresh();
          toast({ messageHe: 'המכשיר נותק. הנתונים לא השתנו.' });
        }}
        onCancel={() => setConfirmDisable(false)}
      />

      <ConfirmDialog
        open={confirmDeleteRemote}
        title="למחוק את העותק בענן?"
        body="הנתונים במכשיר הזה נשארים. מכשירים אחרים שטרם סנכרנו לא יוכלו לקבל אותם יותר. אין ביטול."
        confirmLabel="למחוק מהענן"
        destructive
        onConfirm={async () => {
          try {
            await deleteRemoteVault();
            await disableSync(db);
            setConfirmDeleteRemote(false);
            await refresh();
            toast({ messageHe: 'העותק בענן נמחק. המכשיר לא נגע.' });
          } catch (e) {
            setError(messageOf(e));
            setConfirmDeleteRemote(false);
          }
        }}
        onCancel={() => setConfirmDeleteRemote(false)}
      />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// מצב
// ---------------------------------------------------------------------------

const ACTION_LABEL: Record<string, { title: string; icon: 'cloud-check' | 'cloud' | 'refresh' | 'git-merge' | 'cloud-off' }> = {
  in_sync: { title: 'מסונכרן', icon: 'cloud-check' },
  push: { title: 'יש שינויים להעלות', icon: 'cloud' },
  push_initial: { title: 'עוד לא הועלה כלום', icon: 'cloud' },
  pull: { title: 'יש עדכון בענן', icon: 'refresh' },
  pull_initial: { title: 'יש נתונים בענן', icon: 'refresh' },
  conflict: { title: 'התנגשות — צריך להכריע', icon: 'git-merge' },
  nothing: { title: 'אין מה לסנכרן', icon: 'cloud-off' },
};

function StatusCard({
  status,
  localCount,
  busy,
  onRefresh,
}: {
  status: SyncStatus | null;
  localCount: number;
  busy: string | null;
  onRefresh: () => Promise<void>;
}) {
  const action = status?.decision.action ?? 'nothing';
  const label = ACTION_LABEL[action] ?? ACTION_LABEL.nothing!;

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Icon name={label.icon} className="mt-0.5 size-6 text-slate-500" />
        <div className="flex-1">
          <p className="text-base font-semibold text-slate-800">{label.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            {status?.decision.reasonHe ?? 'בודק…'}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <Row label="עסקאות במכשיר">
          <span className="num">{localCount}</span>
        </Row>
        <Row label="סונכרן לאחרונה">
          {status?.lastSyncedAt ? formatDateHe(status.lastSyncedAt.slice(0, 10)) : 'עוד לא'}
        </Row>
      </div>

      <Button variant="ghost" className="mt-3" disabled={Boolean(busy)} onClick={() => void onRefresh()}>
        בדיקה מחדש
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// פעולות
// ---------------------------------------------------------------------------

function ActionsCard({
  status,
  passphrase,
  busy,
  localCount,
  onBusy,
  onError,
  onPending,
  onRefresh,
}: {
  status: SyncStatus | null;
  passphrase: string;
  busy: string | null;
  localCount: number;
  onBusy: (v: string | null) => void;
  onError: (v: string | null) => void;
  onPending: (p: PendingPull) => void;
  onRefresh: () => Promise<void>;
}) {
  const toast = useToast();
  // ⚠️ המפתח נגזר מקוד החיבור, ולכן אם הגענו לכאן הוא קיים. אין
  // יותר מצב של "מחובר אבל בלי מפתח" שדרש הקלדה.
  const ready = passphrase !== '' && !busy;
  const action = status?.decision.action ?? 'nothing';

  async function doPush() {
    onBusy('מצפין ומעלה…');
    onError(null);
    try {
      const result = await push(db, passphrase, { deviceLabel: deviceLabel() });
      await onRefresh();
      toast({ messageHe: `הועלו ${result.totalRecords} רשומות, מוצפנות.` });
    } catch (e) {
      onError(messageOf(e));
    } finally {
      onBusy(null);
    }
  }

  async function doPull() {
    onBusy('מוריד ומפענח…');
    onError(null);
    try {
      onPending(await preparePull(passphrase));
    } catch (e) {
      onError(messageOf(e));
    } finally {
      onBusy(null);
    }
  }

  if (action === 'conflict') {
    return (
      <Card>
        <CardTitle>שני הצדדים השתנו</CardTitle>
        <p className="text-sm leading-relaxed text-slate-600">
          גם כאן וגם בענן נכנסו שינויים מאז הסנכרון האחרון. אי אפשר למזג אותם, ולכן צריך לבחור צד
          — והצד השני יימחק. אנחנו לא בוחרים במקומך.
        </p>

        <div className="mt-4 space-y-2">
          <Button variant="secondary" full disabled={!ready} onClick={() => void doPush()}>
            לשמור את מה שבמכשיר ({localCount} עסקאות) ולדרוס את הענן
          </Button>
          <Button variant="secondary" full disabled={!ready} onClick={() => void doPull()}>
            לקחת את מה שבענן ולדרוס את המכשיר
          </Button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          בשתי האפשרויות יירד קודם גיבוי של מה שעומד להימחק. לפני ההחלטה אפשר גם לראות מה יש בענן
          — הכפתור השני מציג תצוגה מקדימה לפני שהוא כותב.
        </p>

        {!ready ? <p className="mt-2 text-xs text-slate-500">צריך להזין את סיסמת ההצפנה.</p> : null}
      </Card>
    );
  }

  const canPush = action === 'push' || action === 'push_initial';
  const canPull = action === 'pull' || action === 'pull_initial';

  return (
    <Card>
      <CardTitle>פעולות</CardTitle>

      {busy ? <p className="text-sm text-slate-600">{busy}</p> : null}

      <div className="space-y-2">
        <Button full disabled={!ready} onClick={() => void doPush()}>
          {canPush ? 'להעלות לענן' : 'להעלות שוב'}
        </Button>
        <Button variant="secondary" full disabled={!ready} onClick={() => void doPull()}>
          {canPull ? 'להוריד מהענן' : 'לראות מה יש בענן'}
        </Button>
      </div>

      {!ready && !busy ? (
        <p className="mt-2 text-xs text-slate-500">צריך להזין את סיסמת ההצפנה קודם.</p>
      ) : null}
    </Card>
  );
}

/**
 * תווית מכשיר לתצוגה בלבד ("סונכרן מ…").
 *
 * ⚠️ בכוונה גסה — "טלפון" או "מחשב" ולא דגם, מערכת הפעלה או מזהה.
 * שדה חופשי מה-User-Agent היה הופך את השורה הזו לטביעת אצבע.
 */
function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'מכשיר';
  return /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'טלפון' : 'מחשב';
}

// ---------------------------------------------------------------------------
// אישור משיכה
// ---------------------------------------------------------------------------

function PullSheet({
  pending,
  localCount,
  busy,
  onClose,
  onApply,
}: {
  pending: PendingPull | null;
  localCount: number;
  busy: string | null;
  onClose: () => void;
  onApply: (p: PendingPull) => Promise<void>;
}) {
  if (!pending) return null;
  const incoming = pending.counts.transactions ?? 0;

  return (
    <Sheet open onClose={onClose} title="מה עומד להיכנס">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-600">
          הנתונים מהענן פוענחו בהצלחה. הם עדיין לא נכתבו — זה המסך שלפני.
        </p>

        <Card>
          <Row label="עסקאות בענן">
            <span className="num">{incoming}</span>
          </Row>
          <Row label="עסקאות כאן עכשיו">
            <span className="num">{localCount}</span>
          </Row>
          <Row label="סה״כ רשומות">
            <span className="num">{pending.totalRecords}</span>
          </Row>
          {pending.deviceLabel ? <Row label="הועלה מ־">{pending.deviceLabel}</Row> : null}
        </Card>

        {incoming < localCount ? (
          <Banner
            tone="caution"
            title={`בענן פחות עסקאות מכאן (${incoming} מול ${localCount})`}
            body="אם זה לא מה שציפית — עדיף לעצור, לגבות, ולבדוק. אחרי הכתיבה ההפרש הזה נמחק."
          />
        ) : null}

        <p className="text-xs leading-relaxed text-slate-500">
          לפני הכתיבה יירד אוטומטית קובץ גיבוי של המצב הנוכחי.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button disabled={Boolean(busy)} onClick={() => void onApply(pending)}>
            {busy ?? 'להחליף את הנתונים כאן'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

export { readSyncState };
