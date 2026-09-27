import { detectFields } from './detect-fields';
import type { Paragraph } from './group-paragraphs';

/** Build a single-line paragraph fixture. */
function mkPara(text: string, opts: Partial<Paragraph> = {}): Paragraph {
  const fontSizePx = opts.fontSizePx ?? 16;
  const baselineY = 100;
  return {
    page: 0,
    x: 72,
    y: baselineY - fontSizePx,
    width: 300,
    height: fontSizePx * 1.3,
    fontSizePx,
    fontWeight: opts.fontWeight ?? 'normal',
    fontStyle: opts.fontStyle ?? 'normal',
    content: text,
    lines: [
      {
        baselineY,
        text,
        x: 72,
        width: 300,
        fontSizePx,
        fontWeight: opts.fontWeight ?? 'normal',
        fontStyle: opts.fontStyle ?? 'normal',
        top: baselineY - fontSizePx,
        bottom: baselineY + fontSizePx * 0.3,
      },
    ],
  };
}

describe('detectFields', () => {
  it('emits multiple candidates for a line with several blanks', () => {
    const { components, candidates } = detectFields(
      [mkPara('Name: ______  Date: ______')],
      0,
    );
    expect(components).toHaveLength(1);
    expect(candidates).toHaveLength(2);
    // First blank keeps id === componentId; second gets a #1 suffix.
    expect(candidates[0].id).toBe(components[0].id);
    expect(candidates[1].id).toBe(`${components[0].id}#1`);
    // Both candidates point at the same paragraph component.
    expect(candidates.map((c) => c.componentId)).toEqual([
      components[0].id,
      components[0].id,
    ]);
    // Two distinct tokens were written into the content.
    expect((components[0].content.match(/{{/g) ?? []).length).toBe(2);
    expect(candidates[0].heuristicName).not.toBe(candidates[1].heuristicName);
  });

  it('classifies a long underscore run as a signature', () => {
    const long = '__________________________'; // 26 chars → ~208px at fs16 → signature
    const { candidates } = detectFields([mkPara(`Sign here: ${long}`)], 0);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].heuristicType).toBe('signature');
  });

  it('classifies a checkbox glyph as a checkbox', () => {
    const { candidates } = detectFields([mkPara('☐ I agree')], 0);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].heuristicType).toBe('checkbox');
  });

  it('leaves a paragraph with no blanks as literal text', () => {
    const { components, candidates } = detectFields(
      [mkPara('Just a normal sentence.')],
      0,
    );
    expect(components).toHaveLength(1);
    expect(candidates).toHaveLength(0);
    expect(components[0].content).toBe('Just a normal sentence.');
  });

  it('carries paragraph style onto the component', () => {
    const { components } = detectFields(
      [mkPara('Bold heading', { fontWeight: 'bold', fontSizePx: 24 })],
      0,
    );
    expect(components[0].fontWeight).toBe('bold');
    expect(components[0].fontSize).toBe(24);
  });

  it('infers center alignment from staggered lefts with consistent centers', () => {
    const fs = 16;
    const para: Paragraph = {
      page: 0,
      x: 200,
      y: 100,
      width: 400,
      height: fs * 3,
      fontSizePx: fs,
      fontWeight: 'normal',
      fontStyle: 'normal',
      content: 'CERTIFICATE\nOF ACHIEVEMENT',
      lines: [
        {
          baselineY: 116,
          text: 'CERTIFICATE',
          x: 200,
          width: 400,
          fontSizePx: fs,
          fontWeight: 'normal',
          fontStyle: 'normal',
          top: 100,
          bottom: 121,
        },
        {
          baselineY: 140,
          text: 'OF ACHIEVEMENT',
          x: 260,
          width: 280,
          fontSizePx: fs,
          fontWeight: 'normal',
          fontStyle: 'normal',
          top: 124,
          bottom: 145,
        },
      ],
    };
    const { components } = detectFields([para], 0);
    expect(components).toHaveLength(1);
    expect(components[0].align).toBe('center');
    // Wrap-shaped paragraph → flows into one line (no hard \n in content).
    expect(components[0].content).toBe('CERTIFICATE OF ACHIEVEMENT');
  });

  it('infers right alignment from consistent rights with ragged lefts', () => {
    const fs = 16;
    const para: Paragraph = {
      page: 0,
      x: 100,
      y: 100,
      width: 200,
      height: fs * 2,
      fontSizePx: fs,
      fontWeight: 'normal',
      fontStyle: 'normal',
      content: 'Date: ____________\nSignature: ____',
      lines: [
        {
          baselineY: 116,
          text: 'Date: ____________',
          x: 100,
          width: 200,
          fontSizePx: fs,
          fontWeight: 'normal',
          fontStyle: 'normal',
          top: 100,
          bottom: 121,
        },
        {
          baselineY: 140,
          text: 'Signature: ____',
          x: 150,
          width: 150,
          fontSizePx: fs,
          fontWeight: 'normal',
          fontStyle: 'normal',
          top: 124,
          bottom: 145,
        },
      ],
    };
    const { components } = detectFields([para], 0);
    expect(components[0].align).toBe('right');
  });

  it('keeps left alignment for consistent lefts (plain paragraphs)', () => {
    const para = mkPara('Just a normal sentence.');
    const { components } = detectFields([para], 0);
    expect(components[0].align).toBe('left');
  });

  it('keeps left alignment for justified text (full lines + shorter last line)', () => {
    const fs = 16;
    const para: Paragraph = {
      page: 0,
      x: 100,
      y: 100,
      width: 300,
      height: fs * 2,
      fontSizePx: fs,
      fontWeight: 'normal',
      fontStyle: 'normal',
      content: 'full width line one\nshorter last',
      lines: [
        {
          baselineY: 116,
          text: 'full width line one',
          x: 100,
          width: 300,
          fontSizePx: fs,
          fontWeight: 'normal',
          fontStyle: 'normal',
          top: 100,
          bottom: 121,
        },
        {
          baselineY: 140,
          text: 'shorter last',
          x: 100,
          width: 180,
          fontSizePx: fs,
          fontWeight: 'normal',
          fontStyle: 'normal',
          top: 124,
          bottom: 145,
        },
      ],
    };
    const { components } = detectFields([para], 0);
    expect(components[0].align).toBe('left');
  });

  it('infers center for a single line centered on the page', () => {
    const para: Paragraph = {
      ...mkPara('INVOICE'),
      x: 300,
      width: 200,
      lines: [{ ...mkPara('INVOICE').lines[0], x: 300, width: 200 }],
    };
    const { components } = detectFields([para], 0, { pageWidth: 800 });
    expect(components[0].align).toBe('center');
  });

  it('keeps left for a single line at the left margin', () => {
    const { components } = detectFields([mkPara('At the margin')], 0, {
      pageWidth: 800,
    });
    expect(components[0].align).toBe('left');
  });

  it('infers center for a single line centered inside a divider band (table cell)', () => {
    const para: Paragraph = {
      ...mkPara('Qty'),
      x: 310,
      width: 180,
      lines: [{ ...mkPara('Qty').lines[0], x: 310, width: 180 }],
    };
    const { components } = detectFields([para], 0, {
      pageWidth: 800,
      dividers: {
        vertical: [
          { x: 250, top: 50, bottom: 150 },
          { x: 550, top: 50, bottom: 150 },
        ],
        horizontal: [],
      },
    });
    expect(components[0].align).toBe('center');
  });
});

