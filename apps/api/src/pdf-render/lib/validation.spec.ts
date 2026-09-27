import {
  isFilled,
  findMissingRequired,
  findMissingGenerateValues,
  askScalarFields,
} from './validation';
import type { RenderTemplate, RenderField, FillValues } from './types';

function field(name: string, over: Partial<RenderField> = {}): RenderField {
  return { name, type: 'text', required: false, ...over };
}

function tpl(fields: RenderField[]): RenderTemplate {
  return {
    name: 't',
    canvas: { size: { width: 595, height: 842 }, components: [] },
    groups: [],
    fields,
  };
}

describe('isFilled', () => {
  it('requires the literal "true" for checkboxes', () => {
    expect(isFilled('checkbox', 'true')).toBe(true);
    expect(isFilled('checkbox', 'false')).toBe(false);
    expect(isFilled('text', '  ')).toBe(false);
    expect(isFilled('text', 'x')).toBe(true);
  });
});

describe('findMissingRequired', () => {
  it('skips ask-on-generate fields (the owner answers them at download)', () => {
    const t = tpl([
      field('Name', { required: true }),
      field('Issued At', { required: true, askOnGenerate: true }),
    ]);
    const missing = findMissingRequired(t, { Name: 'Burak' });
    expect(missing).toEqual([]); // 'Issued At' blank but not filler-visible
  });

  it('still flags blank required normal fields', () => {
    const t = tpl([field('Name', { required: true })]);
    expect(findMissingRequired(t, {})).toEqual(['::Name']);
  });
});

describe('askScalarFields', () => {
  it('returns only scalar ask fields', () => {
    const fields = [
      field('Case No', { askOnGenerate: true }),
      field('Row Note', { askOnGenerate: true, groupId: 'g1' }),
      field('Name'),
    ];
    expect(askScalarFields(fields).map((f) => f.name)).toEqual(['Case No']);
  });
});

describe('findMissingGenerateValues', () => {
  it('flags blank required ask fields, passes blank optional ones', () => {
    const fields = [
      field('Case No', { required: true, askOnGenerate: true }),
      field('Note', { required: false, askOnGenerate: true }),
    ];
    expect(findMissingGenerateValues(fields, {})).toEqual(['Case No']);
    expect(
      findMissingGenerateValues(fields, {
        'Case No': '2026-001',
      }),
    ).toEqual([]);
  });

  it('ignores group members, disabled fields and non-ask fields', () => {
    const fields = [
      field('Row Note', { required: true, askOnGenerate: true, groupId: 'g1' }),
      field('Locked', { required: true, askOnGenerate: true, disabled: true }),
      field('Name', { required: true }),
    ];
    expect(findMissingGenerateValues(fields, {})).toEqual([]);
  });

  it('honors the checkbox "true" rule', () => {
    const fields = [
      field('Approved', {
        type: 'checkbox',
        required: true,
        askOnGenerate: true,
      }),
    ];
    expect(findMissingGenerateValues(fields, { Approved: 'false' })).toEqual([
      'Approved',
    ]);
    expect(findMissingGenerateValues(fields, { Approved: 'true' })).toEqual([]);
  });
});
