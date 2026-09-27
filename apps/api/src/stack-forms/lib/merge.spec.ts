import { canonical, mergeStack, buildEntryValues } from './merge';
import type { StackEntryInput } from './merge';
import type {
  RenderTemplate,
  RenderField,
  RenderGroup,
  FillValues,
} from '../../pdf-render/lib/types';

/** Minimal render snapshot: empty canvas, optional groups + fields. */
function snap(opts: {
  fields?: RenderField[];
  groups?: RenderGroup[];
}): RenderTemplate {
  return {
    name: 't',
    canvas: { size: { width: 595, height: 842 }, components: [] },
    groups: opts.groups ?? [],
    fields: opts.fields ?? [],
  };
}

function field(name: string, over: Partial<RenderField> = {}): RenderField {
  return { name, type: 'text', required: false, ...over };
}

function group(
  id: string,
  name: string,
  memberIds: string[] = [],
  repeating = true,
): RenderGroup {
  return { id, name, memberIds, repeating, direction: 'column' };
}

function entry(
  templateId: string,
  templateName: string,
  s: RenderTemplate,
  version = 'v1',
): StackEntryInput {
  return { templateId, templateName, templateVersion: version, snapshot: s };
}

describe('canonical', () => {
  it('trims, lowercases and collapses internal whitespace', () => {
    expect(canonical('Full Name')).toBe('fullname');
    expect(canonical('  Email   Address ')).toBe('emailaddress');
    expect(canonical('DATE')).toBe('date');
  });
});

describe('mergeStack', () => {
  it('unifies scalar fields by normalized name and keeps first-seen casing', () => {
    const r = mergeStack([
      entry(
        'a',
        'Offer',
        snap({
          fields: [field('Employee Name'), field('Salary', { type: 'number' })],
        }),
      ),
      entry(
        'b',
        'NDA',
        snap({
          fields: [
            field('employee name'),
            field('Start Date', { type: 'date' }),
          ],
        }),
      ),
    ]);

    const names = r.unifiedFields.map((f) => f.name);
    expect(names).toContain('Employee Name');
    expect(names).toContain('Salary');
    expect(names).toContain('Start Date');
    // 'Employee Name' + 'employee name' unified into ONE field
    expect(
      r.unifiedFields.filter((f) => canonical(f.name) === 'employeename'),
    ).toHaveLength(1);
    expect(r.unifiedFields).toHaveLength(3);
    expect(r.conflicts).toHaveLength(0);
  });

  it('flags a type conflict when the same field name has different types', () => {
    const r = mergeStack([
      entry('a', 'A', snap({ fields: [field('Date', { type: 'date' })] })),
      entry('b', 'B', snap({ fields: [field('date', { type: 'text' })] })),
    ]);
    const conflict = r.conflicts.find((c) => c.property === 'type');
    expect(conflict).toBeDefined();
    expect(conflict!.variants.map((v) => v.value).sort()).toEqual([
      'date',
      'text',
    ]);
  });

  it('unions required across members (true if ANY member requires it)', () => {
    const r = mergeStack([
      entry('a', 'A', snap({ fields: [field('Email', { required: false })] })),
      entry('b', 'B', snap({ fields: [field('email', { required: true })] })),
    ]);
    const u = r.unifiedFields.find((f) => canonical(f.name) === 'email')!;
    expect(u.required).toBe(true);
  });

  it('unions dropdown options across members and flags differing option sets', () => {
    const r = mergeStack([
      entry(
        'a',
        'A',
        snap({
          fields: [
            field('Country', {
              type: 'dropdown',
              options: ['US', 'TR'] as any,
            }),
          ],
        }),
      ),
      entry(
        'b',
        'B',
        snap({
          fields: [
            field('country', {
              type: 'dropdown',
              options: ['TR', 'DE'] as any,
            }),
          ],
        }),
      ),
    ]);
    const u = r.unifiedFields.find((f) => canonical(f.name) === 'country')!;
    expect(u.options).toEqual(['US', 'TR', 'DE']);
    expect(r.conflicts.some((c) => c.property === 'options')).toBe(true);
  });

  it('unifies repeating groups by name and merges differing member fields', () => {
    const r = mergeStack([
      entry(
        'a',
        'A',
        snap({
          groups: [group('g1', 'Items')],
          fields: [
            field('Description', { groupId: 'g1' }),
            field('Qty', { type: 'number', groupId: 'g1' }),
          ],
        }),
      ),
      entry(
        'b',
        'B',
        snap({
          groups: [group('g2', 'items')],
          fields: [
            field('description', { groupId: 'g2' }),
            field('Amount', { type: 'number', groupId: 'g2' }),
          ],
        }),
      ),
    ]);

    expect(r.unifiedGroups).toHaveLength(1);
    const g = r.unifiedGroups[0];
    expect(canonical(g.name)).toBe('items');
    const memberNames = r.unifiedFields
      .filter((f) => f.groupId === g.id)
      .map((f) => canonical(f.name));
    expect(memberNames.sort()).toEqual(['amount', 'description', 'qty']);
  });

  it('builds a per-entry scalarMap + groupMaps that remap original → canonical', () => {
    const r = mergeStack([
      entry(
        'a',
        'A',
        snap({
          groups: [group('g1', 'Items')],
          fields: [field('Name'), field('Desc', { groupId: 'g1' })],
        }),
      ),
    ]);
    const a = r.entries[0];
    expect(a.maps.scalarMap['Name']).toBe('name');
    expect(a.maps.groupMaps['Items']).toEqual({
      canonical: 'items',
      fields: { Desc: 'desc' },
    });
  });

  it('manual link forces differently-named fields into one unified field', () => {
    const r = mergeStack(
      [
        entry('a', 'A', snap({ fields: [field('Name')] })),
        entry('b', 'B', snap({ fields: [field('Full Name')] })),
      ],
      [{ templateId: 'b', name: 'Full Name', targetName: 'name' }],
    );
    // One unified scalar (canonical 'name'), not two.
    expect(r.unifiedFields.filter((f) => !f.groupId)).toHaveLength(1);
    // B's 'Full Name' remaps to the shared 'name' canonical key.
    expect(r.entries[1].maps.scalarMap['Full Name']).toBe('name');
    expect(r.entries[0].maps.scalarMap['Name']).toBe('name');
  });

  it('preserves disabled/visible flags through the merge (first-seen)', () => {
    const r = mergeStack([
      entry(
        'a',
        'A',
        snap({ fields: [field('SSN', { disabled: true, visible: false })] }),
      ),
    ]);
    const u = r.unifiedFields[0];
    expect(u.disabled).toBe(true);
    expect(u.visible).toBe(false);
  });

  it('preserves the askOnGenerate flag through the merge (first-seen)', () => {
    const r = mergeStack([
      entry(
        'a',
        'A',
        snap({ fields: [field('Case No', { askOnGenerate: true })] }),
      ),
      entry('b', 'B', snap({ fields: [field('case no')] })),
    ]);
    const u = r.unifiedFields.find((f) => canonical(f.name) === 'caseno')!;
    expect(u.askOnGenerate).toBe(true);
  });
});

