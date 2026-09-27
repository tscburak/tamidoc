import type { TemplateField } from '../../context/TemplateStoreProvider';
import type { ComponentGroup } from '../designer';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { FieldInput, FieldLabel } from './FieldInput';

/** FillValues: scalars keyed by field name; repeating groups keyed by group
 * name → array of per-entry { field: value } objects. Mirrors the renderer. */
export type FillValues = Record<string, string | Record<string, string>[]>;

/** Compound identity for a field (mirrors the backend missing-field key). */
export const fieldKeyOf = (groupId: string | undefined | null, name: string) =>
  `${groupId ?? ''}::${name}`;

/** A value counts as filled unless blank (checkbox needs the literal 'true'). */
export function isFilled(type: string, v: unknown): boolean {
  if (typeof v !== 'string') return false;
  if (type === 'checkbox') return v === 'true';
  return v.trim().length > 0;
}

/** Compound keys of required fields currently lacking a value. Same rule as the
 * backend's findMissingRequired. */
export function findMissingFields(
  fields: TemplateField[],
  groups: ComponentGroup[],
  values: FillValues,
): string[] {
  const out: string[] = [];
  for (const f of fields) {
    if (!f.required) continue;
    // Disabled / hidden fields aren't user-fillable — can't block submit.
    // Ask-on-generate fields are owner-answered at download time instead.
    if (f.disabled || f.visible === false || f.askOnGenerate) continue;
    if (f.groupId) {
      const g = groups.find((gr) => gr.id === f.groupId);
      const arr = g ? (values[g.name] as Record<string, string>[] | undefined) : undefined;
      const entries = Array.isArray(arr) ? arr : [];
      if (entries.length === 0 || entries.some((e) => !isFilled(f.type, e?.[f.name]))) {
        out.push(fieldKeyOf(f.groupId, f.name));
      }
    } else if (!isFilled(f.type, values[f.name])) {
      out.push(fieldKeyOf(undefined, f.name));
    }
  }
  return out;
}

/**
 * Renders a template's fields as an editable form: scalar fields first, then
 * each repeating group with add/remove-entry controls. Controlled via `values` +
 * `onValuesChange`. Reused by the public fill page (clean — no debug output).
 */
