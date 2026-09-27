/**
 * All custom TipTap extensions + configured StarterKit.
 */

import { StarterKit } from '@tiptap/starter-kit';
import { FontWeightMark } from './marks/FontWeight';
import { FontStyleMark } from './marks/FontStyle';
import { TextDecorationMark } from './marks/TextDecoration';
import { FontSizeMark } from './marks/FontSize';
import { TextColorMark } from './marks/TextColor';
import { Token } from './nodes/Token';

export const allExtensions = [
  StarterKit.configure({
    // Disable extensions we don't want
    heading: false,
    blockquote: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    code: false,
    bold: false,
    italic: false,
    underline: false,
    link: false,
    trailingNode: false,
    // Keep document, paragraph, text, hardBreak, dropcursor, gapcursor, undoRedo (all defaults)
  }),
  FontWeightMark,
  FontStyleMark,
  TextDecorationMark,
  FontSizeMark,
  TextColorMark,
  Token,
];
