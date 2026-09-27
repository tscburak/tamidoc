import {
  boxWithinClipBounds,
  classifyContours,
  classifyShape,
  CLIP_CONTAIN_EPS_PX,
  splitContours,
  MAX_CONTOURS_PER_PATH,
  type Seg,
} from './extract-shapes';
import { IDENTITY } from './pdf-matrix';

/** Rect segment. */
const R = (x: number, y: number, w: number, h: number): Seg => ({
  op: 'R',
  r: { x, y, w, h },
});

/** Closed 4-corner polyline rect contour (how generators emit borders as lines). */
const rectPolyline = (x: number, y: number, w: number, h: number): Seg[] => [
  { op: 'M', p: [x, y] },
  { op: 'L', p: [x + w, y] },
  { op: 'L', p: [x + w, y + h] },
  { op: 'L', p: [x, y + h] },
  { op: 'Z' },
];

/** Horizontal divider contour. */
const hLine = (x1: number, x2: number, y: number): Seg[] => [
  { op: 'M', p: [x1, y] },
  { op: 'L', p: [x2, y] },
];

describe('splitContours', () => {
  it('splits one rect per sub-path', () => {
    const contours = splitContours([
      R(0, 0, 10, 10),
      R(20, 0, 10, 10),
      R(40, 0, 10, 10),
    ]);
    expect(contours).toHaveLength(3);
  });

  it('splits closed polyline sub-paths', () => {
    const contours = splitContours([
      ...rectPolyline(0, 0, 10, 10),
      ...rectPolyline(20, 0, 10, 10),
    ]);
    expect(contours).toHaveLength(2);
    expect(contours[0][0].op).toBe('M');
    expect(contours[1][0].op).toBe('M');
  });

  it('keeps a single-contour path as one contour', () => {
    expect(splitContours(hLine(0, 100, 50))).toHaveLength(1);
    expect(splitContours(rectPolyline(0, 0, 10, 10))).toHaveLength(1);
  });

  it('starts a new contour at an R mid-polyline', () => {
    const contours = splitContours([
      { op: 'M', p: [0, 0] },
      { op: 'L', p: [5, 5] },
      R(10, 10, 2, 2),
      { op: 'L', p: [20, 20] },
    ]);
    expect(contours).toHaveLength(2);
    expect(contours[1][0].op).toBe('R');
    expect(contours[1]).toHaveLength(2); // the trailing L joins the R contour
  });
});

describe('classifyContours', () => {
  it('decomposes a multi-rect path into one rectangle spec per cell', () => {
    const segs = [
      R(0, 0, 50, 20),
      R(50, 0, 50, 20),
      R(0, 20, 50, 20),
      R(50, 20, 50, 20),
    ];
    const specs = classifyContours(segs, false, IDENTITY, 1);
    expect(specs).not.toBeNull();
    expect(specs).toHaveLength(4);
    expect(specs!.every((s) => s.shape === 'rectangle')).toBe(true);
    expect(specs![0].box).toEqual({ x: 0, y: 0, width: 50, height: 20 });
    expect(specs![3].box).toEqual({ x: 50, y: 20, width: 50, height: 20 });
  });

  it('decomposes a polyline-rect grid (borders emitted as line paths)', () => {
    const segs = [
      ...rectPolyline(0, 0, 80, 30),
      ...rectPolyline(80, 0, 80, 30),
      ...rectPolyline(0, 30, 80, 30),
    ];
    const specs = classifyContours(segs, true, IDENTITY, 2);
    expect(specs).toHaveLength(3);
    expect(specs!.every((s) => s.shape === 'rectangle')).toBe(true);
    // Stroke expansion: box grows by half the stroke on each side.
    expect(specs![0].box.x).toBeCloseTo(-1, 5);
    expect(specs![0].box.width).toBeCloseTo(82, 5);
  });

  it('dedupes coincident contours (fill+stroke of the same rect)', () => {
    const segs = [...rectPolyline(0, 0, 40, 20), R(0, 0, 40, 20)];
    const specs = classifyContours(segs, false, IDENTITY, 1);
    expect(specs).toHaveLength(1);
  });

  it('mixes rect and line sub-shapes in one path (table with dividers)', () => {
    const segs = [...rectPolyline(0, 0, 100, 40), ...hLine(0, 100, 20)];
    const specs = classifyContours(segs, true, IDENTITY, 2);
    expect(specs).toHaveLength(2);
    expect(specs!.map((s) => s.shape).sort()).toEqual(['line', 'rectangle']);
  });

  it('returns null when any contour is not a simple shape (all-or-nothing)', () => {
    const diagonal: Seg[] = [
      { op: 'M', p: [0, 0] },
      { op: 'L', p: [30, 30] },
    ];
    const specs = classifyContours(
      [...rectPolyline(0, 0, 50, 50), ...diagonal],
      true,
      IDENTITY,
      1,
    );
    expect(specs).toBeNull();
  });

  it('returns null beyond the contour cap', () => {
    const segs: Seg[] = [];
    for (let i = 0; i <= MAX_CONTOURS_PER_PATH; i++)
      segs.push(R(i * 10, 0, 5, 5));
    expect(classifyContours(segs, false, IDENTITY, 1)).toBeNull();
  });

  it('returns null for single-contour input (classifyShape owns that path)', () => {
    expect(
      classifyContours(rectPolyline(0, 0, 10, 10), false, IDENTITY, 1),
    ).toBeNull();
  });
});

describe('classifyShape (single contour)', () => {
  it('still classifies a lone rect', () => {
    const spec = classifyShape([R(0, 0, 10, 10)], false, IDENTITY, 1);
    expect(spec?.shape).toBe('rectangle');
    expect(spec?.box).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('still classifies a lone horizontal line', () => {
    const spec = classifyShape(hLine(0, 100, 50), true, IDENTITY, 2);
    expect(spec?.shape).toBe('line');
  });
});

describe('boxWithinClipBounds', () => {
  it('tolerates float slop from exactly-fitting clips (react-pdf exports)', () => {
    // Measured on a tamidoc export: the divider stroke box exceeds its own
    // View clip by ~4e-5px via different float paths (CTM math vs
    // Path2D.computeTightBounds). Strict comparison rasterized every divider
    // to an image, so reimport found 2 inputs instead of 20.
    const box = { x: 155.272008, y: 244.5093387, width: 588.896, height: 0.872 };
    const bounds: [number, number, number, number] = [
      155.272, 244.509, 744.168, 245.381,
    ];
    expect(boxWithinClipBounds(box, bounds)).toBe(true);
  });

  it('still rejects genuinely clipped artwork', () => {
    const box = { x: 0, y: 0, width: 100, height: 10 };
    expect(
      boxWithinClipBounds(box, [0, 0, 50, 10], CLIP_CONTAIN_EPS_PX),
    ).toBe(false);
    expect(boxWithinClipBounds(box, [0, 0, 100, 10])).toBe(true);
  });
});
