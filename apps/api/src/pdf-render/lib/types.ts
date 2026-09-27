/**
 * Structural shapes of a Template, as needed for server-side rendering. These
 * mirror the interfaces in `templates/schemas/template.schema.ts` but are plain
 * (no Mongoose) so the renderer stays decoupled from the ODM. Callers pass the
 * `.toObject()` of a Template document.
 */

export interface RenderBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderCanvasSize {
  width: number;
  height: number;
}

export interface RenderBaseComponent extends RenderBox {
  id: string;
  kind: 'text' | 'image' | 'shape' | 'table';
  rotation: number;
  page: number;
}

export interface RenderTextMark {
  color?: string;
  start: number;
  end: number;
  fontWeight?: string;
  fontSize?: number;
  fontStyle?: string;
  textDecoration?: string;
}

export interface RenderTextComponent extends RenderBaseComponent {
  importedText?: ImportedTextLayout;
  fontAscent?: number;
  fontFamily?: string;
  kind: 'text';
  content: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  textDecoration: string;
  color: string;
  align: string;
  lineHeight: number;
  marks?: RenderTextMark[];
}

/** Fixed source positions for an imported paragraph, discarded on text edits. */
export interface ImportedTextLayout {
  content: string;
  fontFamily?: string;
  marks?: RenderTextMark[];
  width: number;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  lineHeight: number;
  fragments: {
    start: number;
    end: number;
    x: number;
    baseline: number;
    width: number;
    /** Fit substituted glyphs to the source width until the text is edited. */
    fitWidth?: boolean;
  }[];
}

export interface RenderImageComponent extends RenderBaseComponent {
  kind: 'image';
  src: string;
  alt: string;
  objectFit: string;
  radius: number;
  field?: string;
}

export interface RenderShapeComponent extends RenderBaseComponent {
  kind: 'shape';
  shape: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
}

export interface RenderTableComponent extends RenderBaseComponent {
  kind: 'table';
  rows: number;
  cols: number;
  cells: string[];
  colWidths?: number[];
  rowHeight: number;
  border: string;
  zebra: boolean;
  zebraColor: string;
  headerFill: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  align: string;
}

export type RenderComponent =
  | RenderTextComponent
  | RenderImageComponent
  | RenderShapeComponent
  | RenderTableComponent;

export interface RenderGroup {
  id: string;
  name: string;
  memberIds: string[];
  repeating: boolean;
  direction: 'row' | 'column';
}

export interface RenderField {
  name: string;
  type: string;
  required: boolean;
  groupId?: string | null;
  // Per-field metadata for fill-time UX
  defaultValue?: string;
  placeholder?: string;
  info?: string;
  section?: string;
  options?: { value: string; label: string }[];
  defaultToday?: boolean;
  /** Read-only at fill time (prefilled with defaultValue, not editable). */
  disabled?: boolean;
  /** Hidden from the filler; PDF still carries it filled with defaultValue. */
  visible?: boolean;
  /** Hidden from the filler; the form owner is prompted for the value when
   *  generating/downloading the document (scalar fields only). */
  askOnGenerate?: boolean;
}

export interface RenderTemplate {
  name: string;
  canvas: {
    size: RenderCanvasSize;
    components: RenderComponent[];
  };
  groups: RenderGroup[];
  fields: RenderField[];
}

/** One fill value per field key. Scalars keyed by field name; repeating groups
 * keyed by group name → array of per-entry { fieldName: value } objects. Mirrors
 * `FillValues` in FillTemplatePage.tsx. */
export type FillValues = Record<string, string | Record<string, string>[]>;
