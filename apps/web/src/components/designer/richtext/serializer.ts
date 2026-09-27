/**
 * Serializer between TipTap doc JSON and content+marks model.
 * Single-paragraph schema with HardBreak for \n; token nodes are atoms.
 */

import type { TextMark } from '../types';
import type { BaseStyle, ContentMarks } from './schema';
import { splitContent } from '../textMerge';

/** Internal mark representation (one attribute per range) for serialization. */
interface MarkRange {
  start: number;
  end: number;
  attr: 'fontWeight' | 'fontStyle' | 'textDecoration' | 'fontSize' | 'color';
  value: string | number;
}

/** TipTap node types we emit. */
type DocNode = { type: 'doc'; content: ParaNode[] };
type ParaNode = { type: 'paragraph'; content: ChildNode[] };
type ChildNode = TextNode | HardBreakNode | TokenNode;
type TextNode = { type: 'text'; text: string; marks?: MarkRef[] };
type HardBreakNode = { type: 'hardBreak' };
type TokenNode = { type: 'token'; attrs: { name: string } };
type MarkRef = { type: string; attrs: Record<string, unknown> };

/**
 * Convert content+marks → TipTap doc JSON.
 * Splits text on \n into hardBreak nodes; merges runs of equal effective style.
 */
export function modelToDoc(model: ContentMarks, base: BaseStyle): DocNode {
  const children: ChildNode[] = [];
  let contentPos = 0;

  for (const seg of splitContent(model.content)) {
    if (seg.type === 'token') {
      children.push({ type: 'token', attrs: { name: seg.value } });
      contentPos += seg.value.length + 4;
    } else {
      // Split text segment on \n → interleave text nodes with hardBreak
      const lines = seg.value.split('\n');
      lines.forEach((line, i) => {
        if (line.length > 0) {
          // Group into runs of equal effective style
          let lineStart = contentPos;
          let j = 0;
          while (j < line.length) {
            const runStyle = effectiveStyleAt(model.marks, lineStart + j, base);
            let k = j + 1;
            while (k < line.length && sameEffectiveStyle(model.marks, lineStart + k, runStyle, base)) {
              k++;
            }
            const runText = line.slice(j, k);
            children.push({
              type: 'text',
              text: runText,
              marks: marksToPMMarks(runStyle, base),
            });
            j = k;
          }
        }
        // Insert hardBreak between lines (but not after the last)
        if (i < lines.length - 1) {
          children.push({ type: 'hardBreak' });
        }
        contentPos += line.length + 1; // +1 for the \n
      });
    }
  }

  return { type: 'doc', content: [{ type: 'paragraph', content: children }] };
}

/**
 * Convert TipTap doc JSON → content+marks.
 * Tokens emit {{name}}; hardBreaks emit \n.
 */
export function docToModel(doc: DocNode): ContentMarks {
  const para = doc.content[0];
  const contentParts: string[] = [];
  const rawMarks: MarkRange[] = [];

  let contentPos = 0;
  for (const child of para.content ?? []) {
    if (child.type === 'text') {
      const start = contentPos;
      contentParts.push(child.text);
      contentPos += child.text.length;
      for (const m of child.marks ?? []) {
        rawMarks.push({
          attr: m.type as MarkRange['attr'],
          value: m.attrs.value as string | number,
          start,
          end: start + child.text.length,
        });
      }
    } else if (child.type === 'hardBreak') {
      contentParts.push('\n');
      contentPos += 1;
    } else if (child.type === 'token') {
      contentParts.push(`{{${child.attrs.name}}}`);
      contentPos += child.attrs.name.length + 4;
      // tokens carry no marks
    }
  }

  // Reconstruct TextMark[] from per-attribute ranges, then merge adjacent equal sets
  const marks = coalesceAttrRanges(rawMarks);
  return {
    content: contentParts.join(''),
    marks: sanitizeAndMergeMarks(marks, contentPos),
  };
}

/**
 * Map a content offset (including tokens and \n) to a ProseMirror position.
 * ProseMirror pos = 1 (paragraph start) + sum over children (1 per text char, 1 per hardBreak, 1 per token).
 */
export function posFromContentOffset(content: string, offset: number): number {
  let pos = 1; // paragraph start
  let i = 0;
  while (i < offset && i < content.length) {
    if (content.startsWith('{{', i)) {
      const end = content.indexOf('}}', i);
      if (end === -1) break;
      pos += 1; // token = 1 atom
      i = end + 2;
    } else if (content[i] === '\n') {
      pos += 1; // hardBreak = 1
      i += 1;
    } else {
      pos += 1;
      i += 1;
    }
  }
  return pos;
}

/**
 * Map a ProseMirror position back to content offset.
 */
