import { collectInputCandidates, inputName } from './field-candidates';
import type { TextRun } from './pdf-parser';

const viewport = {
  width: 400,
  height: 400,
  convertToViewportRectangle: (r: number[]) => r,
};
const run = (text: string, x = 20, y = 20): TextRun => ({
  text,
  x,
  y,
  width: text.length * 8,
  height: 16,
  baselineY: y + 12,
  fontSizePx: 16,
  fontWeight: 'normal',
  fontStyle: 'normal',
  page: 0,
});

describe('PDF input candidates', () => {
  it('finds multiple blanks on a line with separate labels, and keeps checkbox labels on the right', () => {
    const found = collectInputCandidates(
      [run('Name: ____ Date: ____'), run('[ ] Accept terms', 20, 80)],
      [],
      [],
      viewport,
      2,
    );
    expect(found).toHaveLength(3);
    expect(found.map((c) => c.label)).toEqual(['Name', 'Date', 'Accept terms']);
    expect(found[2]).toMatchObject({
      page: 2,
      hint: 'checkbox',
      source: 'blank',
    });
    expect(new Set(found.map((c) => c.id)).size).toBe(3);
  });

  it('uses native widget geometry, required flags and choices; skips read-only and action buttons', () => {
    const found = collectInputCandidates(
      [],
      [],
      [
        {
          subtype: 'Widget',
          fieldType: 'Ch',
          fieldName: 'Country',
          rect: [20, 20, 140, 40],
          required: true,
          options: [{ displayValue: 'Turkey' }],
        },
        {
          subtype: 'Widget',
          fieldType: 'Tx',
          rect: [20, 50, 140, 70],
          readOnly: true,
        },
        {
          subtype: 'Widget',
          fieldType: 'Btn',
          rect: [20, 80, 140, 100],
          pushButton: true,
        },
      ],
      viewport,
      0,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      source: 'widget',
      width: 120,
      hint: 'dropdown',
      required: true,
      options: ['Turkey'],
    });
  });

  it('deduplicates blanks over widgets and bounds geometry to the source page', () => {
    const found = collectInputCandidates(
      [run('____', 20, 20)],
      [],
      [
        { subtype: 'Widget', fieldType: 'Tx', rect: [20, 20, 52, 36] },
        { subtype: 'Widget', fieldType: 'Tx', rect: [390, 390, 450, 450] },
      ],
      viewport,
      0,
    );
    expect(found).toHaveLength(2);
    expect(found[1]).toMatchObject({ width: 10, height: 10 });
  });

  it('finds blank graphical lines and treats text on them as filled sample values', () => {
    const shape = {
      id: 's',
      kind: 'shape' as const,
      shape: 'line' as const,
      x: 100,
      y: 38,
      width: 100,
      height: 1,
      rotation: 0,
      page: 0,
      paintOrder: 0,
      fill: 'transparent',
      stroke: '#000',
      strokeWidth: 1,
      radius: 0,
    };
    expect(
      collectInputCandidates([run('Name:', 20, 20)], [shape], [], viewport, 0),
    ).toHaveLength(1);
    const filled = collectInputCandidates(
      [run('Name:', 20, 20), run('Existing', 100, 20)],
      [shape],
      [],
      viewport,
      0,
    );
    expect(filled).toHaveLength(1);
    expect(filled[0]).toMatchObject({
      label: 'Name:',
      prefilled: 'Existing',
    });
  });

  it('ignores prose crossing a graphical line', () => {
    const shape = {
      id: 's',
      kind: 'shape' as const,
      shape: 'line' as const,
      x: 100,
      y: 38,
      width: 100,
      height: 1,
      rotation: 0,
      page: 0,
      paintOrder: 0,
      fill: 'transparent',
      stroke: '#000',
      strokeWidth: 1,
      radius: 0,
    };
    expect(
      collectInputCandidates(
        [
          run('Name:', 20, 20),
          run('Some long sentence crosses the rule', 100, 20),
        ],
        [shape],
        [],
        viewport,
        0,
      ),
    ).toHaveLength(0);
  });

  it('keeps filled checkbox marks and widget values as prefilled sample data', () => {
    const found = collectInputCandidates(
      [run('[x] Accept terms', 20, 80)],
      [],
      [
        {
          subtype: 'Widget',
          fieldType: 'Tx',
          fieldName: 'City',
          fieldValue: 'Istanbul',
          rect: [20, 120, 140, 140],
        },
      ],
      viewport,
      0,
    );
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({
      source: 'widget',
      prefilled: 'Istanbul',
    });
    expect(found[1]).toMatchObject({
      hint: 'checkbox',
      prefilled: 'checked',
      label: 'Accept terms',
    });
  });

  it('keeps labels verbatim as field names (shared, display-ready)', () => {
    // No slugification: names double as labels, so case, spacing and
    // non-ASCII survive. Repeated labels share one field.
    expect(inputName('İsim Soyadı', 0)).toBe('İsim Soyadı');
    expect(inputName('İsim Soyadı', 1)).toBe('İsim Soyadı');
    expect(inputName('Adı Soyadı', 2)).toBe('Adı Soyadı');
  });

  it('falls back only for empty, token-breaking or polluting labels', () => {
    expect(inputName('', 0)).toBe('field_1');
    expect(inputName('   ', 1)).toBe('field_2');
    expect(inputName('{{Ad}}', 2)).toBe('Ad');
    expect(inputName('__proto__', 3)).toBe('field___proto__');
    expect(inputName('constructor', 4)).toBe('field_constructor');
    expect(inputName('123', 5)).toBe('123');
  });
});
