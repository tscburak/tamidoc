/**
 * Editable block list: select-to-expand cards with schema-driven inputs,
 * reorder / duplicate / delete, page-break toggle, and one-level columns
 * nesting. Used by fill mode; edit mode intentionally has no block canvas.
 */
import { useMemo, useState } from 'react';
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronDown,
  IconCopy,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import type { DocBlock } from '../../context/TemplateStoreProvider';
import {
  BLOCK_TYPES,
  canNestInside,
  getBlockDef,
  makeBlock,
} from './blockCatalog';
import { BlockEditor } from './BlockEditor';
import {
  blockSummary,
  duplicateBlock,
  moveBlock,
  removeBlockAt,
  updateBlockAt,
} from './blockOps';
import { cn } from '../../lib/cn';

export interface BlockIssue {
  instanceId?: string;
  message: string;
  fix: string;
}

function BlockCard({
  block, index, total, selected, issues, depth, allowedTypes,
  onSelect, onPatch, onMove, onDuplicate, onDelete,
}: {
  block: DocBlock;
  index: number;
  total: number;
  selected: boolean;
  issues: BlockIssue[];
  depth: number;
  allowedTypes: Set<string>;
  onSelect: (id: string | null) => void;
  onPatch: (id: string, patch: Partial<DocBlock>) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const def = getBlockDef(block.type);
  const summary = blockSummary(block);
  const hasIssues = issues.length > 0;

  return (
    <div
      className={cn(
        'rounded-lg border bg-white transition-colors dark:bg-stone-900',
        selected
          ? 'border-orange-400 ring-1 ring-orange-500/30'
          : hasIssues
            ? 'border-red-300'
            : 'border-stone-200 hover:border-stone-300 dark:border-stone-700',
      )}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-stone-400">
          {index + 1}
        </span>
        <button
          type="button"
          onClick={() => onSelect(selected ? null : block.id)}
          aria-expanded={selected}
          className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left"
        >
          <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:bg-stone-800 dark:text-stone-300">
            {def?.name ?? block.type}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-stone-500 dark:text-stone-400">
            {summary}
          </span>
          {hasIssues && (
            <span className="size-2 shrink-0 rounded-full bg-red-500" title="Validation issue" />
          )}
          <IconChevronDown
            size={14}
            className={cn('shrink-0 text-stone-400 transition-transform', selected && 'rotate-180')}
          />
        </button>
        <div className="flex shrink-0 items-center">
          <button type="button" onClick={() => onMove(block.id, -1)} disabled={index === 0}
            aria-label="Move up" title="Move up"
            className="flex size-7 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30 dark:hover:bg-stone-800">
            <IconArrowUp size={14} />
          </button>
          <button type="button" onClick={() => onMove(block.id, 1)} disabled={index >= total - 1}
            aria-label="Move down" title="Move down"
            className="flex size-7 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30 dark:hover:bg-stone-800">
            <IconArrowDown size={14} />
          </button>
          <button type="button" onClick={() => onDuplicate(block.id)}
            aria-label="Duplicate" title="Duplicate"
            className="flex size-7 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800">
            <IconCopy size={14} />
          </button>
          <button type="button" onClick={() => onDelete(block.id)}
            aria-label="Delete" title="Delete"
            className="flex size-7 items-center justify-center rounded text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40">
            <IconTrash size={14} />
          </button>
        </div>
      </div>

      {selected && (
        <div className="flex flex-col gap-3 border-t border-stone-100 p-3 dark:border-stone-800">
          <BlockEditor
            block={block}
            onChange={(inputs) => onPatch(block.id, { inputs })}
          />
          {block.type === 'columns' && depth === 0 && (
            <ColumnsEditor
              block={block}
              allowedTypes={allowedTypes}
              onPatch={onPatch}
            />
          )}
          {block.type === 'section' && (
            <SectionEditor
              block={block}
              allowedTypes={allowedTypes}
              onPatch={onPatch}
            />
          )}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-500">
            <input
              type="checkbox"
              checked={!!block.pageBreak}
              onChange={(e) => onPatch(block.id, { pageBreak: e.target.checked || undefined })}
              className="size-3.5 rounded accent-orange-600"
            />
            Start new page before this block
          </label>
          {hasIssues && (
            <div className="flex flex-col gap-1 rounded-md bg-red-50 p-2 dark:bg-red-950/30">
              {issues.map((issue, i) => (
                <p key={i} className="text-xs text-red-700 dark:text-red-300">
                  {issue.message} {issue.fix}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ColumnsEditor({
  block, allowedTypes, onPatch,
}: {
  block: DocBlock;
  allowedTypes: Set<string>;
  onPatch: (id: string, patch: Partial<DocBlock>) => void;
}) {
  const cols = (Array.isArray(block.inputs?.columns)
    ? (block.inputs.columns as DocBlock[][])
    : [[], []]).map((c) => (Array.isArray(c) ? c : []));

  const setCols = (next: DocBlock[][]) =>
    onPatch(block.id, { inputs: { ...block.inputs, columns: next } });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-stone-600 dark:text-stone-300">
          Columns ({cols.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => cols.length > 1 && setCols(cols.slice(0, -1))}
            disabled={cols.length <= 1}
            aria-label="Remove column"
            className="rounded border border-stone-300 px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-100 disabled:opacity-30 dark:border-stone-600"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => cols.length < 4 && setCols([...cols, []])}
            disabled={cols.length >= 4}
            aria-label="Add column"
            className="rounded border border-stone-300 px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-100 disabled:opacity-30 dark:border-stone-600"
          >
            +
          </button>
        </div>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
        {cols.map((col, ci) => (
          <div key={ci} className="flex min-w-0 flex-col gap-1.5 rounded-md bg-stone-50 p-1.5 dark:bg-stone-800/60">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
              Column {ci + 1}
            </span>
            {col.map((child) => (
              <MiniBlockRow
                key={child.id}
                block={child}
                onRemove={() => setCols(cols.map((c, i) => (i === ci ? c.filter((b) => b.id !== child.id) : c)))}
              />
            ))}
            <ColumnAddButton
              allowedTypes={allowedTypes}
              onAdd={(type) => setCols(cols.map((c, i) => (i === ci ? [...c, makeBlock(type)] : c)))}
            />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-stone-400">
        Nested blocks support one level. Columns cannot contain columns.
      </p>
    </div>
  );
}

function MiniBlockRow({ block, onRemove }: { block: DocBlock; onRemove: () => void }) {
  const def = getBlockDef(block.type);
  return (
    <div className="flex items-center gap-1 rounded border border-stone-200 bg-white px-1.5 py-1 dark:border-stone-700 dark:bg-stone-900">
      <span className="min-w-0 flex-1 truncate text-[11px] text-stone-600 dark:text-stone-300">
        {def?.name}: {blockSummary(block)}
      </span>
      <button type="button" onClick={onRemove} aria-label="Remove nested block"
        className="text-stone-300 hover:text-red-500">
        <IconTrash size={12} />
      </button>
    </div>
  );
}

function SectionEditor({
  block, allowedTypes, onPatch,
}: {
  block: DocBlock;
  allowedTypes: Set<string>;
  onPatch: (id: string, patch: Partial<DocBlock>) => void;
}) {
  const kids = Array.isArray(block.inputs?.blocks)
    ? (block.inputs.blocks as DocBlock[])
    : [];
  const horizontal = block.inputs?.direction === 'horizontal';
  const setKids = (next: DocBlock[]) =>
    onPatch(block.id, { inputs: { ...block.inputs, blocks: next } });

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-stone-600 dark:text-stone-300">
        Section blocks ({kids.length}){horizontal ? ' · side by side' : ''}
      </span>
      {kids.map((child) => (
        <MiniBlockRow
          key={child.id}
          block={child}
          onRemove={() => setKids(kids.filter((b) => b.id !== child.id))}
        />
      ))}
      <NestedAddButton
        parentType="section"
        allowedTypes={allowedTypes}
        onAdd={(type) => setKids([...kids, makeBlock(type)])}
      />
      <p className="text-[11px] text-stone-400">
        Sections cannot nest inside sections — one container level.
      </p>
    </div>
  );
}

function ColumnAddButton({
  allowedTypes, onAdd,
}: {
  allowedTypes: Set<string>;
  onAdd: (type: string) => void;
}) {
  return <NestedAddButton parentType="columns" allowedTypes={allowedTypes} onAdd={onAdd} />;
}

function NestedAddButton({
  parentType, allowedTypes, onAdd,
}: {
  parentType: string;
  allowedTypes: Set<string>;
  onAdd: (type: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = BLOCK_TYPES.filter(
    (b) => canNestInside(parentType, b.type) && allowedTypes.has(b.type),
  );
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-stone-300 py-1 text-[11px] text-stone-400 hover:border-orange-400 hover:text-orange-600 dark:border-stone-600"
      >
        <IconPlus size={12} /> Add
      </button>
      {open && (
        <div className="absolute inset-x-0 bottom-full z-10 mb-1 max-h-48 overflow-auto rounded-md border border-stone-200 bg-white p-1 shadow-lg dark:border-stone-700 dark:bg-stone-900">
          {options.map((b) => (
            <button
              key={b.type}
              type="button"
              onClick={() => { onAdd(b.type); setOpen(false); }}
              className="block w-full rounded px-2 py-1 text-left text-[11px] text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BlockList({
  blocks,
  onChange,
  allowedBlocks,
  issues = [],
  sectionsOnly = false,
}: {
  blocks: DocBlock[];
  onChange: (blocks: DocBlock[]) => void;
  allowedBlocks?: string[];
  issues?: BlockIssue[];
  /** Sections-everywhere mode: empty-state copy points at sections. */
  sectionsOnly?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allowedTypes = useMemo(
    () =>
      new Set(
        allowedBlocks && allowedBlocks.length > 0
          ? allowedBlocks
          : BLOCK_TYPES.map((b) => b.type),
      ),
    [allowedBlocks],
  );

  const issuesByBlock = useMemo(() => {
    const map = new Map<string, BlockIssue[]>();
    for (const issue of issues) {
      if (!issue.instanceId) continue;
      const list = map.get(issue.instanceId) ?? [];
      list.push(issue);
      map.set(issue.instanceId, list);
    }
    return map;
  }, [issues]);

  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-auto pr-0.5" role="list" aria-label="Document blocks">
      {blocks.length === 0 && (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-stone-300 p-8 text-center dark:border-stone-700">
          <p className="text-sm font-medium text-stone-500">Empty document</p>
          <p className="max-w-xs text-xs text-stone-400">
            {sectionsOnly
              ? 'Add your first section from the library, then fill it with blocks.'
              : 'Pick a component from the library to add your first block.'}
          </p>
        </div>
      )}
      {blocks.map((block, i) => (
        <div key={block.id} role="listitem">
          <BlockCard
            block={block}
            index={i}
            total={blocks.length}
            selected={selectedId === block.id}
            issues={issuesByBlock.get(block.id) ?? []}
            depth={0}
            allowedTypes={allowedTypes}
            onSelect={setSelectedId}
            onPatch={(id, patch) => onChange(updateBlockAt(blocks, id, (b) => ({ ...b, ...patch })))}
            onMove={(id, dir) => onChange(moveBlock(blocks, id, dir))}
            onDuplicate={(id) => onChange(duplicateBlock(blocks, id))}
            onDelete={(id) => {
              onChange(removeBlockAt(blocks, id));
              if (selectedId === id) setSelectedId(null);
            }}
          />
        </div>
      ))}
    </div>
  );
}
