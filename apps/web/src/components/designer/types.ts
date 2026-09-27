/**
 * Canvas component model for the WYSIWYG template designer.
 *
 * All geometry (Box.x/y/width/height) is in **design-space pixels** relative to
 * the canvas top-left — NOT screen pixels. The canvas is rendered at a fixed
 * design size and visually scaled via `transform: scale(zoom)`; every
 * screen↔canvas conversion divides by `zoom`. Never mix the two.
 */

export type ComponentKind = 'text' | 'image' | 'shape' | 'table';
export type ShapeKind = 'rectangle' | 'ellipse' | 'line';
export type TableBorder = 'none' | 'outline' | 'grid';
export type HorizontalAlign = 'left' | 'center' | 'right';
export type FontWeight = 'normal' | 'medium' | 'semibold' | 'bold';
export type FontStyle = 'normal' | 'italic';
export type TextDecoration = 'none' | 'underline';
export type ObjectFit = 'cover' | 'contain' | 'fill';

/** Position/size in design-space px, canvas top-left origin. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BaseComponent extends Box {
  id: string;
  kind: ComponentKind;
  /** Rotation in degrees, applied as a CSS `rotate()` transform about the
   * component center. `0` = upright; positive = clockwise. Stored geometry
   * (x/y/width/height) stays axis-aligned — rotation is presentation only. */
  rotation: number;
  /** Which page this component belongs to (0-indexed) */
  page: number;
  /** Designer visibility toggle (the Layers panel eye). When true the component
   * is rendered as a faint ghost on the canvas and cannot be selected there —
   * toggle it back from the Layers panel. Optional so older data (no flag)
   * stays visible. */
  hidden?: boolean;
  /** Designer lock toggle (the Layers panel lock). When true the component is
   * rendered normally but is non-interactive on the canvas — it can't be
   * clicked, dragged, or resized there; select it via the Layers panel. */
  locked?: boolean;
}

/** Inline style overlay over `TextComponent.content`. Offsets are character
 * indices into the flat `content` string (i.e. the same coordinate system the
 * `<textarea>` selection uses), so a toolbar can read `selectionStart/End`
 * directly. Overlapping marks merge — the effective style at a char is the base
 * component style with every overlapping mark applied in order. */
export interface TextMark {
  start: number;
  end: number;
  fontWeight?: FontWeight;
  fontSize?: number;
  color?: string;
  fontStyle?: FontStyle;
  textDecoration?: TextDecoration;
}

export interface TextComponent extends BaseComponent {
  /** Original PDF positions; use only while the paragraph remains unchanged. */
  importedText?: {
    content: string;
    fontFamily?: string;
    marks?: TextMark[];
    width: number;
    fontSize: number;
    fontWeight: string;
    fontStyle: string;
    lineHeight: number;
    fragments: { start: number; end: number; x: number; baseline: number; width: number; fitWidth?: boolean }[];
  };
  /** Source PDF baseline as a fraction of font size; used for fixed text. */
  fontAscent?: number;
  fontFamily?: 'Helvetica' | 'Times-Roman' | 'Courier' | 'Lato' | 'DejaVuSerifCondensed' | 'DejaVuSans' | 'DejaVuSansMono';
  kind: 'text';
  content: string; // plain text; may contain {{token}} merge placeholders
  fontSize: number;
  fontWeight: FontWeight;
  fontStyle: FontStyle;
  textDecoration: TextDecoration;
  color: string; // hex
  align: HorizontalAlign;
  lineHeight: number; // unitless multiplier
  /** Optional inline-typography overlay. See `TextMark`. */
  marks?: TextMark[];
}

export interface ImageComponent extends BaseComponent {
  kind: 'image';
  src: string; // URL or dataURL (default/placeholder)
  alt: string;
  objectFit: ObjectFit;
  radius: number; // corner radius px
  /** When set, this image is a fillable form field (a named image slot). */
  field: string;
}

export interface ShapeComponent extends BaseComponent {
  kind: 'shape';
  shape: ShapeKind;
  /** Hex color, or `'transparent'` / `''` / `#RRGGBBAA`(alpha 00) for no fill
   * (renders as see-through on the canvas and is skipped by the PDF renderer).
   * Ignored for 'line'. */
  fill: string;
  /** Hex color, or `'transparent'` (see `fill`) for no stroke. */
  stroke: string;
  strokeWidth: number; // px
  radius: number; // corner radius (rectangle only)
}

export interface TableComponent extends BaseComponent {
  kind: 'table';
  /** Number of rows and columns in the table. */
  rows: number;
  cols: number;
  /** Row-major cell text: cells[r * cols + c]. May contain {{token}} placeholders. */
  cells: string[];
  /** Column-width fractions (0..1, sum ~1); omit → equal columns. */
  colWidths?: number[];
  /** Height of each row in px. */
  rowHeight: number;
  /** Border mode. */
  border: TableBorder;
  /** Zebra striping enabled. */
  zebra: boolean;
  /** Alternating-row fill color (e.g., '#f5f5f4'). */
  zebraColor: string;
  /** First-row fill color (or '' for none). */
  headerFill: string;
  // Cell text style (component-wide for v1)
  fontSize: number;
  fontWeight: FontWeight;
  color: string;
  align: HorizontalAlign;
}

export type CanvasComponent = TextComponent | ImageComponent | ShapeComponent | TableComponent;

/**
 * A logical group of canvas components. A *repeating* group can be instantiated
 * N times at fill time; each instance is one entry in an array (e.g. a CV's
 * "experiences" = N × {company, duration, description}). Groups are peers of
 * components — they reference `memberIds`, they do not nest them — so all
 * existing geometry keeps working unchanged.
 */
export type GroupDirection = 'row' | 'column';

export interface ComponentGroup {
  id: string;
  /** Unique, human-readable; doubles as the array key in fill data. */
  name: string;
  /** Component ids that belong to this group, in document order. */
  memberIds: string[];
  /** Can the filler add multiple instances? (Always true from the v1 UI; the
   * flag exists so the data model + filler can branch cleanly later.) */
  repeating: boolean;
  /**
   * How repeated instances are laid out at fill time. Instances always wrap to
   * fill the page, then flow onto the next page:
   *  - `column` fills the page top-to-bottom, then starts a new column to the
   *    right (grows rightward), and continues on the next page when the width
   *    is full.
   *  - `row` fills the page left-to-right, then starts a new row below (grows
   *    downward), and continues on the next page when the height is full.
   * The author picks this when creating the group and can change it any time.
   */
  direction: GroupDirection;
}

/** Toggleable alignment guide lines (a margin box inset by `padding` from each
 * edge). When enabled they're drawn on the canvas and used as snap targets. */
export interface GuideLines {
  enabled: boolean;
  padding: number;
}
