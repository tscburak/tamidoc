import { insetTextCorners, TEXT_CLIP_EPS } from './pdf-parser';

describe('insetTextCorners', () => {
  it('insets wide-run corners by the clip epsilon', () => {
    const corners = insetTextCorners(5.184570312, 0.92822265625, 0.23583984375);
    expect(corners).toHaveLength(4);
    // A 0.02pt overflow past an exactly-fitting clip (react-pdf rounding on
    // tamidoc exports) lands inside the inset probes: no "clipped text".
    expect(corners[1][0]).toBeCloseTo(5.184570312 - TEXT_CLIP_EPS, 10);
    expect(corners[0]).toEqual([TEXT_CLIP_EPS, 0.92822265625 - TEXT_CLIP_EPS]);
  });

  it('clamps to the midpoint for narrow runs instead of crossing over', () => {
    const corners = insetTextCorners(0.4, 0.9, 0.2);
    for (const [x] of corners) expect(x).toBeCloseTo(0.2, 10);
    expect(corners[0][1]).toBeGreaterThan(corners[2][1]);
  });

  it('keeps a 1pt overflow outside the probes (genuine clipping still flags)', () => {
    const corners = insetTextCorners(10, 1, 0.2);
    // Probes sit 0.5pt inside each edge; text extending 1pt past the clip
    // still falls outside them.
    expect(corners[1][0]).toBeCloseTo(9.5, 10);
  });
});
