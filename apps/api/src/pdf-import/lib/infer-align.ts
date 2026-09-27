import type { Paragraph } from './group-paragraphs';
import type { TableDividers } from './table-structure';

/** Context needed to judge a single-line paragraph against its surroundings. */
export interface AlignContext {
  pageWidth: number; // design-space px
  dividers?: TableDividers;
}

/** Edge/center consistency tolerance (px): font-metric re-measurement jitter is
 * a few px at body sizes, while ragged edges differ by a fraction of an em. */
const alignTol = (fs: number) => Math.max(2.5, fs * 0.1);

/** Minimum free margin (× font size) on BOTH sides before a single-line
 * paragraph may claim center — guards text that fills its region, where the
 * center test would pass trivially. Real table cell padding is well above
 * this; 1.5em here would reject most actual cells. */
const MIN_FREE_MARGIN = 0.5;

/** How close to its region's right edge a single-line paragraph's right edge
 * must sit to claim right alignment (absorbs cell padding; × font size). */
const RIGHT_EDGE_TOL = 0.35;

const spread = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);

/** Consistency = every value within tolerance of the others. */
const consistent = (xs: number[], tol: number): boolean => spread(xs) <= tol;

/**
 * Infer a paragraph's horizontal alignment from its lines' geometry.
 *
 * Multi-line paragraphs carry the evidence internally: consistent line centers
 * = centered; consistent rights with ragged lefts = right-aligned; anything
 * else imports as left. Equal-width lines (justified vs centered — visually
 * identical) count as centered.
 *
 * Single-line paragraphs have no internal evidence, so they are judged against
 * their region: the band between the nearest vertical dividers flanking the
 * line (a table cell), defaulting to the page. Center requires the line center
 * on the region center with ≥1.5em free on both sides and width ≤90% of the
 * region; right requires the right edge on the region's right with ≥1.5em free
 * left; everything else stays left.
 *
 * The rendered box works out exactly for center/right: a centered paragraph's
 * bbox (min-left .. max-right) is symmetric about the common line center, so
 * CSS centering inside it lands on the source center; right-aligned lines
 * share the right edge the bbox is flush against.
 */
export function inferAlign(
  para: Paragraph,
  ctx?: AlignContext,
): 'left' | 'center' | 'right' {
  const fs = para.fontSizePx;
  const tol = alignTol(fs);

  if (para.lines.length >= 2) {
    const lefts = para.lines.map((l) => l.x);
    const rights = para.lines.map((l) => l.x + l.width);
    const centers = para.lines.map((l) => l.x + l.width / 2);
    // Consistent centers = centered. (Equal-width lines — where justified,
    // centered, and even plain left are visually identical — land here too;
    // that is harmless by construction.)
    if (consistent(centers, tol)) return 'center';
    if (consistent(rights, tol) && !consistent(lefts, tol)) return 'right';
    return 'left';
  }

  if (!ctx) return 'left';
  const line = para.lines[0];
  const center = line.x + line.width / 2;
  const right = line.x + line.width;

  // Region: nearest y-relevant vertical dividers flanking the line, else page.
  const vDivs = (ctx.dividers?.vertical ?? []).filter(
    (d) => d.top < line.bottom && d.bottom > line.top,
  );
  let regionLeft = 0;
  let regionRight = ctx.pageWidth;
  for (const d of vDivs) {
    if (d.x <= line.x && d.x > regionLeft) regionLeft = d.x;
    if (d.x >= right && d.x < regionRight) regionRight = d.x;
  }
  const regionWidth = regionRight - regionLeft;
  if (regionWidth <= 0) return 'left';

  const leftMargin = line.x - regionLeft;
  const rightMargin = regionRight - right;
  if (
    leftMargin >= fs * MIN_FREE_MARGIN &&
    rightMargin >= fs * MIN_FREE_MARGIN &&
    line.width <= regionWidth * 0.9 &&
    Math.abs(center - (regionLeft + regionRight) / 2) <= tol
  ) {
    return 'center';
  }
  if (
    rightMargin <= Math.max(tol, fs * RIGHT_EDGE_TOL) &&
    leftMargin >= fs * 1.5
  )
    return 'right';
  return 'left';
}
