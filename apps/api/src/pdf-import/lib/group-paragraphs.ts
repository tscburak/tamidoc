import type { TextRun, FontWeightLite, FontStyleLite } from './pdf-parser';
import type { Divider, TableDividers } from './table-structure';

/**
 * A single reconstructed visual line within a paragraph. Runs that pdf-parser
 * coalesced separately (same baseline, far apart) are joined back here so a
 * paragraph is built from true lines, not coalesced segments.
 */
export interface ParagraphLine {
  /** Original fragments, retained for exact positioning and inline styling. */
  sourceRuns?: TextRun[];
  baselineY: number; // design-space px
  text: string;
  x: number; // left edge, design-space px
  width: number; // design-space px
  fontSizePx: number; // design-space px
  fontWeight: FontWeightLite; // dominant segment style (compat/fallback)
  fontStyle: FontStyleLite;
  top: number; // top edge (y), design-space px
  bottom: number; // bottom edge (y), design-space px
  /** Style runs within the line, in order. `text` is their concatenation. */
  segments?: LineSegment[];
}

/**
 * A run of same-style text inside a line. Style changes no longer split
 * paragraphs — they become in-text marks on one component.
 */
export interface LineSegment {
  text: string;
  fontWeight: FontWeightLite;
  fontStyle: FontStyleLite;
}

/**
 * A paragraph: one or more adjacent lines merged into a single multi-line text
 * layer (style may vary within — it becomes in-text marks). Becomes one
 * TextComponent.
 */
export interface Paragraph {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSizePx: number; // first line's size
  fontWeight: FontWeightLite; // dominant style across all segments
  fontStyle: FontStyleLite;
  lines: ParagraphLine[]; // top-to-bottom
  content: string; // lines.map(text).join('\n') — raw, before flow joining
  /** True when the stacked lines are separate records, not wrapped flow —
   * table-cell rows grouped per column by the divider pass. These keep their
   * hard newlines; ordinary paragraphs flow as one text block. */
  hardBreaks?: boolean;
}

// --- Tunable thresholds (design-space px, relative to font size) -------------

/** Baseline-bucketing tolerance: two runs are on the same line when their
 * baselines differ by less than this. Matches pdf-parser's own line tolerance. */
const lineTolerance = (fs: number) => Math.max(1, fs * 0.25);

/** Font-size delta allowed within one paragraph (≈15%). */
const sizeTolerance = (fs: number) => Math.max(1, fs * 0.15);

/** Acceptable vertical advance from one line to the next, as a multiple of font
 * size. Below 0.6× = same line / overlap; above 2.0× = a paragraph break. */
const MIN_LINE_ADVANCE = 0.6;
const MAX_LINE_ADVANCE = 2.0;

/** Horizontal fudge (× font size) for the column-overlap test. */
const COLUMN_FUDGE = 2.0;

/** Horizontal gap (× font size) above which two runs sharing a baseline are
 * separate text objects (e.g. "Name" far left, "Date" far right), not words of
 * one line. Word gaps stay well below this; column gaps are several ems. */
const COLUMN_SPLIT_GAP = 3.0;

/** Minimum gap (× font size) for a divider-based split — pdf-parser already
 * coalesced runs closer than 0.6em, so re-splitting tighter gaps only shreds
 * words. Typical cell padding (≥0.3em) clears the floor. */
const DIVIDER_SPLIT_GAP = 0.25;

/** Inset (px) when testing whether a divider sits strictly between two runs —
 * guards against a border that merely abuts the text edge. */
const DIVIDER_INSET_PX = 0.5;

/** Options for table/grid-aware grouping. */
export interface GroupOptions {
  /** Rule lines derived from extracted shapes (see table-structure.ts). */
  dividers?: TableDividers;
}

/** True when a vertical divider lies strictly between prev and curr on this
 * baseline (its y-span must cover the baseline). */
function dividerBetween(
  prev: TextRun,
  curr: TextRun,
  baselineY: number,
  vDivs: Divider[],
): boolean {
  for (const d of vDivs) {
    if (
      d.top <= baselineY &&
      baselineY <= d.bottom &&
      prev.x + prev.width + DIVIDER_INSET_PX < d.x &&
      d.x < curr.x - DIVIDER_INSET_PX
    ) {
      return true;
    }
  }
  return false;
}

