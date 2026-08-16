/**
 * הגדרות.
 *
 * כאן יושבים הדברים שמשנים את כל המספרים במסך — סכום הביטחון, מסלול
 * התקציב והיעד — ולצידם נעילת האפליקציה, התצוגה, והמחיקה.
 *
 * הגיבוי עבר למסך משלו (`/backup`): הוא ההגנה היחידה מפני אובדן
 * המכשיר, והוא ראוי ליותר מפסקה בתוך רשימת הגדרות.
 */

import { Page } from '../components/layout';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../AppData';
import { db, wipeAllData } from '../../data/db';
import { saveSettings, updateGoal } from '../../data/repositories';
import { createLock, isValidPin, MAX_PIN_LENGTH, MIN_PIN_LENGTH } from '../../data/appLock';
import { fromShekels, toShekels } from '../../core/money';
import {
  AUTO_LOCK_CHOICES_MINUTES,
  SAFETY_BUFFER_PRESETS_AGOROT,
  THEME_CHOICES,
  type ConcreteBudgetPlanId,
  type ThemePreference,
} from '../../core/types';
import { useTheme } from '../useTheme';
import { APP_VERSION, BUILD_ID } from '../../version';
import { Icon } from '../components/icons';
import {
  AmountInput,
  Button,
  buttonClass,
  Card,
  CardTitle,
  ChoiceGroup,
  ConfirmDialog,
  Field,
  LoadingState,
  Money,
  Row,
  Select,
  Sheet,
  TextInput,
} from '../components/ui';

const PLAN_LABELS: Record<ConcreteBudgetPlanId, string> = {
  conservative: 'שמרני — להגיע ליעד מהר יותר',
  balanced: 'מאוזן — מומלץ',
  flexible: 'גמיש — יותר מקום, יעד רחוק יותר',
};

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'לפי המכשיר',
  light: 'בהיר',
  dark: 'כהה',
};

const AUTO_LOCK_LABELS: Record<number, string> = {
  0: 'מיד',
  1: 'אחרי דקה',
  5: 'אחרי 5 דקות',
  15: 'אחרי 15 דקות',
};

