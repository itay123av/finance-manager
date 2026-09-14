/**
 * ניהול קטגוריות.
 *
 * `nature` הוא לא קישוט: הוא קובע אילו קטגוריות המערכת רשאית להציע
 * לצמצום. לכן הוא ניתן לעריכה ומוסבר בשפה פשוטה.
 *
 * ⚠️ **v3 — אותה שפה כמו לוח הבקרה.** הרשימה יושבת בכרטיס שעולה על
 * הבאנר, כל קטגוריה מקבלת אריח בצבע שלה, והאופי נבחר מכרטיסים עם
 * ההסבר גלוי — לא מתוך רשימה נפתחת שמסתירה אותו.
 */

import { Page } from '../components/layout';
import { useMemo, useState } from 'react';
import { useAppData } from '../AppData';
import { db } from '../../data/db';
import {
  archiveOrDeleteCategory,
  createCategory,
  unarchiveCategory,
  updateCategory,
} from '../../data/repositories';
import type { Category, CategoryNature } from '../../core/types';
import {
  Button,
  Card,
  CardTitle,
  ConfirmDialog,
  Field,
  LoadingState,
  Medallion,
  Sheet,
  TextInput,
} from '../components/ui';
import { ChoiceCard, FeatureCard, IconButton, Pill, Segmented } from '../components/premium';
import { Icon } from '../components/icons';

const NATURE_LABELS: Record<CategoryNature, { label: string; help: string }> = {
  essential: { label: 'חיונית', help: 'דברים שממשיכים בכל מקרה — תחבורה, טלפון.' },
  important: { label: 'חשובה', help: 'לימודים, ספורט. לא הכרחי, אבל שווה.' },
  fun: { label: 'הנאה', help: 'יציאות, אוכל בחוץ. שורה מתוכננת בתקציב.' },
  reducible: { label: 'ניתנת לצמצום', help: 'המערכת תציע להקטין אותה קודם.' },
  system: { label: 'מערכת', help: 'קטגוריה פנימית של המערכת.' },
};

const EDITABLE_NATURES = ['essential', 'important', 'fun', 'reducible'] as const;

/** אריח בצבע הקטגוריה. ⚠️ קישוט — השם תמיד כתוב לידו. */
function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-[0.875rem]"
      style={{ background: `color-mix(in oklab, ${color} 18%, transparent)` }}
    >
      <span className="size-3.5 rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
}

