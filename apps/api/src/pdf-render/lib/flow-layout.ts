/**
 * Flow-document layout helpers. The heavy lifting (text wrap, page breaks)
 * lives in react-pdf itself — this module only answers the questions react-pdf
 * can't: which page size to use, and how to split top-level blocks into slides
 * for the `slides` format.
 */
import type {
  DocBlock,
  DocumentPageSize,
  DocumentTheme,
  RenderDocument,
} from './document-types';

/** Page dimensions in PDF points (72 DPI), declared explicitly on each Page. */
export const PAGE_SIZES: Record<
  DocumentPageSize,
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

export const DEFAULT_THEME: DocumentTheme = {
  fontFamily: 'Lato',
  baseFontSize: 11,
  colors: {
    primary: '#f97316',
    heading: '#1c1917',
    body: '#44403c',
    muted: '#78716c',
  },
  spacing: 12,
  pagePadding: 48,
};

/** Fill gaps in a (possibly partial) author theme with defaults. */
export function normalizeTheme(theme?: Partial<DocumentTheme>): DocumentTheme {
  const t = theme ?? {};
  const fontAliases: Record<string, string> = {
    Arial: 'Helvetica',
    Georgia: 'Times-Roman',
  };
  const requestedFont = t.fontFamily ?? DEFAULT_THEME.fontFamily;
  const font = fontAliases[requestedFont] ?? requestedFont;
  return {
    fontFamily: ['Lato', 'Helvetica', 'Times-Roman', 'Courier'].includes(font)
      ? font
      : DEFAULT_THEME.fontFamily,
    baseFontSize: t.baseFontSize ?? DEFAULT_THEME.baseFontSize,
    colors: {
      primary: t.colors?.primary ?? DEFAULT_THEME.colors.primary,
      heading: t.colors?.heading ?? DEFAULT_THEME.colors.heading,
      body: t.colors?.body ?? DEFAULT_THEME.colors.body,
      muted: t.colors?.muted ?? DEFAULT_THEME.colors.muted,
    },
    spacing: t.spacing ?? DEFAULT_THEME.spacing,
    pagePadding:
      typeof t.pagePadding === 'number' && Number.isFinite(t.pagePadding)
        ? Math.min(96, Math.max(24, t.pagePadding))
        : DEFAULT_THEME.pagePadding,
    // Page chrome passes through untouched (all optional, disabled by default).
    header: t.header,
    footer: t.footer,
    pageNumbering: t.pageNumbering,
  };
}

export function pageSizeFor(doc: RenderDocument): {
  width: number;
  height: number;
} {
  const base = PAGE_SIZES[doc.pageSize] ?? PAGE_SIZES.A4;
  return doc.orientation === 'landscape'
    ? { width: base.height, height: base.width }
    : base;
}

/**
 * Split top-level blocks into slides. A new slide starts before any block with
 * `pageBreak === true`; blocks without a boundary accumulate onto the current
 * slide. With no pageBreak flags the whole document is a single slide.
 */
export function partitionSlides(blocks: DocBlock[]): DocBlock[][] {
  const slides: DocBlock[][] = [];
  let current: DocBlock[] = [];
  for (const b of blocks) {
    if (b.pageBreak && current.length > 0) {
      slides.push(current);
      current = [];
    }
    current.push(b);
  }
  if (current.length > 0) slides.push(current);
  return slides.length > 0 ? slides : [[]];
}
