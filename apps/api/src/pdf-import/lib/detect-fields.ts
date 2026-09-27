import type { Paragraph, ParagraphLine } from './group-paragraphs';
import { inferAlign, type AlignContext } from './infer-align';

// Local type definitions matching frontend CanvasComponent
interface TextMark {
  start: number;
  end: number;
  fontWeight?: string;
  fontStyle?: string;
}

interface TextComponent {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  page: number;
  content: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  textDecoration: string;
  color: string;
  align: string;
  lineHeight: number;
  marks?: TextMark[];
}

type CanvasComponent = TextComponent;

/** A styled text run while building component content. */
interface StyleSeg {
  text: string;
  fontWeight: string;
  fontStyle: string;
}

/** Style runs of a line: real segments when the grouper produced them, else
 * the whole line as one run of its dominant style. */
function lineSegs(line: ParagraphLine): StyleSeg[] {
  if (line.segments?.length) return line.segments.map((s) => ({ ...s }));
  return [
    {
      text: line.text,
      fontWeight: line.fontWeight,
      fontStyle: line.fontStyle,
    },
  ];
}

/** Merge adjacent same-style runs and drop empty ones. */
function coalesceSegs(segs: StyleSeg[]): StyleSeg[] {
  const out: StyleSeg[] = [];
  for (const s of segs) {
    if (!s.text) continue;
    const last = out[out.length - 1];
    if (
      last &&
      last.fontWeight === s.fontWeight &&
      last.fontStyle === s.fontStyle
    )
      last.text += s.text;
    else out.push(s);
  }
  return out;
}

/** Splice a blank replacement into a line's style runs. `start`/`end` are
 * char offsets in the concatenated text; `repl` ('' removes the blank,
 * '{{token}}' replaces it) lands as a BASE-styled run — tokens render in the
 * component's base style, like designer-authored tokens. */
function applyEdit(
  segs: StyleSeg[],
  start: number,
  end: number,
  repl: string,
  base: { fontWeight: string; fontStyle: string },
): StyleSeg[] {
  const out: StyleSeg[] = [];
  let pos = 0;
  let inserted = false;
  for (const s of segs) {
    const sStart = pos;
    const sEnd = pos + s.text.length;
    pos = sEnd;
    if (sEnd <= start || sStart >= end) {
      out.push(s);
      continue;
    }
    const head = s.text.slice(0, Math.max(0, start - sStart));
    const tail = s.text.slice(Math.min(s.text.length, end - sStart));
    if (head) out.push({ ...s, text: head });
    if (!inserted && repl && sStart <= start) {
      out.push({ text: repl, ...base });
      inserted = true;
    }
    if (tail) out.push({ ...s, text: tail });
  }
  return coalesceSegs(out);
}

/**
 * A field candidate detected by heuristics, to be classified by AI.
 *
 * A single paragraph component may contain several blanks; each blank becomes
 * its own candidate. `id` is unique per blank; `componentId` always points at
 * the paragraph TextComponent that holds the `{{token}}`.
 */
export interface FieldCandidate {
  id: string; // unique per blank (= componentId#n when multiple)
  componentId: string; // the paragraph TextComponent id
  page: number;
  label: string; // label text near the field (empty if none)
  sampleText: string; // surrounding line text for context
  heuristicType: string; // rule's guess (text, signature, checkbox, etc.)
  heuristicName: string; // snake_case fallback name
}

/**
 * Combined blank detector. A single line may contain several blanks (e.g.
 * "Name: ______   Date: ______"), each turned into its own token.
 *
 * Capture groups, in priority order:
 *  1. underscores _{3,}          → signature if long, else text
 *  2. checkbox glyph             → checkbox
 *  3. bracket checkbox [ ]       → checkbox
 *  4. dots ... / dashes ---      → text
 */
const BLANK_RE = /(_{3,})|([☐☑☒□◻◼])|(\[\s?\])|(\.{3,})|((?:—|–|-){3,})/g;

/** Blank flavors that can stack into one multi-line answer area. Checkbox
 * blanks are excluded — a column of checkboxes is N independent choices, not
 * one growing field. */
const MERGEABLE_FAMILIES = new Set(['under', 'dots', 'dashes']);

/** A single blank occurrence, located in text AND in design space. */
interface RawBlank {
  para: number; // paragraph index
  line: number; // line index within the paragraph
  start: number; // char index in the line's text
  end: number; // char end (exclusive)
  family: 'under' | 'glyph' | 'bracket' | 'dots' | 'dashes';
  fontSizePx: number;
  baselineY: number;
  left: number; // estimated design-space x-range of the blank itself
  right: number;
  /** True when nothing but whitespace precedes the blank on its line — a
   * continuation line of an answer area, never a new labeled field. */
  unlabeled: boolean;
}

