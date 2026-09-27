import { useState, type DragEvent, type ReactNode } from 'react';
import {
  IconEye,
  IconEyeOff,
  IconLock,
  IconLockOpen,
  IconChevronDown,
  IconChevronRight,
  IconStack2,
  IconGripVertical,
} from '@tabler/icons-react';
import { cn } from '../../lib/cn';
import { PALETTE_ICONS } from './ComponentPalette';
import type { CanvasComponent, ComponentGroup, ShapeComponent, ShapeKind } from './types';

export interface LayersPanelProps {
  /** All components (across pages); the panel shows the active page's slice. */
  components: CanvasComponent[];
  groups: ComponentGroup[];
  selectedIds: string[];
  selectedGroupId: string | null;
  activePage: number;
  onSelect: (id: string, additive: boolean) => void;
  onSelectGroup: (id: string) => void;
  /** New front-to-back order for the active page's components. */
  onReorder: (frontToBackIds: string[]) => void;
  onToggleHidden: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onToggleGroupHidden: (groupId: string) => void;
  onToggleGroupLocked: (groupId: string) => void;
}

type LayerNode =
  | { type: 'component'; component: CanvasComponent }
  | { type: 'group'; group: ComponentGroup };

/** A short, human label for a layer row: the first {{field}} if any, else a
 * trimmed preview of the text, else the kind name. */
function componentLabel(c: CanvasComponent): string {
  if (c.kind === 'text') {
    const m = c.content.match(/\{\{\s*([^}]+?)\s*\}\}/);
    if (m) return m[1];
    const t = c.content.replace(/\s+/g, ' ').trim();
    if (!t) return 'Text';
    return t.length > 22 ? `${t.slice(0, 22)}…` : t;
  }
  if (c.kind === 'image') {
    const f = c.field.trim();
    return f ? `{{${f}}}` : 'Image';
  }
  const map: Record<ShapeKind, string> = { rectangle: 'Rectangle', ellipse: 'Ellipse', line: 'Line' };
  return map[(c as ShapeComponent).shape as ShapeKind] ?? c.kind;
}

function KindIcon({ c, className }: { c: CanvasComponent; className?: string }) {
  const key = c.kind === 'shape' ? `shape:${c.shape}` : c.kind;
  const Icon = PALETTE_ICONS[key] ?? PALETTE_ICONS.text;
  return <Icon size={15} className={className} />;
}

/** Tiny icon button for a layer row's eye / lock toggle. Reveals on row hover or
 * when the row is selected or its state is "on" (hidden / locked). */
function RowToggle({
  active,
  activeIcon,
  inactiveIcon,
  activeTitle,
  inactiveTitle,
  reveal,
  onClick,
}: {
  active: boolean;
  activeIcon: ReactNode;
  inactiveIcon: ReactNode;
  activeTitle: string;
  inactiveTitle: string;
  reveal: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      draggable={false}
      title={active ? activeTitle : inactiveTitle}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        'flex size-6 items-center justify-center rounded transition-colors',
        active
          ? 'text-orange-600 dark:text-orange-400'
          : 'text-stone-400 hover:bg-stone-200 hover:text-stone-700 dark:text-stone-500 dark:hover:bg-stone-600 dark:hover:text-stone-100',
        !active && !reveal && 'opacity-0 group-hover:opacity-100',
      )}
    >
      {active ? activeIcon : inactiveIcon}
    </button>
  );
}

/**
 * Layers panel for the designer: a front-to-back list of the active page's
 * components (drag to reorder z-order, eye to hide, lock to disable selection
 * on the canvas) plus collapsible repeating-group nodes that gather their
 * members. Hidden/locked components remain selectable here even though the
 * canvas ignores them.
 */
