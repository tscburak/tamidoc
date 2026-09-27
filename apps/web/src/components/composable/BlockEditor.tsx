/**
 * Auto input form for a single block, driven by the catalog field defs.
 * Covers text/textarea/number/select, repeatable string + stat lists, and a
 * small inline table grid editor. Unknown blocks render a fallback note.
 */
import { useId } from 'react';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { DocBlock } from '../../context/TemplateStoreProvider';
import { getBlockDef, type BlockFieldDef } from './blockCatalog';
import { cn } from '../../lib/cn';

const inputClass =
  'w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-800 placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100';

function FieldLabel({
  def,
  htmlFor,
}: {
  def: BlockFieldDef;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-300"
    >
      {def.label}
      {def.required && <span className="ml-0.5 text-orange-600">*</span>}
    </label>
  );
}

function StringListEditor({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const list = values.length > 0 ? values : [''];
  return (
    <div className="flex flex-col gap-1.5">
      {list.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-4 shrink-0 text-center text-xs text-stone-400">
            {i + 1}
          </span>
          <input
            type="text"
            value={v}
            aria-label={`Item ${i + 1}`}
            onChange={(e) => {
              const next = [...list];
              next[i] = e.target.value;
              onChange(next);
            }}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => onChange(list.filter((_, j) => j !== i))}
            disabled={list.length <= 1}
            aria-label={`Remove item ${i + 1}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-950/40"
          >
            <IconTrash size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, ''])}
        className="flex items-center gap-1 self-start rounded-md px-1.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950/40"
      >
        <IconPlus size={13} /> Add item
      </button>
    </div>
  );
}

function StatListEditor({
  stats,
  onChange,
}: {
  stats: { value: string; label: string }[];
  onChange: (next: { value: string; label: string }[]) => void;
}) {
  const list = stats.length > 0 ? stats : [{ value: '', label: '' }];
  return (
    <div className="flex flex-col gap-1.5">
      {list.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="text"
            value={s.value}
            onChange={(e) => {
              const next = [...list];
              next[i] = { ...next[i], value: e.target.value };
              onChange(next);
            }}
            placeholder="Value"
            aria-label={`Stat ${i + 1} value`}
            className={cn(inputClass, 'font-semibold')}
          />
          <input
            type="text"
            value={s.label}
            onChange={(e) => {
              const next = [...list];
              next[i] = { ...next[i], label: e.target.value };
              onChange(next);
            }}
            placeholder="Label"
            aria-label={`Stat ${i + 1} label`}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => onChange(list.filter((_, j) => j !== i))}
            disabled={list.length <= 1}
            aria-label={`Remove stat ${i + 1}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-950/40"
          >
            <IconTrash size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, { value: '', label: '' }])}
        className="flex items-center gap-1 self-start rounded-md px-1.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950/40"
      >
        <IconPlus size={13} /> Add stat
      </button>
    </div>
  );
}

interface TableModel {
  columns: { label: string; align?: 'left' | 'center' | 'right' }[];
  rows: { cells: string[] }[];
}

function normalizeTable(inputs: Record<string, unknown>): TableModel {
  const rawCols = Array.isArray(inputs.columns) ? inputs.columns : [];
  const columns =
    rawCols.length > 0
      ? rawCols.map((c) => ({
          ...c,
          label:
            typeof (c as { label?: unknown })?.label === 'string'
              ? (c as { label: string }).label
              : '',
        }))
      : [{ label: '' }];
  const rawRows = Array.isArray(inputs.rows) ? inputs.rows : [];
  const rows =
    rawRows.length > 0
      ? rawRows.map((r) => {
          const cells = Array.isArray((r as { cells?: unknown })?.cells)
            ? (r as { cells: unknown[] }).cells.map((c) =>
                typeof c === 'string' ? c : '',
              )
            : [];
          while (cells.length < columns.length) cells.push('');
          return { cells: cells.slice(0, Math.max(columns.length, 1)) };
        })
      : [{ cells: columns.map(() => '') }];
  return { columns, rows };
}