/** True when a horizontal divider sits strictly between two baselines and
 * spans across the paragraph's x-range — a row rule isolating table rows
 * tighter than the MAX_LINE_ADVANCE heuristic allows. */
function rowDividerBetween(
  prevBaseline: number,
  nextBaseline: number,
  xLeft: number,
  xRight: number,
  hDivs: Divider[],
): boolean {
  for (const d of hDivs) {
    if (
      prevBaseline < d.x &&
      d.x < nextBaseline &&
      d.top < xRight &&
      d.bottom > xLeft
    )
      return true;
  }
  return false;
}

/**
 * Group coalesced text runs into paragraphs.
 *
 * Three steps: (1) re-bucket runs into true visual lines by baseline, since
 * pdf-parser emits one run per coalesced *segment* and a single line can span
 * several segments; (2) split each line into column groups at wide gaps AND at
 * table rule lines (a divider physically separating two runs splits them even
 * at sub-em gaps); (3) merge consecutive lines into paragraphs while size,
 * vertical advance, and column overlap all hold — style differences do NOT
 * split, they become in-text marks downstream. With vertical dividers present,
 * merging runs independently per column slot — so interleaved table cells
 * (A1,B1,A2,B2) yield one paragraph per cell, stacking that cell's rows.
 *
 * Without options.dividers the behavior is identical to the classic grouping.
 *
 * @param runs - sorted top-to-bottom (pdf-parser returns them in that order)
 * @param options - divider lines for table-aware splitting/merging
 * @returns Paragraph[]
 */
