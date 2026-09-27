import { groupRunsIntoParagraphs } from './group-paragraphs';
import type { TextRun } from './pdf-parser';
import type { TableDividers } from './table-structure';

/** Build a TextRun with sensible defaults derived from a baseline. */
function run(
  baselineY: number,
  text: string,
  opts: Partial<TextRun> = {},
): TextRun {
  const fontSizePx = opts.fontSizePx ?? 16;
  return {
    page: 0,
    x: opts.x ?? 72,
    y: baselineY - fontSizePx,
    width: opts.width ?? 300,
    height: fontSizePx * 1.3,
    fontSizePx,
    baselineY,
    text,
    fontWeight: opts.fontWeight ?? 'normal',
    fontStyle: opts.fontStyle ?? 'normal',
  };
}

describe('groupRunsIntoParagraphs', () => {
  it('merges adjacent same-style lines into one paragraph', () => {
    const paras = groupRunsIntoParagraphs([
      run(100, 'line one'),
      run(120, 'line two'),
      run(140, 'line three'),
    ]);
    expect(paras).toHaveLength(1);
    expect(paras[0].lines).toHaveLength(3);
    expect(paras[0].content).toBe('line one\nline two\nline three');
  });

  it('splits on a large vertical gap', () => {
    const paras = groupRunsIntoParagraphs([
      run(100, 'first para'),
      run(180, 'second para'), // advance 80 ≫ 2×16
    ]);
    expect(paras).toHaveLength(2);
    expect(paras[0].content).toBe('first para');
    expect(paras[1].content).toBe('second para');
  });

  it('splits a heading (bold, larger) from body text', () => {
    const paras = groupRunsIntoParagraphs([
      run(100, 'Title', { fontSizePx: 24, fontWeight: 'bold' }),
      run(130, 'body text', { fontSizePx: 12 }),
    ]);
    expect(paras).toHaveLength(2);
    expect(paras[0].fontWeight).toBe('bold');
    expect(paras[1].fontWeight).toBe('normal');
  });

  it('joins coalesced segments on the same line back into one line', () => {
    // Two segments on the same baseline (e.g. "Name:" and a value) share a line.
    const paras = groupRunsIntoParagraphs([
      { ...run(100, 'Name:'), width: 60 },
      { ...run(100, 'John Doe', { x: 140, width: 100 }) },
    ]);
    expect(paras).toHaveLength(1);
    expect(paras[0].lines).toHaveLength(1);
    expect(paras[0].content).toBe('Name: John Doe');
  });

  it('splits same-baseline runs separated by a column-sized gap', () => {
    // "Name" far left, "Date" far right — same baseline, different columns.
    const paras = groupRunsIntoParagraphs([
      { ...run(100, 'Name'), width: 50 },
      { ...run(100, 'Date', { x: 500, width: 40 }) }, // gap 378 ≫ 3×16
    ]);
    expect(paras).toHaveLength(2);
    expect(paras[0].content).toBe('Name');
    expect(paras[1].content).toBe('Date');
    expect(paras[1].x).toBe(500);
  });

  it('produces an empty array for no runs', () => {
    expect(groupRunsIntoParagraphs([])).toEqual([]);
  });

  it('reconstructs interleaved columns without merging them together', () => {
    const paras = groupRunsIntoParagraphs([
      run(100, 'Left one', { x: 50, width: 200 }),
      run(100, 'Right one', { x: 400, width: 200 }),
      run(120, 'Left two', { x: 50, width: 180 }),
      run(120, 'Right two', { x: 400, width: 190 }),
    ]);
    expect(paras.map((p) => p.content)).toEqual([
      'Left one\nLeft two',
      'Right one\nRight two',
    ]);
  });
});

// --- table/grid-aware grouping ----------------------------------------------

const vdiv = (x: number, top: number, bottom: number): TableDividers => ({
  vertical: [{ x, top, bottom }],
  horizontal: [],
});
const hdiv = (y: number, left: number, right: number): TableDividers => ({
  vertical: [],
  horizontal: [{ x: y, top: left, bottom: right }],
});

describe('groupRunsIntoParagraphs with dividers', () => {
  it('splits same-baseline runs at a divider even below the 3em gap', () => {
    // Gap 20px < 3×16=48 — merges without a divider, splits with one at x=250.
    const runs = [
      run(100, 'Alpha', { x: 72, width: 160 }),
      run(100, 'Beta', { x: 252, width: 50 }),
    ];
    expect(groupRunsIntoParagraphs(runs)).toHaveLength(1); // control: merged
    const paras = groupRunsIntoParagraphs(runs, {
      dividers: vdiv(250, 90, 110),
    });
    expect(paras).toHaveLength(2);
    expect(paras.map((p) => p.content)).toEqual(['Alpha', 'Beta']);
  });

  it('does not split when the divider does not cover the baseline', () => {
    const runs = [
      run(100, 'Alpha', { x: 72, width: 160 }),
      run(100, 'Beta', { x: 252, width: 50 }),
    ];
    const paras = groupRunsIntoParagraphs(runs, {
      dividers: vdiv(250, 300, 400),
    });
    expect(paras).toHaveLength(1);
    expect(paras[0].content).toBe('Alpha Beta');
  });

  it('stacks interleaved table cells into per-cell paragraphs', () => {
    // 2×2 cells, one vertical rule at x=250 spanning both rows.
    const runs = [
      run(100, 'Alpha', { x: 72, width: 160 }),
      run(100, 'Beta', { x: 252, width: 50 }),
      run(130, 'Gamma', { x: 72, width: 70 }),
      run(130, 'Delta', { x: 252, width: 60 }),
    ];
    const paras = groupRunsIntoParagraphs(runs, {
      dividers: vdiv(250, 90, 140),
    });
    expect(paras).toHaveLength(2);
    expect(paras[0].content).toBe('Alpha\nGamma'); // left cell, both rows
    expect(paras[1].content).toBe('Beta\nDelta'); // right cell, both rows
  });

  it('keeps a divider-spanning caption as its own paragraph', () => {
    const runs = [
      run(60, 'Report Title', { x: 100, width: 280 }),
      run(100, 'Alpha', { x: 72, width: 160 }),
      run(100, 'Beta', { x: 252, width: 50 }),
    ];
    const paras = groupRunsIntoParagraphs(runs, {
      dividers: vdiv(250, 40, 140),
    });
    expect(paras).toHaveLength(3);
    expect(paras[0].content).toBe('Report Title');
  });

  it('blocks a vertical merge when a horizontal row rule sits between baselines', () => {
    const runs = [
      run(100, 'row one', { x: 72, width: 80 }),
      run(130, 'row two', { x: 72, width: 80 }),
    ];
    expect(groupRunsIntoParagraphs(runs)).toHaveLength(1); // control: 30px advance merges
    const paras = groupRunsIntoParagraphs(runs, {
      dividers: hdiv(115, 60, 200),
    });
    expect(paras).toHaveLength(2);
    expect(paras.map((p) => p.content)).toEqual(['row one', 'row two']);
  });
});
