/**
 * Frontend catalog for composable document blocks. Mirrors the backend
 * `BLOCK_CATALOG` in `pdf-render/lib/flow-blocks.ts` — the single source of
 * truth stays backend-side (validation + rendering); this file only drives
 * the composer UI (picker labels, default inputs, auto input forms).
 */
import type { DocBlock } from '../../context/TemplateStoreProvider';

export type { DocBlock };

export type BlockFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'string-list'
  | 'stat-list'
  | 'table-editor';

export interface BlockFieldOption {
  value: string | number;
  label: string;
}

export interface BlockFieldDef {
  key: string;
  label: string;
  type: BlockFieldType;
  placeholder?: string;
  required?: boolean;
  options?: BlockFieldOption[];
  min?: number;
  max?: number;
}

export interface BlockTypeDef {
  type: string;
  name: string;
  description: string;
  category: 'text' | 'media' | 'data' | 'layout';
  fields: BlockFieldDef[];
  defaultInputs: () => Record<string, unknown>;
  /** Realistic content for the edit-mode detail preview. */
  sampleInputs: () => Record<string, unknown>;
}

export const BLOCK_TYPES: BlockTypeDef[] = [
  {
    type: 'heading',
    name: 'Heading',
    description: 'Section heading, levels 1–4.',
    category: 'text',
    fields: [
      { key: 'text', label: 'Text', type: 'text', required: true, placeholder: 'Section title' },
      {
        key: 'level', label: 'Level', type: 'select', required: true,
        options: [
          { value: 1, label: 'H1' }, { value: 2, label: 'H2' },
          { value: 3, label: 'H3' }, { value: 4, label: 'H4' },
        ],
      },
      {
        key: 'align', label: 'Alignment', type: 'select',
        options: [
          { value: 'left', label: 'Left' }, { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ],
      },
    ],
    defaultInputs: () => ({ text: '', level: 1 }),
    sampleInputs: () => ({ text: 'Getting started', level: 2 }),
  },
  {
    type: 'paragraph',
    name: 'Paragraph',
    description: 'Plain body text block.',
    category: 'text',
    fields: [
      { key: 'text', label: 'Text', type: 'textarea', required: true, placeholder: 'Write a paragraph…' },
    ],
    defaultInputs: () => ({ text: '' }),
    sampleInputs: () => ({ text: 'This guide walks through the core concepts step by step.' }),
  },
  {
    type: 'bullet-list',
    name: 'Bullet List',
    description: 'Unordered list of items.',
    category: 'text',
    fields: [
      { key: 'items', label: 'Items', type: 'string-list', required: true },
      {
        key: 'style', label: 'Bullet style', type: 'select',
        options: [
          { value: 'disc', label: 'Disc' }, { value: 'circle', label: 'Circle' },
          { value: 'square', label: 'Square' }, { value: 'dash', label: 'Dash' },
        ],
      },
    ],
    defaultInputs: () => ({ items: [''] }),
    sampleInputs: () => ({ items: ['First key point', 'Second key point', 'Third key point'] }),
  },
  {
    type: 'numbered-list',
    name: 'Numbered List',
    description: 'Ordered list of items.',
    category: 'text',
    fields: [
      { key: 'items', label: 'Items', type: 'string-list', required: true },
      { key: 'start', label: 'Start at', type: 'number', min: 1 },
    ],
    defaultInputs: () => ({ items: [''] }),
    sampleInputs: () => ({ items: ['Prepare the inputs', 'Compose the blocks', 'Export the document'] }),
  },
  {
    type: 'image',
    name: 'Image',
    description: 'Single image with optional caption.',
    category: 'media',
    fields: [
      { key: 'src', label: 'Image URL', type: 'text', required: true, placeholder: 'https://… or storage key' },
      { key: 'alt', label: 'Alt text', type: 'text' },
      { key: 'caption', label: 'Caption', type: 'text' },
      {
        key: 'width', label: 'Width', type: 'select',
        options: [
          { value: 'full', label: 'Full' }, { value: 'half', label: 'Half' },
          { value: 'third', label: 'Third' },
        ],
      },
    ],
    defaultInputs: () => ({ src: '' }),
    sampleInputs: () => ({ src: '', caption: 'Figure 1 — architecture overview' }),
  },
  {
    type: 'table',
    name: 'Table',
    description: 'Data table with optional header row.',
    category: 'data',
    fields: [{ key: '__table', label: 'Table', type: 'table-editor', required: true }],
    defaultInputs: () => ({
      columns: [{ label: 'Column 1' }],
      rows: [{ cells: [''] }],
    }),
    sampleInputs: () => ({
      columns: [{ label: 'Plan' }, { label: 'Price' }],
      rows: [{ cells: ['Starter', '$0'] }, { cells: ['Pro', '$24'] }],
      header: true,
    }),
  },
  {
    type: 'quote',
    name: 'Quote',
    description: 'Quoted text with optional author.',
    category: 'text',
    fields: [
      { key: 'text', label: 'Quote', type: 'textarea', required: true },
      { key: 'author', label: 'Author', type: 'text' },
    ],
    defaultInputs: () => ({ text: '' }),
    sampleInputs: () => ({ text: 'Simplicity is the soul of efficiency.', author: 'Austin Freeman' }),
  },
  {
    type: 'callout',
    name: 'Callout',
    description: 'Highlighted note with tone variant.',
    category: 'text',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea', required: true },
      {
        key: 'tone', label: 'Tone', type: 'select',
        options: [
          { value: 'info', label: 'Info' }, { value: 'success', label: 'Success' },
          { value: 'warning', label: 'Warning' }, { value: 'danger', label: 'Danger' },
        ],
      },
    ],
    defaultInputs: () => ({ body: '', tone: 'info' }),
    sampleInputs: () => ({ title: 'Heads up', body: 'Review the defaults before publishing.', tone: 'warning' }),
  },
  {
    type: 'code',
    name: 'Code Block',
    description: 'Preformatted code snippet.',
    category: 'text',
    fields: [
      { key: 'code', label: 'Code', type: 'textarea', required: true, placeholder: 'paste code…' },
      { key: 'language', label: 'Language', type: 'text', placeholder: 'typescript' },
    ],
    defaultInputs: () => ({ code: '' }),
    sampleInputs: () => ({ code: 'const doc = compose(blocks);', language: 'typescript' }),
  },
  {
    type: 'divider',
    name: 'Divider',
    description: 'Horizontal section divider.',
    category: 'layout',
    fields: [],
    defaultInputs: () => ({}),
    sampleInputs: () => ({}),
  },
  {
    type: 'stat-grid',
    name: 'Stat Grid',
    description: 'Grid of value/label statistics.',
    category: 'data',
    fields: [
      { key: 'stats', label: 'Stats', type: 'stat-list', required: true },
      { key: 'columns', label: 'Columns', type: 'number', min: 1, max: 12 },
    ],
    defaultInputs: () => ({ stats: [{ value: '', label: '' }] }),
    sampleInputs: () => ({ stats: [{ value: '99.9%', label: 'Uptime' }, { value: '4.2s', label: 'Avg. build' }] }),
  },
  {
    type: 'section',
    name: 'Section',
    description: 'Layout container: vertical stack or side-by-side.',
    category: 'layout',
    fields: [
      {
        key: 'direction', label: 'Direction', type: 'select', required: true,
        options: [
          { value: 'vertical', label: 'Vertical (stack)' },
          { value: 'horizontal', label: 'Horizontal (side by side)' },
        ],
      },
      {
        key: 'justify', label: 'Justify (main axis)', type: 'select',
        options: [
          { value: 'start', label: 'Start' }, { value: 'center', label: 'Center' },
          { value: 'end', label: 'End' }, { value: 'between', label: 'Space between' },
        ],
      },
      {
        key: 'align', label: 'Align (cross axis)', type: 'select',
        options: [
          { value: 'start', label: 'Start' }, { value: 'center', label: 'Center' },
          { value: 'end', label: 'End' }, { value: 'stretch', label: 'Stretch' },
        ],
      },
    ],
    defaultInputs: () => ({ direction: 'vertical', justify: 'start', align: 'stretch', blocks: [] }),
    sampleInputs: () => ({
      direction: 'vertical',
      justify: 'start',
      align: 'stretch',
      blocks: [
        { id: 'sample-s1', type: 'heading', inputs: { text: 'Section title', level: 3 } },
        { id: 'sample-s2', type: 'paragraph', inputs: { text: 'Section body text.' } },
      ],
    }),
  },
  {
    type: 'columns',
    name: 'Columns',
    description: 'Side-by-side container for blocks (legacy — prefer Section).',
    category: 'layout',
    fields: [],
    defaultInputs: () => ({ columns: [[], []] }),
    sampleInputs: () => ({
      columns: [
        [{ id: 'sample-c1', type: 'heading', inputs: { text: 'Left', level: 3 } }],
        [{ id: 'sample-c2', type: 'paragraph', inputs: { text: 'Right column content.' } }],
      ],
    }),
  },
];

