/**
 * TipTap mark for fontSize (number in px).
 */

import { Mark } from '@tiptap/core';

export const FontSizeMark = Mark.create({
  name: 'fontSize',

  addAttributes() {
    return {
      value: {
        default: null,
        parseHTML: (element) => {
          const size = element.style.fontSize;
          if (size && size.endsWith('px')) {
            return parseInt(size, 10);
          }
          const attr = element.getAttribute('data-font-size');
          return attr ? parseInt(attr, 10) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.value) return {};
          return {
            style: `fontSize: ${attributes.value}px`,
            'data-font-size': String(attributes.value),
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'span[data-font-size]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },
});
