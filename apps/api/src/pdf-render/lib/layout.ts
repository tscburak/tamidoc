/**
 * Layout engine — clean port of
 * `apps/web/src/components/designer/layout.ts` + `bboxOf` from
 * `apps/web/src/components/designer/coordinates.ts`. The debug `console.log`s
 * from the frontend original are dropped; the math is identical so repeating
 * groups reflow and wrap across pages the same way as the live fill preview.
 */
import type {
  RenderBox,
  RenderComponent,
  RenderGroup,
  RenderCanvasSize,
} from './types';

/** Default gap between repeated instances, in design px. */
export const STACK_GAP = 16;

/** Tight bounding box around one or more boxes (design px). Degenerate
 * `{0,0,0,0}` for an empty list. */
export function bboxOf(boxes: RenderBox[]): RenderBox {
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

export interface StackedLayoutItem {
  id: string;
  x: number;
  y: number;
  instanceIndex?: number;
  groupId?: string;
}

type Axis = 'x' | 'y';

interface Expansion {
  id: string;
  bbox: RenderBox;
  axis: Axis;
  extra: number;
  itemsAlong: number;
  direction: 'row' | 'column';
  members: RenderComponent[];
}

/**
 * Compute the laid-out position of every renderable element for a filled /
 * previewed document. Repeating groups fill a page then flow onto the next.
 * See the frontend `layoutStacked` for the full axis/wrap semantics.
 */
export function layoutStacked(args: {
  components: RenderComponent[];
  groups: RenderGroup[];
  counts?: Record<string, number>;
  gap?: number;
  canvasSize?: RenderCanvasSize;
}): StackedLayoutItem[] {
  const { components, groups, counts = {}, gap = STACK_GAP, canvasSize } = args;

  if (!components || components.length === 0) return [];

  const pageW = canvasSize?.width ?? Infinity;
  const pageH = canvasSize?.height ?? Infinity;
  const byId = new Map(components.map((c) => [c.id, c]));

  const expansions: Expansion[] = groups
    .filter((g) => g.repeating && g.memberIds.length > 0)
    .map((group) => {
      const members = group.memberIds
        .map((id) => byId.get(id))
        .filter((c): c is RenderComponent => !!c);
      if (members.length === 0) return null;

      const bbox = bboxOf(members);
      const count = Math.max(1, counts[group.id] ?? 1);
      const isCol = group.direction === 'column';

      const bound = isCol ? pageH : pageW;
      const start = isCol ? bbox.y : bbox.x;
      const span = isCol ? bbox.height : bbox.width;
      const perpSpan = isCol ? bbox.width : bbox.height;
      const axis: Axis = isCol ? 'x' : 'y';

      if (
        !Number.isFinite(bound) ||
        !Number.isFinite(start) ||
        !Number.isFinite(span) ||
        !Number.isFinite(perpSpan) ||
        span <= 0 ||
        perpSpan <= 0
      ) {
        return null;
      }

      const itemsAlong = Math.max(
        1,
        Math.min(count, Math.floor((bound - start + gap) / (span + gap))),
      );
      const lines = Math.max(1, Math.ceil(count / itemsAlong));
      const extra = (lines - 1) * (perpSpan + gap);

      return {
        id: group.id,
        bbox,
        axis,
        extra,
        itemsAlong,
        direction: group.direction,
        members,
      };
    })
    .filter((e): e is Expansion => e !== null);

  const memberExp = new Map<string, Expansion>();
  for (const e of expansions) for (const m of e.members) memberExp.set(m.id, e);

  const dyAt = (y: number, excludeId?: string) => {
    let s = 0;
    for (const e of expansions) {
      if (e.axis !== 'y' || e.id === excludeId) continue;
      if (e.bbox.y <= y) s += e.extra;
    }
    return s;
  };
  const dxAt = (x: number, excludeId?: string) => {
    let s = 0;
    for (const e of expansions) {
      if (e.axis !== 'x' || e.id === excludeId) continue;
      if (e.bbox.x <= x) s += e.extra;
    }
    return s;
  };

  const instancesPerPage = (expansion: Expansion): number => {
    const isCol = expansion.direction === 'column';
    const bound = isCol ? pageH : pageW;
    const start = isCol ? expansion.bbox.y : expansion.bbox.x;
    const span = isCol ? expansion.bbox.height : expansion.bbox.width;
    const availableSpace = bound - start - gap;
    if (span <= 0 || availableSpace <= 0) return 1;
    return Math.max(1, Math.floor(availableSpace / (span + gap)));
  };

  const out: StackedLayoutItem[] = [];
  const countOf = (id: string) => Math.max(1, counts[id] ?? 1);

  for (const c of components) {
    const e = memberExp.get(c.id);
    if (!e) {
      const pageOffsetY = canvasSize ? (c.page ?? 0) * pageH : 0;
      out.push({
        id: c.id,
        x: c.x + dxAt(c.x),
        y: c.y + dyAt(c.y) + pageOffsetY,
      });
      continue;
    }
    const count = countOf(e.id);
    const colW = e.bbox.width + gap;
    const rowH = e.bbox.height + gap;
    if (colW <= 0 || rowH <= 0) continue;

    for (let i = 0; i < count; i++) {
      const itemsPerPage = instancesPerPage(e);
      const pageIndex = Math.floor(i / itemsPerPage);
      const instanceIndexInPage = i % itemsPerPage;

      let x: number;
      let y: number;

      if (e.axis === 'x') {
        const row = instanceIndexInPage % e.itemsAlong;
        const col = Math.floor(instanceIndexInPage / e.itemsAlong);
        const xInPage = c.x + col * colW;
        const yInPage = c.y + row * rowH;
        x = xInPage + dxAt(c.x, e.id) + pageIndex * pageW;
        y = yInPage + dyAt(c.y);
      } else {
        const col = instanceIndexInPage % e.itemsAlong;
        const row = Math.floor(instanceIndexInPage / e.itemsAlong);
        const xInPage = c.x + col * colW;
        const yInPage = c.y + row * rowH;
        x = xInPage + dxAt(c.x);
        y = yInPage + dyAt(e.bbox.y, e.id) + pageIndex * pageH;
      }

      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const pageOffsetY = canvasSize ? (c.page ?? 0) * pageH : 0;
      out.push({
        id: c.id,
        groupId: e.id,
        instanceIndex: i,
        x,
        y: y + pageOffsetY,
      });
    }
  }

  return out;
}
