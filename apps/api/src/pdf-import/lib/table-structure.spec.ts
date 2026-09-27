import {
  deriveDividers,
  medianFontSizePx,
  type DividerShapeInput,
} from './table-structure';
import type { TextRun } from './pdf-parser';

const run = (fontSizePx: number): TextRun => ({
  page: 0,
  x: 0,
  y: 0,
  width: 10,
  height: fontSizePx * 1.3,
  fontSizePx,
  baselineY: 0,
  text: 'x',
  fontWeight: 'normal',
  fontStyle: 'normal',
});

/** Cell rect shape. */
const cell = (
  x: number,
  y: number,
  w: number,
  h: number,
): DividerShapeInput => ({
  kind: 'shape',
  shape: 'rectangle',
  x,
  y,
  width: w,
  height: h,
});

describe('medianFontSizePx', () => {
  it('returns the median font size', () => {
    expect(medianFontSizePx([run(10), run(16), run(20)])).toBe(16);
  });

  it('falls back to 12 for empty runs', () => {
    expect(medianFontSizePx([])).toBe(12);
  });
});

describe('deriveDividers', () => {
  it('recognizes horizontal line components as row dividers', () => {
    expect(
      deriveDividers([{ ...cell(20, 115, 200, 1), shape: 'line' }], 32),
    ).toEqual({
      vertical: [],
      horizontal: [{ x: 115.5, top: 20, bottom: 220 }],
    });
  });
  it('derives a divider from a single thin vertical rect (column rule)', () => {
    const { vertical } = deriveDividers([cell(100, 50, 2, 300)], 40);
    expect(vertical).toHaveLength(1);
    expect(vertical[0].x).toBeCloseTo(101, 5);
    expect(vertical[0].top).toBe(50);
    expect(vertical[0].bottom).toBe(350);
  });

  it('filters accent bars shorter than minSpan', () => {
    const { vertical } = deriveDividers([cell(100, 50, 2, 30)], 40);
    expect(vertical).toHaveLength(0);
  });

  it('does not promote a single boxed rect (lone paragraph frame)', () => {
    const { vertical, horizontal } = deriveDividers(
      [cell(50, 50, 400, 100)],
      40,
    );
    expect(vertical).toHaveLength(0);
    expect(horizontal).toHaveLength(0);
  });

  it('derives dividers from a 2×2 grid of cell rects (3 vertical + 3 horizontal lines)', () => {
    // 2×2 grid: x∈{0,200,400}, y∈{0,100,200} — each shared by 2 cells.
    const grid = [
      cell(0, 0, 200, 100),
      cell(200, 0, 200, 100),
      cell(0, 100, 200, 100),
      cell(200, 100, 200, 100),
    ];
    const { vertical, horizontal } = deriveDividers(grid, 40);
    expect(vertical.map((d) => Math.round(d.x))).toEqual([0, 200, 400]);
    expect(horizontal.map((d) => Math.round(d.x))).toEqual([0, 100, 200]);
    // Interior divider spans the union of both rows' cells.
    expect(vertical[1].top).toBe(0);
    expect(vertical[1].bottom).toBe(200);
  });

  it('clusters ±1px jittered edges into one divider', () => {
    // Two stacked cells whose shared border edges differ by 0.8px.
    const shapes = [cell(0, 0, 199.6, 100), cell(200.4, 100, 200, 100)];
    const { vertical } = deriveDividers(shapes, 40);
    const near200 = vertical.filter((d) => Math.abs(d.x - 200) < 3);
    expect(near200).toHaveLength(1);
  });

  it('ignores non-rectangle shapes and images', () => {
    const noise: DividerShapeInput[] = [
      { kind: 'image', x: 0, y: 0, width: 500, height: 500 },
      { kind: 'shape', shape: 'ellipse', x: 0, y: 0, width: 300, height: 300 },
      { kind: 'shape', shape: 'line', x: 0, y: 0, width: 300, height: 2 },
    ];
    const { vertical } = deriveDividers(noise, 40);
    expect(vertical).toHaveLength(0);
  });

  it('merges a thin rule coinciding with cell edges', () => {
    // Thin rule at x≈200 plus cells whose edges vote x=200.
    const shapes = [
      cell(199, 0, 2, 200),
      cell(0, 0, 200, 100),
      cell(200, 100, 200, 100),
    ];
    const { vertical } = deriveDividers(shapes, 40);
    expect(vertical.filter((d) => Math.abs(d.x - 200) < 3)).toHaveLength(1);
  });
});
