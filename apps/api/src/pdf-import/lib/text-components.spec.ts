import { textComponents } from './text-components';
import type { TextRun } from './pdf-parser';

const run = (
  text: string,
  x: number,
  baselineY: number,
  extra: Partial<TextRun> = {},
): TextRun => ({
  text,
  x,
  baselineY,
  y: baselineY - 12,
  width: 100,
  height: 16,
  fontSizePx: 16,
  fontAscent: 0.75,
  fontFamily: 'Lato',
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: '#000000',
  page: 0,
  paintOrder: 1,
  ...extra,
});

describe('editable imported paragraphs', () => {
  it('joins wrapped lines and preserves fragment positions and inline styles', () => {
    const [c] = textComponents([
      run('Türkçe', 40, 100, { width: 50 }),
      run('bilgi', 94, 100, {
        width: 35,
        fontWeight: 'bold',
        color: '#ff0000',
      }),
      run('ikinci satır', 40, 124),
    ]);
    expect(c.content).toBe('Türkçe bilgi ikinci satır');
    expect(c.marks).toEqual([
      { start: 7, end: 12, fontWeight: 'bold', color: '#ff0000' },
    ]);
    expect(c.importedText?.fragments).toEqual([
      { start: 0, end: 6, x: 0, baseline: 12, width: 50 },
      { start: 7, end: 12, x: 54, baseline: 12, width: 35 },
      { start: 13, end: 25, x: 0, baseline: 36, width: 100 },
    ]);
  });

  it('does not group text across pages or intervening artwork', () => {
    const runs = [
      run('First', 40, 100),
      run('Second', 40, 124, { paintOrder: 3 }),
    ];
    expect(textComponents(runs, { paintBreaks: [2] })).toHaveLength(2);
    expect(textComponents([runs[0], { ...runs[1], page: 1 }])).toHaveLength(2);
  });

  it('keeps column contents separate and table row rules prevent merging', () => {
    const runs = [
      run('Left', 40, 100),
      run('Right', 160, 100),
      run('Next left', 40, 124),
      run('Next right', 160, 124),
    ];
    const dividers = {
      vertical: [{ x: 150, top: 80, bottom: 150 }],
      horizontal: [],
    };
    expect(textComponents(runs, { dividers }).map((c) => c.content)).toEqual([
      'Left\nNext left',
      'Right\nNext right',
    ]);
    expect(
      textComponents(runs, {
        dividers: {
          ...dividers,
          horizontal: [{ x: 110, top: 30, bottom: 300 }],
        },
      }),
    ).toHaveLength(4);
  });
});
