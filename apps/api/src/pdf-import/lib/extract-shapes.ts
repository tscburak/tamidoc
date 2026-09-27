import { OPS } from 'pdfjs-dist';
import { createCanvas, Path2D, type DOMMatrix2DInit } from '@napi-rs/canvas';
import type { PDFPageProxy } from 'pdfjs-dist';
import { type Matrix, IDENTITY, mul, apply } from './pdf-matrix';
import type { ImportIssues } from './import-diagnostics';

/** Local component shapes matching the frontend designer components. */
interface ShapeComponent {
  paintOrder: number;
  id: string;
  kind: 'shape';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  page: number;
  shape: 'rectangle' | 'ellipse' | 'line';
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
}

interface VectorImageComponent {
  paintOrder: number;
  id: string;
  kind: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  page: number;
  src: string; // PNG data URL
  alt: string;
  objectFit: string;
  radius: number;
  field: string;
}

export type ExtractedVector = ShapeComponent | VectorImageComponent;

/** Distributive Omit — a plain Omit over the union collapses to common keys. */
type NewVector =
  | Omit<ShapeComponent, 'id' | 'page' | 'paintOrder'>
  | Omit<VectorImageComponent, 'id' | 'page' | 'paintOrder'>;

// --- Safety caps (mirrors extract-images' philosophy) ------------------------
// Tables arrive as ONE path containing dozens of cell-border sub-paths, so the
// per-page budget must hold a full grid (10×8 cells = 80 shapes). Shape
// components are small JSON — the real rasterization cost stays capped by
// MAX_COMPLEX_PER_PAGE below.
const MAX_PER_PAGE = 2000;
const MAX_COMPLEX_PER_PAGE = 200;
const MIN_DESIGN_PX = 0.01;
const MAX_RASTER_SIDE_PX = 2000;
const MAX_RASTER_AREA_PX = 4_000_000;
const MIN_ALPHA = 0.001;

/** Viewport contract from page.getViewport({ scale }) — user space → design px. */
interface ViewportLike {
  transform: number[];
  width: number;
  height: number;
}

/** Graphics state tracked alongside the CTM. Colors are hex or null (pattern /
 * unknown). Saved/restored together with the CTM on save/restore/form XObjects. */
interface GState {
  fill: string | null;
  stroke: string | null;
  lineWidth: number;
  dash: number[] | null;
  fillAlpha: number;
  strokeAlpha: number;
  dashOffset: number;
  lineCap: number;
  lineJoin: number;
  miterLimit: number;
  clips: { path: Path2D; evenOdd: boolean; rect: boolean }[];
}

const INITIAL_GSTATE: GState = {
  fill: '#000000',
  stroke: '#000000',
  lineWidth: 1,
  dash: null,
  fillAlpha: 1,
  strokeAlpha: 1,
  dashOffset: 0,
  lineCap: 0,
  lineJoin: 0,
  miterLimit: 10,
  clips: [],
};

/** Decoded path segment in PDF user space (pre-CTM). */
export type Seg =
  | { op: 'M'; p: [number, number] }
  | { op: 'L'; p: [number, number] }
  | { op: 'C'; c1: [number, number]; c2: [number, number]; p: [number, number] }
  | { op: 'R'; r: { x: number; y: number; w: number; h: number } }
  | { op: 'Z' };

/** How a path-paint op paints the current path. */
interface PaintMode {
  fill: boolean;
  stroke: boolean;
  evenOdd: boolean;
}

/** A path under construction: decoded segments + a skia Path2D mirror. */
interface CurrentPath {
  segs: Seg[];
  path: Path2D;
}

// --- color helpers -----------------------------------------------------------

