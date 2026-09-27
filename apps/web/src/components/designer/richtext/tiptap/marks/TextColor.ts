/**
 * TipTap mark for text color (hex string).
 */

import { Mark } from '@tiptap/core';

export const TextColorMark = Mark.create({
  name: 'textColor',

  addAttributes() {
    return {
      value: {
        default: null,
        parseHTML: (element) => {
          const color = element.style.color;
          if (color) return color;
          return element.getAttribute('data-text-color') || null;
        },
        renderHTML: (attributes) => {
          if (!attributes.value) return {};
          return {
            style: `color: ${attributes.value}`,
            'data-text-color': attributes.value,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'span[data-text-color]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },
});