/** A vertical stack of blanks merged into one answer area. `members` is in
 * top-to-bottom order; `members[0]` carries the token. */
interface BlankGroup {
  members: RawBlank[];
  name: string; // snake_case token name
  type: string; // heuristic type for the whole area
}

/** Estimate the design-space x-range of a blank inside a line, assuming a
 * uniform per-character advance. Crude, but merge decisions only need
 * approximate column overlap. */
function blankXRange(
  line: ParagraphLine,
  start: number,
  end: number,
): { left: number; right: number } {
  const adv = line.width / Math.max(1, line.text.length);
  return { left: line.x + adv * start, right: line.x + adv * end };
}

/** Stack blanks into groups: an UNLABELED blank continues the group whose
 * last member sits directly above it in the same column (advance 0.5–2.5×
 * font size, ≥50% x-overlap with the narrower blank, sizes within 15%). A
 * blank with label text before it always starts a new stack — "Name: ___"
 * above "Address: ___" are two fields, never one. */
function stackBlanks(blanks: RawBlank[]): BlankGroup[] {
  const groups: BlankGroup[] = [];
  // Reading order: top-to-bottom, then left-to-right.
  const sorted = [...blanks].sort(
    (a, b) => a.baselineY - b.baselineY || a.left - b.left,
  );
  for (const b of sorted) {
    let best: BlankGroup | null = null;
    let bestOverlap = 0;
    if (MERGEABLE_FAMILIES.has(b.family) && b.unlabeled) {
      for (const g of groups) {
        const top = g.members[g.members.length - 1];
        if (!MERGEABLE_FAMILIES.has(top.family)) continue;
        const fs = Math.max(top.fontSizePx, b.fontSizePx);
        const advance = b.baselineY - top.baselineY;
        if (advance < fs * 0.5 || advance > fs * 2.5) continue;
        if (Math.abs(top.fontSizePx - b.fontSizePx) > fs * 0.15) continue;
        const overlap =
          Math.min(top.right, b.right) - Math.max(top.left, b.left);
        const narrower = Math.min(top.right - top.left, b.right - b.left);
        if (narrower <= 0 || overlap / narrower < 0.5) continue;
        if (overlap > bestOverlap) {
          best = g;
          bestOverlap = overlap;
        }
      }
    }
    if (best) best.members.push(b);
    else groups.push({ members: [b], name: '', type: '' });
  }
  // Name assignment follows reading order of the stack heads.
  groups.sort(
    (a, b) =>
      a.members[0].baselineY - b.members[0].baselineY ||
      a.members[0].left - b.members[0].left,
  );
  return groups;
}

/** Label for a blank: the text immediately before it on the line, ignoring an
 * EARLIER blank on the same line ("Name: ______  Date: ____" → the second
 * blank's label is "Date", not "Name: ______ Date"). */
function blankLabel(lineText: string, start: number): string {
  const before = lineText.slice(0, start);
  const tail = before.match(/[_.…\-—–][_.…\-—–\s]*([^\s].*)$/);
  return (tail ? tail[1] : before).replace(/[:\s]+$/, '').trim();
}

/** Heuristic type for a whole stack: ≥2 lines is a writing area (longtext —
 * the field must flex for long AND short values); single line keeps the
 * classic rules (long underscore → signature, glyph/bracket → checkbox). */
function groupType(g: BlankGroup): string {
  const head = g.members[0];
  if (g.members.length > 1) return 'longtext';
  if (head.family === 'under') {
    const width = (head.end - head.start) * head.fontSizePx * 0.5;
    return width > 180 ? 'signature' : 'text';
  }
  if (head.family === 'glyph' || head.family === 'bracket') return 'checkbox';
  return 'text';
}

// Lato (the designer's font) vertical metrics as em fractions: ascent+descent
// = 1.23, ascent−descent = 0.78. CSS places the first baseline at
// ASC + (lineHeight − (ASC+DESC))/2 em below the box top, so positioning the
// box top that far ABOVE the PDF baseline makes the rendered text land on it.
const FONT_ASCENT_MINUS_DESCENT = 0.78;

/** Derive the component's lineHeight from the paragraph's real baseline-to-
 * baseline advances, and its y/height so the first baseline lands exactly and
 * every following line advances like the source PDF. Falls back to 1.3 for
 * single-line paragraphs. */
