/**
 * TipTap mark for textDecoration (underline/line-through/none).
 */

import { Mark } from '@tiptap/core';

export const TextDecorationMark = Mark.create({
  name: 'textDecoration',

  addAttributes() {
    return {
      value: {
        default: 'none',
        parseHTML: (element) => {
          const style = element.style.textDecoration;
          if (style === 'underline') return 'underline';
          if (style === 'line-through') return 'line-through';
          return element.getAttribute('data-text-decoration') || 'none';
        },
        renderHTML: (attributes) => {
          if (!attributes.value || attributes.value === 'none') return {};
          return {
            style: `textDecoration: ${attributes.value}`,
            'data-text-decoration': attributes.value,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'span[data-text-decoration]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },
});