export function DynamicFormFields({
  fields,
  groups,
  values,
  onValuesChange,
  missingFields,
  disabled,
}: {
  fields: TemplateField[];
  groups: ComponentGroup[];
  values: FillValues;
  onValuesChange: (v: FillValues) => void;
  missingFields: Set<string>;
  disabled?: boolean;
}) {
  // Hidden fields are not rendered (their defaultValue is still seeded + submitted).
  // Ask-on-generate fields are owner-answered at document generation time.
  const scalarFields = fields.filter((f) => !f.groupId && f.visible !== false && !f.askOnGenerate);
  const groupOf = (g: ComponentGroup) =>
    fields.filter((f) => f.groupId === g.id && f.visible !== false && !f.askOnGenerate);

  const setScalar = (name: string, v: string) => onValuesChange({ ...values, [name]: v });
  const setGroupEntry = (groupName: string, index: number, fieldName: string, v: string) => {
    const arr = [...((values[groupName] as Record<string, string>[]) ?? [])];
    arr[index] = { ...arr[index], [fieldName]: v };
    onValuesChange({ ...values, [groupName]: arr });
  };
  const addEntry = (groupName: string) =>
    onValuesChange({ ...values, [groupName]: [...((values[groupName] as Record<string, string>[]) ?? []), {}] });
  const removeEntry = (groupName: string, index: number) => {
    const arr = [...((values[groupName] as Record<string, string>[]) ?? [])];
    if (arr.length <= 1) return; // keep at least one entry
    arr.splice(index, 1);
    onValuesChange({ ...values, [groupName]: arr });
  };

  if (scalarFields.length === 0 && groups.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-stone-300 p-3 text-center text-xs text-stone-400 dark:border-stone-600 dark:text-stone-500">
        This form has no fillable fields.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {scalarFields.length > 0 && (() => {
        // Group scalars by section in first-seen order
        const sections = Array.from(new Set(scalarFields.map((f) => f.section ?? '')));
        return (
          <div className="flex flex-col gap-4">
            {sections.map((section) => {
              const sectionFields = scalarFields.filter((f) => (f.section ?? '') === section);
              return (
                <div key={section} className="flex flex-col gap-3">
                  {section && (
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-600 dark:bg-orange-950/50 dark:text-orange-300">
                        {section}
                      </span>
                      <span className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
                    </div>
                  )}
                  {sectionFields.map((f) => {
                    const missing = missingFields.has(fieldKeyOf(undefined, f.name));
                    return (
                      <div key={f.name} className="flex flex-col gap-1.5">
                        <FieldLabel required={f.required} info={f.info}>{f.name}</FieldLabel>
                        <div className={missing ? 'rounded-md ring-2 ring-red-500' : ''}>
                          <FieldInput field={f} value={(values[f.name] as string) ?? ''} onChange={(v) => setScalar(f.name, v)} disabled={disabled} />
                        </div>
                        {missing && <span className="text-xs font-medium text-red-600">This field is required</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}

      {groups.map((g) => {
        const arr = (values[g.name] as Record<string, string>[]) ?? [{}];
        const gFields = groupOf(g);
        if (gFields.length === 0) return null;
        return (
          <div key={g.id} className="flex flex-col gap-3 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-800 dark:text-stone-100">
                <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-600 dark:bg-orange-950/50 dark:text-orange-300">
                  ↻ {g.name}
                </span>
                <span className="text-xs font-normal text-stone-400">repeats</span>
                <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                  {arr.length} {arr.length === 1 ? 'entry' : 'entries'}
                </span>
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.preventDefault();
                  addEntry(g.name);
                }}
                className="flex items-center gap-1.5 rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:opacity-50 dark:bg-orange-700 dark:hover:bg-orange-600"
              >
                <IconPlus size={14} />
                Add
              </button>
            </div>
            {arr.map((entry, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border border-stone-200 bg-stone-50 p-2.5 dark:border-stone-700 dark:bg-stone-900/40">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Entry {i + 1}</span>
                  <button
                    type="button"
                    disabled={disabled || arr.length <= 1}
                    onClick={() => removeEntry(g.name, i)}
                    className="text-stone-400 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={`Remove entry ${i + 1}`}
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
                {gFields.map((f) => {
                  const missing = missingFields.has(fieldKeyOf(f.groupId, f.name));
                  return (
                    <div key={f.name} className="flex flex-col gap-1">
                      <FieldLabel required={f.required} info={f.info}>{f.name}</FieldLabel>
                      <div className={missing ? 'rounded-md ring-2 ring-red-500' : ''}>
                        <FieldInput field={f} value={entry[f.name] ?? ''} onChange={(v) => setGroupEntry(g.name, i, f.name, v)} disabled={disabled} />
                      </div>
                      {missing && <span className="text-xs font-medium text-red-600">This field is required</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Build the initial values for a template: defaults (or blank) + one entry per group. */
export function initialValuesFor(fields: TemplateField[], groups: ComponentGroup[]): FillValues {
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const init: FillValues = {};
  // Seed defaults for scalar fields
  for (const f of fields) {
    if (f.groupId) continue; // groups handled below
    if (f.type === 'date' && f.defaultToday) {
      init[f.name] = todayIso();
    } else if (f.defaultValue !== undefined && f.defaultValue !== '') {
      init[f.name] = f.defaultValue;
    }
  }
  // Seed defaults for group fields
  for (const g of groups) {
    const arr: Record<string, string>[] = [{}];
    const gFields = fields.filter((f) => f.groupId === g.id);
    for (const f of gFields) {
      if (f.type === 'date' && f.defaultToday) {
        arr[0][f.name] = todayIso();
      } else if (f.defaultValue !== undefined && f.defaultValue !== '') {
        arr[0][f.name] = f.defaultValue;
      }
    }
    init[g.name] = arr;
  }
  return init;
}