function lineGeometry(para: Paragraph): {
  lineHeight: number;
  y: number;
  height: number;
} {
  const fs = para.fontSizePx;
  const advances = para.lines
    .slice(1)
    .map((l, i) => l.baselineY - para.lines[i].baselineY)
    .sort((a, b) => a - b);
  const medianAdvance = advances.length
    ? advances[Math.floor(advances.length / 2)]
    : fs * 1.3;
  const lineHeight = Math.min(2, Math.max(1, medianAdvance / fs));
  const firstBaseline = para.lines[0].baselineY;
  // Distance from CSS box top to the first line's baseline (em → px):
  // ASC + (L − (ASC+DESC))/2, which reduces to (L + ASC − DESC)/2.
  const baselineOffset = ((lineHeight + FONT_ASCENT_MINUS_DESCENT) / 2) * fs;
  return {
    lineHeight: Math.round(lineHeight * 100) / 100,
    y: firstBaseline - baselineOffset,
    height: para.lines.length * lineHeight * fs,
  };
}

/** List/bullet markers: a paragraph where (roughly) every line starts with one
 * is a list — checkbox options, bullets, numbered items — whose lines are
 * distinct entries, not wrapped flow. */
const LIST_MARKER_RE =
  /^\s*(?:[☐☑☒□◻◼■•●○◦▪▫*]|[-–—]\s|\d+[.)]\s|\p{L}[.)]\s)/u;

function isListLike(lines: ParagraphLine[]): boolean {
  const marked = lines.filter((l) => LIST_MARKER_RE.test(l.text)).length;
  return marked >= 2 && marked >= lines.length / 2;
}

/** A wrapped body paragraph: every line except the last fills the column
 * (that's WHY it wrapped) — all within 80% of the widest line. Short interior
 * lines (address blocks, titles with distinct lines) are deliberate breaks. */
function isWrappedFlow(lines: ParagraphLine[]): boolean {
  if (lines.length < 2) return true;
  const maxWidth = Math.max(...lines.map((l) => l.width));
  return lines.slice(0, -1).every((l) => l.width >= maxWidth * 0.8);
}

/** A paragraph renders as ONE flowing text block unless its lines are separate
 * records: table-cell stacks (grouping marked them), lists, or non-wrap-shaped
 * line sets (address blocks, stacked titles). */
function keepsHardBreaks(para: Paragraph): boolean {
  return (
    para.hardBreaks === true ||
    isListLike(para.lines) ||
    !isWrappedFlow(para.lines)
  );
}

/** Concatenate kept lines' style runs into the final content + marks.
 * Flowing paragraphs join with a space — source line breaks are wrap
 * artifacts of the source column width, so the block reflows freely for
 * long/short values — and a trailing hyphen between lowercase letters is
 * de-hyphenated ("docu-ment" → "document"). Hard-break paragraphs join with
 * \n. Runs differing from the base style become marks (coalesced when
 * adjacent runs share the same override). */
function buildContent(
  lines: StyleSeg[][],
  hardBreaks: boolean,
  base: { fontWeight: string; fontStyle: string },
): { content: string; marks: TextMark[] } {
  const atoms: StyleSeg[] = [];
  let first = true;
  for (const segs of lines) {
    if (!first) {
      if (hardBreaks) {
        atoms.push({ text: '\n', ...base });
      } else {
        // De-hyphenate across the join when both sides are lowercase words.
        const lastAtom = [...atoms].reverse().find((a) => a.text);
        const nextHead = segs.find((s) => s.text.trim());
        if (
          lastAtom &&
          nextHead &&
          /[\p{Ll}]-$/u.test(lastAtom.text) &&
          /^\p{Ll}/u.test(nextHead.text)
        ) {
          lastAtom.text = lastAtom.text.slice(0, -1);
        } else {
          atoms.push({ text: ' ', ...base });
        }
      }
    }
    first = false;
    atoms.push(...segs);
  }

  let content = '';
  const marks: TextMark[] = [];
  for (const a of atoms) {
    if (!a.text) continue;
    const start = content.length;
    content += a.text;
    const weightDiff = a.fontWeight !== base.fontWeight;
    const styleDiff = a.fontStyle !== base.fontStyle;
    if (!weightDiff && !styleDiff) continue;
    const last = marks[marks.length - 1];
    if (
      last &&
      last.end === start &&
      (last.fontWeight ?? base.fontWeight) === a.fontWeight &&
      (last.fontStyle ?? base.fontStyle) === a.fontStyle
    ) {
      last.end = content.length; // extend adjacent same-override mark
    } else {
      marks.push({
        start,
        end: content.length,
        ...(weightDiff ? { fontWeight: a.fontWeight } : {}),
        ...(styleDiff ? { fontStyle: a.fontStyle } : {}),
      });
    }
  }
  return { content, marks };
}