/** Container block types and the inputs key holding their children. */
export const CONTAINER_CHILD_KEY: Record<string, 'blocks' | 'columns'> = {
  section: 'blocks',
  columns: 'columns',
};

export function isContainerType(type: string): boolean {
  return type in CONTAINER_CHILD_KEY;
}

/** Sections cannot nest inside sections — one container level max. */
export function canNestInside(parentType: string, childType: string): boolean {
  if (parentType === 'section') return childType !== 'section';
  if (parentType === 'columns') return childType !== 'columns' && childType !== 'section';
  return false;
}

/** Read-only child lists of a container (section: one list, columns: one per column). */
export function childListsOf(block: DocBlock): DocBlock[][] {
  if (block.type === 'section' && Array.isArray(block.inputs?.blocks)) {
    return [block.inputs.blocks as DocBlock[]];
  }
  if (block.type === 'columns' && Array.isArray(block.inputs?.columns)) {
    return (block.inputs.columns as DocBlock[][]).filter((c) => Array.isArray(c));
  }
  return [];
}

/** Immutable update of every child list inside a container. */
export function mapChildLists(
  block: DocBlock,
  fn: (list: DocBlock[]) => DocBlock[],
): DocBlock {
  if (block.type === 'section' && Array.isArray(block.inputs?.blocks)) {
    return { ...block, inputs: { ...block.inputs, blocks: fn(block.inputs.blocks as DocBlock[]) } };
  }
  if (block.type === 'columns' && Array.isArray(block.inputs?.columns)) {
    return {
      ...block,
      inputs: {
        ...block.inputs,
        columns: (block.inputs.columns as DocBlock[][]).map((c) => (Array.isArray(c) ? fn(c) : c)),
      },
    };
  }
  return block;
}

