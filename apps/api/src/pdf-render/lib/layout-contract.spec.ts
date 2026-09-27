import { parseLayoutString, validateLayout } from './layout-contract';

describe('parseLayoutString', () => {
  it('parses display + gap tokens', () => {
    expect(parseLayoutString('stack gap-md')).toEqual({
      layout: { display: 'stack', gap: 'md' },
      errors: [],
    });
  });

  it('parses grid columns + span + alignment', () => {
    expect(parseLayoutString('grid col-2 gap-lg')).toEqual({
      layout: { display: 'grid', columns: 2, gap: 'lg' },
      errors: [],
    });
    expect(parseLayoutString('row justify-between align-center')).toEqual({
      layout: { display: 'row', align: 'between', valign: 'center' },
      errors: [],
    });
    expect(parseLayoutString('span-2')).toEqual({
      layout: { span: 2 },
      errors: [],
    });
  });

  it('parses page-break and keep-together flags', () => {
    expect(parseLayoutString('page-break-before keep-together')).toEqual({
      layout: { pageBreakBefore: true, keepTogether: true },
      errors: [],
    });
  });

  it('rejects unknown tokens instead of passing them through', () => {
    const { layout, errors } = parseLayoutString('stack foo-bar className:x');
    expect(layout).toEqual({ display: 'stack' });
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('foo-bar');
  });

  it('rejects out-of-range spans', () => {
    const { errors } = parseLayoutString('span-13');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('span-13');
  });

  it('never emits raw CSS', () => {
    const { layout, errors } = parseLayoutString(
      'display:flex; color:red <style>',
    );
    expect(layout).toEqual({});
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('validateLayout', () => {
  it('accepts a valid contract object', () => {
    expect(
      validateLayout({ display: 'grid', columns: 2, span: 2, gap: 'md' }),
    ).toEqual([]);
  });

  it('rejects className, raw CSS keys and unknown props', () => {
    const errors = validateLayout({ className: 'foo', style: 'color:red' });
    expect(errors.some((e) => e.includes('layout.className'))).toBe(true);
    expect(errors.some((e) => e.includes('layout.style'))).toBe(true);
  });

  it('rejects out-of-range and wrong-typed values', () => {
    expect(validateLayout({ columns: 13 }).length).toBeGreaterThan(0);
    expect(validateLayout({ gap: 'huge' }).length).toBeGreaterThan(0);
    expect(validateLayout({ keepTogether: 'yes' }).length).toBeGreaterThan(0);
  });
});
