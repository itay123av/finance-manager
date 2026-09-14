/**
 * גיבוי ושחזור.
 *
 * ⚠️ שלוש החלטות שמגדירות את המסך הזה:
 *
 * 1. **הצפנה היא ברירת המחדל.** קובץ גיבוי לא מוצפן הוא כל ההיסטוריה
 *    הפיננסית בטקסט קריא, והוא נועד לצאת מהמכשיר — ל-Drive, לאימייל,
 *    לכונן. שם הוא כבר לא מוגן בכלום. ייצוא בלי הצפנה עדיין אפשרי,
 *    אבל הוא הבחירה שצריך לבחור, לא זו שקורית מעצמה.
 *
 * 2. **שחזור לא מתחיל לפני שרואים מה בפנים.** תאריך, מספר עסקאות,
 *    מספר חשבונות וגרסת סכמה — ורק אז כפתור. שחזור הוא דריסה מלאה,
 *    ואי אפשר לאשר דריסה בלי לדעת במה מחליפים.
 *
 * 3. **גיבוי אוטומטי לפני דריסה.** ברירת המחדל היא לשמור את המצב
 *    הנוכחי לקובץ לפני השחזור. אם התברר שזה היה הגיבוי הלא נכון —
 *    יש לאן לחזור.
 *
 * ⚠️ **v3 — אותה שפה כמו לוח הבקרה.** מצב הגיבוי הוא הכרטיס שעולה על
 * הבאנר: מתי גובה לאחרונה ומה ייכנס לקובץ. שחזור וייצוא לגיליון הם שני
 * כרטיסים זה לצד זה, וסוג הגיבוי נבחר מכרטיסים.
 */

import { Page } from '../components/layout';
import { useRef, useState } from 'react';
import { useAppData } from '../AppData';
import { db } from '../../data/db';
import { saveSettings } from '../../data/repositories';
import { downloadFile } from '../download';
import {
  BackupError,
  createBackup,
  previewBackup,
  restoreFromText,
  type BackupPreview,
} from '../../data/backup';
import { csvFileName, transactionsToCsv } from '../../data/csvExport';
import { formatDateHe } from '../../core/dates';
import { Icon } from '../components/icons';
import {
  Banner,
  Button,
  Card,
  CardTitle,
  Field,
  LoadingState,
  Medallion,
  ProgressState,
  Row,
  Sheet,
  TextInput,
} from '../components/ui';
import { BigNumber, ChoiceCard, FeatureCard, Pill, StatTile, Switch } from '../components/premium';

type ExportMode = 'encrypted' | 'plain';

