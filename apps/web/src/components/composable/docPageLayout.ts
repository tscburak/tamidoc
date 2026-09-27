import type { DocOrientation, DocPageSize } from './DocCanvasSettings';

/** Page dimensions in PDF points, mirrored by the live preview. */
export const DOC_PAGE_DIMS: Record<
  DocPageSize,
  { width: number; height: number }
> = {
  A4: { width: 595, height: 842 },
  A3: { width: 842, height: 1191 },
  A5: { width: 420, height: 595 },
  letter: { width: 612, height: 792 },
  legal: { width: 612, height: 1008 },
  tabloid: { width: 792, height: 1224 },
  '16:9': { width: 960, height: 540 },
};

export function docPageDims(
  pageSize: DocPageSize = 'A4',
  orientation: DocOrientation = 'portrait',
) {
  const base = DOC_PAGE_DIMS[pageSize] ?? DOC_PAGE_DIMS.A4;
  return orientation === 'landscape'
    ? { width: base.height, height: base.width }
    : base;
}

export function isDocPageSize(value: unknown): value is DocPageSize {
  return typeof value === 'string' && Object.hasOwn(DOC_PAGE_DIMS, value);
}

export function docPagePadding(padding?: number) {
  return typeof padding === 'number' && Number.isFinite(padding)
    ? Math.min(96, Math.max(24, padding)) : 48;
}
