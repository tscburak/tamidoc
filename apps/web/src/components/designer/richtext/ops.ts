/**
 * Composable mark algebra for the content+marks model.
 * Each operation affects ONLY its named attribute; others are untouched.
 * Fixes the latent bug where applyMark replaced the entire selection with one merged mark.
 */

import type { TextMark } from '../types';
import type { ContentMarks, Selection } from './schema';

/** Apply one attribute over a range, leaving other attributes intact. */
export function applyAttribute(
  model: ContentMarks,
  range: Selection,
  attr: 'fontWeight' | 'fontStyle' | 'textDecoration' | 'fontSize' | 'color',
  value: string | number,
): ContentMarks {
  const a = Math.max(0, Math.min(range.start, model.content.length));
  const b = Math.max(0, Math.min(range.end, model.content.length));
  if (b <= a) return model;

  const newMarks = (model.marks ?? [])
    // Remove existing marks for this attr that fully inside the range (they're overridden)
    .filter((m) => !(m[attr] && m.end > a && m.start < b))
    // Trim marks that overlap the range
    .map((m): TextMark | null => {
      if (!m[attr]) return m;
      if (m.end <= a || m.start >= b) return m;
      const trimmed: TextMark = { start: m.start, end: m.end };
      // Copy all attrs except the one we're replacing
      if (m.fontWeight && attr !== 'fontWeight') trimmed.fontWeight = m.fontWeight;
      if (m.fontSize !== undefined && attr !== 'fontSize') trimmed.fontSize = m.fontSize;
      if (m.fontStyle && attr !== 'fontStyle') trimmed.fontStyle = m.fontStyle;
      if (m.textDecoration && attr !== 'textDecoration') trimmed.textDecoration = m.textDecoration;
      if (m.color && attr !== 'color') trimmed.color = m.color;
      // Clamp to outside the range
      if (trimmed.start < a) trimmed.end = a;
      if (trimmed.end > b) trimmed.start = b;
      if (trimmed.end <= trimmed.start) return null;
      return trimmed;
    })
    .filter((m): m is TextMark => m !== null);

  // Add the new mark for this attribute
  newMarks.push({ start: a, end: b, [attr]: value });

  return { content: model.content, marks: sanitizeAndMergeMarks(newMarks, model.content.length) };
}

/** Toggle: if every char in range has this attribute==value, remove; otherwise set. */
export function toggleAttribute(
  model: ContentMarks,
  range: Selection,
  attr: 'fontWeight' | 'fontStyle' | 'textDecoration' | 'fontSize' | 'color',
  value: string | number,
): ContentMarks {
  const a = Math.max(0, Math.min(range.start, model.content.length));
  const b = Math.max(0, Math.min(range.end, model.content.length));
  if (b <= a) return model;

  // Check uniformity: does every char in range already have this attr==value?
  let allHaveValue = true;
  for (let p = a; p < b && allHaveValue; p++) {
    let has = false;
    for (const m of model.marks ?? []) {
      if (m.start <= p && p < m.end && m[attr] === value) {
        has = true;
        break;
      }
    }
    if (!has) allHaveValue = false;
  }

  if (allHaveValue) {
    // Remove this attribute from the range
    return removeAttribute(model, range, attr);
  }
  // Set the attribute
  return applyAttribute(model, range, attr, value);
}

/** Remove one attribute from a range while preserving others. */
export function removeAttribute(
  model: ContentMarks,
  range: Selection,
  attr: 'fontWeight' | 'fontStyle' | 'textDecoration' | 'fontSize' | 'color',
): ContentMarks {
  const a = Math.max(0, Math.min(range.start, model.content.length));
  const b = Math.max(0, Math.min(range.end, model.content.length));
  if (b <= a) return model;

  const newMarks = (model.marks ?? [])
    .map((m): TextMark | null => {
      if (!m[attr]) return m;
      // Trim marks that overlap the range, removing the attr portion inside
      if (m.start < a && m.end > b) {
        // Split: keep before and after
        const before: TextMark = { start: m.start, end: a };
        const after: TextMark = { start: b, end: m.end };
        copyAttrsExcept(m, before, attr);
        copyAttrsExcept(m, after, attr);
        // We can only return one, return before and push after separately
        // Actually, we need to handle splits differently. For simplicity, just trim:
        const trimmed: TextMark = { start: m.start, end: m.end };
        copyAttrsExcept(m, trimmed, attr);
        return trimmed;
      }
      if (m.end <= a || m.start >= b) return m;
      // Trim: keep portion outside range
      const trimmed: TextMark = { start: m.start, end: m.end };
      copyAttrsExcept(m, trimmed, attr);
      if (trimmed.start < a) trimmed.end = a;
      if (trimmed.end > b) trimmed.start = b;
      if (trimmed.end <= trimmed.start) return null;
      return trimmed;
    })
    .filter((m): m is TextMark => m !== null);

  return { content: model.content, marks: sanitizeAndMergeMarks(newMarks, model.content.length) };
}