export function groupRunsIntoParagraphs(
  runs: TextRun[],
  options?: GroupOptions,
): Paragraph[] {
  if (runs.length === 0) return [];

  const vDivs = options?.dividers?.vertical ?? [];
  const hDivs = options?.dividers?.horizontal ?? [];

  // Step 1: bucket runs into lines by baselineY.
  const lines: ParagraphLine[] = [];
  const buckets: TextRun[][] = [];
  for (const run of runs) {
    let placed = false;
    for (const bucket of buckets) {
      const ref = bucket[0];
      const tol = lineTolerance(Math.max(ref.fontSizePx, run.fontSizePx));
      if (Math.abs(ref.baselineY - run.baselineY) <= tol) {
        bucket.push(run);
        placed = true;
        break;
      }
    }
    if (!placed) buckets.push([run]);
  }
  for (const bucket of buckets) {
    bucket.sort((a, b) => a.x - b.x);
    const baselineY = bucket[0].baselineY;
    // Split the baseline bucket into column groups: runs far apart on the same
    // baseline are separate text objects, not one wide line — and so are runs
    // with a table rule line physically between them.
    const groups: TextRun[][] = [];
    let grp: TextRun[] = [];
    for (let i = 0; i < bucket.length; i++) {
      if (i > 0) {
        const prev = bucket[i - 1];
        const gap = bucket[i].x - (prev.x + prev.width);
        const fs = Math.max(prev.fontSizePx, bucket[i].fontSizePx);
        if (
          gap > fs * COLUMN_SPLIT_GAP ||
          (gap > fs * DIVIDER_SPLIT_GAP &&
            dividerBetween(prev, bucket[i], baselineY, vDivs))
        ) {
          groups.push(grp);
          grp = [];
        }
      }
      grp.push(bucket[i]);
    }
    groups.push(grp);

    for (const g of groups) {
      // Re-insert a space between segments separated by a word gap (mirror of
      // pdf-parser's coalescing join) so line text keeps its real word spacing.
      // Style runs are kept as `segments` — style no longer splits paragraphs,
      // it becomes in-text marks downstream.
      let text = '';
      const segments: LineSegment[] = [];
      const pushSeg = (seg: LineSegment) => {
        if (!seg.text) return;
        const last = segments[segments.length - 1];
        if (
          last &&
          last.fontWeight === seg.fontWeight &&
          last.fontStyle === seg.fontStyle
        )
          last.text += seg.text;
        else segments.push({ ...seg });
      };
      for (let i = 0; i < g.length; i++) {
        if (i > 0) {
          const prev = g[i - 1];
          const gap = g[i].x - (prev.x + prev.width);
          if (
            gap > g[i].fontSizePx * 0.1 &&
            !/\s$/.test(text) &&
            !/^\s/.test(g[i].text)
          ) {
            text += ' ';
            pushSeg({
              text: ' ',
              fontWeight: prev.fontWeight,
              fontStyle: prev.fontStyle,
            });
          }
        }
        text += g[i].text;
        pushSeg({
          text: g[i].text,
          fontWeight: g[i].fontWeight,
          fontStyle: g[i].fontStyle,
        });
      }
      const x = Math.min(...g.map((r) => r.x));
      const right = Math.max(...g.map((r) => r.x + r.width));
      const top = Math.min(...g.map((r) => r.y));
      const bottom = Math.max(...g.map((r) => r.y + r.height));
      // Dominant style across the line: longest styled segment's (fallback:
      // first non-normal, else normal).
      const dominant = (
        key: 'fontWeight' | 'fontStyle',
        plain: string,
      ): string => {
        let best = 0;
        let winner = plain;
        for (const seg of segments) {
          if (seg[key] === plain) continue;
          if (seg.text.length > best) {
            best = seg.text.length;
            winner = seg[key];
          }
        }
        return winner;
      };
      lines.push({
        sourceRuns: g,
        baselineY: g[0].baselineY,
        text,
        x,
        width: right - x,
        fontSizePx: g[0].fontSizePx,
        fontWeight: dominant('fontWeight', 'normal') as FontWeightLite,
        fontStyle: dominant('fontStyle', 'normal') as FontStyleLite,
        top,
        bottom,
        segments,
      });
    }
  }
  // Lines top-to-bottom.
  lines.sort((a, b) => a.baselineY - b.baselineY);

  // Step 2: merge lines into paragraphs — one sequential pass per column slot
  // when table dividers exist, so interleaved cells (A1,B1,A2,B2) stack into
  // per-cell paragraphs (A1+A2, B1+B2) instead of per-row fragments.
  const mergePass = (subset: ParagraphLine[]): Paragraph[] => {
    const paragraphs: Paragraph[] = [];
    for (const line of subset) {
      // PDF operators may interleave columns even without visible dividers.
      const current = paragraphs
        .filter((p) => sameParagraph(p, line, hDivs))
        .sort((a, b) => Math.abs(a.x - line.x) - Math.abs(b.x - line.x))[0];
      if (current) appendLine(current, line);
      else paragraphs.push(startParagraph(line));
    }
    paragraphs.forEach(finalize);
    return paragraphs;
  };

  let paragraphs: Paragraph[];
  if (vDivs.length) {
    // Bucket lines by column slot; -1 = spanning (crosses a divider — table
    // captions/titles), merged among themselves.
    const bySlot = new Map<number, ParagraphLine[]>();
    for (const line of lines) {
      const slot = columnSlot(line, vDivs);
      if (!bySlot.has(slot)) bySlot.set(slot, []);
      bySlot.get(slot)!.push(line); // lines pre-sorted → subsets keep order
    }
    paragraphs = [];
    for (const slotLines of bySlot.values())
      for (const p of mergePass(slotLines)) {
        p.hardBreaks = true; // stacked table-cell rows, not wrapped flow
        paragraphs.push(p);
      }
    // Deterministic reading order: row first, then column.
    paragraphs.sort(
      (a, b) => a.lines[0].baselineY - b.lines[0].baselineY || a.x - b.x,
    );
  } else {
    paragraphs = mergePass(lines);
  }
  const page = runs[0]?.page ?? 0;
  for (const p of paragraphs) p.page = page;
  return paragraphs;
}

/** Column slot of a line among vertical dividers: the number of y-relevant
 * dividers left of the line. -1 when the line crosses a divider (it spans
 * multiple columns — a table caption or page-wide title). */
function columnSlot(line: ParagraphLine, vDivs: Divider[]): number {
  const relevant = vDivs.filter(
    (d) => d.top < line.bottom && d.bottom > line.top,
  );
  let slot = 0;
  for (const d of relevant) {
    if (
      line.x + DIVIDER_INSET_PX < d.x &&
      d.x < line.x + line.width - DIVIDER_INSET_PX
    )
      return -1;
    if (d.x <= line.x) slot++;
  }
  return slot;
}

