/**
 * Token-merge helpers — clean port of the frontend
 * `apps/web/src/components/designer/textMerge.ts`. Kept in sync so the
 * server-rendered PDF resolves `{{field}}` placeholders exactly like the live
 * fill preview (see ComponentBody.tsx / DocumentPreview in FillTemplatePage.tsx).
 */

export interface Segment {
  type: 'text' | 'token';
  value: string;
}

/** Split text content into literal-text and {{token}} merge-field segments. */
export function splitContent(content: string): Segment[] {
  if (!content) return [];
  return content
    .split(/(\{\{[^}]+\}\})/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('{{') && part.endsWith('}}')
        ? { type: 'token', value: part.slice(2, -2) }
        : { type: 'text', value: part },
    );
}

/**
 * Coerce a fill value to a plain string. The fill page stores scalars as
 * strings and image uploads as data URLs (also strings), so a non-string is
 * treated as empty.
 */
export function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** A run of text rendered with one (fontSize, fontWeight, fontStyle, textDecoration, color) pair. */
export interface StyledRun {
  text: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  textDecoration: string;
  color: string;
}

/**
 * Split `content` into styled runs honoring an optional `marks` overlay, while
 * also resolving `{{token}}` placeholders via `resolve`. Overlapping marks
 * merge in order; the base style comes from the caller. Tokens always render
 * in the base style (marks don't apply inside chips).
 */
export function splitStyledRuns(
  content: string,
  marks:
    | {
        start: number;
        end: number;
        fontWeight?: string;
        fontSize?: number;
        fontStyle?: string;
        textDecoration?: string;
        color?: string;
      }[]
    | undefined,
  baseSize: number,
  baseWeight: string,
  baseStyle: string,
  baseDecoration: string,
  baseColor: string,
  resolve: (token: string) => string,
): StyledRun[] {
  if (!content) return [];
  const segs = splitContent(content);
  const runs: StyledRun[] = [];
  // Walk a logical char index into `content` (including the chars inside
  // `{{...}}` tokens) so marks line up with `content` offsets exactly.
  let pos = 0;
  const sizeAt = (p: number) => {
    let s = baseSize;
    if (marks)
      for (const m of marks)
        if (m.start <= p && p < m.end && typeof m.fontSize === 'number')
          s = m.fontSize;
    return s;
  };
  const weightAt = (p: number) => {
    let w: string = baseWeight;
    if (marks)
      for (const m of marks)
        if (m.start <= p && p < m.end && m.fontWeight) w = m.fontWeight;
    return w;
  };
  const styleAt = (p: number) => {
    let s: string = baseStyle;
    if (marks)
      for (const m of marks)
        if (m.start <= p && p < m.end && m.fontStyle) s = m.fontStyle;
    return s;
  };
  const decorationAt = (p: number) => {
    let d: string = baseDecoration;
    if (marks)
      for (const m of marks)
        if (m.start <= p && p < m.end && m.textDecoration) d = m.textDecoration;
    return d;
  };
  const colorAt = (p: number) => {
    let c: string = baseColor;
    if (marks)
      for (const m of marks)
        if (m.start <= p && p < m.end && m.color) c = m.color;
    return c;
  };
  for (const seg of segs) {
    if (seg.type === 'token') {
      // Tokens are a single run in the base style.
      const v = asString(resolve(seg.value));
      if (v)
        runs.push({
          text: v,
          fontSize: baseSize,
          fontWeight: baseWeight,
          fontStyle: baseStyle,
          textDecoration: baseDecoration,
          color: baseColor,
        });
      pos += seg.value.length + 4; // skip the {{ }} delimiters and inner chars
      continue;
    }
    // Plain text — group adjacent chars with the same effective style.
    let i = 0;
    while (i < seg.value.length) {
      const startPos = pos + i;
      const size = sizeAt(startPos);
      const weight = weightAt(startPos);
      const style = styleAt(startPos);
      const decoration = decorationAt(startPos);
      const color = colorAt(startPos);
      let j = i;
      while (j < seg.value.length) {
        const p = pos + j;
        if (
          sizeAt(p) !== size ||
          weightAt(p) !== weight ||
          styleAt(p) !== style ||
          decorationAt(p) !== decoration ||
          colorAt(p) !== color
        )
          break;
        j++;
      }
      runs.push({
        text: seg.value.slice(i, j),
        fontSize: size,
        fontWeight: weight,
        fontStyle: style,
        textDecoration: decoration,
        color,
      });
      i = j;
    }
    pos += seg.value.length;
  }
  return runs;
}
