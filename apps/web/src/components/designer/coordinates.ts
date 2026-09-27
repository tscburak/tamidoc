import type { Box } from './types';

export interface Point {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

/**
 * Convert a screen point (clientX/clientY) to design-space canvas coordinates.
 * Uses the element's post-transform bounding rect, so `zoom` is accounted for
 * by dividing the in-rect offset by `zoom`.
 */
export function screenToCanvas(
  clientX: number,
  clientY: number,
  el: HTMLElement | null,
  zoom: number,
): Point {
  if (!el) return { x: 0, y: 0 };
  const rect = el.getBoundingClientRect();
  return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
}

/** Keep a box fully inside the canvas (clamps to [0, canvas] per axis). */
export function clampToCanvas(box: Box, canvas: CanvasSize): Box {
  const maxX = Math.max(0, canvas.width - box.width);
  const maxY = Math.max(0, canvas.height - box.height);
  return {
    x: Math.max(0, Math.min(box.x, maxX)),
    y: Math.max(0, Math.min(box.y, maxY)),
    width: box.width,
    height: box.height,
  };
}

export interface Anchors {
  left: number;
  centerX: number;
  right: number;
  top: number;
  centerY: number;
  bottom: number;
}

/** The 6 alignment anchors (3 per axis) of a box, in design px. */
export function getAnchors(box: Box): Anchors {
  return {
    left: box.x,
    centerX: box.x + box.width / 2,
    right: box.x + box.width,
    top: box.y,
    centerY: box.y + box.height / 2,
    bottom: box.y + box.height,
  };
}

/**
 * Wrap an angle (degrees) into the half-open range (-180, 180]. Keeps stored
 * rotation bounded so the inspector slider/handle and the value never diverge,
 * regardless of how the angle was produced (drag, slider, typed number).
 */
export function normalizeAngle(deg: number): number {
  const d = (((deg + 180) % 360) + 360) % 360 - 180;
  return d === -180 ? 180 : d;
}

/**
 * Tight bounding box around one or more boxes (design px). Used to derive a
 * repeating group's band from its members. Returns `{x:0,y:0,width:0,height:0}`
 * for an empty list so callers can render a degenerate (invisible) box.
 */
export function bboxOf(boxes: Box[]): Box {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