function toHex(r: number, g: number, b: number): string {
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

function rgbArgsHex(args: number[]): string | null {
  return args.length >= 3 ? toHex(args[0], args[1], args[2]) : null;
}

function grayHex(v: number): string {
  return toHex(v * 255, v * 255, v * 255);
}

function cmykHex(c: number, m: number, y: number, k: number): string {
  const f = (v: number) => 255 * (1 - v) * (1 - k);
  return toHex(f(c), f(m), f(y));
}

/** setFillColor(54)/setStrokeColor(52): component array, length → colorspace.
 * Some pdfjs versions wrap the array — unwrap number[] | number[][]. */
function componentsHex(raw: unknown): string | null {
  const a: number[] | undefined = Array.isArray(raw)
    ? Array.isArray(raw[0])
      ? ((raw[0] as unknown as number[][])[0] ?? (raw as number[]))
      : (raw as number[])
    : undefined;
  if (!a) return null;
  if (a.length === 1) return grayHex(a[0]);
  if (a.length === 3) return rgbArgsHex(a);
  if (a.length === 4) return cmykHex(a[0], a[1], a[2], a[3]);
  return null;
}

// --- geometry helpers --------------------------------------------------------

/** Axis-aligned bbox of design-space points. */
function bboxOf(points: [number, number][]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** CTM maps to an axis-aligned box in design space (scale/translate or 90°). */
function isAxisAligned(m: Matrix): boolean {
  const EPS = 1e-6;
  return (
    (Math.abs(m[1]) < EPS && Math.abs(m[2]) < EPS) ||
    (Math.abs(m[0]) < EPS && Math.abs(m[3]) < EPS)
  );
}

/** Uniform scale factor of a matrix (for lineWidth/dash conversion). */
function matrixScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
}

// --- path shape probes (pure — spec-testable) --------------------------------

/** Segs minus Z and zero-length curveTo corner padding (react-pdf and similar
 * generators pad polyline corners with degenerate beziers). */
function simplifySegs(segs: Seg[]): Seg[] {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  return segs.filter((s) => {
    if (s.op === 'Z') return false;
    if (s.op === 'C') {
      return !(
        near(s.c1[0], s.p[0]) &&
        near(s.c1[1], s.p[1]) &&
        near(s.c2[0], s.p[0]) &&
        near(s.c2[1], s.p[1])
      );
    }
    return true;
  });
}

/** Single `re` (rectangle) sub-op → its user-space rect, else null. */
function singleRect(
  segs: Seg[],
): { x: number; y: number; w: number; h: number } | null {
  if (segs.length !== 1 || segs[0].op !== 'R') return null;
  return segs[0].r;
}

/** Closed 4-corner polyline ([M,L,L,L] + optional closing L + Z) that traces an
 * axis-aligned rect → its user-space rect. Many generators (react-pdf, Word)
 * emit borders as line paths instead of the `re` operator. */
function polylineRect(
  segs: Seg[],
): { x: number; y: number; w: number; h: number } | null {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const core = simplifySegs(segs);
  if (core.length < 4 || core.length > 5) return null;
  if (core[0].op !== 'M' || core.slice(1).some((s) => s.op !== 'L'))
    return null;
  const pts = core.map((s) => (s as { p: [number, number] }).p);
  if (
    pts.length === 5 &&
    !(near(pts[4][0], pts[0][0]) && near(pts[4][1], pts[0][1]))
  )
    return null;
  const q = pts.slice(0, 4);

  const xs = q.map((p) => p[0]);
  const ys = q.map((p) => p[1]);
  const minx = Math.min(...xs);
  const maxx = Math.max(...xs);
  const miny = Math.min(...ys);
  const maxy = Math.max(...ys);
  // Exactly two distinct x and two distinct y, every point on a corner —
  // rejects diamonds (3+ distinct x) and diagonal quads.
  if (new Set(xs.map((v) => Math.round(v * 100) / 100)).size !== 2) return null;
  if (new Set(ys.map((v) => Math.round(v * 100) / 100)).size !== 2) return null;
  for (const [x, y] of q) {
    if (!(near(x, minx) || near(x, maxx)) || !(near(y, miny) || near(y, maxy)))
      return null;
  }
  // Corners must be connected by edges, not diagonals or repeated vertices.
  for (let i = 0; i < 4; i++) {
    const a = q[i],
      b = q[(i + 1) % 4];
    if (near(a[0], b[0]) === near(a[1], b[1])) return null;
  }
  return { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
}

/** [M, L] (+optional Z, +degenerate corner padding) — one straight segment. */
function singleLine(
  segs: Seg[],
): { m: [number, number]; l: [number, number] } | null {
  const core = simplifySegs(segs);
  if (core.length !== 2 || core[0].op !== 'M' || core[1].op !== 'L')
    return null;
  return { m: core[0].p, l: core[1].p };
}

/** Ellipse test: [M, C, C, C, C] (+optional Z) whose 5 anchors sit on the
 * bbox's x/y extremes in alternating diamond order (R,B,L,T,R) — how bezier
 * circles are constructed. Returns the 4 distinct extreme anchors. */
function ellipseAnchors(segs: Seg[]): [number, number][] | null {
  const core = segs.filter((s) => s.op !== 'Z');
  if (
    core.length !== 5 ||
    core[0].op !== 'M' ||
    core.slice(1).some((s) => s.op !== 'C')
  )
    return null;
  const anchors: [number, number][] = [
    core[0].p,
    ...(core.slice(1) as Extract<Seg, { op: 'C' }>[]).map((s) => s.p),
  ];

  const xs = anchors.map((a) => a[0]);
  const ys = anchors.map((a) => a[1]);
  const minx = Math.min(...xs);
  const maxx = Math.max(...xs);
  const miny = Math.min(...ys);
  const maxy = Math.max(...ys);
  const tol = Math.max(0.02 * Math.max(maxx - minx, maxy - miny), 0.25);

  const atX = (i: number) => xs[i] <= minx + tol || xs[i] >= maxx - tol;
  const atY = (i: number) => ys[i] <= miny + tol || ys[i] >= maxy - tol;
  const sideX = (i: number) => (xs[i] <= minx + tol ? -1 : 1);
  const sideY = (i: number) => (ys[i] <= miny + tol ? -1 : 1);

  // Expected pattern: X,Y,X,Y,X with alternating sides on each axis. The 5th
  // anchor closes back to the start's side — require alternation between the
  // opposite anchors only.
  for (let i = 0; i < 5; i++) {
    if (i % 2 === 0 ? !atX(i) : !atY(i)) return null;
  }
  if (sideX(0) === sideX(2) || sideY(1) === sideY(3)) return null;
  if (Math.hypot(xs[4] - xs[0], ys[4] - ys[0]) > tol) return null;
  const kappa = 0.55228475;
  for (let i = 0; i < 4; i++) {
    const curve = core[i + 1] as Extract<Seg, { op: 'C' }>;
    const start = anchors[i],
      end = anchors[i + 1];
    const expected1 =
      i % 2 === 0
        ? [start[0], start[1] + (end[1] - start[1]) * kappa]
        : [start[0] + (end[0] - start[0]) * kappa, start[1]];
    const expected2 =
      i % 2 === 0
        ? [end[0] + (start[0] - end[0]) * kappa, end[1]]
        : [end[0], end[1] + (start[1] - end[1]) * kappa];
    if (
      Math.hypot(curve.c1[0] - expected1[0], curve.c1[1] - expected1[1]) >
        tol ||
      Math.hypot(curve.c2[0] - expected2[0], curve.c2[1] - expected2[1]) > tol
    )
      return null;
  }

  return anchors.slice(0, 4);
}

/** Classified shape spec; `fillFromStroke` marks the vertical-bar special case
 * (designer 'line' is horizontal-only, verticals become filled rects). */
export interface ShapeSpec {
  shape: 'rectangle' | 'ellipse' | 'line';
  box: { x: number; y: number; width: number; height: number };
  fillFromStroke?: boolean;
}

/** Classify one single-contour path into a shape spec, or null for complex.
 * Caller must ensure the CTM is axis-aligned (shared across contours). */
function classifySingle(
  segs: Seg[],
  strokePainted: boolean,
  designM: Matrix,
  swPx: number,
): ShapeSpec | null {
  const toDesign = (p: [number, number]): [number, number] => apply(p, designM);

  // PDF strokes straddle the path (half out, half in); the designer draws CSS
  // borders fully INSIDE the box. Expand the box by half the stroke so the
  // inside border lands exactly on the PDF stroke's footprint.
  const expand = (box: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) =>
    strokePainted
      ? {
          x: box.x - swPx / 2,
          y: box.y - swPx / 2,
          width: box.width + swPx,
          height: box.height + swPx,
        }
      : box;

  // A. Single rectangle (`re` op or a closed 4-corner polyline)
  const first = segs[0];
  const last = segs[segs.length - 1];
  const closed =
    last?.op === 'Z' ||
    (first?.op === 'M' &&
      last?.op === 'L' &&
      Math.hypot(first.p[0] - last.p[0], first.p[1] - last.p[1]) < 0.01);
  const rect =
    singleRect(segs) ?? (!strokePainted || closed ? polylineRect(segs) : null);
  if (rect) {
    const box = bboxOf([
      apply([rect.x, rect.y], designM),
      apply([rect.x + rect.w, rect.y + rect.h], designM),
    ]);
    return { shape: 'rectangle', box: expand(box) };
  }

  // C. Ellipse (4 beziers, diamond anchors)
  const anchors = ellipseAnchors(segs);
  if (anchors) {
    return { shape: 'ellipse', box: expand(bboxOf(anchors.map(toDesign))) };
  }

  // B. Single straight segment → horizontal line / vertical filled bar
  const line = singleLine(segs);
  if (line && strokePainted) {
    const [dm, dl] = [toDesign(line.m), toDesign(line.l)];
    const dx = Math.abs(dl[0] - dm[0]);
    const dy = Math.abs(dl[1] - dm[1]);
    if (dy <= 0.01) {
      // Horizontal divider — designer 'line' renders a horizontal bar.
      const y = (dm[1] + dl[1]) / 2 - swPx / 2;
      return {
        shape: 'line',
        box: { x: Math.min(dm[0], dl[0]), y, width: dx, height: swPx },
      };
    }
    if (dx <= 0.01) {
      const x = (dm[0] + dl[0]) / 2 - swPx / 2;
      return {
        shape: 'rectangle',
        box: { x, y: Math.min(dm[1], dl[1]), width: swPx, height: dy },
        fillFromStroke: true,
      };
    }
    return null; // diagonal → complex
  }

  return null; // polyline / mixed → complex
}

/** Classify a single-contour painted path into a shape spec, or null for
 * "complex → rasterize". */
export function classifyShape(
  segs: Seg[],
  strokePainted: boolean,
  designM: Matrix,
  swPx: number,
): ShapeSpec | null {
  if (!isAxisAligned(designM)) return null;
  return classifySingle(segs, strokePainted, designM, swPx);
}

/** Split decoded segments into sub-path contours. Every `M` and every `R`
 * starts a new subpath in PDF semantics (`re` appends a whole closed rect);
 * `Z` closes the contour it trails. Segments before any M/R form their own
 * contour so nothing is silently dropped. */
export function splitContours(segs: Seg[]): Seg[][] {
  const contours: Seg[][] = [];
  let cur: Seg[] | null = null;
  for (const s of segs) {
    if (s.op === 'M' || s.op === 'R') {
      if (cur) contours.push(cur);
      cur = [s];
    } else {
      if (!cur) cur = [];
      cur.push(s); // L, C, Z
    }
  }
  if (cur) contours.push(cur);
  return contours;
}

/** Cap on sub-paths decomposed from one painted path (≈ a 15×20 grid; guards
 * pathological Type3/pattern paths). */
export const MAX_CONTOURS_PER_PATH = 300;

/** Tolerance for clip-containment checks (design px). Clip bounds come from
 * Path2D.computeTightBounds() while shape boxes come from direct CTM math —
 * the two disagree by ~1e-5px on identical rects (react-pdf wraps every
 * component in an exactly-fitting clip, so its own exports always tripped a
 * strict comparison and rasterized every divider to an image). Truly clipped
 * artwork still misses by far more. */
export const CLIP_CONTAIN_EPS_PX = 0.05;

/** Whether a shape box sits inside clip bounds modulo float slop. */
export function boxWithinClipBounds(
  box: { x: number; y: number; width: number; height: number },
  b: [number, number, number, number],
  eps = CLIP_CONTAIN_EPS_PX,
): boolean {
  return (
    box.x >= b[0] - eps &&
    box.y >= b[1] - eps &&
    box.x + box.width <= b[2] + eps &&
    box.y + box.height <= b[3] + eps
  );
}

/** Classify a multi-contour painted path — how tables arrive: ONE constructPath
 * chaining every cell border, painted by a single op — into one shape spec per
 * contour. All-or-nothing: any non-simple contour returns null so the whole
 * path keeps the rasterize fallback instead of silently dropping borders.
 * Coincident boxes (a rect painted fill+stroke as duplicate contours, or an
 * outer border sharing edges with cells) are deduped at 0.5 px precision. */
export function classifyContours(
  segs: Seg[],
  strokePainted: boolean,
  designM: Matrix,
  swPx: number,
): ShapeSpec[] | null {
  const contours = splitContours(segs);
  if (contours.length < 2 || contours.length > MAX_CONTOURS_PER_PATH)
    return null;
  if (!isAxisAligned(designM)) return null;

  const specs: ShapeSpec[] = [];
  const seen = new Set<string>();
  for (const contour of contours) {
    const spec = classifySingle(contour, strokePainted, designM, swPx);
    if (!spec) return null;
    const key = [
      spec.shape,
      spec.box.x,
      spec.box.y,
      spec.box.width,
      spec.box.height,
    ]
      .map((v) => (typeof v === 'number' ? Math.round(v * 2) / 2 : v))
      .join('|');
    if (seen.has(key)) continue; // duplicate contour — same visual box
    seen.add(key);
    specs.push(spec);
  }
  return specs.length ? specs : null;
}

// --- complex path rasterization ----------------------------------------------

export function toDOMMatrix(m: Matrix): DOMMatrix2DInit {
  return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] };
}

