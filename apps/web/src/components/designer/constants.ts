import { clampToCanvas } from './coordinates';
import type { CanvasComponent, ComponentKind, ShapeKind } from './types';

/** Canvas design size: US Letter @ 96 DPI. */
export const CANVAS_SIZE = { width: 816, height: 1056 } as const;

export interface PageSizePreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

/** Pre-defined page sizes (portrait, @ 96 DPI). */
export const PAGE_PRESETS: PageSizePreset[] = [
  { id: 'a4', label: 'A4', width: 794, height: 1123 },
  { id: 'a3', label: 'A3', width: 1123, height: 1587 },
  { id: 'a5', label: 'A5', width: 559, height: 794 },
  { id: 'letter', label: 'Letter', width: 816, height: 1056 },
  { id: 'legal', label: 'Legal', width: 816, height: 1344 },
  { id: 'tabloid', label: 'Tabloid', width: 1056, height: 1632 },
];

/** Snap distance in design px (feels consistent across zoom levels). */
export const SNAP_THRESHOLD = 6;

/** Minimum component size in design px. */
export const MIN_SIZE = 12;

/** MIME-ish key used for HTML5 drag-and-drop from the palette to the canvas. */
export const DND_MIME = 'application/x-tamidoc-component';

export interface PaletteEntry {
  /** Encoded kind: 'text' | 'image' | 'shape:<shapeKind>'. */
  kind: string;
  label: string;
}

/** Palette shown in the right panel + the right-click "Add" menu. */
export const PALETTE: PaletteEntry[] = [
  { kind: 'text', label: 'Text' },
  { kind: 'image', label: 'Image' },
  { kind: 'shape:rectangle', label: 'Rectangle' },
  { kind: 'shape:ellipse', label: 'Ellipse' },
  { kind: 'shape:line', label: 'Line' },
  { kind: 'table', label: 'Table' },
];

/** Parse an encoded palette kind into its component kind (+ shape if any). */
export function parseKind(encoded: string): { kind: ComponentKind; shape?: ShapeKind } {
  if (encoded.startsWith('shape:')) return { kind: 'shape', shape: encoded.split(':')[1] as ShapeKind };
  return { kind: encoded as ComponentKind };
}

/** Build a new component of the given encoded kind, centered at (cx, cy). */
export function makeComponent(
  encoded: string,
  id: string,
  cx: number,
  cy: number,
  canvas: { width: number; height: number },
  page: number = 0,
): CanvasComponent {
  const center = (width: number, height: number) =>
    clampToCanvas({ x: cx - width / 2, y: cy - height / 2, width, height }, canvas);

  const { kind, shape } = parseKind(encoded);

  if (kind === 'text') {
    const b = center(240, 40);
    return { id, kind: 'text', ...b, rotation: 0, page, content: 'Text', fontSize: 16, fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', color: '#1c1917', align: 'left', lineHeight: 1.3 };
  }
  if (kind === 'image') {
    const b = center(200, 200);
    return { id, kind: 'image', ...b, rotation: 0, page, src: '', alt: '', objectFit: 'cover', radius: 0, field: '' };
  }
  // shape
  if (shape === 'ellipse') {
    const b = center(160, 160);
    return { id, kind: 'shape', ...b, rotation: 0, page, shape: 'ellipse', fill: '#f59e0b', stroke: '#00000000', strokeWidth: 0, radius: 0 };
  }
  if (shape === 'line') {
    const b = center(200, 2);
    return { id, kind: 'shape', ...b, rotation: 0, page, shape: 'line', fill: '#00000000', stroke: '#1c1917', strokeWidth: 2, radius: 0 };
  }
  if (kind === 'table') {
    const b = center(320, 160);
    return { id, kind: 'table', ...b, rotation: 0, page, rows: 3, cols: 2, cells: Array(6).fill(''), rowHeight: 40, border: 'grid', zebra: true, zebraColor: '#f5f5f4', headerFill: '', fontSize: 12, fontWeight: 'normal', color: '#1c1917', align: 'left' };
  }
  // rectangle
  const b = center(160, 120);
  return { id, kind: 'shape', ...b, rotation: 0, page, shape: 'rectangle', fill: '#f59e0b', stroke: '#00000000', strokeWidth: 0, radius: 8 };
}
