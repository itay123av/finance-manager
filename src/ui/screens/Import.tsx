/**
 * מסך ייבוא קובץ.
 *
 * הכלל שמנחה את המסך: **כלום לא נכנס בלי שראית אותו קודם.**
 * הקובץ מנותח, מוצגת תצוגה מקדימה מלאה עם מה חדש, מה כפול ומה נכשל,
 * ורק לחיצה מפורשת כותבת לבסיס הנתונים. ואם משהו יצא לא נכון —
 * כפתור ביטול מוחק בדיוק את מה שנכנס.
 */

import { Page } from '../components/layout';
import { useRef, useState } from 'react';
import { useAppData } from '../AppData';
import { db } from '../../data/db';
import { commitImport, findSavedMapping, listImportSessions, undoImport } from '../../data/imports';
import {
  buildCardImportPreview,
  commitCardImport,
  type CardImportPreview,
} from '../../data/cards';
import { buildImportPreview } from '../../import/pipeline';
import { COLUMN_ROLE_LABELS_HE, detectMapping, isMappingUsable } from '../../import/columnMapping';
import { suggestIncomeValue } from '../../import/direction';
import { readTable } from '../../import/tabular';
import { FAILURE_LABELS_HE } from '../../import/rows';
import { needsReview } from '../../import/classify';
import {
  ImportError,
  MAX_FILE_BYTES,
  type ColumnMapping,
  type ColumnRole,
  type DirectionRule,
  type ImportPreview,
} from '../../import/types';
import { formatDateHe } from '../../core/dates';
import type { ImportSession } from '../../core/types';
import {
  Button,
  Card,
  CardTitle,
  ConfirmDialog,
  LoadingState,
  Money,
  Row,
  Select,
  TextInput,
} from '../components/ui';

const ROLE_OPTIONS: ColumnRole[] = [
  'date',
  'merchant',
  'amount',
  'debit',
  'credit',
  'balance',
  'reference',
  'ignore',
];