/** Rasterize a user-space path into a PNG data URL at design-space resolution.
 * Returns null when it exceeds the raster guard (path stays ghost-only). */
function rasterizeComplexPath(
  path: CurrentPath,
  mode: PaintMode,
  designM: Matrix,
  gstate: GState,
): Omit<VectorImageComponent, 'id' | 'page' | 'paintOrder'> | null {
  const scale = matrixScale(designM);
  const swPx = gstate.lineWidth === 0 ? 1 : Math.abs(gstate.lineWidth * scale);

  let designPath: InstanceType<typeof Path2D>;
  let bounds: [number, number, number, number];
  try {
    designPath = new Path2D(path.path).transform(toDOMMatrix(designM));
    const tight = designPath.computeTightBounds?.() ?? designPath.getBounds?.();
    if (!tight) return null;
    const pad = mode.stroke
      ? (swPx * (gstate.lineJoin === 0 ? gstate.miterLimit : 1)) / 2 + 1
      : 1;
    bounds = [tight[0] - pad, tight[1] - pad, tight[2] + pad, tight[3] + pad];
  } catch {
    return null;
  }

  const w = Math.ceil(bounds[2] - bounds[0]);
  const h = Math.ceil(bounds[3] - bounds[1]);
  if (w < MIN_DESIGN_PX || h < MIN_DESIGN_PX) return null;
  if (
    w > MAX_RASTER_SIDE_PX ||
    h > MAX_RASTER_SIDE_PX ||
    w * h > MAX_RASTER_AREA_PX
  )
    return null;

  try {
    const rasterScale = Math.min(
      2,
      MAX_RASTER_SIDE_PX / w,
      MAX_RASTER_SIDE_PX / h,
      Math.sqrt(MAX_RASTER_AREA_PX / (w * h)),
    );
    const canvas = createCanvas(
      Math.ceil(w * rasterScale),
      Math.ceil(h * rasterScale),
    );
    const ctx = canvas.getContext('2d');
    ctx.setTransform(
      rasterScale,
      0,
      0,
      rasterScale,
      -bounds[0] * rasterScale,
      -bounds[1] * rasterScale,
    );
    for (const clip of gstate.clips)
      ctx.clip(clip.path, clip.evenOdd ? 'evenodd' : 'nonzero');
    // Draw the original path under its transform exactly once.
    ctx.setTransform(
      designM[0] * rasterScale,
      designM[1] * rasterScale,
      designM[2] * rasterScale,
      designM[3] * rasterScale,
      (designM[4] - bounds[0]) * rasterScale,
      (designM[5] - bounds[1]) * rasterScale,
    );

    if (mode.fill && gstate.fill) {
      ctx.fillStyle = gstate.fill;
      ctx.globalAlpha = gstate.fillAlpha;
      ctx.fill(path.path, mode.evenOdd ? 'evenodd' : 'nonzero');
    }
    if (mode.stroke && gstate.stroke) {
      ctx.strokeStyle = gstate.stroke;
      ctx.globalAlpha = gstate.strokeAlpha;
      ctx.lineWidth =
        gstate.lineWidth === 0 ? 1 / scale : Math.abs(gstate.lineWidth);
      ctx.lineCap =
        (['butt', 'round', 'square'] as const)[gstate.lineCap] ?? 'butt';
      ctx.lineJoin =
        (['miter', 'round', 'bevel'] as const)[gstate.lineJoin] ?? 'miter';
      ctx.miterLimit = gstate.miterLimit;
      ctx.lineDashOffset = gstate.dashOffset;
      if (gstate.dash?.length) ctx.setLineDash(gstate.dash);
      ctx.stroke(path.path);
    }

    const png = canvas.toBuffer('image/png');
    return {
      kind: 'image',
      x: bounds[0],
      y: bounds[1],
      width: w,
      height: h,
      rotation: 0,
      src: `data:image/png;base64,${png.toString('base64')}`,
      alt: '',
      objectFit: 'fill',
      radius: 0,
      field: '',
    };
  } catch {
    return null;
  }
}

