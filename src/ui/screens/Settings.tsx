/**
 * הגדרות.
 *
 * כאן יושבים הדברים שמשנים את כל המספרים במסך — סכום הביטחון, מסלול
 * התקציב והיעד — ולצידם נעילת האפליקציה, התצוגה, והמחיקה.
 *
 * הגיבוי עבר למסך משלו (`/backup`): הוא ההגנה היחידה מפני אובדן
 * המכשיר, והוא ראוי ליותר מפסקה בתוך רשימת הגדרות.
 *
 * ⚠️ **v3 — אותה שפה כמו לוח הבקרה.** סכום הביטחון הוא הכרטיס שעולה על
 * הבאנר, עם המספר הגדול. מסלול התקציב נבחר מכרטיסים, התצוגה ממתגים, וכל
 * קבוצה מקבלת מדליון משלה.
 */

import { Page } from '../components/layout';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../AppData';
import { db, wipeAllData } from '../../data/db';
import { saveSettings, updateGoal } from '../../data/repositories';
import { readSyncState } from '../../data/sync/state';
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
  Medallion,
  Money,
  Sheet,
  TextInput,
} from '../components/ui';
import {
  BigNumber,
  ChoiceCard,
  FeatureCard,
  Pill,
  SettingRow,
  StatTile,
  Switch,
} from '../components/premium';

