import { bboxOf } from './coordinates';
import type { CanvasSize } from './coordinates';
import type { Box, CanvasComponent, ComponentGroup, GroupDirection } from './types';

/** Default gap between repeated instances, in design px. */
export const STACK_GAP = 16;

/** Bounding box (band) occupied by a group's members in the base layout. */
export function groupBbox(members: CanvasComponent[]): Box {
  return bboxOf(members);
}

export interface StackedLayoutItem {
  /** Component id being rendered. */
  id: string;
  /** Final position (design px). */
  x: number;
  y: number;
  /** For group members: which instance (0-based) this is. `undefined` for
   * non-group components. Lets the renderer key duplicates and resolve
   * instance-scoped field values. */
  instanceIndex?: number;
  /** The group this item belongs to (members only). */
  groupId?: string;
}

type Axis = 'x' | 'y';

interface Expansion {
  id: string;
  bbox: Box;
  /** Axis along which this group overflows (and pushes neighbors). */
  axis: Axis;
  /** How much the group grows beyond its base band along its overflow axis. */
  extra: number;
  /** Items per line (per column for `column`, per row for `row`). */
  itemsAlong: number;
  direction: GroupDirection;
  members: CanvasComponent[];
}

/**
 * Compute the laid-out position of every renderable element for a filled /
 * previewed document. Repeating groups always wrap to fill the page, then flow
 * onto the next page:
 *
 * | direction | fills…               | wraps to…   | overflows / pushes |
 * |-----------|----------------------|-------------|--------------------|
 * | column    | top→bottom (height)  | new column  | right (X)          |
 * | row       | left→right (width)   | new row     | down (Y)           |
 *
 * When a page is full (all columns/rows placed) the rest continues on the next
 * page — the caller tiles this single (possibly larger-than-page) canvas into
 * page-sized pages.
 *
 * The two axes are independent: a component below a Y-overflowing group *and*
 * right of an X-overflowing group gets pushed both ways. Authoring rule: don't
 * overlap groups along their overflow axis, anything that should repeat must be
 * a member, and keep fixed content above/around a group (groups reflow
 * neighbors along one axis only).
 *
 * @param counts  group id → number of instances to render (defaults to 1).
 * @param canvasSize page bounds used for wrapping (omit → single strip).
 */
