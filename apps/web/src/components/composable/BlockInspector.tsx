/**
 * Fill-mode right-hand inspector: input form + actions for the block selected
 * in the layer tree. Section layout fields (direction/justify/align) render
 * through the same schema-driven form; container children are managed in the
 * tree, not here.
 */
import {
  IconArrowDown,
  IconArrowUp,
  IconCopy,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import type { DocBlock } from '../../context/TemplateStoreProvider';
import { getBlockDef } from './blockCatalog';
import { BlockEditor } from './BlockEditor';
import { blockSummary } from './blockOps';
import type { BlockIssue } from './BlockList';

export function BlockInspector({
  block,
  isTopLevel,
  index,
  total,
  issues,
  onPatch,
  onMove,
  onDuplicate,
  onDelete,
  onDeselect,
}: {
  block: DocBlock;
  isTopLevel: boolean;
  index: number;
  total: number;
  issues: BlockIssue[];
  onPatch: (patch: Partial<DocBlock>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDeselect: () => void;
}) {
  const def = getBlockDef(block.type);
  const hasIssues = issues.length > 0;

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-auto">
      <div className="flex shrink-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-stone-800 dark:text-stone-100">
              {def?.name ?? block.type}
            </h3>
            {def && (
              <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:bg-stone-800 dark:text-stone-300">
                {def.category}
              </span>
            )}
            {hasIssues && (
              <span
                className="size-2 shrink-0 rounded-full bg-red-500"
                title="Validation issue"
              />
            )}
          </div>
          {blockSummary(block) && (
            <p className="mt-0.5 truncate text-xs text-stone-400">
              {blockSummary(block)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDeselect}
          aria-label="Deselect block"
          className="flex size-7 shrink-0 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
        >
          <IconX size={14} />
        </button>
      </div>

      <BlockEditor block={block} onChange={(inputs) => onPatch({ inputs })} />

      {(block.type === 'section' || block.type === 'columns') && (
        <p className="rounded-md bg-stone-100 px-3 py-2 text-xs leading-relaxed text-stone-500 dark:bg-stone-800 dark:text-stone-400">
          {block.type === 'section'
            ? 'Layout container — add and arrange its blocks from the Layers panel.'
            : 'Legacy side-by-side container — manage each column from the Layers panel.'}
        </p>
      )}

      {isTopLevel && (
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-500">
          <input
            type="checkbox"
            checked={!!block.pageBreak}
            onChange={(e) =>
              onPatch({ pageBreak: e.target.checked || undefined })
            }
            className="size-3.5 rounded accent-orange-600"
          />
          Start new page before this block
        </label>
      )}

      {hasIssues && (
        <div className="flex flex-col gap-1 rounded-md bg-red-50 p-2 dark:bg-red-950/30">
          {issues.map((issue, i) => (
            <p key={i} className="text-xs text-red-700 dark:text-red-300">
              {issue.message} {issue.fix}
            </p>
          ))}
        </div>
      )}

      <div className="mt-auto flex shrink-0 items-center gap-1 border-t border-stone-100 pt-2 dark:border-stone-800">
        <>
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move up"
            title="Move up"
            className="flex size-7 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30 dark:hover:bg-stone-800"
          >
            <IconArrowUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index >= total - 1}
            aria-label="Move down"
            title="Move down"
            className="flex size-7 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30 dark:hover:bg-stone-800"
          >
            <IconArrowDown size={14} />
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            aria-label="Duplicate"
            title="Duplicate"
            className="flex size-7 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
          >
            <IconCopy size={14} />
          </button>
        </>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete block"
          title="Delete block"
          className="flex size-7 items-center justify-center rounded text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
        >
          <IconTrash size={14} />
        </button>
      </div>
    </div>
  );
}
