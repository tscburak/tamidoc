/**
 * TipTap mark for fontStyle (normal/italic).
 */

import { Mark } from '@tiptap/core';

export const FontStyleMark = Mark.create({
  name: 'fontStyle',

  addAttributes() {
    return {
      value: {
        default: 'normal',
        parseHTML: (element) => {
          const style = element.style.fontStyle;
          if (style === 'italic') return 'italic';
          if (style === 'normal') return 'normal';
          return element.getAttribute('data-font-style') || 'normal';
        },
        renderHTML: (attributes) => {
          if (!attributes.value || attributes.value === 'normal') return {};
          return {
            style: 'fontStyle: italic',
            'data-font-style': 'italic',
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'span[data-font-style]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },
});