export function contentOffsetFromPos(content: string, pmPos: number): number {
  let pos = 0;
  let pm = 1; // paragraph start
  let i = 0;
  while (pm < pmPos && i < content.length) {
    if (content.startsWith('{{', i)) {
      const end = content.indexOf('}}', i);
      if (end === -1) break;
      pm += 1; pos = end + 2; i = end + 2;
    } else if (content[i] === '\n') {
      pm += 1; pos += 1; i += 1;
    } else {
      pm += 1; pos += 1; i += 1;
    }
  }
  return pos;
}

/** Effective style at a content position. */
function effectiveStyleAt(marks: TextMark[] | undefined, pos: number, base: BaseStyle): BaseStyle {
  if (!marks) return { ...base };
  const style: BaseStyle = { ...base };
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

/** Check if two positions have equal effective style. */
function sameEffectiveStyle(marks: TextMark[] | undefined, pos: number, style: BaseStyle, base: BaseStyle): boolean {
  const at = effectiveStyleAt(marks, pos, base);
  return (
    at.fontWeight === style.fontWeight &&
    at.fontSize === style.fontSize &&
    at.fontStyle === style.fontStyle &&
    at.textDecoration === style.textDecoration &&
    at.color === style.color
  );
}

/** Convert effective style to ProseMirror mark refs (only attributes that differ from base). */
function marksToPMMarks(style: BaseStyle, base: BaseStyle): MarkRef[] {
  const out: MarkRef[] = [];
  if (style.fontWeight !== base.fontWeight) out.push({ type: 'fontWeight', attrs: { value: style.fontWeight } });
  if (style.fontStyle !== base.fontStyle) out.push({ type: 'fontStyle', attrs: { value: style.fontStyle } });
  if (style.textDecoration !== base.textDecoration && style.textDecoration !== 'none') {
    out.push({ type: 'textDecoration', attrs: { value: style.textDecoration } });
  }
  if (style.fontSize !== base.fontSize) out.push({ type: 'fontSize', attrs: { value: style.fontSize } });
  if (style.color !== base.color) out.push({ type: 'textColor', attrs: { value: style.color } });
  return out;
}

/**
 * Reconstruct TextMark[] from per-attribute raw ranges.
 * Merge adjacent ranges with equal attribute sets into single TextMark objects.
 * Drop any range that fully lies over token chars (defensive; tokens shouldn't have marks in doc).
 */
function coalesceAttrRanges(raw: MarkRange[]): TextMark[] {
  if (raw.length === 0) return [];

  // Sort by start, then end
  const sorted = [...raw].sort((a, b) => a.start - b.start || a.end - b.end);

  // Group by position range, collecting attributes
  const byRange = new Map<string, Set<MarkRange>>();
  for (const r of sorted) {
    const key = `${r.start}:${r.end}`;
    if (!byRange.has(key)) byRange.set(key, new Set());
    byRange.get(key)!.add(r);
  }

  const marks: TextMark[] = [];
  for (const [key, ranges] of byRange) {
    const [startStr, endStr] = key.split(':');
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    const m: TextMark = { start, end };
    for (const r of ranges) {
      (m as unknown as Record<string, unknown>)[r.attr] = r.value;
    }
    marks.push(m);
  }

  return marks;
}

/** Import from ops.ts to avoid duplication. */
function sanitizeAndMergeMarks(marks: TextMark[] | undefined, contentLength: number): TextMark[] | undefined {
  if (!marks || marks.length === 0) return marks;

  // Clamp and drop empty
  const clamped: TextMark[] = [];
  for (const m of marks) {
    const start = Math.max(0, Math.min(m.start, contentLength));
    const end = Math.max(0, Math.min(m.end, contentLength));
    if (end <= start) continue;
    const next: TextMark = { start, end };
    if (m.fontWeight) next.fontWeight = m.fontWeight;
    if (m.color) next.color = m.color;
    if (m.fontSize !== undefined) next.fontSize = m.fontSize;
    if (m.fontStyle) next.fontStyle = m.fontStyle;
    if (m.textDecoration) next.textDecoration = m.textDecoration;
    clamped.push(next);
  }

  // Sort by start, then merge adjacent with equal attributes
  clamped.sort((a, b) => a.start - b.start);
  const merged: TextMark[] = [];
  for (const m of clamped) {
    const last = merged[merged.length - 1];
    if (last && last.end === m.start && attrsEqual(last, m)) {
      last.end = m.end;
    } else {
      merged.push({ ...m });
    }
  }

  return merged.length ? merged : undefined;
}

function attrsEqual(a: TextMark, b: TextMark): boolean {
  return (
    (a.fontWeight ?? undefined) === (b.fontWeight ?? undefined) &&
    (a.fontSize ?? undefined) === (b.fontSize ?? undefined) &&
    (a.fontStyle ?? undefined) === (b.fontStyle ?? undefined) &&
    (a.textDecoration ?? undefined) === (b.textDecoration ?? undefined) &&
    (a.color ?? undefined) === (b.color ?? undefined)
  );
}
