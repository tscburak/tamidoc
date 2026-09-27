import type { TextRun } from './pdf-parser';

/**
 * A derived table/grid rule line in design-space px.
 * Vertical: x position spanning [top, bottom]. Horizontal: y position
 * spanning [left, right].
 */
export interface Divider {
  x: number; // vertical: x; horizontal: y
  top: number; // vertical: top y; horizontal: left x
  bottom: number; // vertical: bottom y; horizontal: right x
}

/** Both orientations of derived grid lines for one page. */
export interface TableDividers {
  vertical: Divider[];
  horizontal: Divider[];
}

/** Median font size across runs (fallback 12 px ≈ 9pt body text) — used to
 * scale the minimum divider span relative to the document's text. */
export function medianFontSizePx(runs: TextRun[]): number {
  if (!runs.length) return 12;
  const sizes = runs.map((r) => r.fontSizePx).sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)];
}

/** Rect-like subset of extracted shape components deriveDividers accepts. */
export interface DividerShapeInput {
  kind: string;
  shape?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// --- Tunable thresholds (design-space px) --------------------------------------

/** Max thickness of a "thin" rect whose centerline is a rule (stroked vertical
 * / horizontal lines become swPx-wide filled rects; 3px ≈ 2.25pt stroke). */
const THIN_PX = 3;

/** Cluster radius: edge votes within this distance are the same rule line
 * (stroke-width jitter between adjacent cells). */
const CLUSTER_PX = 1.5;

/** Edge-derived votes need at least this many corroborating rects — a single
 * boxed paragraph's edges must not split its own text. */
const MIN_EDGE_VOTES = 2;

interface Vote {
  pos: number;
  top: number;
  bottom: number;
}

/** Promote clustered votes into dividers: sort, cluster within CLUSTER_PX,
 * require the vote count (edges) or thin-ness, then union the y-spans. */
function promote(votes: Vote[], minSpanPx: number, thin: boolean): Divider[] {
  const out: Divider[] = [];
  votes.sort((a, b) => a.pos - b.pos);

  let cluster: Vote[] = [];
  const flush = () => {
    if (!cluster.length) return;
    if (!thin && cluster.length < MIN_EDGE_VOTES) {
      cluster = [];
      return;
    }
    const top = Math.min(...cluster.map((v) => v.top));
    const bottom = Math.max(...cluster.map((v) => v.bottom));
    if (bottom - top >= minSpanPx) {
      out.push({
        x: cluster.reduce((s, v) => s + v.pos, 0) / cluster.length,
        top,
        bottom,
      });
    }
    cluster = [];
  };

  for (const v of votes) {
    if (cluster.length && v.pos - cluster[cluster.length - 1].pos > CLUSTER_PX)
      flush();
    cluster.push(v);
  }
  flush();
  return out;
}

/**
 * Derive table/grid rule lines from extracted shape components (design-space
 * px). Two sources, per orientation:
 *
 * 1. Thin rects (width ≤ 3px / height ≤ 3px) — stroked rule lines that
 *    classifyShape already turned into filled bars. Their centerline is a
 *    divider; a single one suffices (a true column rule stands alone).
 * 2. Rect edges — every cell rect votes its left/right (top/bottom) edge.
 *    Votes cluster into a divider only when ≥2 rects corroborate the same
 *    line, so a lone boxed paragraph does not split its own text.
 *
 * Every divider must span ≥ minSpanPx, so bullets, accent bars, and one-row
 * label/value boxes never qualify. Never throws; pure function.
 */
export function deriveDividers(
  shapes: DividerShapeInput[],
  minSpanPx: number,
): TableDividers {
  const edgeV: Vote[] = []; // vertical candidates from rect edges
  const edgeH: Vote[] = [];
  const thinV: Vote[] = [];
  const thinH: Vote[] = [];

  for (const s of shapes) {
    if (s.kind !== 'shape') continue;
    if (s.shape === 'line') {
      thinH.push({ pos: s.y + s.height / 2, top: s.x, bottom: s.x + s.width });
      continue;
    }
    if (s.shape !== 'rectangle') continue;
    if (s.width <= THIN_PX) {
      thinV.push({ pos: s.x + s.width / 2, top: s.y, bottom: s.y + s.height });
    } else if (s.height <= THIN_PX) {
      thinH.push({ pos: s.y + s.height / 2, top: s.x, bottom: s.x + s.width });
    } else {
      // Cell rect: both edges vote, carrying the rect's span along the axis.
      edgeV.push({ pos: s.x, top: s.y, bottom: s.y + s.height });
      edgeV.push({ pos: s.x + s.width, top: s.y, bottom: s.y + s.height });
      edgeH.push({ pos: s.y, top: s.x, bottom: s.x + s.width });
      edgeH.push({ pos: s.y + s.height, top: s.x, bottom: s.x + s.width });
    }
  }

  return {
    vertical: mergeAdjacent([
      ...promote(thinV, minSpanPx, true),
      ...promote(edgeV, minSpanPx, false),
    ]),
    horizontal: mergeAdjacent([
      ...promote(thinH, minSpanPx, true),
      ...promote(edgeH, minSpanPx, false),
    ]),
  };
}

/** Merge dividers from different sources that landed on the same line (a thin
 * rule coinciding with cell edges): average positions, union spans. */
function mergeAdjacent(dividers: Divider[]): Divider[] {
  const sorted = [...dividers].sort((a, b) => a.x - b.x);
  const out: Divider[] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && d.x - last.x <= CLUSTER_PX) {
      last.x = (last.x + d.x) / 2;
      last.top = Math.min(last.top, d.top);
      last.bottom = Math.max(last.bottom, d.bottom);
    } else {
      out.push({ ...d });
    }
  }
  return out;
}
