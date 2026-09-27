import { validateBlocks, BLOCK_CATALOG, canNestInside } from './flow-blocks';
import type { DocBlock } from './document-types';

function block(
  type: any,
  inputs: any = {},
  over: Partial<DocBlock> = {},
): DocBlock {
  return { id: 'b1', type, inputs, ...over };
}

describe('validateBlocks', () => {
  it.each([null, false, 42, 'text', []])(
    'reports malformed blocks instead of throwing: %p',
    (value) => {
      expect(validateBlocks([value])).toEqual([
        expect.objectContaining({ instanceId: 'block_0', path: 'block' }),
      ]);
    },
  );

  it.each(['toString', '__proto__', 'constructor'])(
    'rejects inherited object keys as block types: %s',
    (type) => {
      expect(validateBlocks([block(type)])).toEqual([
        expect.objectContaining({
          message: expect.stringContaining('Unknown block type'),
        }),
      ]);
    },
  );

  it('reports malformed children against their container', () => {
    expect(validateBlocks([block('section', { blocks: [null] })])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instanceId: 'b1', path: 'block' }),
      ]),
    );
  });

  it.each([null, [], 1, 'text'])('rejects non-object inputs: %p', (inputs) => {
    expect(validateBlocks([block('divider', inputs)])).toEqual([
      expect.objectContaining({ path: 'inputs' }),
    ]);
  });

  it('rejects non-boolean page breaks', () => {
    expect(
      validateBlocks([
        { ...block('paragraph', { text: 'Hello' }), pageBreak: 'false' },
      ]),
    ).toEqual([expect.objectContaining({ path: 'pageBreak' })]);
  });

  it('passes a valid flat document', () => {
    const errors = validateBlocks([
      block('heading', { text: 'Title', level: 1 }),
      block('paragraph', { text: 'body' }),
      block('bullet-list', { items: ['a', 'b'] }),
    ]);
    expect(errors).toEqual([]);
  });

  it('flags unknown block types', () => {
    const errors = validateBlocks([block('bogus', {})]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Unknown block type');
    expect(errors[0].instanceId).toBe('b1');
  });

  it('rejects a heading without text or a bad level', () => {
    const missingText = validateBlocks([block('heading', { level: 1 })]);
    expect(missingText).toHaveLength(1);
    expect(missingText.some((e) => e.path === 'inputs.text')).toBe(true);

    const badLevel = validateBlocks([
      block('heading', { text: 'x', level: 9 }),
    ]);
    expect(badLevel.some((e) => e.path === 'inputs.level')).toBe(true);
  });

  it('validates table columns and rows', () => {
    const ok = validateBlocks([
      block('table', { columns: [{ label: 'A' }], rows: [{ cells: ['x'] }] }),
    ]);
    expect(ok).toEqual([]);

    const bad = validateBlocks([block('table', { columns: [], rows: [] })]);
    expect(bad.some((e) => e.path.includes('inputs.columns'))).toBe(true);
    expect(bad.some((e) => e.path.includes('inputs.rows'))).toBe(true);
  });

  it('rejects disallowed types when allowedBlocks is set', () => {
    const errors = validateBlocks(
      [block('code', { code: 'x' })],
      ['heading', 'paragraph'],
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('not allowed');
  });

  it('treats containers as structural: section bypasses a legacy allowlist', () => {
    const errors = validateBlocks(
      [
        block('section', {
          blocks: [block('heading', { text: 'Hi', level: 1 }, { id: 'kid' })],
        }),
      ],
      ['heading', 'paragraph'],
    );
    expect(errors).toEqual([]);
  });

  it('recursively validates columns children', () => {
    const errors = validateBlocks([
      block('columns', {
        columns: [[block('heading', { level: 1 }, { id: 'child' })]],
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].instanceId).toBe('child');
  });

  it('passes a valid section with layout + children', () => {
    const errors = validateBlocks([
      block('section', {
        direction: 'horizontal',
        justify: 'between',
        align: 'center',
        blocks: [
          block('heading', { text: 'Left', level: 2 }, { id: 's1' }),
          block('paragraph', { text: 'Right' }, { id: 's2' }),
        ],
      }),
    ]);
    expect(errors).toEqual([]);
  });

  it('rejects a section with a bad direction and validates children', () => {
    const errors = validateBlocks([
      block('section', {
        direction: 'diagonal',
        blocks: [block('heading', { level: 1 }, { id: 'schild' })],
      }),
    ]);
    expect(errors.some((e) => e.path === 'inputs.direction')).toBe(true);
    expect(errors.some((e) => e.instanceId === 'schild')).toBe(true);
  });

  it('enforces nesting rules: no section inside a section', () => {
    const errors = validateBlocks([
      block('section', {
        blocks: [block('section', { blocks: [] }, { id: 'nested' })],
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].instanceId).toBe('nested');
    expect(errors[0].message).toContain('cannot contain');
  });

  it('enforces nesting rules: no columns or section inside columns', () => {
    const errors = validateBlocks([
      block('columns', {
        columns: [
          [
            block('columns', { columns: [[], []] }, { id: 'nc' }),
            block('section', { blocks: [] }, { id: 'ns' }),
          ],
        ],
      }),
    ]);
    expect(errors).toHaveLength(2);
    expect(new Set(errors.map((e) => e.instanceId))).toEqual(
      new Set(['nc', 'ns']),
    );
  });

  it('rejects script content in block inputs', () => {
    const errors = validateBlocks([
      block('paragraph', { text: '<script>alert(1)</script>' }),
    ]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('forbidden');
  });

  it('rejects unsafe image sources', () => {
    const errors = validateBlocks([
      block('image', { src: 'javascript:alert(1)' }),
    ]);
    expect(errors.some((e) => e.path.includes('src'))).toBe(true);
  });

  it('attributes nested issues without an id to the top-level block', () => {
    const errors = validateBlocks([
      block(
        'section',
        {
          blocks: [
            {
              id: '',
              type: 'paragraph',
              inputs: {},
            } as DocBlock,
          ],
        },
        { id: 'top' },
      ),
    ]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.instanceId === 'top')).toBe(true);
  });

  it('exposes a machine-readable schema for every catalog type', () => {
    for (const [type, spec] of Object.entries(BLOCK_CATALOG)) {
      expect(spec.jsonSchema).toBeDefined();
      expect(spec.type === type).toBe(true);
      expect(typeof spec.validate).toBe('function');
    }
  });
});

describe('canNestInside', () => {
  it('mirrors the composer rules: one container level max', () => {
    expect(canNestInside('section', 'columns')).toBe(true);
    expect(canNestInside('section', 'section')).toBe(false);
    expect(canNestInside('columns', 'paragraph')).toBe(true);
    expect(canNestInside('columns', 'columns')).toBe(false);
    expect(canNestInside('columns', 'section')).toBe(false);
    expect(canNestInside('paragraph', 'heading')).toBe(false);
  });
});