export function Categories() {
  const { snapshot, loading } = useAppData();
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [nature, setNature] = useState<CategoryNature>('fun');
  const [kind, setKind] = useState<Category['kind']>('expense');
  const [notice, setNotice] = useState<string | null>(null);

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of snapshot?.transactions ?? []) {
      counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [snapshot?.transactions]);

  const active = (snapshot?.categories ?? []).filter((c) => !c.archivedAt);
  const archived = (snapshot?.categories ?? []).filter((c) => c.archivedAt);

  if (loading) return <LoadingState />;

  function openEdit(category: Category) {
    setEditing(category);
    setName(category.name);
    setNature(category.nature);
  }

  function openCreate() {
    setCreating(true);
    setName('');
    setNature('fun');
    setKind('expense');
  }

  async function save() {
    if (!name.trim()) return;
    if (editing) await updateCategory(db, editing.id, { name, nature });
    else await createCategory(db, { name, kind, nature });
    setEditing(null);
    setCreating(false);
  }

  function renderRow(c: Category, archivedList: boolean) {
    return (
      <div key={c.id} className="flex items-center gap-3 py-2.5">
        <Swatch color={c.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
          <p className="text-xs text-slate-600">
            {NATURE_LABELS[c.nature].label}
            <span aria-hidden className="mx-1.5 text-slate-400">
              ·
            </span>
            <span className="num">{usage.get(c.id) ?? 0}</span> עסקאות
          </p>
        </div>
        {archivedList ? (
          <Button variant="ghost" onClick={() => void unarchiveCategory(db, c.id)}>
            להחזיר
          </Button>
        ) : (
          <>
            <IconButton icon="pencil" label={`עריכת ${c.name}`} onClick={() => openEdit(c)} />
            {!c.isSystem ? (
              <IconButton
                icon="trash"
                tone="danger"
                label={`הסרת ${c.name}`}
                onClick={() => setRemoving(c)}
              />
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <Page
      title="קטגוריות"
      icon="tag"
      subtitle="לערוך, להוסיף, לארכב"
      width="reading"
      overlap
      stats={[
        { label: 'פעילות', value: <span className="num">{active.length}</span> },
        { label: 'בארכיון', value: <span className="num">{archived.length}</span> },
      ]}
    >
      {/* ── ⭐ הקטגוריות ─────────────────────────────────────── */}
      <FeatureCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 text-sm font-semibold text-slate-600">
            <Medallion icon="tag" tone="brand" />
            הקטגוריות שלך
          </h2>
          <Button onClick={openCreate}>
            <Icon name="plus" className="size-4" />
            קטגוריה חדשה
          </Button>
        </div>

        <div className="mb-2 flex flex-wrap gap-2">
          {EDITABLE_NATURES.map((n) => {
            const count = active.filter((c) => c.nature === n).length;
            return count > 0 ? (
              <Pill key={n}>
                {NATURE_LABELS[n].label} · <span className="num">{count}</span>
              </Pill>
            ) : null;
          })}
        </div>

        <div className="divide-y divide-slate-100">{active.map((c) => renderRow(c, false))}</div>
      </FeatureCard>

      {notice ? (
        <Card tone="brand">
          <p role="status" className="text-sm text-accent-strong">
            {notice}
          </p>
        </Card>
      ) : null}

      {archived.length > 0 ? (
        <Card>
          <CardTitle
            icon="package"
            hint="קטגוריה שיש לה עסקאות לא נמחקת, כדי שההיסטוריה לא תישבר. היא עוברת לכאן."
          >
            בארכיון
          </CardTitle>
          <div className="divide-y divide-slate-100">{archived.map((c) => renderRow(c, true))}</div>
        </Card>
      ) : null}

      <Sheet
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? 'עריכת קטגוריה' : 'קטגוריה חדשה'}
      >
        <div className="space-y-4">
          <Field label="שם">
            {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>

          {!editing ? (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">סוג</p>
              <Segmented
                ariaLabel="סוג"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'expense', label: 'הוצאה' },
                  { value: 'income', label: 'הכנסה' },
                ]}
              />
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">אופי הקטגוריה</p>
            <div role="radiogroup" aria-label="אופי הקטגוריה" className="grid gap-2 sm:grid-cols-2">
              {EDITABLE_NATURES.map((n) => (
                <ChoiceCard
                  key={n}
                  selected={nature === n}
                  onSelect={() => setNature(n)}
                  title={NATURE_LABELS[n].label}
                  description={NATURE_LABELS[n].help}
                />
              ))}
            </div>
          </div>

          <Button full onClick={save} disabled={!name.trim()}>
            לשמור
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={removing !== null}
        title="להסיר את הקטגוריה?"
        body={
          removing ? (
            (usage.get(removing.id) ?? 0) > 0 ? (
              <p>
                לקטגוריה <strong>{removing.name}</strong> משויכות{' '}
                {usage.get(removing.id)} עסקאות, ולכן היא תעבור לארכיון במקום להימחק. ההיסטוריה
                תישאר שלמה, והיא פשוט לא תוצע יותר בהוספת עסקה.
              </p>
            ) : (
              <p>
                לקטגוריה <strong>{removing.name}</strong> אין עסקאות, ולכן היא תימחק לגמרי.
              </p>
            )
          ) : null
        }
        confirmLabel="להסיר"
        destructive
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          const result = await archiveOrDeleteCategory(db, removing.id);
          setNotice(
            result.archived
              ? `${removing.name} הועברה לארכיון (${result.transactionCount} עסקאות נשמרו).`
              : `${removing.name} נמחקה.`,
          );
          setRemoving(null);
        }}
      />
    </Page>
  );
}
