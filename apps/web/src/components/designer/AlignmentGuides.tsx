import type { Guides } from '../../hooks/useSnap';
import type { CanvasSize } from './coordinates';

/**
 * Smart alignment guide lines. Rendered *inside* the scaled paper wrapper, so
 * coordinates are design-space px and no zoom conversion is needed.
 */
export function AlignmentGuides({ guides, canvasSize }: { guides: Guides; canvasSize: CanvasSize }) {
  return (
    <>
      {guides.vertical.map((x, i) => (
        <div
          key={`v${i}`}
          className="pointer-events-none absolute bg-orange-500/70"
          style={{ left: x, top: 0, width: 1, height: canvasSize.height }}
        />
      ))}
      {guides.horizontal.map((y, i) => (
        <div
          key={`h${i}`}
          className="pointer-events-none absolute bg-orange-500/70"
          style={{ top: y, left: 0, height: 1, width: canvasSize.width }}
        />
      ))}
    </>
  );
}
