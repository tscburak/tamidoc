import { describe, expect, it } from 'vitest';
import { cloneBlock, childListsOf, makeBlock } from './blockCatalog';
import {
  duplicateBlock,
  ensureSections,
  findBlock,
  findBlockPosition,
  moveBlock,
} from './blockOps';
import type { DocBlock } from '../../context/TemplateStoreProvider';

const leaf = (id: string): DocBlock => ({
  id,
  type: 'paragraph',
  inputs: { text: id },
});
const tree = (): DocBlock[] => [
  {
    id: 'section',
    type: 'section',
    inputs: {
      blocks: [
        leaf('one'),
        {
          id: 'columns',
          type: 'columns',
          inputs: { columns: [[leaf('two'), leaf('three')], [leaf('four')]] },
        },
      ],
    },
  },
];

describe('nested block operations', () => {
  it('moves within a column without changing other siblings or the original', () => {
    const original = tree();
    const next = moveBlock(original, 'three', -1);
    expect(
      childListsOf(findBlock(next, 'columns')!)[0].map((b) => b.id),
    ).toEqual(['three', 'two']);
    expect(findBlockPosition(next, 'three')).toEqual({ index: 0, total: 2 });
    expect(
      childListsOf(findBlock(original, 'columns')!)[0].map((b) => b.id),
    ).toEqual(['two', 'three']);
    expect(findBlock(next, 'four')).toEqual(leaf('four'));
  });

  it('duplicates a nested container beside itself with fresh descendant ids', () => {
    const original = tree();
    const next = duplicateBlock(original, 'columns');
    const siblings = childListsOf(next[0])[0];
    expect(siblings).toHaveLength(3);
    const duplicate = siblings[2];
    expect(duplicate.id).not.toBe('columns');
    expect(childListsOf(duplicate)[0][0].id).not.toBe('two');
    expect(childListsOf(duplicate)[0][0].inputs).toEqual(leaf('two').inputs);
    expect(childListsOf(original[0])[0]).toHaveLength(2);
  });

  it('keeps blocks inside their parent at movement boundaries', () => {
    const original = tree();
    expect(moveBlock(original, 'two', -1)).toEqual(original);
    expect(moveBlock(original, 'three', 1)).toEqual(original);
  });

  it('preserves page boundaries when migrating leaf blocks into sections', () => {
    const original = [
      leaf('one'),
      { ...leaf('two'), pageBreak: true },
      leaf('three'),
      makeBlock('section'),
    ];
    const sections = ensureSections(original);
    expect(sections).toHaveLength(3);
    expect(sections[1].pageBreak).toBe(true);
    expect(childListsOf(sections[1])[0].map((b) => b.id)).toEqual([
      'two',
      'three',
    ]);
    expect(childListsOf(sections[1])[0][0].pageBreak).toBeUndefined();
    expect(original[1].pageBreak).toBe(true);
  });

  it('clones container data without sharing editable values', () => {
    const original = tree()[0];
    const copy = cloneBlock(original);
    childListsOf(copy)[0][0].inputs.text = 'Changed';
    expect(childListsOf(original)[0][0].inputs.text).toBe('one');
  });
});
