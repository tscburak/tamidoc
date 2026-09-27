import type { RenderTextComponent } from './types';

/** Source geometry is useful only for unchanged imported text. Editing or
 * resizing switches back to normal paragraph layout. */
export function importedTextFragments(c: RenderTextComponent) {
  const source = c.importedText;
  if (
    !source ||
    source.content !== c.content ||
    c.content.includes('{{') ||
    source.width !== c.width ||
    source.fontSize !== c.fontSize ||
    source.fontWeight !== c.fontWeight ||
    source.fontStyle !== c.fontStyle ||
    source.lineHeight !== c.lineHeight ||
    c.align !== 'left' ||
    source.fontFamily !== c.fontFamily ||
    JSON.stringify(source.marks ?? []) !== JSON.stringify(c.marks ?? []) ||
    !Array.isArray(source.fragments)
  )
    return undefined;
  if (
    !source.fragments.length ||
    !source.fragments.every(
      (f) =>
        f &&
        Number.isInteger(f.start) &&
        Number.isInteger(f.end) &&
        f.start >= 0 &&
        f.end > f.start &&
        f.end <= c.content.length &&
        Number.isFinite(f.x) &&
        Number.isFinite(f.baseline) &&
        Number.isFinite(f.width) &&
        f.width > 0,
    )
  )
    return undefined;
  return source.fragments;
}