const byType = new Map(BLOCK_TYPES.map((b) => [b.type, b]));

export function getBlockDef(type: string): BlockTypeDef | undefined {
  return byType.get(type);
}

/** Theme used by the read-only preview (approximates the PDF output). */
export interface PreviewTheme {
  fontFamily: string;
  baseFontSize: number;
  colors: { primary: string; heading: string; body: string; muted: string };
  spacing: number;
  pagePadding?: number;
}

export const DEFAULT_PREVIEW_THEME: PreviewTheme = {
  fontFamily: 'Lato, sans-serif',
  baseFontSize: 11,
  colors: { primary: '#f97316', heading: '#1c1917', body: '#44403c', muted: '#78716c' },
  spacing: 12,
};

/**
 * Template-level default style for one component type. Token-safe only:
 * hex colors + font-size token. Mirrors the backend ComponentStyleOverride.
 */
export interface ComponentStyle {
  color?: string;
  background?: string;
  fontSize?: '' | 'xs' | 'sm' | 'base' | 'lg' | 'xl';
}

/** `{ [componentKey]: { styles: ComponentStyle } }` — stored in documentConfig. */
export type ComponentDefaults = Record<string, { styles: ComponentStyle }>;

export const FONT_SIZE_OPTIONS: { value: ComponentStyle['fontSize']; label: string }[] = [
  { value: '', label: 'Theme default' },
  { value: 'xs', label: 'XS' },
  { value: 'sm', label: 'Small' },
  { value: 'base', label: 'Base' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'XL' },
];

const FONT_SIZE_MULTIPLIERS: Record<string, number> = {
  xs: 0.75, sm: 0.85, base: 1, lg: 1.2, xl: 1.45,
};

export function fontSizeMultiplier(token: ComponentStyle['fontSize']): number {
  if (!token) return 1;
  return FONT_SIZE_MULTIPLIERS[token] ?? 1;
}

export function componentStyleFor(
  defaults: ComponentDefaults | undefined,
  type: string,
): ComponentStyle {
  return defaults?.[type]?.styles ?? {};
}

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value.trim());
}

let idCounter = 0;

/** Client-side block id (backend treats it as opaque). */
export function newBlockId(): string {
  idCounter += 1;
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `blk_${Date.now().toString(36)}_${idCounter}`;
}

export function makeBlock(type: string): DocBlock {
  const def = getBlockDef(type);
  return {
    id: newBlockId(),
    type,
    inputs: def ? def.defaultInputs() : {},
  };
}

/** Deep clone a block (duplicate keeps content, gets a fresh id). */
export function cloneBlock(block: DocBlock): DocBlock {
  const copy = JSON.parse(JSON.stringify(block)) as DocBlock;
  const reId = (b: DocBlock): void => {
    b.id = newBlockId();
    if (b.type === 'section' && Array.isArray(b.inputs?.blocks)) {
      (b.inputs.blocks as DocBlock[]).forEach(reId);
      return;
    }
    const cols = b.inputs?.columns;
    if (b.type === 'columns' && Array.isArray(cols)) {
      for (const col of cols as DocBlock[][]) {
        if (Array.isArray(col)) col.forEach(reId);
      }
    }
  };
  reId(copy);
  return copy;
}