function TableEditor({
  inputs,
  onChange,
}: {
  inputs: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const { columns, rows } = normalizeTable(inputs);
  const set = (next: TableModel) =>
    onChange({ columns: next.columns, rows: next.rows });

  const setCell = (ri: number, ci: number, v: string) => {
    const next = { columns, rows: rows.map((r) => ({ cells: [...r.cells] })) };
    next.rows[ri].cells[ci] = v;
    set(next);
  };
  const setHeader = (ci: number, v: string) => {
    const next = { columns: columns.map((c) => ({ ...c })), rows };
    next.columns[ci].label = v;
    set(next);
  };
  const addColumn = () =>
    set({
      columns: [...columns, { label: `Column ${columns.length + 1}` }],
      rows: rows.map((r) => ({ cells: [...r.cells, ''] })),
    });
  const removeColumn = (ci: number) => {
    if (columns.length <= 1) return;
    set({
      columns: columns.filter((_, i) => i !== ci),
      rows: rows.map((r) => ({ cells: r.cells.filter((_, i) => i !== ci) })),
    });
  };
  const addRow = () =>
    set({ columns, rows: [...rows, { cells: columns.map(() => '') }] });
  const removeRow = (ri: number) => {
    if (rows.length <= 1) return;
    set({ columns, rows: rows.filter((_, i) => i !== ri) });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-md border border-stone-200 dark:border-stone-700">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-stone-100 dark:bg-stone-800">
              {columns.map((c, ci) => (
                <th
                  key={ci}
                  className="min-w-24 border-b border-stone-200 p-1 dark:border-stone-700"
                >
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={c.label}
                      onChange={(e) => setHeader(ci, e.target.value)}
                      placeholder={`Column ${ci + 1}`}
                      aria-label={`Column ${ci + 1} header`}
                      className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs font-semibold text-stone-700 focus:border-orange-400 focus:bg-white focus:outline-none dark:text-stone-200 dark:focus:bg-stone-900"
                    />
                    <button
                      type="button"
                      onClick={() => removeColumn(ci)}
                      disabled={columns.length <= 1}
                      aria-label={`Remove column ${ci + 1}`}
                      className="text-stone-300 hover:text-red-500 disabled:opacity-30"
                    >
                      <IconTrash size={12} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="group/row">
                {r.cells.map((cell, ci) => (
                  <td
                    key={ci}
                    className="border-b border-stone-100 p-1 dark:border-stone-800"
                  >
                    <input
                      type="text"
                      value={cell}
                      onChange={(e) => setCell(ri, ci, e.target.value)}
                      aria-label={`Row ${ri + 1} column ${ci + 1}`}
                      className="w-full rounded border border-transparent px-1.5 py-1 text-xs text-stone-700 focus:border-orange-400 focus:outline-none dark:text-stone-200"
                    />
                  </td>
                ))}
                <td className="w-8 border-b border-stone-100 p-1 dark:border-stone-800">
                  <button
                    type="button"
                    onClick={() => removeRow(ri)}
                    disabled={rows.length <= 1}
                    aria-label={`Remove row ${ri + 1}`}
                    className="text-stone-300 opacity-0 hover:text-red-500 group-hover/row:opacity-100 disabled:opacity-30"
                  >
                    <IconTrash size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addColumn}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950/40"
        >
          <IconPlus size={13} /> Column
        </button>
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950/40"
        >
          <IconPlus size={13} /> Row
        </button>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-stone-500">
          <input
            type="checkbox"
            checked={inputs.header !== false}
            onChange={(e) => onChange({ header: e.target.checked })}
            className="size-3.5 rounded accent-orange-600"
          />
          Header row
        </label>
      </div>
    </div>
  );
}

export function BlockEditor({
  block,
  onChange,
}: {
  block: DocBlock;
  onChange: (inputs: Record<string, unknown>) => void;
}) {
  const fieldPrefix = useId();
  const def = getBlockDef(block.type);
  if (!def) {
    return (
      <p className="rounded-md border border-dashed border-stone-300 p-2 text-xs text-stone-400">
        Unknown block type “{block.type}”.
      </p>
    );
  }
  if (def.fields.length === 0) {
    return (
      <p className="rounded-md bg-stone-100 p-2 text-xs text-stone-400 dark:bg-stone-800 dark:text-stone-500">
        {block.type === 'divider'
          ? 'A divider needs no settings.'
          : 'Configure columns below — add blocks into each column.'}
      </p>
    );
  }

  const patch = (key: string, value: unknown) => {
    const next = { ...block.inputs };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      {def.fields.map((field) => {
        const value = block.inputs[field.key];
        const fieldId = `${fieldPrefix}-${field.key}`;
        return (
          <div key={field.key}>
            {field.type === 'table-editor' ? (
              <>
                <FieldLabel def={field} />
                <TableEditor
                  inputs={block.inputs}
                  onChange={(p) => onChange({ ...block.inputs, ...p })}
                />
              </>
            ) : field.type === 'string-list' ? (
              <>
                <FieldLabel def={field} />
                <StringListEditor
                  values={Array.isArray(value) ? (value as string[]) : []}
                  onChange={(next) => patch(field.key, next)}
                />
              </>
            ) : field.type === 'stat-list' ? (
              <>
                <FieldLabel def={field} />
                <StatListEditor
                  stats={
                    Array.isArray(value)
                      ? (value as { value: string; label: string }[])
                      : []
                  }
                  onChange={(next) => patch(field.key, next)}
                />
              </>
            ) : field.type === 'textarea' ? (
              <>
                <FieldLabel def={field} htmlFor={fieldId} />
                <textarea
                  id={fieldId}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(e) => patch(field.key, e.target.value)}
                  rows={3}
                  placeholder={field.placeholder}
                  className={cn(inputClass, 'resize-y')}
                />
              </>
            ) : field.type === 'number' ? (
              <>
                <FieldLabel def={field} htmlFor={fieldId} />
                <input
                  id={fieldId}
                  type="number"
                  value={typeof value === 'number' ? value : ''}
                  min={field.min}
                  max={field.max}
                  onChange={(e) =>
                    patch(
                      field.key,
                      e.target.value === ''
                        ? undefined
                        : Number(e.target.value),
                    )
                  }
                  className={cn(inputClass, 'w-28')}
                />
              </>
            ) : field.type === 'select' ? (
              <>
                <FieldLabel def={field} htmlFor={fieldId} />
                <select
                  id={fieldId}
                  value={String(value ?? '')}
                  onChange={(e) => {
                    const opt = field.options?.find(
                      (o) => String(o.value) === e.target.value,
                    );
                    patch(field.key, opt?.value);
                  }}
                  className={inputClass}
                >
                  <option value="" disabled={field.required}>
                    —
                  </option>
                  {field.options?.map((o) => (
                    <option key={String(o.value)} value={String(o.value)}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <FieldLabel def={field} htmlFor={fieldId} />
                <input
                  id={fieldId}
                  type="text"
                  value={typeof value === 'string' ? value : ''}
                  onChange={(e) => patch(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className={inputClass}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
