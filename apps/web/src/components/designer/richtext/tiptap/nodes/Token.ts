/**
 * TipTap node for token `{{name}}` — atomic, inline, non-editable chip.
 * Renders identically to ComponentBody's token styling.
 */

import { Node } from '@tiptap/core';

export const Token = Node.create({
  name: 'token',

  group: 'inline',

  inline: true,

  atom: true, // Treat as a single unit — cursor can't enter

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-token-name') || null,
        renderHTML: (attributes) => {
          if (!attributes.name) return {};
          return {
            'data-token-name': attributes.name,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-token-name]',
      },
    ];
  },

  renderHTML({ node }) {
    const name = node.attrs.name as string;
    return [
      'span',
      {
        'data-token-name': name,
        class: 'rounded bg-orange-100 px-1 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200',
        contenteditable: 'false',
      },
      `{{${name}}}`,
    ];
  },

  renderText({ node }) {
    return `{{${node.attrs.name}}}`;
  },
});
