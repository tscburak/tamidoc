import { MIN_SIZE, SNAP_THRESHOLD } from '../components/designer/constants';
import { getAnchors, type CanvasSize } from '../components/designer/coordinates';
import type { Box } from '../components/designer/types';

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface Guides {
  vertical: number[]; // x-coordinates of vertical guide lines (design px)
  horizontal: number[]; // y-coordinates of horizontal guide lines (design px)
}

interface SnapMatch {
  delta: number; // amount to add to the candidate origin on this axis
  target: number; // the anchor we aligned to (guide line position)
}

/** Snap targets for alignment guide lines inset by `padding` from the canvas edges. */
export function guideTargets(canvas: CanvasSize, padding: number): Guides {
  return { vertical: [padding, canvas.width - padding], horizontal: [padding, canvas.height - padding] };
}

/** Target anchor lines (edges + centers) for every sibling + the canvas itself,
 * plus optional alignment-guide positions. */
function targetLines(others: Box[], canvas: CanvasSize, guides?: Guides) {
  const vertical = [0, canvas.width / 2, canvas.width];
  const horizontal = [0, canvas.height / 2, canvas.height];
  if (guides) {
    vertical.push(...guides.vertical);
    horizontal.push(...guides.horizontal);
  }
  for (const o of others) {
    const a = getAnchors(o);
    vertical.push(a.left, a.centerX, a.right);
    horizontal.push(a.top, a.centerY, a.bottom);
  }
  return { vertical, horizontal };
}

/** Closest (anchor → target) match within threshold across the given anchors. */
function nearest(anchors: number[], targets: number[], threshold: number): SnapMatch | null {
  let best: SnapMatch | null = null;
  for (const anchor of anchors) {
    for (const target of targets) {
      const delta = target - anchor;
      if (Math.abs(delta) > threshold) continue;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, target };
    }
  }
  return best;
}

/** Single value → nearest target within threshold. */
function nearestOne(value: number, targets: number[], threshold: number): SnapMatch | null {
  return nearest([value], targets, threshold);
}

/**
 * Snap a moving box. X and Y snap independently; at most one vertical and one
 * horizontal guide. Always computed from the *unsnapped* candidate so the
 * pointer stays under the cursor and the offset never accumulates.
 */
export function snapMove(
  candidate: Box,
  others: Box[],
  canvas: CanvasSize,
  guides?: Guides,
  threshold: number = SNAP_THRESHOLD,
): { x: number; y: number } & Guides {
  const a = getAnchors(candidate);
  const { vertical, horizontal } = targetLines(others, canvas, guides);
  const bx = nearest([a.left, a.centerX, a.right], vertical, threshold);
  const by = nearest([a.top, a.centerY, a.bottom], horizontal, threshold);
  return {
    x: candidate.x + (bx?.delta ?? 0),
    y: candidate.y + (by?.delta ?? 0),
    vertical: bx ? [bx.target] : [],
    horizontal: by ? [by.target] : [],
  };
}

/** Recompute a box for a resize handle from design-space deltas. Enforces MIN_SIZE. */
export function resizeBox(orig: Box, handle: Handle, dx: number, dy: number): Box {
  let { x, y, width, height } = orig;
  if (handle.includes('w')) {
    x = orig.x + dx;
    width = orig.width - dx;
  }
  if (handle.includes('e')) {
    width = orig.width + dx;
  }
  if (handle.includes('n')) {
    y = orig.y + dy;
    height = orig.height - dy;
  }
  if (handle.includes('s')) {
    height = orig.height + dy;
  }
  // Enforce minimums; keep the opposite edge fixed.
  if (width < MIN_SIZE) {
    if (handle.includes('w')) x = orig.x + orig.width - MIN_SIZE;
    width = MIN_SIZE;
  }
  if (height < MIN_SIZE) {
    if (handle.includes('n')) y = orig.y + orig.height - MIN_SIZE;
    height = MIN_SIZE;
  }
  return { x, y, width, height };
}

/**
 * Snap a resizing box. Only the edge(s) the handle moves are snapped.
 * e/se/ne move the right edge; w/sw/nw move the left; s moves bottom; n moves top.
 */
export function snapResize(
  handle: Handle,
  candidate: Box,
  others: Box[],
  canvas: CanvasSize,
  guides?: Guides,
  threshold: number = SNAP_THRESHOLD,
): { box: Box } & Guides {
  const { vertical, horizontal } = targetLines(others, canvas, guides);
  let { x, y, width, height } = candidate;
  const right = x + width;
  const bottom = y + height;
  const verticalGuides: number[] = [];
  const horizontalGuides: number[] = [];

  if (handle.includes('e')) {
    const m = nearestOne(right, vertical, threshold);
    if (m) {
      width = m.target - x;
      verticalGuides.push(m.target);
    }
  } else if (handle.includes('w')) {
    const m = nearestOne(x, vertical, threshold);
    if (m) {
      width = right - m.target;
      x = m.target;
      verticalGuides.push(m.target);
    }
  }

  if (handle.includes('s')) {
    const m = nearestOne(bottom, horizontal, threshold);
    if (m) {
      height = m.target - y;
      horizontalGuides.push(m.target);
    }
  } else if (handle.includes('n')) {
    const m = nearestOne(y, horizontal, threshold);
    if (m) {
      height = bottom - m.target;
      y = m.target;
      horizontalGuides.push(m.target);
    }
  }

  // Re-enforce minimums after snapping.
  if (width < MIN_SIZE) {
    if (handle.includes('w')) x = right - MIN_SIZE;
    width = MIN_SIZE;
  }
  if (height < MIN_SIZE) {
    if (handle.includes('n')) y = bottom - MIN_SIZE;
    height = MIN_SIZE;
  }

  return { box: { x, y, width, height }, vertical: verticalGuides, horizontal: horizontalGuides };
}
