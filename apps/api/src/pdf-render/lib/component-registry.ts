/**
 * Component registry for composable documents.
 *
 * Every component carries versioned, immutable definitions: a published
 * version is never edited in place — changes open a new draft version.
 * Documents pin the component version they were created with, so old
 * documents keep rendering with their original versions after updates.
 *
 * The 13 flow blocks in `flow-blocks.ts` ship as built-in v1 definitions.
 * The remaining keys in `RESERVED_COMPONENT_KEYS` are the rest of the
 * 28-component target catalog; their renderers land incrementally.
 */
import type { BlockType } from './document-types';
import { BLOCK_CATALOG, BLOCK_CATEGORY } from './flow-blocks';
import type { LayoutContract } from './layout-contract';

export type ComponentSource = 'built-in' | 'organization' | 'developer';
export type ComponentStatus = 'active' | 'inactive' | 'deprecated';
export type ComponentVersionStatus = 'draft' | 'published' | 'deprecated';

export interface LayoutCapabilities {
  repeatable: boolean;
  container: boolean;
  spanRange?: [number, number];
  supportsKeepTogether: boolean;
  supportsPageBreak: boolean;
  aiSelectable: boolean;
}

export interface ComponentVersion {
  id: string;
  version: number;
  inputSchema: Record<string, unknown>;
  defaultData: Record<string, unknown>;
  styleSchema: Record<string, unknown>;
  defaultStyles: Record<string, unknown>;
  layoutCapabilities: LayoutCapabilities;
  rendererKey: string;
  status: ComponentVersionStatus;
  createdAt: string;
  publishedAt?: string;
}

export interface ComponentDefinition {
  id: string;
  key: string;
  name: string;
  description?: string;
  category: string;
  source: ComponentSource;
  status: ComponentStatus;
  currentVersionId: string;
  versions: ComponentVersion[];
}

/**
 * Reserved keys for the rest of the 28-component target catalog.
 * Renderers arrive incrementally; the keys are pinned now so AI contracts,
 * allowlists, and composition rules can reference them safely.
 */
export const RESERVED_COMPONENT_KEYS = [
  'document-header',
  'cover',
  'title',
  'subtitle',
  'rich-text',
  'key-value-list',
  'metric',
  'metric-grid',
  'steps',
  'timeline',
  'pros-cons',
  'comparison',
  'chart',
  'page-break',
  'spacer',
  'signature-area',
  'footer',
  'header',
  'table-of-contents',
] as const;

export type ReservedComponentKey = (typeof RESERVED_COMPONENT_KEYS)[number];

const META: Record<BlockType, { name: string; description: string }> = {
  heading: { name: 'Heading', description: 'Section heading, levels 1–4.' },
  paragraph: { name: 'Paragraph', description: 'Plain body text block.' },
  'bullet-list': {
    name: 'Bullet List',
    description: 'Unordered list of items.',
  },
  'numbered-list': {
    name: 'Numbered List',
    description: 'Ordered list of items.',
  },
  image: { name: 'Image', description: 'Single image with optional caption.' },
  table: { name: 'Table', description: 'Data table with optional header row.' },
  quote: { name: 'Quote', description: 'Quoted text with optional author.' },
  callout: {
    name: 'Callout',
    description: 'Highlighted note with tone variant.',
  },
  code: { name: 'Code Block', description: 'Preformatted code snippet.' },
  divider: { name: 'Divider', description: 'Horizontal section divider.' },
  'stat-grid': {
    name: 'Stat Grid',
    description: 'Grid of value/label statistics.',
  },
  columns: {
    name: 'Columns',
    description: 'Side-by-side container for blocks (legacy — prefer Section).',
  },
  section: {
    name: 'Section',
    description: 'Layout container: stacks blocks vertically or side by side.',
  },
};

/** Generic style schema shared by built-in v1 components (token-first). */
export const GENERIC_STYLE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    typography: {
      type: 'object',
      properties: {
        fontFamily: { type: 'string' },
        fontSize: { type: 'string', enum: ['xs', 'sm', 'base', 'lg', 'xl'] },
        fontWeight: {
          type: 'string',
          enum: ['normal', 'medium', 'semibold', 'bold'],
        },
      },
      additionalProperties: false,
    },
    color: { type: 'string' },
    background: { type: 'string' },
    border: {
      type: 'object',
      properties: {
        color: { type: 'string' },
        width: { type: 'number' },
        radius: {
          type: 'string',
          enum: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
        },
      },
      additionalProperties: false,
    },
    spacing: {
      type: 'object',
      properties: {
        padding: { type: 'string' },
        margin: { type: 'string' },
        gap: { type: 'string' },
      },
      additionalProperties: false,
    },
    variant: { type: 'string' },
  },
  additionalProperties: false,
};

