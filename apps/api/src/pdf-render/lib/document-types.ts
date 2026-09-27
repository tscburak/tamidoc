/**
 * Structural shapes of a composable (flow) template. Plain types — no Mongoose
 * — so the validator and flow renderer stay decoupled from the ODM, mirroring
 * `pdf-render/lib/types.ts` for the Fixed-layout Template (form) renderer.
 *
 * A document is an ordered list of blocks. Each block is a discriminated union
 * (`type` + type-specific `inputs`). Container blocks (`section`, legacy
 * `columns`) nest child blocks. The same `DocBlock[]` shape is what a human
 * composes in the block picker and what an AI agent emits as JSON.
 */

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'bullet-list'
  | 'numbered-list'
  | 'image'
  | 'table'
  | 'quote'
  | 'callout'
  | 'code'
  | 'divider'
  | 'stat-grid'
  | 'section'
  | 'columns';

export type DocumentFormat = 'document' | 'slides';
export type DocumentPageSize =
  'A4' | 'A3' | 'A5' | 'letter' | 'legal' | 'tabloid' | '16:9';

export interface DocBlock {
  id: string;
  type: BlockType;
  inputs: Record<string, unknown>;
  /** Only for container blocks (section, legacy columns). */
  children?: DocBlock[];
  /** Slides: start a new slide before this block. Document: force a page break. */
  pageBreak?: boolean;
}

/** Layout inputs of a `section` container: main-axis direction plus
 * main-axis (`justify`) and cross-axis (`align`) placement of children.
 * Layout-only v1 — no box styling (background/border/padding) yet. */
export interface SectionInputs {
  direction?: 'vertical' | 'horizontal';
  justify?: 'start' | 'center' | 'end' | 'between';
  align?: 'start' | 'center' | 'end' | 'stretch';
  blocks: DocBlock[];
}

export interface DocumentTheme {
  fontFamily: string;
  baseFontSize: number;
  colors: {
    primary: string;
    heading: string;
    body: string;
    muted: string;
  };
  spacing: number;
  pagePadding?: number;
  /** Per-page running header (blank text falls back to the document title). */
  header?: { enabled: boolean; text?: string; editable?: boolean };
  /** Per-page footer line. */
  footer?: { enabled: boolean; text?: string; editable?: boolean };
  /** Per-page page numbering. */
  pageNumbering?: { enabled: boolean; format?: string };
}

/** A curated, pre-composed bundle of blocks a filler can insert as one unit. */
export interface DocumentSection {
  id: string;
  name: string;
  description?: string;
  blocks: DocBlock[];
}

/**
 * The author-defined schema of a document template: which block types are
 * allowed (the "component collection"), the theme, and optional curated
 * sections. Mirrors `DocumentConfig` on the Template entity.
 */
export interface DocumentConfig {
  format: DocumentFormat;
  pageSize: DocumentPageSize;
  orientation?: 'portrait' | 'landscape';
  theme: DocumentTheme;
  allowedBlocks: BlockType[];
  sections?: DocumentSection[];
  /**
   * Template-level per-component default styles (resolution level 4):
   * `{ [componentKey]: { styles: { color?, background?, fontSize? } } }`.
   * Consumed by the renderer; validated against COMPONENT_DEFAULTS_JSON_SCHEMA.
   */
  componentDefaults?: Record<string, unknown>;
}

/** What the flow renderer consumes. `title` + `blocks` come from the generate
 * request; `format`/`pageSize`/`theme` come from the template's config. */
export interface RenderDocument {
  name: string;
  title?: string;
  format: DocumentFormat;
  pageSize: DocumentPageSize;
  orientation?: 'portrait' | 'landscape';
  theme: DocumentTheme;
  blocks: DocBlock[];
  /** Template-level per-component default styles (see DocumentConfig). */
  componentDefaults?: Record<string, unknown>;
}