export function LayersPanel({
  components,
  groups,
  selectedIds,
  selectedGroupId,
  activePage,
  onSelect,
  onSelectGroup,
  onReorder,
  onToggleHidden,
  onToggleLocked,
  onToggleGroupHidden,
  onToggleGroupLocked,
}: LayersPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(groups.map((g) => g.id)));
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);

  const byId = new Map(components.map((c) => [c.id, c]));
  const selectedSet = new Set(selectedIds);

  const groupOf = new Map<string, ComponentGroup>();
  for (const g of groups) for (const id of g.memberIds) groupOf.set(id, g);

  const pageComponents = components.filter((c) => c.page === activePage);

  // Build the displayed tree (front-to-back). Group members are nested under
  // their group node — never listed at the top level — and a group node sits at
  // its front-most member's z position.
  const nodes: LayerNode[] = [];
  const emittedGroup = new Set<string>();
  for (const c of [...pageComponents].reverse()) {
    const g = groupOf.get(c.id);
    if (g) {
      if (!emittedGroup.has(g.id)) {
        emittedGroup.add(g.id);
        nodes.push({ type: 'group', group: g });
      }
    } else {
      nodes.push({ type: 'component', component: c });
    }
  }

  // Members of a group on the active page, front-to-back.
  const membersOf = (g: ComponentGroup): CanvasComponent[] =>
    g.memberIds
      .map((id) => byId.get(id))
      .filter((c): c is CanvasComponent => !!c && c.page === activePage)
      .reverse();

  // Flattened front-to-back id sequence. Because group members are gathered
  // under their group node, after any drag the display order === z-order.
  const flatIds: string[] = [];
  for (const node of nodes) {
    if (node.type === 'group') for (const m of membersOf(node.group)) flatIds.push(m.id);
    else flatIds.push(node.component.id);
  }

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ---- native HTML5 drag & drop reorder -----------------------------------

  const onDragStart = (e: DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const onDragEnd = () => {
    setDragId(null);
    setOver(null);
  };
  const onRowDragOver = (e: DragEvent, id: string) => {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
    setOver({ id, pos });
  };
  const onRowDrop = (e: DragEvent, id: string) => {
    e.preventDefault();
    const src = dragId;
    const dropOver = over;
    setDragId(null);
    setOver(null);
    if (!src || src === id) return;
    const order = [...flatIds];
    const from = order.indexOf(src);
    if (from < 0) return;
    order.splice(from, 1);
    let to = order.indexOf(id);
    if (to < 0) return;
    if (dropOver?.pos === 'after') to += 1;
    order.splice(to, 0, src);
    onReorder(order);
  };

  const renderComponentRow = (c: CanvasComponent, depth: number) => {
    const selected = selectedSet.has(c.id);
    const hidden = !!c.hidden;
    const locked = !!c.locked;
    return (
      <li
        key={c.id}
        draggable
        onDragStart={(e) => onDragStart(e, c.id)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => onRowDragOver(e, c.id)}
        onDrop={(e) => onRowDrop(e, c.id)}
        onClick={(e) => onSelect(c.id, e.shiftKey)}
        style={{ paddingLeft: 6 + depth * 14 }}
        className={cn(
          'group relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-1 text-xs',
          selected
            ? 'bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200'
            : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700/60',
          dragId === c.id && 'opacity-40',
        )}
      >
        {over?.id === c.id && over.pos === 'before' && (
          <span className="absolute inset-x-1 -top-px h-0.5 rounded bg-orange-500" />
        )}
        {over?.id === c.id && over.pos === 'after' && (
          <span className="absolute inset-x-1 -bottom-px h-0.5 rounded bg-orange-500" />
        )}
        <IconGripVertical size={13} className="shrink-0 cursor-grab text-stone-300 dark:text-stone-600" />
        <KindIcon c={c} className="shrink-0 text-stone-400 dark:text-stone-500" />
        <span className={cn('min-w-0 flex-1 truncate', hidden && 'italic text-stone-400 line-through dark:text-stone-500')}>
          {componentLabel(c)}
        </span>
        <div className="flex items-center gap-0.5">
          <RowToggle
            reveal={selected}
            active={hidden}
            activeIcon={<IconEyeOff size={14} />}
            inactiveIcon={<IconEye size={14} />}
            activeTitle="Show layer"
            inactiveTitle="Hide layer"
            onClick={(e) => {
              e.stopPropagation();
              onToggleHidden(c.id);
            }}
          />
          <RowToggle
            reveal={selected}
            active={locked}
            activeIcon={<IconLock size={14} />}
            inactiveIcon={<IconLockOpen size={14} />}
            activeTitle="Unlock layer"
            inactiveTitle="Lock layer"
            onClick={(e) => {
              e.stopPropagation();
              onToggleLocked(c.id);
            }}
          />
        </div>
      </li>
    );
  };

  const renderGroupNode = (g: ComponentGroup) => {
    const members = membersOf(g);
    if (members.length === 0) return null;
    const isOpen = expanded.has(g.id);
    const allHidden = members.every((m) => m.hidden);
    const allLocked = members.every((m) => m.locked);
    const selected = selectedGroupId === g.id;
    return (
      <li key={g.id} className="flex flex-col gap-0.5">
        <div
          className={cn(
            'group flex items-center gap-1 rounded-md px-1 py-1 text-xs',
            selected
              ? 'bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200'
              : 'text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700/60',
          )}
        >
          <button
            type="button"
            onClick={() => toggleExpand(g.id)}
            aria-label={isOpen ? 'Collapse group' : 'Expand group'}
            className="flex size-5 items-center justify-center rounded text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-600"
          >
            {isOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </button>
          <IconStack2 size={14} className="shrink-0 text-orange-500" />
          <button
            type="button"
            onClick={() => onSelectGroup(g.id)}
            className="min-w-0 flex-1 truncate text-left font-medium"
            title={`Repeating group · ${g.name}`}
          >
            {g.name}
          </button>
          <span className="shrink-0 rounded-full bg-stone-200 px-1.5 text-[10px] font-medium text-stone-500 dark:bg-stone-700 dark:text-stone-400">
            {members.length}
          </span>
          <div className="flex items-center gap-0.5">
            <RowToggle
              reveal
              active={allHidden}
              activeIcon={<IconEyeOff size={14} />}
              inactiveIcon={<IconEye size={14} />}
              activeTitle="Show all members"
              inactiveTitle="Hide all members"
              onClick={(e) => {
                e.stopPropagation();
                onToggleGroupHidden(g.id);
              }}
            />
            <RowToggle
              reveal
              active={allLocked}
              activeIcon={<IconLock size={14} />}
              inactiveIcon={<IconLockOpen size={14} />}
              activeTitle="Unlock all members"
              inactiveTitle="Lock all members"
              onClick={(e) => {
                e.stopPropagation();
                onToggleGroupLocked(g.id);
              }}
            />
          </div>
        </div>
        {isOpen && <ul className="flex flex-col gap-0.5">{members.map((m) => renderComponentRow(m, 1))}</ul>}
      </li>
    );
  };

  return (
    <>
      {nodes.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-stone-400 dark:text-stone-500">
          No layers on this page yet. Add components from the palette.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {nodes.map((node) =>
            node.type === 'group' ? renderGroupNode(node.group) : renderComponentRow(node.component, 0),
          )}
        </ul>
      )}
      <p className="mt-3 px-2 text-[11px] leading-relaxed text-stone-400 dark:text-stone-500">
        Drag to reorder · eye to hide · lock to disable canvas selection. Top of the list is the front-most layer.
      </p>
    </>
  );
}