const PLANS: Record<ConcreteBudgetPlanId, { title: string; note: string; recommended?: true }> = {
  conservative: { title: 'שמרני', note: 'להגיע ליעד מהר יותר' },
  balanced: { title: 'מאוזן', note: 'האיזון בין ליהנות עכשיו לבין היעד', recommended: true },
  flexible: { title: 'גמיש', note: 'יותר מקום, יעד רחוק יותר' },
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

  /**
   * קוד החיבור, אם המכשיר מסונכרן.
   *
   * ⚠️ נטען רק כדי להזהיר לפני מחיקה. הוא לא מוצג כאן — התצוגה
   * שלו יושבת במסך הסנכרון, מאחורי לחיצה מפורשת.
   */
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  useEffect(() => {
    void readSyncState(db).then((s) => setPairingCode(s.pairingCode));
  }, []);

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
    <Page
      title="הגדרות"
      icon="settings"
      subtitle="סכום ביטחון, יעד, נעילה ותצוגה"
      width="reading"
      overlap
    >
      {/* ── ⭐ סכום ביטחון ────────────────────────────────────── */}
      <FeatureCard>
        <CardTitle
          icon="shield-check"
          iconTone="brand"
          hint="הסכום שלא נספר בתור כסף פנוי. שינוי כאן מעדכן מיד את 'בטוח להוציא' ואת התחזיות."
        >
          סכום ביטחון
        </CardTitle>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-slate-600">שמור בצד כרגע</p>
            <div className="mt-1.5">
              <BigNumber size="md">
                <Money agorot={settings.safetyBufferAgorot} />
              </BigNumber>
            </div>
          </div>
          <Pill tone="brand" icon="lock">
            לא נספר ככסף פנוי
          </Pill>
        </div>

        <div className="mt-5">
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
        </div>
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
      </FeatureCard>

      {/* ⚠️ ההודעות אחרי הכרטיס הראשון ולא לפניו: הכרטיס הראשון עולה על
          הבאנר הכהה, והודעה צבעונית שקופה-למחצה לא הייתה נקראת עליו. */}
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

      {/* ── תקציב ────────────────────────────────────────────── */}
      <Card>
        <CardTitle icon="target" iconTone="brand">
          מסלול התקציב
        </CardTitle>
        <div role="radiogroup" aria-label="מסלול תקציב" className="space-y-2">
          {(Object.keys(PLANS) as ConcreteBudgetPlanId[]).map((id) => (
            <ChoiceCard
              key={id}
              selected={settings.budgetPlanId === id}
              onSelect={() => void saveSettings(db, { budgetPlanId: id })}
              title={PLANS[id].title}
              description={PLANS[id].note}
              {...(PLANS[id].recommended ? { badge: <Pill tone="brand">מומלץ</Pill> } : {})}
            />
          ))}
        </div>
        {dashboard ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <StatTile
                label="תקציב חודשי"
                dot="brand"
                value={<Money agorot={dashboard.budgetPlan.monthlySpendAgorot} />}
              />
              <StatTile
                label="מתוכו לבילויים"
                dot="slate"
                value={<Money agorot={dashboard.budgetPlan.funBudgetAgorot} />}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              {dashboard.budgetPlan.risk.summaryHe} {dashboard.budgetPlan.risk.primaryReasonHe}.
            </p>
          </>
        ) : null}
      </Card>

      {/* ── יעד ──────────────────────────────────────────────── */}
      <Card>
        <CardTitle icon="sparkles" iconTone="brand">
          היעד
        </CardTitle>
        {snapshot.goal ? (
          <div className="mb-4 grid grid-cols-2 gap-2">
            <StatTile
              label="היעד כרגע"
              dot="brand"
              value={<Money agorot={snapshot.goal.targetAgorot} />}
            />
            {dashboard ? (
              <StatTile
                label="נשאר עד היעד"
                value={<Money agorot={dashboard.goalProgress.gapAgorot} />}
              />
            ) : null}
          </div>
        ) : null}
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
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          אין תאריך יעד קשיח. המערכת מציגה תאריך משוער לפי הקצב שלך, והוא זז כשההרגלים משתנים.
        </p>
      </Card>

      {/* ── נעילה ────────────────────────────────────────────── */}
      <Card>
        <CardTitle icon="lock">נעילת האפליקציה</CardTitle>

        <SettingRow
          icon={settings.lock ? 'shield-check' : 'lock'}
          tone={settings.lock ? 'brand' : 'neutral'}
          title="קוד נעילה"
          description={
            settings.lock
              ? `נעילה אוטומטית: ${
                  AUTO_LOCK_LABELS[settings.lock.autoLockMinutes] ??
                  `אחרי ${settings.lock.autoLockMinutes} דקות`
                }`
              : 'לא הוגדר קוד'
          }
        >
          <Pill tone={settings.lock ? 'brand' : 'neutral'}>{settings.lock ? 'פעילה' : 'כבויה'}</Pill>
        </SettingRow>

        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          קוד בן {MIN_PIN_LENGTH}–{MAX_PIN_LENGTH} ספרות שמונע ממי שלוקח את הטלפון לרגע לראות מיד
          את הנתונים.
        </p>
        <p className="mt-3 flex gap-2 rounded-2xl bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600">
          <Icon name="alert-triangle" className="mt-0.5 size-4 shrink-0 text-caution-600" />
          <span>
            קוד הנעילה מונע גישה מזדמנת לאפליקציה.{' '}
            <strong>הוא אינו מצפין את מסד הנתונים המקומי.</strong>
          </span>
        </p>

        <div className="mt-4">
          {settings.lock ? (
            <div className="flex gap-2">
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
          ) : (
            <Button full onClick={() => setLockSheet(true)}>
              להפעיל נעילה
            </Button>
          )}
        </div>
      </Card>

      {/* ── תצוגה ────────────────────────────────────────────── */}
      <Card>
        <CardTitle icon={resolvedTheme === 'dark' ? 'moon' : 'sun'}>תצוגה</CardTitle>

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
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          ״לפי המכשיר״ הולך אחרי ההגדרה של הטלפון או המחשב ומתחלף איתה.
        </p>

        <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          <Switch
            label="להציג אגורות"
            checked={settings.showAgorot}
            onChange={(checked) => void saveSettings(db, { showAgorot: checked })}
          />
          <Switch
            label="מצב דיסקרטי"
            description="מטשטש את כל הסכומים על המסך. הנתונים לא משתנים — רק מה שרואים."
            checked={settings.discreetMode}
            onChange={(checked) => void saveSettings(db, { discreetMode: checked })}
          />
          <Link to="/categories" className="group flex min-h-14 items-center gap-3.5 py-2.5">
            <Medallion icon="tag" className="size-10" />
            <span className="flex-1 text-sm font-semibold text-slate-900">ניהול קטגוריות</span>
            <Icon
              name="chevron-inline"
              className="size-4 text-slate-400 transition group-hover:-translate-x-0.5"
            />
          </Link>
        </div>
      </Card>

      {/* ── מחיקה ────────────────────────────────────────────── */}
      <Card>
        <CardTitle icon="trash" iconTone="danger">
          מחיקת כל הנתונים
        </CardTitle>
        <p className="mb-4 text-sm leading-relaxed text-slate-600">
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

      <div className="flex flex-col items-center gap-3 pb-4 text-center">
        <Link
          to="/privacy"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200/70 bg-surface px-4 text-sm font-semibold text-accent elev-1 transition hover:border-slate-300"
        >
          <Icon name="lock" className="size-4" />
          מה נשמר ומה לא ←
        </Link>
        <p className="text-xs text-slate-500">
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
          <p className="flex gap-2.5 rounded-2xl bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600">
            <Icon name="info" className="mt-0.5 size-4 shrink-0 text-slate-500" />
            <span>
              הקוד עצמו לא נשמר — נשמר ממנו ערך אימות שאי אפשר להפוך בחזרה. המשמעות: אם תשכח אותו,
              אין דרך לשחזר, והכניסה תדרוש מחיקת הנתונים ושחזור מגיבוי.
            </span>
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
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
                  className="text-center text-xl tracking-[0.5em]"
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
                  className="text-center text-xl tracking-[0.5em]"
                />
              )}
            </Field>
          </div>

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
            {/*
              ⚠️ המחיקה מוחקת גם את קוד החיבור. מי שזה המכשיר היחיד
              שלו עם הקוד יאבד את הגישה לעותק בענן — והפעלה מחדש
              תיצור קוד חדש וחשבון ריק חדש, בלי שום רמז לכך שהעותק
              הישן עדיין קיים ולא נגיש.
            */}
            {pairingCode ? (
              <p className="mt-2 font-medium text-danger">
                המכשיר הזה מסונכרן, והמחיקה תמחק גם את קוד החיבור. בלי הקוד אי אפשר להגיע
                לעותק שבענן — גם לא על ידי הפעלת סנכרון מחדש, שתיצור קוד חדש וחשבון ריק. אם
                אין לך את הקוד במקום נוסף, העתק אותו קודם ממסך הסנכרון.
              </p>
            ) : null}
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