const CONTAINER_TYPES: Partial<Record<BlockType, boolean>> = {
  section: true,
  columns: true,
};

function defaultDataFor(key: BlockType): Record<string, unknown> {
  const schema = BLOCK_CATALOG[key].jsonSchema as {
    required?: string[];
  };
  const data: Record<string, unknown> = {};
  for (const field of schema.required ?? []) {
    // Defaults must satisfy the published schemas (minItems: 1 etc.), so the
    // registry never hands out a default its own inputSchema rejects.
    if (field === 'columns' && key === 'columns') data[field] = [[]];
    else if (field === 'blocks' && key === 'section') data[field] = [];
    else if (field === 'items') data[field] = [''];
    else if (field === 'stats') data[field] = [{ value: '', label: '' }];
    else if (field === 'columns') data[field] = [{ label: '' }];
    else if (field === 'rows') data[field] = [{ cells: [] }];
    else if (field === 'level') data[field] = 1;
    else data[field] = '';
  }
  return data;
}

function capabilitiesFor(key: BlockType): LayoutCapabilities {
  return {
    repeatable: true,
    container: !!CONTAINER_TYPES[key],
    spanRange: [1, 12],
    supportsKeepTogether: true,
    supportsPageBreak: true,
    aiSelectable: true,
  };
}

function buildDefinition(key: BlockType): ComponentDefinition {
  const spec = BLOCK_CATALOG[key];
  const versionId = `${key}-v1`;
  return {
    id: `cmp_${key}`,
    key,
    name: META[key].name,
    description: META[key].description,
    category: BLOCK_CATEGORY[key],
    source: 'built-in',
    status: 'active',
    currentVersionId: versionId,
    versions: [
      {
        id: versionId,
        version: 1,
        inputSchema: spec.jsonSchema,
        defaultData: defaultDataFor(key),
        styleSchema: GENERIC_STYLE_SCHEMA,
        defaultStyles: {},
        layoutCapabilities: capabilitiesFor(key),
        rendererKey: key,
        status: 'published',
        createdAt: new Date(0).toISOString(),
        publishedAt: new Date(0).toISOString(),
      },
    ],
  };
}

const REGISTRY: Record<string, ComponentDefinition> = {};
for (const key of Object.keys(BLOCK_CATALOG) as BlockType[]) {
  REGISTRY[key] = buildDefinition(key);
}

export function getComponentDefinition(
  key: string,
): ComponentDefinition | undefined {
  return REGISTRY[key];
}

export function listComponentDefinitions(): ComponentDefinition[] {
  return Object.values(REGISTRY);
}

export function getActiveComponentVersion(
  key: string,
): ComponentVersion | undefined {
  const def = REGISTRY[key];
  if (!def) return undefined;
  return def.versions.find((v) => v.id === def.currentVersionId);
}

/**
 * Open a new draft version for an existing definition. Published versions are
 * immutable — this never mutates them, it appends a draft.
 */
export function createDraftVersion(
  key: string,
  patch: Partial<
    Pick<
      ComponentVersion,
      | 'inputSchema'
      | 'defaultData'
      | 'styleSchema'
      | 'defaultStyles'
      | 'layoutCapabilities'
      | 'rendererKey'
    >
  >,
): ComponentVersion {
  const def = REGISTRY[key];
  if (!def) throw new Error(`unknown component "${key}"`);
  const current = getActiveComponentVersion(key);
  if (!current) throw new Error(`component "${key}" has no active version`);
  const next = current.version + 1;
  const snapshot = JSON.parse(JSON.stringify(current)) as ComponentVersion;
  const draft: ComponentVersion = {
    ...snapshot,
    ...patch,
    id: `${key}-v${next}`,
    version: next,
    status: 'draft',
    createdAt: new Date().toISOString(),
    publishedAt: undefined,
  };
  def.versions.push(draft);
  return draft;
}

/**
 * Publish a draft version, making it the current one. The previous published
 * version stays in history untouched so pinned documents keep rendering.
 */
export function publishComponentVersion(
  key: string,
  version: number,
): ComponentVersion {
  const def = REGISTRY[key];
  if (!def) throw new Error(`unknown component "${key}"`);
  const draft = def.versions.find((v) => v.version === version);
  if (!draft) throw new Error(`component "${key}" has no version ${version}`);
  if (draft.status !== 'draft') {
    throw new Error(
      `only draft versions can be published (v${version} is ${draft.status})`,
    );
  }
  draft.status = 'published';
  draft.publishedAt = new Date().toISOString();
  def.currentVersionId = draft.id;
  return draft;
}

export function isReservedComponentKey(key: string): boolean {
  return (RESERVED_COMPONENT_KEYS as readonly string[]).includes(key);
}

/** Default (empty) layout for a fresh component instance. */
export const DEFAULT_INSTANCE_LAYOUT: LayoutContract = {
  display: 'stack',
};