// --- walk --------------------------------------------------------------------

/** Decode constructPath args [opsArray, flatArgs] into segments + Path2D. */
export function decodeConstructPath(args: any[]): CurrentPath | null {
  const opsArr: number[] = args[0] ?? [];
  const flat: number[] = args[1] ?? [];
  const segs: Seg[] = [];
  const path = new Path2D();
  let cp: [number, number] = [0, 0]; // current point — normalizes curveTo2/3
  let subpathStart: [number, number] = [0, 0];
  let k = 0;

  for (const op of opsArr) {
    const n = SUB_ARGS[op];
    if (n === undefined) break; // unknown sub-op — keep what we have
    const a = flat.slice(k, k + n);
    k += n;
    if (a.length < n) break; // truncated args — defensive

    if (op === OPS.moveTo) {
      cp = [a[0], a[1]];
      subpathStart = cp;
      segs.push({ op: 'M', p: cp });
      path.moveTo(cp[0], cp[1]);
    } else if (op === OPS.lineTo) {
      cp = [a[0], a[1]];
      segs.push({ op: 'L', p: cp });
      path.lineTo(cp[0], cp[1]);
    } else if (op === OPS.curveTo) {
      const c1: [number, number] = [a[0], a[1]];
      const c2: [number, number] = [a[2], a[3]];
      cp = [a[4], a[5]];
      segs.push({ op: 'C', c1, c2, p: cp });
      path.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], cp[0], cp[1]);
    } else if (op === OPS.curveTo2) {
      // c1 = current point, then x2,y2,x3,y3
      const prev = cp;
      const c2: [number, number] = [a[0], a[1]];
      cp = [a[2], a[3]];
      segs.push({ op: 'C', c1: prev, c2, p: cp });
      path.bezierCurveTo(prev[0], prev[1], c2[0], c2[1], cp[0], cp[1]);
    } else if (op === OPS.curveTo3) {
      // x1,y1,x3,y3 — c2 coincides with the end point
      const c1: [number, number] = [a[0], a[1]];
      cp = [a[2], a[3]];
      segs.push({ op: 'C', c1, c2: cp, p: cp });
      path.bezierCurveTo(c1[0], c1[1], cp[0], cp[1], cp[0], cp[1]);
    } else if (op === OPS.closePath) {
      segs.push({ op: 'Z' });
      path.closePath();
      cp = subpathStart;
    } else if (op === OPS.rectangle) {
      const r = { x: a[0], y: a[1], w: a[2], h: a[3] };
      segs.push({ op: 'R', r });
      path.rect(r.x, r.y, r.w, r.h);
      cp = subpathStart = [r.x, r.y];
    }
  }

  return segs.length ? { segs, path } : null;
}