// --- stacked blanks → one flexible multi-line field ---------------------------

const fs = 16;

/** Line fixture: pure geometry + text, no paragraph wrapper. */
function line(
  baselineY: number,
  text: string,
  x: number,
  width: number,
): Paragraph['lines'][number] {
  return {
    baselineY,
    text,
    x,
    width,
    fontSizePx: fs,
    fontWeight: 'normal',
    fontStyle: 'normal',
    top: baselineY - fs,
    bottom: baselineY + fs * 0.3,
  };
}

function paraFrom(lines: Paragraph['lines']): Paragraph {
  const top = Math.min(...lines.map((l) => l.top));
  const bottom = Math.max(...lines.map((l) => l.bottom));
  const left = Math.min(...lines.map((l) => l.x));
  const right = Math.max(...lines.map((l) => l.x + l.width));
  return {
    page: 0,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    fontSizePx: fs,
    fontWeight: 'normal',
    fontStyle: 'normal',
    content: lines.map((l) => l.text).join('\n'),
    lines,
  };
}

describe('detectFields stacked blanks', () => {
  it('merges underscore lines under a label into one longtext field', () => {
    const para = paraFrom([
      line(116, 'Name: ____________________', 72, 300),
      line(140, '____________________', 72, 300),
      line(164, '____________________', 72, 300),
    ]);
    const { components, candidates } = detectFields([para], 0);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].heuristicType).toBe('longtext');
    expect(candidates[0].label).toBe('Name');
    // Continuation lines vanish; only the labeled line with the token stays.
    expect(components).toHaveLength(1);
    expect(components[0].content).toBe('Name: {{name}}');
    // Height covers all three source lines (advance 24 → lineHeight 1.5).
    expect(components[0].height).toBeCloseTo(3 * 1.5 * fs, 0);
  });

  it('keeps blanks in different columns as separate fields', () => {
    const { candidates } = detectFields(
      [
        paraFrom([line(116, 'Name: ________', 72, 120)]),
        paraFrom([line(140, '________', 400, 120)]),
      ],
      0,
    );
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.heuristicType !== 'longtext')).toBe(true);
  });

  it('merges blanks across a paragraph break (loose line spacing)', () => {
    const { components, candidates } = detectFields(
      [
        paraFrom([line(116, 'Address: ____________', 72, 200)]),
        paraFrom([line(152, '____________', 72, 200)]), // advance 36 = 2.25×fs
      ],
      0,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].heuristicType).toBe('longtext');
    expect(candidates[0].label).toBe('Address');
    // Continuation paragraph emits no component of its own; the head's box
    // stretches down over its line.
    expect(components).toHaveLength(1);
    expect(components[0].height).toBeCloseTo(1.3 * fs + 36, 0);
  });

  it('never merges stacked checkbox glyphs', () => {
    const para = paraFrom([
      line(116, '☐ Option A', 72, 200),
      line(140, '☐ Option B', 72, 200),
    ]);
    const { components, candidates } = detectFields([para], 0);
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.heuristicType === 'checkbox')).toBe(true);
    expect(components[0].content).toBe(
      '{{checkbox}} Option A\n{{checkbox_1}} Option B',
    );
  });
});

describe('detectFields paragraph flow joining', () => {
  it('joins wrapped body lines into one flowing line and de-hyphenates', () => {
    const para = paraFrom([
      line(116, 'the terms and condi-', 72, 300),
      line(140, 'tions of this offer', 72, 180),
    ]);
    const { components, candidates } = detectFields([para], 0);
    expect(candidates).toHaveLength(0);
    expect(components[0].content).toBe(
      'the terms and conditions of this offer',
    );
  });

  it('keeps hard breaks when an interior line is short (address block)', () => {
    const para = paraFrom([
      line(116, 'Acme Corp', 72, 100),
      line(140, '123 Main Street', 72, 140),
      line(164, 'Springfield', 72, 90),
    ]);
    const { components } = detectFields([para], 0);
    expect(components[0].content).toBe(
      'Acme Corp\n123 Main Street\nSpringfield',
    );
  });
});