/**
 * Left edge of the component box, shifted by the 0.3em wrap slack AWAY from
 * the alignment edge so center/right rendering stays anchored where the
 * source put it.
 */
function componentX(para: Paragraph, align: string): number {
  if (align === 'center') return para.x - para.fontSizePx * 0.15;
  if (align === 'right') return para.x - para.fontSizePx * 0.3;
  return para.x;
}

/**
 * Detect form fields using heuristic rules and convert Paragraphs to
 * CanvasComponents (one text layer per paragraph).
 *
 * Blanks are detected paragraph-wide and then STACKED: underscore/dot/dash
 * runs on consecutive lines in the same column merge into one multi-line
 * answer area — one `longtext` token whose component covers every stacked
 * line, so a filled value can be short or long and still fit. Continuation
 * lines drop their literal blank text (and vanish from the content when
 * nothing else remains), while the component keeps the full area height.
 *
 * With `ctx` (page geometry + derived table dividers) each paragraph's align
 * is inferred from its lines' geometry — centered/right-aligned source text
 * imports as such; without it everything falls back to left.
 *
 * @param paragraphs - paragraphs extracted from the page
 * @param pageIndex - 0-indexed page number
 * @param ctx - page width + divider lines for alignment inference
 * @returns { components: CanvasComponent[], candidates: FieldCandidate[] }
 */