function startParagraph(line: ParagraphLine): Paragraph {
  return {
    page: 0, // stamped from run.page after grouping
    x: line.x,
    y: line.top,
    width: line.width,
    height: line.bottom - line.top,
    fontSizePx: line.fontSizePx,
    fontWeight: line.fontWeight,
    fontStyle: line.fontStyle,
    lines: [line],
    content: line.text,
  };
}

function appendLine(p: Paragraph, line: ParagraphLine): void {
  p.lines.push(line);
  p.content += '\n' + line.text;
  // Expand bbox.
  const left = Math.min(p.x, line.x);
  const right = Math.max(p.x + p.width, line.x + line.width);
  const top = Math.min(p.y, line.top);
  const bottom = Math.max(p.y + p.height, line.bottom);
  p.x = left;
  p.width = right - left;
  p.y = top;
  p.height = bottom - top;
}

/** Decide whether `line` continues the open paragraph `p`. */
function sameParagraph(
  p: Paragraph,
  line: ParagraphLine,
  hDivs: Divider[],
): boolean {
  const last = p.lines[p.lines.length - 1];
  const fs = p.fontSizePx;

  // Vertical advance from the previous line's baseline.
  const advance = line.baselineY - last.baselineY;
  if (advance <= 0) return false; // out-of-order / column wrap → new paragraph
  if (advance < fs * MIN_LINE_ADVANCE || advance > fs * MAX_LINE_ADVANCE)
    return false;

  // Font size close enough (bigger deltas = headings, still split).
  if (Math.abs(line.fontSizePx - fs) > sizeTolerance(fs)) return false;

  // Style differences do NOT split — bold lead-ins, italic phrases etc. stay
  // in the paragraph and become in-text marks downstream.

  // Horizontal column overlap: the line must sit roughly under the paragraph's
  // horizontal span (expanded by a couple of ems), else it is another column.
  const pLeft = p.x - fs * COLUMN_FUDGE;
  const pRight = p.x + p.width + fs * COLUMN_FUDGE;
  const lineRight = line.x + line.width;
  const overlaps = line.x < pRight && lineRight > pLeft;
  if (!overlaps) return false;

  // A horizontal row rule between the baselines, spanning the paragraph's
  // x-range, isolates table rows regardless of the advance heuristic.
  if (
    rowDividerBetween(last.baselineY, line.baselineY, p.x, p.x + p.width, hDivs)
  )
    return false;

  return true;
}

/** Recompute bbox from lines (defensive — also collapses any drift) and the
 * dominant weight/style from the style segments (longest styled text wins;
 * line-level majority fallback when a fixture carries no segments). */
function finalize(p: Paragraph): void {
  if (p.lines.length === 0) return;
  const xs = p.lines.map((l) => l.x);
  const rights = p.lines.map((l) => l.x + l.width);
  const tops = p.lines.map((l) => l.top);
  const bottoms = p.lines.map((l) => l.bottom);
  p.x = Math.min(...xs);
  p.width = Math.max(...rights) - p.x;
  p.y = Math.min(...tops);
  p.height = Math.max(...bottoms) - p.y;

  const allSegs = p.lines.flatMap((l) => l.segments ?? []);
  const dominant = (key: 'fontWeight' | 'fontStyle', plain: string): string => {
    if (allSegs.length) {
      // Longest styled text wins.
      const lens = new Map<string, number>();
      for (const seg of allSegs) {
        if (seg[key] === plain) continue;
        lens.set(seg[key], (lens.get(seg[key]) ?? 0) + seg.text.length);
      }
      let winner = plain;
      let best = 0;
      for (const [v, len] of lens)
        if (len > best) {
          best = len;
          winner = v;
        }
      return winner;
    }
    // Line-level fallback (fixtures without segments): majority by line count.
    const styled = p.lines.filter((l) => l[key] !== plain);
    return styled.length * 2 > p.lines.length ? styled[0][key] : plain;
  };
  p.fontWeight = dominant('fontWeight', 'normal') as FontWeightLite;
  p.fontStyle = dominant('fontStyle', 'normal') as FontStyleLite;
}
