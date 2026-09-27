import {
  PAGE_SIZES,
  DEFAULT_THEME,
  normalizeTheme,
  pageSizeFor,
  partitionSlides,
} from './flow-layout';
import type { DocBlock, RenderDocument } from './document-types';

describe('normalizeTheme', () => {
  it('fills gaps in a partial theme', () => {
    const t = normalizeTheme({ baseFontSize: 14 });
    expect(t.baseFontSize).toBe(14);
    expect(t.colors.primary).toBe(DEFAULT_THEME.colors.primary);
    expect(t.fontFamily).toBe(DEFAULT_THEME.fontFamily);
  });

  it('returns defaults for an empty theme', () => {
    const t = normalizeTheme(undefined);
    expect(t).toEqual(DEFAULT_THEME);
  });
});

describe('pageSizeFor', () => {
  it.each([
    ['A3', 842, 1191],
    ['A5', 420, 595],
    ['legal', 612, 1008],
    ['tabloid', 792, 1224],
  ] as const)('supports %s in both orientations', (pageSize, width, height) => {
    expect(
      pageSizeFor({ pageSize, orientation: 'portrait' } as RenderDocument),
    ).toEqual({ width, height });
    expect(
      pageSizeFor({ pageSize, orientation: 'landscape' } as RenderDocument),
    ).toEqual({ width: height, height: width });
  });
  it('resolves known sizes and falls back to A4', () => {
    expect(pageSizeFor({ pageSize: 'A4' } as RenderDocument).width).toBe(595);
    expect(pageSizeFor({ pageSize: '16:9' } as RenderDocument).height).toBe(
      540,
    );
    expect(pageSizeFor({ pageSize: 'bogus' as any } as RenderDocument)).toEqual(
      PAGE_SIZES.A4,
    );
  });
});

describe('partitionSlides', () => {
  const b = (id: string, pageBreak = false): DocBlock => ({
    id,
    type: 'paragraph',
    inputs: { text: 'x' },
    pageBreak,
  });

  it('groups blocks into slides by pageBreak boundaries', () => {
    const slides = partitionSlides([
      b('a'),
      b('b', true),
      b('c'),
      b('d', true),
      b('e'),
    ]);
    expect(slides.map((s) => s.map((x) => x.id))).toEqual([
      ['a'],
      ['b', 'c'],
      ['d', 'e'],
    ]);
  });

  it('returns a single slide with no boundaries', () => {
    const slides = partitionSlides([b('a'), b('b')]);
    expect(slides.map((s) => s.length)).toEqual([2]);
  });

  it('returns one empty slide for empty input', () => {
    expect(partitionSlides([])).toEqual([[]]);
  });
});