export function detectFields(
  paragraphs: Paragraph[],
  pageIndex: number,
  ctx?: AlignContext,
): { components: CanvasComponent[]; candidates: FieldCandidate[] } {
  const components: CanvasComponent[] = [];
  const candidates: FieldCandidate[] = [];
  const usedNames = new Set<string>();
  let compIndex = 0;

  // Generate a unique snake_case field name from a label.
  const generateName = (base: string): string => {
    const sanitized =
      base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'field';
    let name = sanitized;
    let counter = 1;
    while (usedNames.has(name)) {
      name = `${sanitized}_${counter++}`;
    }
    usedNames.add(name);
    return name;
  };

  // Pass 1: collect every blank with its text and design-space location.
  const blanks: RawBlank[] = [];
  paragraphs.forEach((para, p) => {
    para.lines.forEach((line, l) => {
      BLANK_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = BLANK_RE.exec(line.text)) !== null) {
        const family: RawBlank['family'] = m[1]
          ? 'under'
          : m[2]
            ? 'glyph'
            : m[3]
              ? 'bracket'
              : m[4]
                ? 'dots'
                : 'dashes';
        const { left, right } = blankXRange(
          line,
          m.index,
          m.index + m[0].length,
        );
        blanks.push({
          para: p,
          line: l,
          start: m.index,
          end: m.index + m[0].length,
          family,
          fontSizePx: line.fontSizePx,
          baselineY: line.baselineY,
          left,
          right,
          unlabeled: line.text.slice(0, m.index).trim() === '',
        });
      }
    });
  });

  // Pass 2: stack blanks into one field per answer area; mint names in
  // reading order so dedupe suffixes follow the visual order.
  const groups = stackBlanks(blanks);
  for (const g of groups) {
    g.type = groupType(g);
    const head = g.members[0];
    const label = blankLabel(
      paragraphs[head.para].lines[head.line].text,
      head.start,
    );
    g.name = generateName(
      label ||
        (g.type === 'checkbox'
          ? 'checkbox'
          : g.type === 'signature'
            ? 'signature'
            : 'field'),
    );
  }

  // Pass 3: rewrite each paragraph's lines — head blanks become {{token}}s,
  // stacked continuations are removed (empty leftover lines are dropped) —
  // and emit one candidate per stack.
  // editsByPara: paragraph → line → replacements (applied right-to-left).
  const editsByPara = new Map<
    number,
    Map<number, { start: number; end: number; repl: string }[]>
  >();
  const headsByPara = new Map<number, BlankGroup[]>();
  for (const g of groups) {
    for (const m of g.members) {
      const isHead = m === g.members[0];
      if (!editsByPara.has(m.para)) editsByPara.set(m.para, new Map());
      const lineEdits = editsByPara.get(m.para)!;
      if (!lineEdits.has(m.line)) lineEdits.set(m.line, []);
      lineEdits.get(m.line)!.push({
        start: m.start,
        end: m.end,
        repl: isHead ? `{{${g.name}}}` : '',
      });
    }
    const head = g.members[0];
    if (!headsByPara.has(head.para)) headsByPara.set(head.para, []);
    headsByPara.get(head.para)!.push(g);
  }

  paragraphs.forEach((para, p) => {
    const lineEdits = editsByPara.get(p);
    if (!lineEdits) {
      // No blanks at all — emit the paragraph verbatim (with style marks).
      const geo = lineGeometry(para);
      const align = inferAlign(para, ctx);
      const componentId = `c${pageIndex}_${compIndex++}`;
      const base = {
        fontWeight: para.fontWeight,
        fontStyle: para.fontStyle,
      };
      const { content, marks } = buildContent(
        para.lines.map((l) => lineSegs(l)),
        keepsHardBreaks(para),
        base,
      );
      components.push({
        id: componentId,
        kind: 'text',
        x: componentX(para, align),
        y: geo.y,
        width: para.width + para.fontSizePx * 0.3,
        height: geo.height,
        rotation: 0,
        page: pageIndex,
        content,
        marks: marks.length ? marks : undefined,
        fontSize: Math.round(para.fontSizePx),
        fontWeight: para.fontWeight,
        fontStyle: para.fontStyle,
        textDecoration: 'none',
        color: '#1c1917',
        align,
        lineHeight: geo.lineHeight,
      });
      return;
    }

    const componentId = `c${pageIndex}_${compIndex++}`;
    const geo = lineGeometry(para);
    const align = inferAlign(para, ctx);
    // Width + slack: the source font's metrics differ from Lato, and without
    // headroom the same text re-wraps early inside the fixed-width box. The
    // slack (0.3em total) grows AWAY from the alignment edge so center/right
    // rendering stays anchored where the source put it.
    const width = para.width + para.fontSizePx * 0.3;
    const x = componentX(para, align);

    // Rewrite lines (blank surgery on the style runs); drop lines whose only
    // content was a stacked blank.
    const base = {
      fontWeight: para.fontWeight,
      fontStyle: para.fontStyle,
    };
    const keptSegs: StyleSeg[][] = [];
    para.lines.forEach((line, l) => {
      const edits = lineEdits.get(l);
      if (!edits) {
        keptSegs.push(lineSegs(line));
        return;
      }
      let segs = lineSegs(line);
      for (const e of [...edits].sort((a, b) => b.start - a.start)) {
        segs = applyEdit(segs, e.start, e.end, e.repl, base);
      }
      if (segs.some((s) => s.text.trim())) keptSegs.push(segs);
    });

    // A stack may continue below this paragraph's own last line; stretch the
    // component so the filled value can use the whole answer area.
    const paraLastBaseline = para.lines[para.lines.length - 1].baselineY;
    let stackBottom = paraLastBaseline;
    for (const g of headsByPara.get(p) ?? []) {
      const last = g.members[g.members.length - 1];
      if (last.baselineY > stackBottom) stackBottom = last.baselineY;
    }
    const height = geo.height + Math.max(0, stackBottom - paraLastBaseline);

    // Candidates: one per stack headed in this paragraph, left-to-right.
    const heads = (headsByPara.get(p) ?? []).sort(
      (a, b) => a.members[0].start - b.members[0].start,
    );
    heads.forEach((g, n) => {
      const head = g.members[0];
      const headLine = para.lines[head.line];
      candidates.push({
        id: n === 0 ? componentId : `${componentId}#${n}`,
        componentId,
        page: pageIndex,
        label: blankLabel(headLine.text, head.start),
        sampleText: headLine.text.substring(0, 60),
        heuristicType: g.type,
        heuristicName: g.name,
      });
    });

    // A paragraph whose every line was a stacked continuation carries nothing
    // of its own — its area is covered by the stack head's component.
    if (keptSegs.length === 0) return;

    const { content, marks } = buildContent(
      keptSegs,
      keepsHardBreaks(para),
      base,
    );
    components.push({
      id: componentId,
      kind: 'text',
      x,
      y: geo.y,
      width,
      height,
      rotation: 0,
      page: pageIndex,
      content,
      marks: marks.length ? marks : undefined,
      fontSize: Math.round(para.fontSizePx),
      fontWeight: para.fontWeight,
      fontStyle: para.fontStyle,
      textDecoration: 'none',
      color: '#1c1917',
      align,
      lineHeight: geo.lineHeight,
    });
  });

  return { components, candidates };
}
