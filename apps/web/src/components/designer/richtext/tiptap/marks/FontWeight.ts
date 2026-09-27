/**
 * TipTap mark for fontWeight (normal/medium/semibold/bold).
 * Renders a <span> with a fontWeight CSS property.
 */

import { Mark } from '@tiptap/core';

export const FontWeightMark = Mark.create({
  name: 'fontWeight',

  addOptions() {
    return {
      // No HTML-specific options needed
    };
  },

  addAttributes() {
    return {
      value: {
        default: 'normal',
        parseHTML: (element) => element.style.fontWeight || element.getAttribute('data-font-weight') || 'normal',
        renderHTML: (attributes) => {
          if (!attributes.value) return {};
          const weight = attributes.value;
          // Map to numeric CSS values (400/500/600/700)
          const numeric = { normal: 400, medium: 500, semibold: 600, bold: 700 }[weight as string] ?? 400;
          return {
            style: `fontWeight: ${numeric}`,
            'data-font-weight': weight,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'span[data-font-weight]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },
});
