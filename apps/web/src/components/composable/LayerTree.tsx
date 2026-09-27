/**
 * Fill-mode layer tree: sections behave like groups (expand/collapse with
 * nested children), every row selects the block for the right-hand inspector.
 * Sections and columns expose their own plus-menu to add blocks inside.
 */
import { useMemo, useState } from 'react';
import { IconChevronRight } from '@tabler/icons-react';
import type { DocBlock } from '../../context/TemplateStoreProvider';
import { BLOCK_TYPES, canNestInside, getBlockDef } from './blockCatalog';
import { blockSummary } from './blockOps';
import { AddBlockMenu } from './AddBlockMenu';
import { cn } from '../../lib/cn';

interface TreeCtx {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  allowedTypes: Set<string>;
  issueIds: Set<string>;
  collapsed: Set<string>;
  onToggleCollapse: (id: string) => void;
  onAddToSection: (sectionId: string, type: string) => void;
  onAddToColumn: (columnsId: string, colIndex: number, type: string) => void;
}

function nestableOptions(parentType: string, allowedTypes: Set<string>) {
  return BLOCK_TYPES.filter((b) => canNestInside(parentType, b.type) && allowedTypes.has(b.type));
}

function LayerRow({ block, depth, ctx }: { block: DocBlock; depth: number; ctx: TreeCtx }) {
  const def = getBlockDef(block.type);
  const selected = ctx.selectedId === block.id;
  const hasIssues = ctx.issueIds.has(block.id);
  const isSection = block.type === 'section';
  const isColumns = block.type === 'columns';
  const container = isSection || isColumns;
  const collapsed = container && ctx.collapsed.has(block.id);

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-0.5 rounded-md py-1 pr-1',
          selected
            ? 'bg-orange-100/70 dark:bg-orange-950/50'
            : 'hover:bg-stone-100 dark:hover:bg-stone-800',
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        {container ? (
          <button
            type="button"
            onClick={() => ctx.onToggleCollapse(block.id)}
            aria-label={collapsed ? `Expand ${def?.name ?? block.type}` : `Collapse ${def?.name ?? block.type}`}
            aria-expanded={!collapsed}
            className="flex size-5 shrink-0 items-center justify-center rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
          >
            <IconChevronRight size={13} className={cn('transition-transform', !collapsed && 'rotate-90')} />
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => ctx.onSelect(selected ? null : block.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left"
        >
          <span
            className={cn(
              'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              isSection
                ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200'
                : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-300',
            )}
          >
            {def?.name ?? block.type}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-stone-500 dark:text-stone-400">
            {blockSummary(block)}
          </span>
          {hasIssues && <span className="size-2 shrink-0 rounded-full bg-red-500" title="Validation issue" />}
        </button>
        {isSection && !collapsed && (
          <AddBlockMenu
            small
            title="Add block to section"
            options={nestableOptions('section', ctx.allowedTypes)}
            onAdd={(type) => ctx.onAddToSection(block.id, type)}
          />
        )}
      </div>

      {isSection && !collapsed && (
        <SectionKids block={block} depth={depth} ctx={ctx} />
      )}
      {isColumns && !collapsed && (
        <ColumnsKids block={block} depth={depth} ctx={ctx} />
      )}
    </div>
  );
}

function SectionKids({ block, depth, ctx }: { block: DocBlock; depth: number; ctx: TreeCtx }) {
  const kids = useMemo(
    () => (Array.isArray(block.inputs?.blocks) ? (block.inputs.blocks as DocBlock[]) : []),
    [block.inputs],
  );
  return (
    <>
      {kids.length === 0 && (
        <p className="py-0.5 text-[11px] italic text-stone-400" style={{ paddingLeft: 4 + (depth + 1) * 14 }}>
          Empty — add blocks with +
        </p>
      )}
      {kids.map((child) => (
        <LayerRow key={child.id} block={child} depth={depth + 1} ctx={ctx} />
      ))}
    </>
  );
}

function ColumnsKids({ block, depth, ctx }: { block: DocBlock; depth: number; ctx: TreeCtx }) {
  const cols = useMemo(() => {
    const raw = Array.isArray(block.inputs?.columns) ? (block.inputs.columns as DocBlock[][]) : [];
    return raw.map((c) => (Array.isArray(c) ? c : []));
  }, [block.inputs]);
  return (
    <>
      {cols.map((col, ci) => (
        <div key={ci}>
          <div
            className="flex items-center gap-1 py-0.5 pr-1"
            style={{ paddingLeft: 4 + (depth + 1) * 14 }}
          >
            <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wide text-stone-400">
              Column {ci + 1}
            </span>
            <AddBlockMenu
              small
              title={`Add block to column ${ci + 1}`}
              options={nestableOptions('columns', ctx.allowedTypes)}
              onAdd={(type) => ctx.onAddToColumn(block.id, ci, type)}
            />
          </div>
          {col.map((child) => (
            <LayerRow key={child.id} block={child} depth={depth + 2} ctx={ctx} />
          ))}
        </div>
      ))}
    </>
  );
}

export function LayerTree({
  blocks,
  selectedId,
  allowedTypes,
  issueIds,
  onSelect,
  onAddToSection,
  onAddToColumn,
}: {
  blocks: DocBlock[];
  selectedId: string | null;
  allowedTypes: Set<string>;
  issueIds: Set<string>;
  onSelect: (id: string | null) => void;
  onAddToSection: (sectionId: string, type: string) => void;
  onAddToColumn: (columnsId: string, colIndex: number, type: string) => void;
}) {
  // Collapsed ids only — everything starts expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const onToggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ctx: TreeCtx = {
    selectedId,
    onSelect,
    allowedTypes,
    issueIds,
    collapsed,
    onToggleCollapse,
    onAddToSection,
    onAddToColumn,
  };

  if (blocks.length === 0) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 p-6 text-center dark:border-stone-700">
        <p className="text-sm font-medium text-stone-500">Empty document</p>
        <p className="max-w-xs text-xs text-stone-400">Use + above to add your first block.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-px overflow-auto pr-0.5" role="tree" aria-label="Document layers">
      {blocks.map((block) => (
        <div key={block.id} role="treeitem" aria-selected={selectedId === block.id}>
          <LayerRow block={block} depth={0} ctx={ctx} />
        </div>
      ))}
    </div>
  );
}