/** constructPath sub-op arg counts (same OPS enum values). */
const SUB_ARGS: Record<number, number> = {
  [OPS.moveTo]: 2,
  [OPS.lineTo]: 2,
  [OPS.curveTo]: 6,
  [OPS.curveTo2]: 4,
  [OPS.curveTo3]: 4,
  [OPS.closePath]: 0,
  [OPS.rectangle]: 4,
};

/** Skip degenerate boxes and artwork entirely outside the visible page. */
function passesBoxFilters(
  box: { x: number; y: number; width: number; height: number },
  filled: boolean,
  viewport: ViewportLike,
): boolean {
  if (box.width < MIN_DESIGN_PX || box.height < MIN_DESIGN_PX) return false;
  return (
    box.x < viewport.width &&
    box.y < viewport.height &&
    box.x + box.width > 0 &&
    box.y + box.height > 0
  );
}

/**
 * Extract vector objects (dividers, background rectangles, rules, shapes) from
 * a PDF page as designer components. Walks the page's operator list tracking
 * the CTM and graphics state, classifying each painted path:
 *   - single rectangle         → shape:rectangle
 *   - 2-point horizontal line  → shape:line (vertical → thin filled rect)
 *   - 4-bezier circle/ellipse  → shape:ellipse
 *   - anything else            → rasterized PNG image component
 *   - paintSolidColorImageMask → synthetic rectangle (how Word etc. draw rules)
 *
 * NEVER throws — any failure skips the shape (it remains visible in the ghost
 * background).
 *
 * @param page - PDF page proxy
 * @param viewport - design-space viewport (scale + y-flip + /Rotate applied)
 * @param pageIndex - 0-indexed page number
 * @param budget - remaining shape budget across the whole document
 * @returns Promise<ExtractedVector[]>
 */