describe('buildEntryValues', () => {
  it('remaps canonical values back to each template original names (scalar + group)', () => {
    const r = mergeStack([
      entry(
        'a',
        'Offer',
        snap({
          groups: [group('g1', 'Line Items')],
          fields: [
            field('Full Name'),
            field('Item', { groupId: 'g1' }),
            field('Qty', { type: 'number', groupId: 'g1' }),
          ],
        }),
      ),
      entry(
        'b',
        'NDA',
        snap({
          groups: [group('g2', 'line items')],
          fields: [
            field('full name'),
            field('item', { groupId: 'g2' }),
            field('Price', { type: 'number', groupId: 'g2' }),
          ],
        }),
      ),
    ]);

    const canonicalValues: FillValues = {
      fullname: 'Burak',
      lineitems: [
        { item: 'Widget', qty: '3', price: '10' },
        { item: 'Gadget', qty: '1', price: '25' },
      ],
    };

    const aValues = buildEntryValues(r.entries[0].maps, canonicalValues);
    // Template a expects original scalar + original group name + original field names
    expect(aValues['Full Name']).toBe('Burak');
    const aGroup = aValues['Line Items'] as Record<string, string>[];
    expect(aGroup).toHaveLength(2);
    expect(aGroup[0]).toEqual({ Item: 'Widget', Qty: '3' }); // 'price' dropped (not in a)

    const bValues = buildEntryValues(r.entries[1].maps, canonicalValues);
    expect(bValues['full name']).toBe('Burak');
    const bGroup = bValues['line items'] as Record<string, string>[];
    expect(bGroup[0]).toEqual({ item: 'Widget', Price: '10' }); // 'qty' dropped (not in b); 'Price' keeps b's original casing
  });

  it('lets owner ask-on-generate values overlay the remapped values (owner-wins)', () => {
    const r = mergeStack([
      entry(
        'a',
        'A',
        snap({
          groups: [group('g1', 'Items')],
          fields: [
            field('Name'),
            field('Case No', { askOnGenerate: true }),
            field('Item', { groupId: 'g1' }),
          ],
        }),
      ),
    ]);
    const remapped = buildEntryValues(r.entries[0].maps, { name: 'Burak' });
    // Mirrors getSubmissionDocumentPdf's merge: remapped + saved + provided.
    const merged = { ...remapped, 'Case No': '2026-001' };
    expect(merged).toEqual({ Name: 'Burak', 'Case No': '2026-001' });
  });
});
