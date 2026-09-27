import type { CanvasComponent } from './types';

export type ComponentsAction =
  | { type: 'add'; component: CanvasComponent }
  | { type: 'update'; id: string; patch: Partial<CanvasComponent> }
  | { type: 'updateMany'; ids: string[]; patch: Partial<CanvasComponent> }
  | { type: 'delete'; id: string }
  | { type: 'duplicate'; component: CanvasComponent }
  | { type: 'layer'; id: string; dir: -1 | 1 }
  | { type: 'deletePage'; page: number }
  | { type: 'replace'; components: CanvasComponent[] };

/** Pure reducer over the components array (array order = paint/z order). */
export function componentsReducer(state: CanvasComponent[], action: ComponentsAction): CanvasComponent[] {
  switch (action.type) {
    case 'add':
      return [...state, action.component];
    case 'update':
      return state.map((c) => (c.id === action.id ? ({ ...c, ...action.patch } as CanvasComponent) : c));
    case 'updateMany': {
      const ids = new Set(action.ids);
      return state.map((c) => (ids.has(c.id) ? ({ ...c, ...action.patch } as CanvasComponent) : c));
    }
    case 'delete':
      return state.filter((c) => c.id !== action.id);
    case 'duplicate':
      return [...state, action.component];
    case 'layer': {
      const i = state.findIndex((c) => c.id === action.id);
      if (i < 0) return state;
      const j = Math.max(0, Math.min(state.length - 1, i + action.dir));
      if (i === j) return state;
      const next = [...state];
      const [item] = next.splice(i, 1);
      next.splice(j, 0, item);
      return next;
    }
    case 'deletePage':
      return state
        .filter((c) => c.page !== action.page)
        .map((c) => (c.page > action.page ? ({ ...c, page: c.page - 1 } as CanvasComponent) : c));
    case 'replace':
      return action.components;
    default:
      return state;
  }
}