export function Import() {
  const { snapshot, loading } = useAppData();
  const fileInput = useRef<HTMLInputElement>(null);

  const [accountId, setAccountId] = useState<string>('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [rawRows, setRawRows] = useState<string[][] | null>(null);
  const [fileBytes, setFileBytes] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sessionId: string; imported: number } | null>(null);
  const [sessions, setSessions] = useState<ImportSession[] | null>(null);
  const [undoing, setUndoing] = useState<ImportSession | null>(null);
  const [showMapping, setShowMapping] = useState(false);
  const [directionColumn, setDirectionColumn] = useState<number | null>(null);
  const [incomeValue, setIncomeValue] = useState('');
  const [cardPreview, setCardPreview] = useState<CardImportPreview | null>(null);
  const [cardResult, setCardResult] = useState<{ imported: number; linked: number } | null>(null);

  if (loading || !snapshot) return <LoadingState />;

  const activeAccountId = accountId || snapshot.settings.lastAccountId || snapshot.accounts[0]?.id || '';
  const categoryName = new Map(snapshot.categories.map((c) => [c.id, c.name]));

  function reset() {
    setPreview(null);
    setRawRows(null);
    setFileBytes(null);
    setSelected(new Set());
    setError(null);
    setResult(null);
    setShowMapping(false);
    setCardPreview(null);
    setCardResult(null);
  }

  async function analyze(
    file: { name: string; bytes: Uint8Array },
    mappingOverride?: ColumnMapping,
    directionRule?: DirectionRule,
  ) {
    setBusy(true);
    setError(null);
    try {
      const existing = await db.transactions.toArray();
      const merchantRules = await db.merchantRules.toArray();

      const table = readTable(file);
      setRawRows(table.rows);

      // מיפוי שנשמר מקובץ קודם מאותו בנק חוסך מיפוי ידני חוזר
      const detected = mappingOverride ?? detectMapping(table.rows);
      const saved = mappingOverride ? null : await findSavedMapping(db, detected.signature);

      const next = buildImportPreview({
        file,
        accountId: activeAccountId,
        existing,
        context: { merchantRules, categories: snapshot!.categories },
        ...(saved ?? mappingOverride ? { mappingOverride: (mappingOverride ?? saved)! } : {}),
        ...(directionRule ? { directionRule } : {}),
      });

      // פירוט כרטיס אשראי עובר למסלול נפרד: הוא לא נקלט כתנועות בנק,
      // אלא כעסקאות כרטיס שמקושרות לחיוב הקיים
      if (next.statementKind.kind === 'credit_card') {
        setCardPreview(await buildCardImportPreview(db, file));
        setPreview(null);
        return;
      }

      setPreview(next);
      setSelected(new Set(next.rows.filter((r) => r.selected).map((r) => r.sourceLine)));
    } catch (e) {
      setPreview(null);
      setError(
        e instanceof ImportError ? e.message : 'לא הצלחנו לקרוא את הקובץ. אפשר לנסות קובץ אחר.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onFileChosen(file: File) {
    reset();
    if (file.size > MAX_FILE_BYTES) {
      setError(`הקובץ גדול מ-${MAX_FILE_BYTES / 1024 / 1024}MB. אפשר לייצא טווח תאריכים קצר יותר.`);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const payload = { name: file.name, bytes };
    setFileBytes(payload);
    await analyze(payload);
  }

  async function changeRole(columnIndex: number, role: ColumnRole) {
    if (!preview || !fileBytes) return;
    const roles = [...preview.mapping.roles];
    roles[columnIndex] = role;
    await analyze(fileBytes, { ...preview.mapping, roles });
  }

  async function confirmImport() {
    if (!preview) return;
    setBusy(true);
    try {
      const outcome = await commitImport(db, {
        preview,
        accountId: activeAccountId,
        selectedLines: selected,
      });
      setResult({ sessionId: outcome.sessionId, imported: outcome.imported });
      setPreview(null);
      setRawRows(null);
    } catch {
      setError('הקליטה נכשלה. שום עסקה לא נוספה.');
    } finally {
      setBusy(false);
    }
  }

  function toggle(line: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  }

  const headerRow =
    rawRows && preview?.mapping.headerRowIndex !== null && preview
      ? rawRows[preview.mapping.headerRowIndex!]
      : null;

  return (
    <Page title="ייבוא מהבנק">

      {/* ── הסבר ─────────────────────────────────────────────── */}
      {!preview && !result ? (
        <Card tone="brand">
          <p className="text-sm leading-relaxed text-accent-strong">
            הורד מאתר הבנק דוח עסקאות כקובץ CSV או Excel, והעלה אותו כאן.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-accent">
            הקובץ נקרא במכשיר שלך ולא נשלח לשום מקום. המערכת לא מבקשת — ולא תבקש —
            שם משתמש, סיסמה או קוד לבנק.
          </p>
        </Card>
      ) : null}

      {/* ── בחירת חשבון וקובץ ────────────────────────────────── */}
      {!preview && !result && !cardPreview && !cardResult ? (
        <Card>
          <CardTitle>לאיזה חשבון?</CardTitle>
          <Select
            value={activeAccountId}
            onChange={(e) => setAccountId(e.target.value)}
            aria-label="חשבון היעד"
          >
            {snapshot.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Button full className="mt-4" onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? 'קורא את הקובץ…' : 'לבחור קובץ'}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            // הקלט מוסתר ונפתח מכפתור — ולכן השם הנגיש חייב להיות עליו
            aria-label="קובץ עסקאות לייבוא"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFileChosen(file);
              e.target.value = '';
            }}
          />
        </Card>
      ) : null}

      {error ? (
        <Card tone="caution">
          <p role="alert" className="text-sm leading-relaxed text-slate-800">
            {error}
          </p>
          {preview === null && fileBytes ? (
            <Button variant="secondary" className="mt-3" onClick={() => setShowMapping(true)}>
              להתאים עמודות ידנית
            </Button>
          ) : null}
        </Card>
      ) : null}

      {/* ── תוצאה ────────────────────────────────────────────── */}
      {result ? (
        <>
          <Card tone="brand">
            <p className="text-lg font-bold text-accent-strong">
              נקלטו {result.imported} עסקאות
            </p>
            <p className="mt-1 text-sm text-accent">
              היתרה, "בטוח להוציא" וההתקדמות ליעד כבר מעודכנים.
            </p>
          </Card>
          <Button
            full
            variant="secondary"
            onClick={async () => {
              await undoImport(db, result.sessionId);
              setResult(null);
              setSessions(await listImportSessions(db));
            }}
          >
            לבטל את הייבוא הזה
          </Button>
          <Button full onClick={reset}>
            לייבא קובץ נוסף
          </Button>
        </>
      ) : null}

      {/* ── 💳 פירוט כרטיס אשראי — מסלול נפרד ──────────────────── */}
      {cardPreview ? (
        <>
          <Card tone="brand">
            <CardTitle icon="credit-card">פירוט כרטיס •••{cardPreview.cardLast4}</CardTitle>
            <Row label="עסקאות">{cardPreview.counts.total}</Row>
            <Row label="חדשות" strong>
              {cardPreview.counts.fresh}
            </Row>
            {cardPreview.counts.duplicates > 0 ? (
              <Row label="כבר קיימות">{cardPreview.counts.duplicates}</Row>
            ) : null}
            {cardPreview.counts.refunds > 0 ? (
              <Row label="זיכויים">{cardPreview.counts.refunds}</Row>
            ) : null}
            {cardPreview.counts.installments > 0 ? (
              <Row label="בתשלומים">{cardPreview.counts.installments}</Row>
            ) : null}
            {cardPreview.counts.foreignCurrency > 0 ? (
              <Row label="עסקאות מט״ח">{cardPreview.counts.foreignCurrency}</Row>
            ) : null}
            <Row label="סך חיובים">
              <Money agorot={cardPreview.totalBilledAgorot} />
            </Row>
            {cardPreview.file.dateRange ? (
              <p className="mt-2 text-xs text-slate-500">
                {formatDateHe(cardPreview.file.dateRange.from)} –{' '}
                {formatDateHe(cardPreview.file.dateRange.to)}
              </p>
            ) : null}
          </Card>

          <Card>
            <p className="text-sm leading-relaxed text-slate-700">
              הפירוט הזה <strong>לא ישנה את היתרה</strong> — הכסף כבר ירד מהחשבון בחיוב המרוכז.
              מה שישתנה: במקום שורה אחת של &quot;חיוב לכרטיס&quot;, נדע סוף סוף על מה הכסף הלך.
            </p>
          </Card>

          <Card>
            <CardTitle>מה ייקלט</CardTitle>
            <div className="-mx-1 max-h-96 overflow-y-auto">
              {cardPreview.rows.map((row, i) => (
                <div
                  key={`${row.sourceLine}-${i}`}
                  className={`flex items-start gap-2 border-b border-slate-100 p-2 last:border-0 ${
                    row.isDuplicate ? 'opacity-50' : ''
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {row.merchant || '(ללא שם)'}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {formatDateHe(row.purchaseDate)}
                      <span aria-hidden className="mx-1.5 text-slate-400">·</span>
                      {categoryName.get(row.categoryId) ?? 'אחר'}
                      {row.originalCurrency ? (
                        <span className="ms-1.5 text-slate-500">
                          ({row.originalCurrency})
                        </span>
                      ) : null}
                      {row.isDuplicate ? (
                        <span className="ms-1.5 text-caution-600">כבר קיימת</span>
                      ) : null}
                    </span>
                  </span>
                  <Money agorot={row.amountAgorot} className="text-sm font-semibold" />
                </div>
              ))}
            </div>
          </Card>

          <div className="flex gap-2">
            <Button variant="secondary" full onClick={reset}>
              ביטול
            </Button>
            <Button
              full
              disabled={busy || cardPreview.counts.fresh === 0 || cardPreview.blockedReason !== null}
              onClick={async () => {
                if (!fileBytes) return;
                setBusy(true);
                try {
                  const outcome = await commitCardImport(db, cardPreview, {
                    fileName: fileBytes.name,
                  });
                  setCardResult({ imported: outcome.imported, linked: outcome.linked });
                  setCardPreview(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'הקליטה נכשלה.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'קולט…' : `לקלוט ${cardPreview.counts.fresh}`}
            </Button>
          </div>
        </>
      ) : null}

      {cardResult ? (
        <>
          <Card tone="brand">
            <p className="text-lg font-bold text-accent-strong">
              נקלטו {cardResult.imported} עסקאות כרטיס
            </p>
            <p className="mt-1 text-sm text-accent">
              {cardResult.linked} מהן קושרו לחיובים בחשבון הבנק. היתרה לא השתנתה.
            </p>
          </Card>
          <Button full onClick={reset}>
            לייבא קובץ נוסף
          </Button>
        </>
      ) : null}

      {/* ── ⭐ הכרעת כיוון — חוסם עד שהמשתמש מחליט ──────────────── */}
      {preview?.blockedReason === 'unresolved_direction' ? (
        <Card tone="caution">
          <CardTitle>עצרנו רגע</CardTitle>
          <p className="text-sm leading-relaxed text-slate-800">{preview.direction.messageHe}</p>

          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold text-slate-700">איך לקבוע?</p>

            {preview.direction.candidates.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-surface p-3">
                <p className="mb-2 text-xs text-slate-500">
                  לפי עמודה בקובץ — שורה תיחשב הכנסה כשהעמודה מכילה את הערך:
                </p>
                <div className="flex gap-2">
                  <Select
                    value={String(directionColumn ?? preview.direction.candidates[0]!.columnIndex)}
                    onChange={(e) => setDirectionColumn(Number(e.target.value))}
                    aria-label="עמודה שקובעת את הכיוון"
                  >
                    {preview.direction.candidates.map((candidate) => (
                      <option key={candidate.columnIndex} value={candidate.columnIndex}>
                        {candidate.header} ({candidate.distinctValues.slice(0, 3).join(' / ')})
                      </option>
                    ))}
                  </Select>
                  <TextInput
                    value={incomeValue}
                    onChange={(e) => setIncomeValue(e.target.value)}
                    placeholder={suggestIncomeValue(preview.direction.candidates[0]!)}
                    aria-label="הערך שמסמן הכנסה"
                  />
                </div>
                <Button
                  full
                  variant="secondary"
                  className="mt-2"
                  onClick={() => {
                    const column =
                      directionColumn ?? preview.direction.candidates[0]!.columnIndex;
                    const value =
                      incomeValue || suggestIncomeValue(preview.direction.candidates[0]!);
                    if (fileBytes)
                      void analyze(fileBytes, undefined, {
                        kind: 'by_column',
                        columnIndex: column,
                        incomeValue: value,
                      });
                  }}
                >
                  להשתמש בעמודה הזו
                </Button>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button
                variant="secondary"
                full
                onClick={() =>
                  fileBytes && void analyze(fileBytes, undefined, { kind: 'all_expense' })
                }
              >
                הכל הוצאות
              </Button>
              <Button
                variant="secondary"
                full
                onClick={() =>
                  fileBytes && void analyze(fileBytes, undefined, { kind: 'all_income' })
                }
              >
                הכל הכנסות
              </Button>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-3">
            <p className="mb-2 text-xs font-semibold text-slate-500">
              5 שורות ראשונות מהקובץ, כדי שתוכל להחליט:
            </p>
            {preview.rows.slice(0, 5).map((row) => (
              <div
                key={row.sourceLine}
                className="flex items-baseline justify-between gap-2 py-1 text-xs"
              >
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {formatDateHe(row.date)} · {row.merchant || '(ללא תיאור)'}
                </span>
                <Money agorot={row.amountAgorot} className="font-semibold text-slate-900" />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* ── תצוגה מקדימה ─────────────────────────────────────── */}
      {preview && preview.blockedReason !== 'credit_card_file' ? (
        <>
          <Card>
            <CardTitle>{preview.fileName}</CardTitle>
            <Row label="נמצאו">{preview.counts.parsed} עסקאות</Row>
            <Row label="הכנסות / הוצאות">
              {preview.counts.income} / {preview.counts.expense}
            </Row>
            <Row label="חדשות" strong>
              {preview.counts.fresh}
            </Row>
            {preview.counts.needsReview > 0 ? (
              <Row label="דורשות בדיקת סיווג">{preview.counts.needsReview}</Row>
            ) : null}
            {preview.counts.exactDuplicates > 0 ? (
              <Row label="כבר קיימות (ידולגו)">{preview.counts.exactDuplicates}</Row>
            ) : null}
            {preview.counts.possibleDuplicates > 0 ? (
              <Row label="אולי כפולות — כדאי לבדוק">{preview.counts.possibleDuplicates}</Row>
            ) : null}
            {preview.counts.failed > 0 ? (
              <Row label="שורות שלא נקלטו">{preview.counts.failed}</Row>
            ) : null}
            {preview.dateRange ? (
              <p className="mt-2 text-xs text-slate-500">
                טווח: {formatDateHe(preview.dateRange.from)} – {formatDateHe(preview.dateRange.to)}
                <span className="mx-1.5">·</span>
                {preview.encoding}
                {preview.sheetName ? (
                  <>
                    <span className="mx-1.5">·</span>
                    גיליון: {preview.sheetName}
                  </>
                ) : null}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-slate-500">
              כיוון: {preview.direction.sourceHe}
            </p>
            <Button variant="ghost" className="mt-2 -ms-2" onClick={() => setShowMapping(true)}>
              העמודות זוהו לא נכון?
            </Button>
          </Card>

          {/* מיפוי ידני */}
          {showMapping && headerRow !== undefined ? (
            <Card>
              <CardTitle>התאמת עמודות</CardTitle>
              <div className="space-y-2">
                {preview.mapping.roles.map((role, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-xs text-slate-500">
                      {headerRow?.[index] || `עמודה ${index + 1}`}
                    </span>
                    <Select
                      value={role}
                      onChange={(e) => changeRole(index, e.target.value as ColumnRole)}
                      aria-label={`תפקיד עמודה ${index + 1}`}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {COLUMN_ROLE_LABELS_HE[option]}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
              {!isMappingUsable(preview.mapping) ? (
                <p className="mt-3 text-xs text-caution-600">
                  צריך לפחות עמודת תאריך ועמודת סכום (או חובה/זכות).
                </p>
              ) : null}
            </Card>
          ) : null}

          {/* השורות */}
          <Card>
            <CardTitle>מה ייקלט</CardTitle>
            <div className="-mx-1 max-h-96 overflow-y-auto">
              {preview.rows.map((row) => {
                const isDuplicate = row.verdict === 'exact_duplicate';
                return (
                  <label
                    key={row.sourceLine}
                    className={`flex items-start gap-2 border-b border-slate-100 p-2 last:border-0 ${
                      isDuplicate ? 'opacity-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(row.sourceLine)}
                      onChange={() => toggle(row.sourceLine)}
                      className="mt-1 size-4 shrink-0"
                      aria-label={`לקלוט ${row.merchant || 'עסקה'}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {row.merchant || '(ללא תיאור)'}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {formatDateHe(row.date)}
                        <span aria-hidden className="mx-1.5 text-slate-400">·</span>
                        {categoryName.get(row.categoryId) ?? 'אחר'}
                        {needsReview(row.categoryConfidence) ? (
                          <span className="ms-1.5 rounded bg-caution-100 px-1 text-caution-600">
                            לבדיקה
                          </span>
                        ) : null}
                      </span>
                      {row.duplicateReasonHe ? (
                        <span className="block text-xs text-caution-600">
                          {row.duplicateReasonHe}
                        </span>
                      ) : null}
                    </span>
                    <Money
                      agorot={row.type === 'income' ? row.amountAgorot : -row.amountAgorot}
                      signed
                      className={`text-sm font-semibold ${
                        row.type === 'income' ? 'text-accent' : 'text-slate-900'
                      }`}
                    />
                  </label>
                );
              })}
            </div>
          </Card>

          {/* שורות שנכשלו */}
          {preview.failures.length > 0 ? (
            <Card tone="caution">
              <CardTitle>שורות שלא נקלטו</CardTitle>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {preview.failures.slice(0, 20).map((failure, i) => (
                  <p key={i} className="text-xs leading-relaxed text-slate-700">
                    שורה {failure.sourceLine}: {FAILURE_LABELS_HE[failure.reason]}
                    <span className="block truncate text-slate-500">{failure.rawPreview}</span>
                  </p>
                ))}
              </div>
            </Card>
          ) : null}

          <div className="flex gap-2">
            <Button variant="secondary" full onClick={reset}>
              ביטול
            </Button>
            <Button
              full
              onClick={confirmImport}
              disabled={busy || selected.size === 0 || preview.blockedReason !== null}
            >
              {busy
                ? 'קולט…'
                : preview.blockedReason
                  ? 'צריך לקבוע כיוון קודם'
                  : `לקלוט ${selected.size}`}
            </Button>
          </div>
        </>
      ) : null}

      {/* ── ייבואים קודמים ───────────────────────────────────── */}
      {!preview ? (
        <Card>
          <CardTitle>ייבואים קודמים</CardTitle>
          {sessions === null ? (
            <Button
              variant="ghost"
              className="-ms-2"
              onClick={async () => setSessions(await listImportSessions(db))}
            >
              להציג
            </Button>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-slate-500">עוד לא ייבאת קבצים.</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-2 border-b border-slate-100 py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{session.fileName}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateHe(session.importedAt.slice(0, 10))}
                    <span aria-hidden className="mx-1.5 text-slate-400">·</span>
                    {session.rowsImported} עסקאות
                    {session.undone ? (
                      <span className="ms-1.5 text-caution-600">בוטל</span>
                    ) : null}
                  </p>
                </div>
                {!session.undone ? (
                  <Button variant="ghost" onClick={() => setUndoing(session)}>
                    לבטל
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </Card>
      ) : null}

      <ConfirmDialog
        open={undoing !== null}
        title="לבטל את הייבוא?"
        body={
          undoing ? (
            <>
              <p>
                יימחקו {undoing.rowsImported} העסקאות שנקלטו מהקובץ{' '}
                <strong>{undoing.fileName}</strong>.
              </p>
              <p className="mt-2 text-slate-500">
                עסקאות שהזנת ידנית ועסקאות מייבואים אחרים לא ייפגעו.
              </p>
            </>
          ) : null
        }
        confirmLabel="לבטל את הייבוא"
        destructive
        onCancel={() => setUndoing(null)}
        onConfirm={async () => {
          if (undoing) await undoImport(db, undoing.id);
          setUndoing(null);
          setSessions(await listImportSessions(db));
        }}
      />
    </Page>
  );
}
