/**
 * Pure block-list operations (shared by fill mode and any block canvas).
 * All functions are immutable — they return new arrays.
 */
import type { DocBlock } from '../../context/TemplateStoreProvider';
import {
  childListsOf,
  cloneBlock,
  isContainerType,
  makeBlock,
  mapChildLists,
} from './blockCatalog';

export function blockSummary(block: DocBlock): string {
  const inputs = block.inputs ?? {};
  const first = (v: unknown): string =>
    typeof v === 'string' && v.trim() ? v.trim() : '';
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'quote':
      return first(inputs.text).slice(0, 80);
    case 'callout':
      return first(inputs.title) || first(inputs.body).slice(0, 80);
    case 'code':
      return first(inputs.code).slice(0, 60);
    case 'bullet-list':
    case 'numbered-list':
      return Array.isArray(inputs.items)
        ? `${(inputs.items as unknown[]).length} items`
        : '';
    case 'image':
      return first(inputs.caption) || first(inputs.src).slice(0, 60);
    case 'table': {
      const cols = Array.isArray(inputs.columns) ? inputs.columns.length : 0;
      const rows = Array.isArray(inputs.rows) ? inputs.rows.length : 0;
      return `${cols} × ${rows} table`;
    }
    case 'stat-grid':
      return Array.isArray(inputs.stats)
        ? `${(inputs.stats as unknown[]).length} stats`
        : '';
    case 'columns': {
      const cols = Array.isArray(inputs.columns)
        ? (inputs.columns as unknown[][])
        : [];
      const total = cols.reduce((n, c) => n + c.length, 0);
      return `${cols.length} columns · ${total} blocks`;
    }
    case 'section': {
      const kids = Array.isArray(inputs.blocks)
        ? (inputs.blocks as unknown[])
        : [];
      const dir = inputs.direction === 'horizontal' ? 'horizontal' : 'vertical';
      return `${kids.length} blocks · ${dir}`;
    }
    default:
      return '';
  }
}

export function updateBlockAt(
  blocks: DocBlock[],
  id: string,
  fn: (b: DocBlock) => DocBlock,
): DocBlock[] {
  return blocks.map((b) => {
    if (b.id === id) return fn(b);
    if (isContainerType(b.type)) {
      const next = mapChildLists(b, (list) => updateBlockAt(list, id, fn));
      if (next !== b) return next;
    }
    return b;
  });
}

export function removeBlockAt(blocks: DocBlock[], id: string): DocBlock[] {
  const filtered = blocks.filter((b) => b.id !== id);
  return filtered.map((b) => {
    if (isContainerType(b.type)) {
      return mapChildLists(b, (list) => removeBlockAt(list, id));
    }
    return b;
  });
}

export function findBlock(
  blocks: DocBlock[],
  id: string,
): DocBlock | undefined {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (isContainerType(b.type)) {
      for (const list of childListsOf(b)) {
        const found = findBlock(list, id);
        if (found) return found;
      }
    }
  }
  return undefined;
}

/** Locate a block among its siblings, including children of containers. */
export function findBlockPosition(
  blocks: DocBlock[],
  id: string,
): { index: number; total: number } | undefined {
  const index = blocks.findIndex((b) => b.id === id);
  if (index >= 0) return { index, total: blocks.length };
  for (const block of blocks) {
    for (const list of childListsOf(block)) {
      const position = findBlockPosition(list, id);
      if (position) return position;
    }
  }
  return undefined;
}

/** Append a fresh block; returns the next list plus the new id. */
export function addBlock(
  blocks: DocBlock[],
  type: string,
): { blocks: DocBlock[]; id: string } {
  const block = makeBlock(type);
  return { blocks: [...blocks, block], id: block.id };
}

export function moveBlock(
  blocks: DocBlock[],
  id: string,
  dir: -1 | 1,
): DocBlock[] {
  const idx = blocks.findIndex((b) => b.id === id);
  if (idx < 0) {
    return blocks.map((block) =>
      mapChildLists(block, (list) => moveBlock(list, id, dir)),
    );
  }
  const next = idx + dir;
  if (next < 0 || next >= blocks.length) return blocks;
  const copy = [...blocks];
  [copy[idx], copy[next]] = [copy[next], copy[idx]];
  return copy;
}

/** Duplicate beside the original in its own sibling list; regenerate all ids. */
export function duplicateBlock(blocks: DocBlock[], id: string): DocBlock[] {
  const idx = blocks.findIndex((b) => b.id === id);
  if (idx < 0) {
    return blocks.map((block) =>
      mapChildLists(block, (list) => duplicateBlock(list, id)),
    );
  }
  const copy = cloneBlock(blocks[idx]);
  const next = [...blocks];
  next.splice(idx + 1, 0, copy);
  return next;
}

/** Wrap one run of legacy top-level leaf blocks in a vertical section. */
function wrapRun(run: DocBlock[]): DocBlock {
  const section = makeBlock('section');
  section.pageBreak = run[0].pageBreak;
  section.inputs = {
    ...section.inputs,
    blocks: run.map((block) => {
      const copy = { ...block };
      delete copy.pageBreak;
      return copy;
    }),
  };
  return section;
}

/**
 * Sections-everywhere migration: top level must be sections only. Existing
 * sections pass through; each maximal run of non-section blocks is wrapped
 * in its own vertical section (order + pageBreak flags preserved).
 */
export function ensureSections(blocks: DocBlock[]): DocBlock[] {
  if (blocks.length === 0) return blocks;
  if (blocks.every((b) => b.type === 'section')) return blocks;
  const out: DocBlock[] = [];
  let run: DocBlock[] = [];
  const flush = () => {
    if (run.length > 0) {
      out.push(wrapRun(run));
      run = [];
    }
  };
  for (const b of blocks) {
    if (b.type === 'section') {
      flush();
      out.push(b);
    } else {
      if (b.pageBreak) flush();
      run.push(b);
    }
  }
  flush();
  return out;
}

/** Structural type: legacy configs may not list it — always allow. */
export function ensureSectionAllowed(allowed: string[]): string[] {
  return allowed.includes('section') ? allowed : [...allowed, 'section'];
}