export function layoutStacked(args: {
  components: CanvasComponent[];
  groups: ComponentGroup[];
  counts?: Record<string, number>;
  gap?: number;
  canvasSize?: CanvasSize;
}): StackedLayoutItem[] {
  const { components, groups, counts = {}, gap = STACK_GAP, canvasSize } = args;

  // Defensive check for invalid inputs
  if (!components || components.length === 0) {
    console.warn('[layoutStacked] No components provided, returning empty array');
    return [];
  }

  if (!canvasSize || canvasSize.width <= 0 || canvasSize.height <= 0) {
    console.warn('[layoutStacked] Invalid canvas size:', canvasSize);
  }

  const pageW = canvasSize?.width ?? Infinity;
  const pageH = canvasSize?.height ?? Infinity;
  const byId = new Map(components.map((c) => [c.id, c]));

  console.log('[layoutStacked] Input:', {
    componentsCount: components.length,
    groupsCount: groups.length,
    counts,
    canvasSize: canvasSize
  });
  console.log('[layoutStacked] Component IDs:', Array.from(byId.keys()));
  console.log('[layoutStacked] Groups:', groups.map(g => ({
    id: g.id,
    name: g.name,
    repeating: g.repeating,
    memberIds: g.memberIds,
    memberIdsCount: g.memberIds.length
  })));

  const expansions: Expansion[] = groups
    .filter((g) => g.repeating && g.memberIds.length > 0)
    .map((group) => {
      console.log(`[layoutStacked] DEBUG: Starting to process group ${group.name}`);
      const members = group.memberIds.map((id) => byId.get(id)).filter((c): c is CanvasComponent => !!c);
      console.log(`[layoutStacked] Processing group ${group.name}:`, {
        memberIds: group.memberIds,
        foundMembers: members.length,
        missingIds: group.memberIds.filter(id => !byId.has(id)),
        memberDetails: members.map(m => ({ id: m?.id, x: m?.x, y: m?.y, width: m?.width, height: m?.height }))
      });

      // Skip groups with no valid members
      if (members.length === 0) {
        console.warn(`[layoutStacked] Skipping group "${group.name}" - no valid members found`);
        return null;
      }

      const bbox = groupBbox(members);
      console.log(`[layoutStacked] Group "${group.name}" bbox:`, {
        bbox,
        membersCount: members.length,
        firstMember: members[0] ? { id: members[0].id, x: members[0].x, y: members[0].y, width: members[0].width, height: members[0].height } : null
      });

      const count = Math.max(1, counts[group.id] ?? 1);
      const isCol = group.direction === 'column';

      // Column fills page HEIGHT then opens a new column (overflows X).
      // Row fills page WIDTH then opens a new row (overflows Y).
      const bound = isCol ? pageH : pageW;
      const start = isCol ? bbox.y : bbox.x; // FIXED: Use y/x instead of top/left
      const span = isCol ? bbox.height : bbox.width;
      const perpSpan = isCol ? bbox.width : bbox.height;
      const axis: Axis = isCol ? 'x' : 'y';

      console.log(`[layoutStacked] Group "${group.name}" calculations:`, {
        bound,
        start,
        span,
        perpSpan,
        gap,
        count,
        isCol,
        axis,
        bbox
      });

      // Defensive checks to prevent NaN in overflow calculations
      if (!Number.isFinite(bound) || !Number.isFinite(start) || !Number.isFinite(span) || !Number.isFinite(perpSpan)) {
        console.error(`[layoutStacked] Invalid overflow calculation values for group "${group.name}":`, {
          bound,
          start,
          span,
          perpSpan,
          bbox
        });
        return null;
      }

      if (span <= 0 || perpSpan <= 0) {
        console.error(`[layoutStacked] Invalid span values for group "${group.name}":`, {
          span,
          perpSpan,
          bbox
        });
        return null;
      }

      const itemsAlong = Math.max(1, Math.min(count, Math.floor((bound - start + gap) / (span + gap))));
      const lines = Math.max(1, Math.ceil(count / itemsAlong));
      const extra = (lines - 1) * (perpSpan + gap);

      console.log(`[layoutStacked] Group "${group.name}" layout:`, {
        itemsAlong,
        lines,
        extra,
        calculationCheck: {
          boundMinusStart: bound - start,
          dividedBySpanPlusGap: (bound - start + gap) / (span + gap),
          flooredValue: Math.floor((bound - start + gap) / (span + gap))
        }
      });

      return { id: group.id, bbox, axis, extra, itemsAlong, direction: group.direction, members };
    })
    .filter((e): e is Expansion => e !== null);

  const memberExp = new Map<string, Expansion>();
  for (const e of expansions) for (const m of e.members) memberExp.set(m.id, e);

  /** Downward shift at Y from Y-overflowing groups whose top is at/above y. */
  const dyAt = (y: number, excludeId?: string) => {
    let s = 0;
    for (const e of expansions) {
      if (e.axis !== 'y' || e.id === excludeId) continue;
      if (e.bbox.y <= y) s += e.extra; // FIXED: Use y instead of top
    }
    return s;
  };
  /** Rightward shift at X from X-overflowing groups whose left is at/left of x. */
  const dxAt = (x: number, excludeId?: string) => {
    let s = 0;
    for (const e of expansions) {
      if (e.axis !== 'x' || e.id === excludeId) continue;
      if (e.bbox.x <= x) s += e.extra; // FIXED: Use x instead of left
    }
    return s;
  };

  /** How many instances of a group fit on one page. */
  const instancesPerPage = (expansion: Expansion): number => {
    const isCol = expansion.direction === 'column';
    const bound = isCol ? pageH : pageW;
    const start = isCol ? expansion.bbox.y : expansion.bbox.x;
    const span = isCol ? expansion.bbox.height : expansion.bbox.width;
    const availableSpace = bound - start - gap;

    if (span <= 0 || availableSpace <= 0) return 1;
    const itemsPerPage = Math.max(1, Math.floor(availableSpace / (span + gap)));

    console.log(`[layoutStacked] Instances per page for group ${expansion.id}:`, {
      direction: expansion.direction,
      availableSpace,
      span,
      gap,
      itemsPerPage
    });
    return itemsPerPage;
  };

  const out: StackedLayoutItem[] = [];
  const countOf = (id: string) => Math.max(1, counts[id] ?? 1);

  console.log(`[layoutStacked] DEBUG: Starting to process ${components.length} components`);
  console.log(`[layoutStacked] DEBUG: memberExp map has ${memberExp.size} entries`);

  for (const c of components) {
    const e = memberExp.get(c.id);
    if (!e) {
      const pageOffsetY = canvasSize ? (c.page ?? 0) * pageH : 0;
      out.push({ id: c.id, x: c.x + dxAt(c.x), y: c.y + dyAt(c.y) + pageOffsetY });
      continue;
    }
    const count = countOf(e.id);
    const colW = e.bbox.width + gap;
    const rowH = e.bbox.height + gap;

    console.log(`[layoutStacked] Processing component ${c.id} in group ${e.id}:`, {
      componentOriginal: { x: c.x, y: c.y, width: c.width, height: c.height },
      expansionBbox: e.bbox,
      colW,
      rowH,
      count,
      expansionExtra: e.extra,
      expansionAxis: e.axis
    });

    // Defensive checks for positioning calculations
    if (!Number.isFinite(colW) || !Number.isFinite(rowH) || colW <= 0 || rowH <= 0) {
      console.error(`[layoutStacked] Invalid colW/rowH for component ${c.id}:`, {
        colW,
        rowH,
        bboxWidth: e.bbox.width,
        bboxHeight: e.bbox.height,
        gap
      });
      continue; // Skip this component
    }

    for (let i = 0; i < count; i++) {
      let x: number;
      let y: number;

      // Calculate which page this instance belongs to
      const itemsPerPage = instancesPerPage(e);
      const pageIndex = Math.floor(i / itemsPerPage);
      const instanceIndexInPage = i % itemsPerPage;

      console.log(`[layoutStacked] Component ${c.id}, instance ${i}:`, {
        totalInstances: count,
        instanceIndex: i,
        itemsPerPage,
        pageIndex,
        instanceIndexInPage
      });

      if (e.axis === 'x') {
        // column: fill top→bottom, then a new column to the right (col-major)
        const row = instanceIndexInPage % e.itemsAlong;
        const col = Math.floor(instanceIndexInPage / e.itemsAlong);

        // Position within the page (reset to page origin)
        const xInPage = c.x + col * colW;
        const yInPage = c.y + row * rowH;

        // Add page offset
        const dxAtVal = dxAt(c.x, e.id); // FIXED: Use x instead of left
        const dyAtVal = dyAt(c.y);

        // Calculate page offset
        const pageOffsetX = pageIndex * pageW;
        const pageOffsetY = 0; // Column direction: pages stack horizontally, so no Y offset

        x = xInPage + dxAtVal + pageOffsetX;
        y = yInPage + dyAtVal + pageOffsetY;

        console.log(`[layoutStacked] Column layout for component ${c.id}, instance ${i}:`, {
          row, col,
          xInPage, yInPage,
          pageOffset: { x: pageOffsetX, y: pageOffsetY },
          calculatedPos: { x, y },
          validation: {
            isFiniteX: Number.isFinite(x),
            isFiniteY: Number.isFinite(y)
          }
        });
      } else {
        // row: fill left→right, then a new row below (row-major)
        const col = instanceIndexInPage % e.itemsAlong;
        const row = Math.floor(instanceIndexInPage / e.itemsAlong);

        // Position within the page (reset to page origin)
        const xInPage = c.x + col * colW;
        const yInPage = c.y + row * rowH;

        // Add page offset
        const dxAtVal = dxAt(c.x);
        const dyAtVal = dyAt(e.bbox.y, e.id); // FIXED: Use y instead of top

        // Calculate page offset
        const pageOffsetX = 0; // Row direction: pages stack vertically, so no X offset
        const pageOffsetY = pageIndex * pageH;

        x = xInPage + dxAtVal + pageOffsetX;
        y = yInPage + dyAtVal + pageOffsetY;

        console.log(`[layoutStacked] Row layout for component ${c.id}, instance ${i}:`, {
          row, col,
          xInPage, yInPage,
          pageOffset: { x: pageOffsetX, y: pageOffsetY },
          calculatedPos: { x, y },
          validation: {
            isFiniteX: Number.isFinite(x),
            isFiniteY: Number.isFinite(y)
          }
        });
      }

      // Final validation before adding to output
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        console.error(`[layoutStacked] Generated NaN coordinates for component ${c.id}, instance ${i}:`, {
          x,
          y,
          component: c,
          expansion: e
        });
        continue; // Skip this invalid item
      }

      const pageOffsetY = canvasSize ? (c.page ?? 0) * pageH : 0;
      out.push({ id: c.id, groupId: e.id, instanceIndex: i, x, y: y + pageOffsetY });
    }
  }

  // Defensive check: ensure we have at least some output
  if (out.length === 0 && components.length > 0) {
    console.error('[layoutStacked] No items generated despite having components!', {
      componentsCount: components.length,
      expansionsCount: expansions.length,
      groupsCount: groups.length
    });
  }

  console.log('[layoutStacked] Output items:', {
    totalCount: out.length,
    groupMembers: out.filter(item => item.groupId).length,
    nonGroupItems: out.filter(item => !item.groupId).length,
  });
  console.log('[layoutStacked] Items details:', out.map(item => ({
    id: item.id,
    groupId: item.groupId,
    instanceIndex: item.instanceIndex,
    x: item.x,
    y: item.y
  })));

  return out;
}