export async function extractShapes(
  page: PDFPageProxy,
  viewport: ViewportLike,
  pageIndex: number,
  budget: number,
  issues?: ImportIssues,
): Promise<ExtractedVector[]> {
  let opList: { fnArray: number[]; argsArray: any[] };
  try {
    opList = await page.getOperatorList(); // cached by pdfjs — cheap second walk
  } catch (err) {
    issues?.add('vector extraction failed');
    console.warn(
      `PDF import: extractShapes getOperatorList failed (page ${pageIndex + 1}):`,
      (err as Error)?.message,
    );
    return [];
  }

  const { fnArray, argsArray } = opList;
  const out: ExtractedVector[] = [];
  const limit = Math.min(MAX_PER_PAGE, budget);

  let ctm: Matrix = [...IDENTITY] as Matrix;
  let gstate: GState = { ...INITIAL_GSTATE };
  const stack: Array<{ ctm: Matrix; gstate: GState }> = [];
  let current: CurrentPath | null = null;
  let pendingClip: boolean | null = null;
  let seq = 0;
  let complexCount = 0;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] ?? [];

    try {
      // --- transform / state stack ---
      if (fn === OPS.transform) {
        if (current) issues?.add('transforms within a path');
        ctm = mul(ctm, args as Matrix);
      } else if (fn === OPS.save || fn === OPS.paintFormXObjectBegin) {
        stack.push({ ctm: [...ctm] as Matrix, gstate: { ...gstate } });
        if (
          fn === OPS.paintFormXObjectBegin &&
          Array.isArray(args[0]) &&
          args[0].length === 6
        ) {
          ctm = mul(ctm, args[0] as Matrix);
        }
        if (fn === OPS.paintFormXObjectBegin && args[1]) {
          const [x1, y1, x2, y2] = args[1];
          const formPath = new Path2D();
          formPath.rect(x1, y1, x2 - x1, y2 - y1);
          const matrix = mul(viewport.transform as Matrix, ctm);
          gstate.clips = [
            ...gstate.clips,
            {
              path: formPath.transform(toDOMMatrix(matrix)),
              evenOdd: false,
              rect: isAxisAligned(matrix),
            },
          ];
        }
      } else if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd) {
        const s = stack.pop();
        if (s) {
          ctm = s.ctm;
          gstate = s.gstate;
        }
      }
      // --- graphics state ---
      else if (fn === OPS.setLineWidth) {
        gstate.lineWidth = Number(args[0]);
      } else if (fn === OPS.setLineCap) {
        gstate.lineCap = args[0];
      } else if (fn === OPS.setLineJoin) {
        gstate.lineJoin = args[0];
      } else if (fn === OPS.setMiterLimit) {
        gstate.miterLimit = args[0];
      } else if (fn === OPS.setDash) {
        gstate.dashOffset = args[1] ?? 0;
        gstate.dash =
          Array.isArray(args[0]) && args[0].length
            ? (args[0] as number[])
            : null;
      } else if (fn === OPS.setGState) {
        for (const [key, value] of args[0] ?? []) {
          if (key === 'LW') gstate.lineWidth = Number(value);
          else if (key === 'LC') gstate.lineCap = value;
          else if (key === 'LJ') gstate.lineJoin = value;
          else if (key === 'ML') gstate.miterLimit = value;
          else if (key === 'D')
            gstate.dash =
              Array.isArray(value?.[0]) && value[0].length ? value[0] : null;
          else if (key === 'ca') gstate.fillAlpha = Number(value);
          else if (key === 'CA') gstate.strokeAlpha = Number(value);
          else if (key === 'SMask' && value) issues?.add('soft masks');
          else if (
            key === 'BM' &&
            value !== 'source-over' &&
            value !== 'Normal'
          )
            issues?.add('blend modes');
          if (key === 'D') gstate.dashOffset = value?.[1] ?? 0;
        }
      }
      // --- colors ---
      else if (fn === OPS.setFillRGBColor) gstate.fill = rgbArgsHex(args);
      else if (fn === OPS.setStrokeRGBColor) gstate.stroke = rgbArgsHex(args);
      else if (fn === OPS.setFillGray)
        gstate.fill = grayHex(Number(args[0]) || 0);
      else if (fn === OPS.setStrokeGray)
        gstate.stroke = grayHex(Number(args[0]) || 0);
      else if (fn === OPS.setFillCMYKColor)
        gstate.fill = cmykHex(args[0], args[1], args[2], args[3]);
      else if (fn === OPS.setStrokeCMYKColor)
        gstate.stroke = cmykHex(args[0], args[1], args[2], args[3]);
      else if (fn === OPS.setFillColor) gstate.fill = componentsHex(args);
      else if (fn === OPS.setStrokeColor) gstate.stroke = componentsHex(args);
      else if (fn === OPS.setFillColorN || fn === OPS.setStrokeColorN) {
        if (fn === OPS.setFillColorN) gstate.fill = null;
        else gstate.stroke = null;
        issues?.add('pattern fills');
      } else if (fn === OPS.shadingFill) {
        issues?.add('gradient fills');
      } else if (fn === OPS.beginGroup) {
        issues?.add('transparency groups');
      } else if (fn === OPS.beginMarkedContentProps && args[0] === 'OC') {
        issues?.add('optional content layers');
      }
      // --- path construction ---
      else if (fn === OPS.constructPath) {
        const next = decodeConstructPath(args);
        if (current && next) {
          current.segs.push(...next.segs);
          current.path.addPath(next.path);
        } else current = next;
      } else if (fn === OPS.clip || fn === OPS.eoClip) {
        pendingClip = fn === OPS.eoClip;
      }
      // --- path paints ---
      else if (
        fn === OPS.fill ||
        fn === OPS.eoFill ||
        fn === OPS.stroke ||
        fn === OPS.closeStroke ||
        fn === OPS.fillStroke ||
        fn === OPS.eoFillStroke ||
        fn === OPS.closeFillStroke ||
        fn === OPS.closeEOFillStroke
      ) {
        if (current && out.length < limit) {
          if (
            fn === OPS.closeStroke ||
            fn === OPS.closeFillStroke ||
            fn === OPS.closeEOFillStroke
          ) {
            current.path.closePath();
            current.segs.push({ op: 'Z' });
          }
          const mode: PaintMode = {
            fill:
              fn === OPS.fill ||
              fn === OPS.eoFill ||
              fn === OPS.fillStroke ||
              fn === OPS.eoFillStroke ||
              fn === OPS.closeFillStroke ||
              fn === OPS.closeEOFillStroke,
            stroke:
              fn === OPS.stroke ||
              fn === OPS.closeStroke ||
              fn === OPS.fillStroke ||
              fn === OPS.eoFillStroke ||
              fn === OPS.closeFillStroke ||
              fn === OPS.closeEOFillStroke,
            evenOdd:
              fn === OPS.eoFill ||
              fn === OPS.eoFillStroke ||
              fn === OPS.closeEOFillStroke,
          };
          const comps = paintToComponent(
            current,
            mode,
            ctm,
            gstate,
            viewport,
            () => ++complexCount <= MAX_COMPLEX_PER_PAGE,
            issues,
          );
          for (const comp of comps ?? []) {
            if (out.length >= limit) {
              issues?.add('vector complexity limit');
              console.warn(
                `PDF import: capped shapes at ${limit} (page ${pageIndex + 1})`,
              );
              break;
            }
            out.push({
              ...comp,
              id:
                comp.kind === 'image'
                  ? `vec_${pageIndex}_${seq++}`
                  : `shp_${pageIndex}_${seq++}`,
              page: pageIndex,
              paintOrder: i,
            });
          }
        } else if (current) {
          issues?.add('vector complexity limit');
        }
        if (pendingClip !== null && current) {
          gstate.clips = [
            ...gstate.clips,
            {
              path: new Path2D(current.path).transform(
                toDOMMatrix(mul(viewport.transform as Matrix, ctm)),
              ),
              evenOdd: pendingClip,
              rect:
                !!(singleRect(current.segs) ?? polylineRect(current.segs)) &&
                isAxisAligned(mul(viewport.transform as Matrix, ctm)),
            },
          ];
        }
        pendingClip = null;
        current = null;
      } else if (fn === OPS.endPath) {
        if (pendingClip !== null && current) {
          gstate.clips = [
            ...gstate.clips,
            {
              path: new Path2D(current.path).transform(
                toDOMMatrix(mul(viewport.transform as Matrix, ctm)),
              ),
              evenOdd: pendingClip,
              rect:
                !!(singleRect(current.segs) ?? polylineRect(current.segs)) &&
                isAxisAligned(mul(viewport.transform as Matrix, ctm)),
            },
          ];
        }
        pendingClip = null;
        current = null;
      }
      // Solid masks are simple filled rectangles.
      else if (fn === OPS.paintSolidColorImageMask) {
        // Solid mask over the unit square under the CTM — a filled rect in the
        // current fill color (Word and friends draw rules this way).
        if (
          out.length < limit &&
          gstate.fill &&
          gstate.fillAlpha >= MIN_ALPHA
        ) {
          const designM = mul(viewport.transform as Matrix, ctm);
          if (isAxisAligned(designM)) {
            const box = bboxOf([
              apply([0, 0], designM),
              apply([1, 1], designM),
            ]);
            if (passesBoxFilters(box, true, viewport)) {
              out.push({
                id: `shp_${pageIndex}_${seq++}`,
                kind: 'shape',
                ...box,
                rotation: 0,
                page: pageIndex,
                paintOrder: i,
                shape: 'rectangle',
                fill: gstate.fill,
                stroke: 'transparent',
                strokeWidth: 0,
                radius: 0,
              });
            }
          }
        }
      }
    } catch (err) {
      issues?.add('vector extraction failed');
      console.warn(
        `PDF import: shape op failed (page ${pageIndex + 1}):`,
        (err as Error)?.message,
      );
    }
  }

  return out;
}