export function Settings() {
  const { snapshot, dashboard, loading } = useAppData();
  // מה שהמכשיר נותן כרגע — כדי ש"לפי המכשיר" יגיד מה זה אומר בפועל
  const resolvedTheme = useTheme(snapshot?.settings.theme);
  const systemNote = resolvedTheme === 'dark' ? 'כרגע כהה' : 'כרגע בהיר';

  const [customBuffer, setCustomBuffer] = useState('');
  const [targetDraft, setTargetDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wiping, setWiping] = useState(false);

  const [lockSheet, setLockSheet] = useState(false);
  const [pin, setPin] = useState('');
  const [pinAgain, setPinAgain] = useState('');
  const [autoLock, setAutoLock] = useState(1);
  const [lockError, setLockError] = useState<string | null>(null);
  const [removingLock, setRemovingLock] = useState(false);

  if (loading || !snapshot) return <LoadingState />;
  const { settings } = snapshot;

  async function saveLock() {
    if (!isValidPin(pin)) {
      setLockError(`הקוד צריך להיות ${MIN_PIN_LENGTH} עד ${MAX_PIN_LENGTH} ספרות.`);
      return;
    }
    if (pin !== pinAgain) {
      setLockError('שני הקודים לא זהים.');
      return;
    }
    await saveSettings(db, { lock: await createLock(pin, autoLock) });
    setLockSheet(false);
    setPin('');
    setPinAgain('');
    setLockError(null);
    setNotice('הנעילה הופעלה. היא תבקש את הקוד בפעם הבאה שתפתח את האפליקציה.');
  }

  return (
    <Page title="הגדרות" width="reading">

      {notice ? (
        <Card tone="brand">
          <p role="status" className="text-sm text-accent-strong">
            {notice}
          </p>
        </Card>
      ) : null}
      {error ? (
        <Card tone="caution">
          <p role="alert" className="text-sm text-slate-800">
            {error}
          </p>
        </Card>
      ) : null}

      {/* ── סכום ביטחון ──────────────────────────────────────── */}
      <Card>
        <CardTitle hint="הסכום שלא נספר בתור כסף פנוי. שינוי כאן מעדכן מיד את 'בטוח להוציא' ואת התחזיות.">
          סכום ביטחון
        </CardTitle>
        <ChoiceGroup
          ariaLabel="סכום ביטחון"
          value={
            SAFETY_BUFFER_PRESETS_AGOROT.includes(
              settings.safetyBufferAgorot as (typeof SAFETY_BUFFER_PRESETS_AGOROT)[number],
            )
              ? settings.safetyBufferAgorot
              : null
          }
          onChange={async (value) => {
            await saveSettings(db, { safetyBufferAgorot: value });
            setCustomBuffer('');
          }}
          options={SAFETY_BUFFER_PRESETS_AGOROT.map((value) => ({
            value,
            label: `₪${value / 100}`,
            ...(value === 50_000 ? { note: 'מומלץ' } : {}),
          }))}
        />
        <div className="mt-3 flex gap-2">
          <TextInput
            inputMode="decimal"
            dir="ltr"
            placeholder={String(toShekels(settings.safetyBufferAgorot))}
            value={customBuffer}
            onChange={(e) => setCustomBuffer(e.target.value)}
            aria-label="סכום ביטחון מותאם אישית"
          />
          <Button
            variant="secondary"
            onClick={async () => {
              const parsed = Number(customBuffer.replace(/[^\d.]/g, ''));
              if (Number.isFinite(parsed) && parsed >= 0) {
                await saveSettings(db, { safetyBufferAgorot: fromShekels(parsed) });
                setCustomBuffer('');
              } else {
                setError('לא הצלחנו לקרוא את הסכום. אפשר להקליד רק ספרות.');
              }
            }}
          >
            לקבוע
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          כרגע: <Money agorot={settings.safetyBufferAgorot} />
        </p>
      </Card>

      {/* ── תקציב ────────────────────────────────────────────── */}
      <Card>
        <CardTitle>מסלול התקציב</CardTitle>
        <Select
          value={settings.budgetPlanId}
          onChange={(e) =>
            saveSettings(db, { budgetPlanId: e.target.value as ConcreteBudgetPlanId })
          }
          aria-label="מסלול תקציב"
        >
          {(Object.keys(PLAN_LABELS) as ConcreteBudgetPlanId[]).map((id) => (
            <option key={id} value={id}>
              {PLAN_LABELS[id]}
            </option>
          ))}
        </Select>
        {dashboard ? (
          <div className="mt-3">
            <Row label="תקציב חודשי">
              <Money agorot={dashboard.budgetPlan.monthlySpendAgorot} />
            </Row>
            <Row label="מתוכו לבילויים">
              <Money agorot={dashboard.budgetPlan.funBudgetAgorot} />
            </Row>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              {dashboard.budgetPlan.risk.summaryHe} {dashboard.budgetPlan.risk.primaryReasonHe}.
            </p>
          </div>
        ) : null}
      </Card>

      {/* ── יעד ──────────────────────────────────────────────── */}
      <Card>
        <CardTitle>היעד</CardTitle>
        <div className="flex gap-2">
          <AmountInput
            value={targetDraft}
            placeholder={String(toShekels(snapshot.goal?.targetAgorot ?? 500_000))}
            onChange={(e) => setTargetDraft(e.target.value)}
            aria-label="סכום היעד"
          />
          <Button
            variant="secondary"
            onClick={async () => {
              const parsed = Number(targetDraft.replace(/[^\d.]/g, ''));
              if (Number.isFinite(parsed) && parsed > 0) {
                await updateGoal(db, { targetAgorot: fromShekels(parsed) });
                setTargetDraft('');
                setNotice('היעד עודכן.');
              } else {
                setError('סכום היעד צריך להיות מספר גדול מאפס.');
              }
            }}
          >
            לעדכן
          </Button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          אין תאריך יעד קשיח. המערכת מציגה תאריך משוער לפי הקצב שלך, והוא זז כשההרגלים משתנים.
        </p>
      </Card>

      {/* ── נעילה ────────────────────────────────────────────── */}
      <Card>
        <CardTitle>נעילת האפליקציה</CardTitle>
        <p className="mb-3 text-sm leading-relaxed text-slate-600">
          קוד בן {MIN_PIN_LENGTH}–{MAX_PIN_LENGTH} ספרות שמונע ממי שלוקח את הטלפון לרגע לראות מיד
          את הנתונים.
        </p>
        <p className="mb-3 flex gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          <Icon name="alert-triangle" className="mt-0.5 size-4 text-caution-600" />
          <span>
            קוד הנעילה מונע גישה מזדמנת לאפליקציה.{' '}
            <strong>הוא אינו מצפין את מסד הנתונים המקומי.</strong>
          </span>
        </p>

        {settings.lock ? (
          <>
            <Row label="נעילה אוטומטית">
              {AUTO_LOCK_LABELS[settings.lock.autoLockMinutes] ??
                `אחרי ${settings.lock.autoLockMinutes} דקות`}
            </Row>
            <div className="mt-3 flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setAutoLock(settings.lock!.autoLockMinutes);
                  setLockSheet(true);
                }}
              >
                לשנות קוד
              </Button>
              <Button variant="ghost" onClick={() => setRemovingLock(true)}>
                לבטל נעילה
              </Button>
            </div>
          </>
        ) : (
          <Button full onClick={() => setLockSheet(true)}>
            להפעיל נעילה
          </Button>
        )}
      </Card>

      {/* ── תצוגה ────────────────────────────────────────────── */}
      <Card>
        <CardTitle>תצוגה</CardTitle>

        <div className="mb-4">
          <p className="mb-2 text-sm font-medium text-slate-700">ערכת צבעים</p>
          <ChoiceGroup
            ariaLabel="ערכת צבעים"
            value={settings.theme ?? 'system'}
            onChange={(value) => saveSettings(db, { theme: value })}
            options={THEME_CHOICES.map((choice) => ({
              value: choice,
              label: THEME_LABELS[choice],
              ...(choice === 'system' ? { note: systemNote } : {}),
            }))}
          />
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            ״לפי המכשיר״ הולך אחרי ההגדרה של הטלפון או המחשב ומתחלף איתה.
          </p>
        </div>

        <label className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm text-slate-700">
          להציג אגורות
          <input
            type="checkbox"
            checked={settings.showAgorot}
            onChange={(e) => saveSettings(db, { showAgorot: e.target.checked })}
            className="size-6 shrink-0"
          />
        </label>
        <label className="flex min-h-11 items-start justify-between gap-3 py-2 text-sm text-slate-700">
          <span>
            מצב דיסקרטי
            <span className="mt-0.5 block text-xs text-slate-500">
              מטשטש את כל הסכומים על המסך. הנתונים לא משתנים — רק מה שרואים.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.discreetMode}
            onChange={(e) => saveSettings(db, { discreetMode: e.target.checked })}
            className="mt-0.5 size-6 shrink-0"
          />
        </label>
        <Link to="/categories" className="mt-2 inline-block py-2 text-sm font-semibold text-accent">
          ניהול קטגוריות ←
        </Link>
      </Card>

      {/* ── מחיקה ────────────────────────────────────────────── */}
      <Card>
        <CardTitle>מחיקת כל הנתונים</CardTitle>
        <p className="mb-3 text-sm leading-relaxed text-slate-600">
          מוחק את כל העסקאות, החשבונות, הקטגוריות, היעד, הכרטיסים, יומן הגיבויים וההגדרות מהמכשיר.
          הפעולה בלתי הפיכה, ואחריה האפליקציה מתחילה מההתחלה.
        </p>
        <div className="flex gap-2">
          <Link to="/backup" className={buttonClass('secondary')}>
            לגבות קודם
          </Link>
          <Button variant="danger" onClick={() => setWiping(true)}>
            למחוק הכל
          </Button>
        </div>
      </Card>

      <div className="pb-4 text-center">
        <Link to="/privacy" className="inline-block py-2 text-sm font-semibold text-accent">
          מה נשמר ומה לא ←
        </Link>
        <p className="mt-3 text-xs text-slate-500">
          <span className="num">v{APP_VERSION}</span>
          <span className="mx-1.5">·</span>
          <span className="num">build {BUILD_ID}</span>
        </p>
      </div>

      {/* ── הגדרת קוד נעילה ──────────────────────────────────── */}
      <Sheet
        open={lockSheet}
        onClose={() => {
          setLockSheet(false);
          setPin('');
          setPinAgain('');
          setLockError(null);
        }}
        title="קוד נעילה"
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            הקוד עצמו לא נשמר — נשמר ממנו ערך אימות שאי אפשר להפוך בחזרה. המשמעות: אם תשכח אותו,
            אין דרך לשחזר, והכניסה תדרוש מחיקת הנתונים ושחזור מגיבוי.
          </p>

          <Field label="קוד חדש">
            {(id) => (
              <TextInput
                id={id}
                type="password"
                inputMode="numeric"
                dir="ltr"
                maxLength={MAX_PIN_LENGTH}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="שוב, לוודא" {...(lockError ? { error: lockError } : {})}>
            {(id) => (
              <TextInput
                id={id}
                type="password"
                inputMode="numeric"
                dir="ltr"
                maxLength={MAX_PIN_LENGTH}
                value={pinAgain}
                onChange={(e) => setPinAgain(e.target.value.replace(/\D/g, ''))}
                autoComplete="off"
              />
            )}
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">לנעול אוטומטית</p>
            <ChoiceGroup
              ariaLabel="נעילה אוטומטית"
              value={autoLock}
              onChange={setAutoLock}
              options={AUTO_LOCK_CHOICES_MINUTES.map((minutes) => ({
                value: minutes,
                label: AUTO_LOCK_LABELS[minutes] ?? `${minutes} דקות`,
              }))}
            />
          </div>

          <Button full onClick={saveLock}>
            לשמור קוד
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={removingLock}
        title="לבטל את הנעילה?"
        body={
          <p>
            האפליקציה תיפתח מיד בלי קוד. הנתונים עצמם לא משתנים — הם ממילא לא היו מוצפנים.
          </p>
        }
        confirmLabel="לבטל נעילה"
        onCancel={() => setRemovingLock(false)}
        onConfirm={async () => {
          const next = { ...settings };
          delete next.lock;
          await db.settings.put(next);
          setRemovingLock(false);
          setNotice('הנעילה בוטלה.');
        }}
      />

      <ConfirmDialog
        open={wiping}
        title="למחוק את כל הנתונים?"
        body={
          <>
            <p>
              כל העסקאות, החשבונות, הקטגוריות, הכרטיסים, היעד, ההגדרות ויומן הגיבויים יימחקו
              מהמכשיר לצמיתות.
            </p>
            <p className="mt-2">אחרי המחיקה האפליקציה תחזור למסך ההתחלה.</p>
            <p className="mt-2 font-medium text-slate-800">
              אם עוד לא ייצאת גיבוי — כדאי לעשות את זה קודם. אין דרך לשחזר בלעדיו.
            </p>
          </>
        }
        confirmLabel="למחוק הכל"
        confirmWord="מחק"
        destructive
        onCancel={() => setWiping(false)}
        onConfirm={async () => {
          await wipeAllData(db);
          setWiping(false);
        }}
      />
    </Page>
  );
}
