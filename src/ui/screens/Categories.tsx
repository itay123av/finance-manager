/**
 * ניהול קטגוריות.
 *
 * `nature` הוא לא קישוט: הוא קובע אילו קטגוריות המערכת רשאית להציע
 * לצמצום. לכן הוא ניתן לעריכה ומוסבר בשפה פשוטה.
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
import { Button, Card, CardTitle, ConfirmDialog, Field, LoadingState, Select, Sheet, TextInput } from '../components/ui';
import { Icon } from '../components/icons';

const NATURE_LABELS: Record<CategoryNature, { label: string; help: string }> = {
  essential: { label: 'חיונית', help: 'דברים שממשיכים בכל מקרה — תחבורה, טלפון.' },
  important: { label: 'חשובה', help: 'לימודים, ספורט. לא הכרחי, אבל שווה.' },
  fun: { label: 'הנאה', help: 'יציאות, אוכל בחוץ. שורה מתוכננת בתקציב.' },
  reducible: { label: 'ניתנת לצמצום', help: 'המערכת תציע להקטין אותה קודם.' },
  system: { label: 'מערכת', help: 'קטגוריה פנימית של המערכת.' },
};

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

  function renderList(list: Category[], archivedList: boolean) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-surface">
        {list.map((c, i) => (
          <div
            key={c.id}
            className={`flex items-center gap-3 p-3 ${i > 0 ? 'border-t border-slate-100' : ''}`}
          >
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: c.color }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900">{c.name}</p>
              <p className="text-xs text-slate-500">
                {NATURE_LABELS[c.nature].label}
                <span aria-hidden className="mx-1.5 text-slate-400">·</span>
                {usage.get(c.id) ?? 0} עסקאות
              </p>
            </div>
            {archivedList ? (
              <Button variant="ghost" onClick={() => unarchiveCategory(db, c.id)}>
                להחזיר
              </Button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  aria-label={`עריכת ${c.name}`}
                  className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <Icon name="pencil" className="size-4" />
                </button>
                {!c.isSystem ? (
                  <button
                    type="button"
                    onClick={() => setRemoving(c)}
                    aria-label={`הסרת ${c.name}`}
                    className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-alertred-100"
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                ) : null}
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <Page title="קטגוריות" width="reading">

      {notice ? (
        <Card tone="brand">
          <p className="text-sm text-accent-strong">{notice}</p>
        </Card>
      ) : null}

      <Button full variant="secondary" onClick={openCreate}>
        + קטגוריה חדשה
      </Button>

      {renderList(active, false)}

      {archived.length > 0 ? (
        <>
          <CardTitle hint="קטגוריה שיש לה עסקאות לא נמחקת, כדי שההיסטוריה לא תישבר. היא עוברת לכאן.">
            בארכיון
          </CardTitle>
          {renderList(archived, true)}
        </>
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
            <Field label="סוג">
              {(id) => (
                <Select
                  id={id}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as Category['kind'])}
                >
                  <option value="expense">הוצאה</option>
                  <option value="income">הכנסה</option>
                </Select>
              )}
            </Field>
          ) : null}

          <Field label="אופי הקטגוריה" hint={NATURE_LABELS[nature].help}>
            {(id) => (
              <Select
                id={id}
                value={nature}
                onChange={(e) => setNature(e.target.value as CategoryNature)}
              >
                {(['essential', 'important', 'fun', 'reducible'] as const).map((n) => (
                  <option key={n} value={n}>
                    {NATURE_LABELS[n].label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

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