/** ShapeSpec → shape component payload, resolving painted colors per spec
 * flags (single-contour and decomposed contours share this exactly). */
function shapeSpecToComponent(
  spec: ShapeSpec,
  fillPainted: boolean,
  strokePainted: boolean,
  gstate: GState,
  swPx: number,
): NewVector {
  return {
    kind: 'shape',
    ...spec.box,
    rotation: 0,
    shape: spec.shape,
    fill: spec.fillFromStroke
      ? strokePainted && gstate.stroke
        ? gstate.stroke
        : 'transparent'
      : fillPainted && gstate.fill
        ? gstate.fill
        : 'transparent',
    stroke:
      strokePainted && gstate.stroke && !spec.fillFromStroke
        ? gstate.stroke
        : 'transparent',
    strokeWidth: strokePainted && !spec.fillFromStroke ? swPx : 0,
    radius: 0,
  };
}

/** Build components from a painted path: classify first (single contour, then
 * multi-contour decomposition for table grids), rasterize on miss. Returns one
 * component per decomposed sub-shape. */
function paintToComponent(
  path: CurrentPath,
  mode: PaintMode,
  ctm: Matrix,
  gstate: GState,
  viewport: ViewportLike,
  allowComplex: () => boolean,
  issues?: ImportIssues,
): NewVector[] | null {
  // Resolve painted modes against tracked colors/alphas.
  const fillPainted =
    mode.fill && !!gstate.fill && gstate.fillAlpha >= MIN_ALPHA;
  const strokePainted =
    mode.stroke && !!gstate.stroke && gstate.strokeAlpha >= MIN_ALPHA;
  if (!fillPainted && !strokePainted) return null;

  const designM = mul(viewport.transform as Matrix, ctm);
  const scale = matrixScale(designM);
  const swPx = gstate.lineWidth === 0 ? 1 : Math.abs(gstate.lineWidth * scale);

  const uniformStroke =
    !strokePainted ||
    Math.abs(
      Math.hypot(designM[0], designM[1]) - Math.hypot(designM[2], designM[3]),
    ) < 0.001;
  // A single straight segment has no joins. mPDF uses projecting square caps
  // for table rules, whose exact footprint is a longer ordinary line/bar.
  const straightSegment =
    strokePainted &&
    !fillPainted &&
    !path.segs.some((seg) => seg.op === 'Z') &&
    singleLine(path.segs);
  const nativePaint =
    uniformStroke &&
    !gstate.dash?.length &&
    gstate.fillAlpha === 1 &&
    gstate.strokeAlpha === 1 &&
    (gstate.lineCap === 0 || (gstate.lineCap === 2 && !!straightSegment)) &&
    (gstate.lineJoin === 0 || !!straightSegment);
  const single = nativePaint
    ? classifyShape(path.segs, strokePainted, designM, swPx)
    : null;
  const specs = single
    ? [single]
    : nativePaint && !fillPainted
      ? classifyContours(path.segs, strokePainted, designM, swPx)
      : null;
  if (specs && straightSegment && gstate.lineCap === 2) {
    for (const spec of specs) {
      if (spec.shape === 'line') {
        spec.box.x -= swPx / 2;
        spec.box.width += swPx;
      } else if (spec.fillFromStroke) {
        spec.box.y -= swPx / 2;
        spec.box.height += swPx;
      }
    }
  }
  // Filled compound paths may have holes or overlapping contours. Keep their
  // winding rule intact instead of turning every contour into a filled box.
  const unclipped = specs?.every((spec) =>
    gstate.clips.every((clip) => {
      const b = clip.path.computeTightBounds();
      // Only bypass rectangular clips proven to contain the entire shape.
      return (
        clip.rect &&
        boxWithinClipBounds(spec.box, [b[0], b[1], b[2], b[3]])
      );
    }),
  );
  if (specs && unclipped) {
    const comps: NewVector[] = [];
    for (const spec of specs) {
      // Each decomposed box is filtered individually — sub-pixel debris from a
      // big path must not survive just because the path as a whole was large.
      if (!passesBoxFilters(spec.box, fillPainted, viewport)) continue;
      comps.push(
        shapeSpecToComponent(spec, fillPainted, strokePainted, gstate, swPx),
      );
    }
    return comps.length ? comps : null;
  }

  if (!allowComplex()) {
    issues?.add('vector complexity limit');
    return null;
  }
  const raster = rasterizeComplexPath(
    path,
    { fill: fillPainted, stroke: strokePainted, evenOdd: mode.evenOdd },
    designM,
    gstate,
  );
  if (!raster) issues?.add('unsupported vector artwork');
  return raster ? [raster] : null;
}