export function Backup() {
  const { snapshot, loading } = useAppData();
  const fileInput = useRef<HTMLInputElement>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [exportSheet, setExportSheet] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>('encrypted');
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');

  const [restoreText, setRestoreText] = useState<string | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [backupFirst, setBackupFirst] = useState(true);

  if (loading || !snapshot) return <LoadingState />;

  const hasData = snapshot.transactions.length > 0;
  const lastBackup = snapshot.lastBackupDate;
  const passwordProblem =
    exportMode === 'plain'
      ? null
      : password.length < 6
        ? 'סיסמה של פחות משש תווים לא מגינה על הרבה.'
        : password !== passwordAgain
          ? 'שתי הסיסמאות לא זהות.'
          : null;

  function closeExport() {
    setExportSheet(false);
    setPassword('');
    setPasswordAgain('');
  }

  function closeRestore() {
    setRestoreText(null);
    setPreview(null);
    setNeedsPassword(false);
    setRestorePassword('');
  }

  async function doExport() {
    if (busy) return; // מונע לחיצה כפולה שמייצרת שני קבצים ושתי רשומות
    setBusy('מייצר גיבוי…');
    setError(null);
    try {
      const now = new Date();
      const { content, fileName } = await createBackup(db, {
        ...(exportMode === 'encrypted' ? { password } : {}),
        reason: 'manual',
        now,
      });
      downloadFile(content, fileName, 'application/json');
      await saveSettings(db, { lastBackupAt: now.toISOString() });
      setNotice(
        exportMode === 'encrypted'
          ? 'הגיבוי המוצפן ירד למכשיר. בלי הסיסמה אי אפשר לפתוח אותו — גם לא כאן.'
          : 'הגיבוי ירד למכשיר. הוא לא מוצפן, אז כדאי לשמור אותו במקום בטוח.',
      );
      closeExport();
    } catch {
      setError('לא הצלחנו לייצר גיבוי. הנתונים לא השתנו.');
    } finally {
      setBusy(null);
    }
  }

  async function doExportCsv() {
    if (busy) return;
    setBusy('מייצר קובץ…');
    setError(null);
    try {
      downloadFile(
        transactionsToCsv({
          transactions: snapshot!.transactions,
          categories: snapshot!.categories,
        }),
        csvFileName(),
        'text/csv',
      );
      setNotice('קובץ העסקאות ירד. הוא לקריאה בלבד — לשחזור צריך את הגיבוי המלא.');
    } catch {
      setError('לא הצלחנו לייצר את הקובץ.');
    } finally {
      setBusy(null);
    }
  }

  async function onFileChosen(file: File) {
    setError(null);
    setPreview(null);
    setNeedsPassword(false);
    const text = await file.text();
    setRestoreText(text);
    try {
      setPreview(await previewBackup(text));
    } catch (e) {
      if (e instanceof BackupError && e.reason === 'bad_password') setNeedsPassword(true);
      else setError(e instanceof BackupError ? e.message : 'לא הצלחנו לקרוא את הקובץ.');
    }
  }

  async function tryPassword() {
    if (!restoreText) return;
    setError(null);
    try {
      setPreview(await previewBackup(restoreText, restorePassword));
      setNeedsPassword(false);
    } catch (e) {
      setError(e instanceof BackupError ? e.message : 'לא הצלחנו לקרוא את הקובץ.');
    }
  }

  async function doRestore() {
    if (!restoreText || busy) return;
    setError(null);
    try {
      if (backupFirst && hasData) {
        setBusy('מגבה את המצב הנוכחי…');
        const now = new Date();
        const { content, fileName } = await createBackup(db, { reason: 'pre_restore', now });
        downloadFile(content, fileName, 'application/json');
      }
      setBusy('משחזר…');
      const { restored } = await restoreFromText(db, restoreText, restorePassword || undefined);
      setNotice(`שוחזרו ${restored} רשומות.`);
      closeRestore();
    } catch (e) {
      setError(
        e instanceof BackupError ? e.message : 'השחזור נכשל. הנתונים הקיימים לא השתנו.',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Page
      title="גיבוי ושחזור"
      icon="save"
      subtitle="ההגנה היחידה מאובדן המכשיר"
      width="reading"
      overlap
    >
      {/* ── ⭐ מצב הגיבוי ─────────────────────────────────────── */}
      <FeatureCard>
        <CardTitle
          icon="save"
          iconTone="brand"
          hint="בארכיטקטורה מקומית, אובדן המכשיר הוא הסיכון האמיתי היחיד. הגיבוי הוא ההגנה."
        >
          גיבוי
        </CardTitle>

        <div className="flex items-center gap-4">
          <Medallion
            icon={lastBackup ? 'shield-check' : 'alert-triangle'}
            tone={lastBackup ? 'brand' : 'caution'}
            className="size-14"
            iconClassName="size-7"
          />
          <div className="min-w-0">
            <p className="text-xs text-slate-600">
              {lastBackup ? 'הגיבוי האחרון' : 'עוד לא יצרת גיבוי.'}
            </p>
            {lastBackup ? (
              <div className="mt-1.5">
                <BigNumber size="md">{formatDateHe(lastBackup)}</BigNumber>
              </div>
            ) : (
              <p className="mt-1 text-lg font-semibold text-slate-900">כדאי לגבות עכשיו</p>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <StatTile
            label="עסקאות"
            dot="brand"
            value={<span className="num">{snapshot.transactions.length}</span>}
          />
          <StatTile label="חשבונות" value={<span className="num">{snapshot.accounts.length}</span>} />
          <StatTile
            label="קטגוריות"
            value={<span className="num">{snapshot.categories.length}</span>}
          />
        </div>

        <Button
          full
          className="mt-4"
          onClick={() => {
            setExportMode('encrypted');
            setExportSheet(true);
          }}
          disabled={busy !== null}
        >
          <Icon name="download" className="size-[1.125rem]" />
          לגבות עכשיו
        </Button>

        <div className="mt-3 flex flex-wrap gap-2">
          <Pill tone="brand" icon="lock">
            מוצפן כברירת מחדל
          </Pill>
          <Pill icon="save">הקובץ נשאר אצלך</Pill>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          הגיבוי כולל את כל העסקאות, החשבונות, הקטגוריות, היעד וההגדרות.
        </p>
      </FeatureCard>

      {busy ? <ProgressState label={busy} pct={null} /> : null}

      {notice ? (
        <Card tone="brand">
          <p role="status" className="text-sm leading-relaxed text-accent-strong">
            {notice}
          </p>
        </Card>
      ) : null}
      {error ? (
        <Card tone="caution">
          <p role="alert" className="text-sm leading-relaxed text-slate-800">
            {error}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
        {/* ── שחזור ──────────────────────────────────────────── */}
        <Card className="flex flex-col">
          <CardTitle icon="refresh">שחזור</CardTitle>
          <p className="mb-4 flex-1 text-sm leading-relaxed text-slate-600">
            שחזור <strong>מחליף</strong> את כל מה שקיים במכשיר. תראה בדיוק מה יש בקובץ לפני שתאשר.
          </p>
          <Button variant="secondary" full onClick={() => fileInput.current?.click()}>
            לבחור קובץ גיבוי
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="קובץ גיבוי לשחזור"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFileChosen(file);
              e.target.value = '';
            }}
          />
        </Card>

        {/* ── ייצוא פשוט ─────────────────────────────────────── */}
        <Card className="flex flex-col">
          <CardTitle icon="receipt">ייצוא עסקאות לגיליון</CardTitle>
          <p className="mb-4 flex-1 text-sm leading-relaxed text-slate-600">
            קובץ CSV עם העסקאות בלבד, לפתיחה ב-Excel או Google Sheets.{' '}
            <strong>אי אפשר לשחזר ממנו</strong> — לשחזור צריך את הגיבוי המלא.
          </p>
          <Button variant="secondary" full onClick={doExportCsv} disabled={!hasData || busy !== null}>
            לייצא CSV
          </Button>
        </Card>
      </div>

      {/* ── גיליון ייצוא ─────────────────────────────────────── */}
      <Sheet open={exportSheet} onClose={closeExport} title="גיבוי הנתונים">
        <div className="space-y-4">
          <div role="radiogroup" aria-label="סוג הגיבוי" className="space-y-2">
            <ChoiceCard
              icon="lock"
              selected={exportMode === 'encrypted'}
              onSelect={() => setExportMode('encrypted')}
              title="גיבוי מוצפן"
              badge={<Pill tone="brand">מומלץ</Pill>}
              description="הקובץ נעול בסיסמה שאתה בוחר. בלעדיה אי אפשר לפתוח אותו — גם לא כאן."
            />
            <ChoiceCard
              icon="eye"
              selected={exportMode === 'plain'}
              onSelect={() => setExportMode('plain')}
              title="גיבוי בלי הצפנה"
              description="כל ההיסטוריה הפיננסית בטקסט קריא. מתאים רק אם הקובץ נשאר במקום שאתה סומך עליו."
            />
          </div>

          {exportMode === 'encrypted' ? (
            <>
              <Field
                label="סיסמת גיבוי"
                hint="לפחות שישה תווים. הסיסמה לא נשמרת בשום מקום, ואין דרך לשחזר אותה."
              >
                {(id) => (
                  <TextInput
                    id={id}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                )}
              </Field>
              <Field
                label="שוב, לוודא"
                {...(passwordAgain && passwordProblem ? { error: passwordProblem } : {})}
              >
                {(id) => (
                  <TextInput
                    id={id}
                    type="password"
                    value={passwordAgain}
                    onChange={(e) => setPasswordAgain(e.target.value)}
                    autoComplete="new-password"
                  />
                )}
              </Field>
            </>
          ) : (
            <p className="flex gap-2 rounded-2xl bg-caution-100/50 p-3.5 text-xs leading-relaxed text-slate-700">
              <Icon name="alert-triangle" className="mt-0.5 size-4 shrink-0 text-caution-600" />
              <span>
                מי שיפתח את הקובץ יראה כל עסקה, כל סכום וכל יתרה. אם הוא הולך לענן או לאימייל —
                עדיף מוצפן.
              </span>
            </p>
          )}

          <Button
            full
            onClick={doExport}
            disabled={busy !== null || (exportMode === 'encrypted' && passwordProblem !== null)}
          >
            {busy ? 'מייצר…' : exportMode === 'encrypted' ? 'לייצא מוצפן' : 'לייצא בלי הצפנה'}
          </Button>
        </div>
      </Sheet>

      {/* ── גיליון שחזור ─────────────────────────────────────── */}
      <Sheet open={restoreText !== null} onClose={closeRestore} title="שחזור מגיבוי">
        <div className="space-y-4">
          {needsPassword ? (
            <>
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Icon name="lock" className="size-4 text-slate-500" />
                הגיבוי הזה מוצפן.
              </p>
              <Field label="סיסמת הגיבוי">
                {(id) => (
                  <TextInput
                    id={id}
                    type="password"
                    value={restorePassword}
                    onChange={(e) => setRestorePassword(e.target.value)}
                  />
                )}
              </Field>
              <Button full onClick={tryPassword}>
                לפתוח
              </Button>
            </>
          ) : null}

          {preview ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <StatTile
                  label="עסקאות"
                  dot="brand"
                  value={<span className="num">{preview.counts.transactions ?? 0}</span>}
                />
                <StatTile
                  label="עסקאות כרטיס"
                  value={<span className="num">{preview.counts.cardTransactions ?? 0}</span>}
                />
                <StatTile
                  label="חשבונות"
                  value={<span className="num">{preview.counts.accounts ?? 0}</span>}
                />
                <StatTile
                  label="קטגוריות"
                  value={<span className="num">{preview.counts.categories ?? 0}</span>}
                />
              </div>

              <div className="rounded-2xl border border-slate-200/70 px-3.5 py-1">
                <Row label="נוצר בתאריך">{formatDateHe(preview.createdAt.slice(0, 10))}</Row>
                <Row label="גרסת מבנה">
                  <span className="num">{preview.schemaVersion}</span>
                </Row>
                <Row label="מוצפן">{preview.encrypted ? 'כן' : 'לא'}</Row>
                <Row label="סה״כ רשומות" strong>
                  <span className="num">{preview.totalRecords}</span>
                </Row>
              </div>

              <p className="flex gap-2 rounded-2xl bg-caution-100/50 p-3.5 text-sm leading-relaxed text-slate-800">
                <Icon name="alert-triangle" className="mt-0.5 size-4 shrink-0 text-caution-600" />
                <span>
                  השחזור <strong>מחליף</strong> את כל מה שקיים כרגע במכשיר. מה שלא נמצא בגיבוי —
                  יימחק.
                </span>
              </p>

              {hasData ? (
                <div className="rounded-2xl border border-slate-200/70 px-3.5">
                  <Switch
                    label="לגבות קודם את המצב הנוכחי"
                    description="יורד קובץ נוסף לפני הדריסה. אם התברר שזה הגיבוי הלא נכון — יש לאן לחזור."
                    checked={backupFirst}
                    onChange={setBackupFirst}
                  />
                </div>
              ) : null}

              <Button full onClick={doRestore} disabled={busy !== null}>
                {busy ?? 'לשחזר עכשיו'}
              </Button>
            </>
          ) : null}
        </div>
      </Sheet>

      {!hasData ? (
        <Banner
          title="אין עדיין מה לגבות"
          body="ברגע שיהיו עסקאות במערכת, כאן תהיה הדרך לשמור אותן מחוץ למכשיר."
        />
      ) : null}
    </Page>
  );
}
