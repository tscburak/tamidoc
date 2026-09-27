/**
 * Resolve toolbar state (active/inactive/mixed) from marks over a selection.
 * Mirrors ComponentBody's sizeAt/weightAt/fontStyleAt/textDecorationAt logic.
 */

import type { TextMark } from '../types';
import type { AttributeState, BaseStyle, Selection, StyleState, ToolbarState } from './schema';
import { splitContent } from '../textMerge';

/** Is a content position inside a `{{token}}` placeholder? Tokens skip mark resolution. */
function isInsideToken(content: string, pos: number): boolean {
  let i = 0;
  for (const seg of splitContent(content)) {
    if (seg.type === 'token') {
      const len = seg.value.length + 4; // {{ + name + }}
      if (pos >= i && pos < i + len) return true;
      i += len;
    } else {
      i += seg.value.length;
    }
  }
  return false;
}

/** Effective style at one content position. */
function effectiveStyleAt(
  marks: TextMark[] | undefined,
  pos: number,
  base: BaseStyle,
): BaseStyle {
  if (!marks) return base;
  let style: BaseStyle = { ...base };
  for (const m of marks) {
    if (m.start <= pos && pos < m.end) {
      if (m.fontWeight) style.fontWeight = m.fontWeight;
      if (m.fontSize !== undefined) style.fontSize = m.fontSize;
      if (m.fontStyle) style.fontStyle = m.fontStyle;
      if (m.textDecoration) style.textDecoration = m.textDecoration;
      if (m.color) style.color = m.color;
    }
  }
  return style;
}

/** Compute per-attribute active/inactive/mixed over a selection. */
export function resolveSelectionStyles(
  content: string,
  marks: TextMark[] | undefined,
  base: BaseStyle,
  selection: Selection,
): ToolbarState {
  const counts = {
    fontWeight: new Map<string | number, number>(),
    fontStyle: new Map<string | number, number>(),
    textDecoration: new Map<string | number, number>(),
    fontSize: new Map<string | number, number>(),
    color: new Map<string | number, number>(),
  };

  const styleKeys = ['fontWeight', 'fontStyle', 'textDecoration', 'fontSize', 'color'] as const;
  const len = Math.min(selection.end, content.length);
  for (let p = selection.start; p < len; p++) {
    if (isInsideToken(content, p)) continue;
    const style = effectiveStyleAt(marks, p, base);
    for (const key of styleKeys) {
      const value = style[key];
      counts[key].set(value, (counts[key].get(value) ?? 0) + 1);
    }
  }

  const toState = (map: Map<string | number, number>, baseValue: string | number): AttributeState => {
    const distinct = map.size;
    if (distinct === 0) return { state: 'inactive' as StyleState };
    if (distinct === 1) {
      const [value] = map.keys();
      return { state: value === baseValue ? ('inactive' as StyleState) : ('active' as StyleState), value };
    }
    return { state: 'mixed' as StyleState };
  };

  return {
    fontWeight: toState(counts.fontWeight, base.fontWeight),
    fontStyle: toState(counts.fontStyle, base.fontStyle),
    textDecoration: toState(counts.textDecoration, 'none'),
    fontSize: toState(counts.fontSize, base.fontSize),
    color: toState(counts.color, base.color),
  };
}