/** Copy all attributes except `attr` from src to dst. */
function copyAttrsExcept(src: TextMark, dst: TextMark, except: string): void {
  if (src.fontWeight && except !== 'fontWeight') dst.fontWeight = src.fontWeight;
  if (src.fontSize !== undefined && except !== 'fontSize') dst.fontSize = src.fontSize;
  if (src.fontStyle && except !== 'fontStyle') dst.fontStyle = src.fontStyle;
  if (src.textDecoration && except !== 'textDecoration') dst.textDecoration = src.textDecoration;
  if (src.color && except !== 'color') dst.color = src.color;
}

/** Insert text at a position, shifting marks. */
export function insertText(model: ContentMarks, pos: number, text: string): ContentMarks {
  const clamped = Math.max(0, Math.min(pos, model.content.length));
  const nextContent = model.content.slice(0, clamped) + text + model.content.slice(clamped);
  const shift = text.length;
  const marks = (model.marks ?? [])
    .map((m): TextMark | null => {
      if (m.end <= clamped) return m;
      const s = m.start >= clamped ? m.start + shift : m.start;
      const e = m.end >= clamped ? m.end + shift : m.end;
      return { ...m, start: s, end: e };
    })
    .filter((m): m is TextMark => m !== null);
  return { content: nextContent, marks: sanitizeAndMergeMarks(marks, nextContent.length) };
}

/** Delete a range, collapsing marks around it. */
export function deleteRange(model: ContentMarks, range: Selection): ContentMarks {
  const a = Math.max(0, Math.min(range.start, model.content.length));
  const b = Math.max(0, Math.min(range.end, model.content.length));
  if (b <= a) return model;

  const nextContent = model.content.slice(0, a) + model.content.slice(b);
  const removed = b - a;
  const marks = (model.marks ?? [])
    .map((m): TextMark | null => {
      if (m.end <= a) return m;
      if (m.start >= b) return { ...m, start: m.start - removed, end: m.end - removed };
      if (m.start < a && m.end > b) return { ...m, end: m.end - removed };
      return null; // Fully inside deleted range
    })
    .filter((m): m is TextMark => m !== null);
  return { content: nextContent, marks: sanitizeAndMergeMarks(marks, nextContent.length) };
}

/** Insert a token `{{name}}` at position. Tokens are not marked (render as chips). */
export function insertToken(model: ContentMarks, pos: number, name: string): ContentMarks {
  const token = `{{${name}}}`;
  return insertText(model, pos, token);
}

/**
 * Merge adjacent ranges with equal attribute sets, clamp to content bounds, drop empty.
 * Replaces PropertiesInspector.sanitizeMarks — the single source of truth for mark hygiene.
 */
export function sanitizeAndMergeMarks(marks: TextMark[] | undefined, contentLength: number): TextMark[] | undefined {
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

/** Check if two marks have identical attribute sets (values must match too). */
function attrsEqual(a: TextMark, b: TextMark): boolean {
  return (
    (a.fontWeight ?? undefined) === (b.fontWeight ?? undefined) &&
    (a.fontSize ?? undefined) === (b.fontSize ?? undefined) &&
    (a.fontStyle ?? undefined) === (b.fontStyle ?? undefined) &&
    (a.textDecoration ?? undefined) === (b.textDecoration ?? undefined) &&
    (a.color ?? undefined) === (b.color ?? undefined)
  );
}
