import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconZoomIn, IconZoomOut,IconTrash,IconPlus,IconArrowBackUp,IconArrowForwardUp,IconStack2 } from '@tabler/icons-react';
import { ContextMenu, DropdownItem, DropdownLabel, Panel, Tabs, TabsList, Tab, TabPanel } from '../ui';
import { useToast } from '../../context/toast';
import { cn } from '../../lib/cn';
import type { Guides } from '../../hooks/useSnap';
import { CanvasDocument } from './CanvasDocument';
import { CanvasSettings } from './CanvasSettings';
import { ComponentPalette, PALETTE_ICONS } from './ComponentPalette';
import { LayersPanel } from './LayersPanel';
import { PropertiesInspector } from './PropertiesInspector';
import { CANVAS_SIZE, makeComponent, PALETTE } from './constants';
import type { CanvasSize } from './coordinates';
import { componentsReducer, type ComponentsAction } from './reducer';
import { extractFieldNames, extractFields } from './textMerge';
import type { CanvasComponent, ComponentGroup, GroupDirection, GuideLines, TableComponent, TextComponent } from './types';
import { useDesignerHistory } from './useDesignerHistory';

/** A form field derived from the document — a {{token}} (text) or a named image slot.
 * `groupId` is set when the field belongs to a repeating-group member. */
export interface DesignerField {
  name: string;
  kind: 'text' | 'image';
  groupId?: string;
}

export interface TemplateDesignerProps {
  /** Controlled canvas components (the document content). */
  value: CanvasComponent[];
  onChange: (next: CanvasComponent[]) => void;
  /** Controlled repeating groups. */
  groups?: ComponentGroup[];
  onGroupsChange?: (groups: ComponentGroup[]) => void;
  /**
   * Fires whenever the set of form fields changes — i.e. whenever a component
   * is added, edited, or removed such that the {{token}} placeholders change.
   * Use this to surface the document's fillable fields in the host UI.
   */
  onFieldsChange?: (fields: DesignerField[]) => void;
  canvasSize?: CanvasSize;
  /** Controlled page-size changes (preset / orientation / custom W·H). */
  onCanvasSizeChange?: (size: CanvasSize) => void;
  /** Controlled page count (for PDF import). */
  pageCount?: number;
  /** Callback when page count changes. */
  onPageCountChange?: (count: number) => void;
  /** Page background images (data URLs) for each page (for PDF import). */
  pageBackgrounds?: string[];
  /** Invoked on Ctrl/Cmd+S (the browser save dialog is suppressed). */
  onSave?: () => void;
  className?: string;
}

interface MenuState {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
}

/**
 * Reusable, controlled WYSIWYG document designer. Owns selection (including
 * multi-select for grouping), zoom, alignment guides, the right-click menu,
 * and keyboard shortcuts — the host only supplies `value`/`onChange`
 * (+ optional `groups`/`fields`). Embeddable by both the create flow and a
 * future edit-existing flow.
 */
export function TemplateDesigner({
  value,
  onChange,
  groups: groupsProp,
  onGroupsChange,
  onFieldsChange,
  canvasSize = CANVAS_SIZE,
  onCanvasSizeChange,
  pageCount: pageCountProp,
  onPageCountChange,
  pageBackgrounds,
  onSave,
  className,
}: TemplateDesignerProps) {
  const toast = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState<Guides>({ vertical: [], horizontal: [] });
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [guideLines, setGuideLines] = useState<GuideLines>({ enabled: false, padding: 48 });
  const [internalPages, setInternalPages] = useState(1); // Start with page 1, users can add more
  const [activePage, setActivePage] = useState(0); // Currently active page (0-indexed)
  const [rightTab, setRightTab] = useState<'design' | 'layers' | 'canvas'>('design');
  // How the imported-PDF page background renders (session-local; not persisted).
  const [bgMode, setBgMode] = useState<'off' | 'dim' | 'full'>('full');

  // Bridge controlled pageCount prop with internal state
  // Ensure manualPages never falls below the number of pages that have data.
  const dataPages = value.length ? Math.max(...value.map((c) => c.page)) + 1 : 1;
  const manualPages = Math.max(pageCountProp ?? internalPages, dataPages);
  const setManualPages = (n: number) => {
    setInternalPages(n);
    onPageCountChange?.(n);
  };
  useEffect(() => {
    if (pageCountProp !== undefined) {
      setInternalPages(pageCountProp);
    }
  }, [pageCountProp]);

  const groups = groupsProp ?? [];

  // Groups with stale member ids (deleted components) filtered out, empty ones
  // dissolved. Used for all rendering/extraction; mutations call onGroupsChange
  // explicitly with a cleaned array.
  const effectiveGroups = useMemo(() => {
    const ids = new Set(value.map((c) => c.id));
    return groups
      .map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => ids.has(id)) }))
      .filter((g) => g.memberIds.length > 0);
  }, [groups, value]);

  // Insert-field chips = text {{token}} names; onFieldsChange reports ALL fields
  // (text tokens + named image slots), with their kind and group linkage.
  const tokens = useMemo(() => extractFieldNames(value), [value]);
  const fields = useMemo(() => extractFields(value, effectiveGroups), [value, effectiveGroups]);
  useEffect(() => {
    onFieldsChange?.(fields);
  }, [fields, onFieldsChange]);

  const idRef = useRef(0);
  const newId = useCallback((prefix = 'c') => `${prefix}${++idRef.current}`, []);

  // Seed idRef from existing component and group ids to prevent collisions when
  // editing a previously-saved template. Without this, the first new component
  // would get id 'c1', which collides with a loaded component from creation time.
  // Also updates on undo/redo to avoid ID collisions after state changes.
  useEffect(() => {
    const ids: string[] = [
      ...value.map((c) => c.id),
      ...groups.flatMap((g) => [g.id, ...g.memberIds]),
    ];
    let max = 0;
    for (const id of ids) {
      // Take the max of ALL digit runs so timestamp-style ids can't collide either.
      for (const m of id.matchAll(/\d+/g)) max = Math.max(max, parseInt(m[0], 10));
    }
    idRef.current = Math.max(idRef.current, max);
  }, [value, groups]);

  // Refs mirror latest state so the keyboard handler can subscribe once.
  const valueRef = useRef(value);
  valueRef.current = value;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  // Undo/redo history layered over the controlled value. All designer edits go
  // through `commit` (not raw `onChange`) so each becomes an undo step, while a
  // drag coalesces into one; external resets (PDF import, loading a template)
  // are detected and clear the stack.
  const { commit, undo, redo, canUndo, canRedo } = useDesignerHistory(value, onChange);

  // onSave via ref so the window-scoped key handler (subscribed once) calls the
  // latest handler without needing to re-subscribe.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // In-designer clipboard for copy/paste (structured objects; intentionally not
  // the system clipboard so it survives focus changes but stays app-local).
  const clipboardRef = useRef<CanvasComponent[]>([]);
  const pasteCountRef = useRef(0);

  const run = useCallback(
    (action: ComponentsAction) => commit(componentsReducer(valueRef.current, action)),
    [commit],
  );

  const updateComponent = useCallback(
    (id: string, patch: Partial<CanvasComponent>) => run({ type: 'update', id, patch }),
    [run],
  );

  const createComponent = useCallback(
    (kind: string, x: number, y: number) => {
      const component = makeComponent(kind, newId(), x, y, canvasSize, activePage);
      run({ type: 'add', component });
      setSelectedGroupId(null);
      setSelectedIds([component.id]);
    },
    [run, newId, canvasSize, activePage],
  );

  const addAtCenter = useCallback(
    (kind: string) => createComponent(kind, canvasSize.width / 2, canvasSize.height / 2),
    [createComponent, canvasSize],
  );

  // ---- selection -----------------------------------------------------------

  const select = useCallback((id: string | null, additive: boolean) => {
    setSelectedGroupId(null);
    setSelectedIds((prev) => {
      if (id === null) return [];
      if (additive) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return [...next];
      }
      return [id];
    });
  }, []);

  const selectGroup = useCallback((id: string) => {
    setSelectedIds([]);
    setSelectedGroupId(id);
  }, []);

  // ---- group mutations -----------------------------------------------------

  const setGroups = useCallback(
    (next: ComponentGroup[]) => {
      onGroupsChange?.(next);
    },
    [onGroupsChange],
  );

  const createGroup = useCallback(
    (memberIds: string[], name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        toast.show({ title: 'Name required', message: 'Give the repeating group a name.', color: 'red' });
        return;
      }
      if (effectiveGroups.some((g) => g.name.toLowerCase() === trimmed.toLowerCase())) {
        toast.show({ title: 'Name in use', message: `A group named “${trimmed}” already exists.`, color: 'red' });
        return;
      }
      const grouped = new Set(effectiveGroups.flatMap((g) => g.memberIds));
      if (memberIds.some((id) => grouped.has(id))) {
        toast.show({
          title: 'Already grouped',
          message: 'Some selected components already belong to a group. Ungroup them first.',
          color: 'red',
        });
        return;
      }
      const id = newId('g');
      setGroups([...effectiveGroups, { id, name: trimmed, memberIds, repeating: true, direction: 'column' }]);
      setSelectedIds([]);
      setSelectedGroupId(id);
    },
    [effectiveGroups, setGroups, toast, newId],
  );

  const renameGroup = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (effectiveGroups.some((g) => g.id !== id && g.name.toLowerCase() === trimmed.toLowerCase())) {
        toast.show({ title: 'Name in use', message: `A group named “${trimmed}” already exists.`, color: 'red' });
        return;
      }
      setGroups(effectiveGroups.map((g) => (g.id === id ? { ...g, name: trimmed } : g)));
    },
    [effectiveGroups, setGroups, toast],
  );

  const setGroupDirection = useCallback(
    (id: string, direction: GroupDirection) => {
      setGroups(effectiveGroups.map((g) => (g.id === id ? { ...g, direction } : g)));
    },
    [effectiveGroups, setGroups],
  );

  const ungroup = useCallback(
    (id: string) => {
      setGroups(effectiveGroups.filter((g) => g.id !== id));
      setSelectedGroupId(null);
    },
    [effectiveGroups, setGroups],
  );

  const deleteGroup = useCallback(
    (id: string) => {
      const g = effectiveGroups.find((x) => x.id === id);
      const ids = g?.memberIds ?? [];
      setGroups(effectiveGroups.filter((x) => x.id !== id));
      if (ids.length) commit(valueRef.current.filter((c) => !ids.includes(c.id)));
      setSelectedGroupId(null);
    },
    [effectiveGroups, setGroups, commit],
  );

  const deletePage = useCallback(() => {
    if (manualPages <= 1) return;
    run({ type: 'deletePage', page: activePage });
    // Persist group cleanup (effectiveGroups already filters reactively, but write it through)
    const surviving = new Set(valueRef.current.filter((c) => c.page !== activePage).map((c) => c.id));
    const cleaned = effectiveGroups
      .map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => surviving.has(id)) }))
      .filter((g) => g.memberIds.length > 0);
    if (cleaned.length !== effectiveGroups.length || JSON.stringify(cleaned) !== JSON.stringify(effectiveGroups)) {
      setGroups(cleaned);
    }
    const next = manualPages - 1;
    setManualPages(next);
    setActivePage((p) => Math.min(p, next - 1));
  }, [manualPages, activePage, run, effectiveGroups, setGroups]);

  // ---- component mutations (single + multi) -------------------------------

  /** Remove the given ids and dissolve any groups left empty by the removal. */
  const deleteMany = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const rem = new Set(ids);
      commit(valueRef.current.filter((c) => !rem.has(c.id)));
      const cleaned = effectiveGroups
        .map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => !rem.has(id)) }))
        .filter((g) => g.memberIds.length > 0);
      if (cleaned.length !== effectiveGroups.length || JSON.stringify(cleaned) !== JSON.stringify(effectiveGroups)) {
        setGroups(cleaned);
      }
      setSelectedIds((prev) => prev.filter((id) => !rem.has(id)));
    },
    [commit, effectiveGroups, setGroups],
  );

  const duplicateMany = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return [];
      const want = new Set(ids);
      const copies: CanvasComponent[] = [];
      const next = [...valueRef.current];
      for (const c of valueRef.current) {
        if (!want.has(c.id)) continue;
        const copy: CanvasComponent = { ...c, id: newId(), x: c.x + 16, y: c.y + 16 };
        // Deep-copy mutable arrays so duplicates are independent
        if (c.kind === 'table') (copy as TableComponent).cells = [...(c as TableComponent).cells];
        if (c.kind === 'text' && c.marks) (copy as TextComponent).marks = c.marks.map((m) => ({ ...m }));
        copies.push(copy);
        next.push(copy);
      }
      commit(next);
      setSelectedGroupId(null);
      setSelectedIds(copies.map((c) => c.id));
      return copies.map((c) => c.id);
    },
    [commit, newId],
  );

  // Copy/paste share clipboard semantics with duplicate, but copy stashes the
  // selection to paste later (offsetting each successive paste so they cascade).
  const copy = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const set = new Set(ids);
    clipboardRef.current = valueRef.current
      .filter((c) => set.has(c.id))
      .map((c) => {
        const out: CanvasComponent = { ...c };
        if (c.kind === 'table') (out as TableComponent).cells = [...(c as TableComponent).cells];
        if (c.kind === 'text' && c.marks) (out as TextComponent).marks = c.marks.map((m) => ({ ...m }));
        return out;
      });
    pasteCountRef.current = 0;
  }, []);

  const paste = useCallback(() => {
    if (clipboardRef.current.length === 0) return;
    const k = ++pasteCountRef.current;
    const copies = clipboardRef.current.map((src) => {
      const out: CanvasComponent = { ...src, id: newId(), x: src.x + 16 * k, y: src.y + 16 * k };
      if (src.kind === 'table') (out as TableComponent).cells = [...(src as TableComponent).cells];
      if (src.kind === 'text' && src.marks) (out as TextComponent).marks = src.marks.map((m) => ({ ...m }));
      return out;
    });
    commit([...valueRef.current, ...copies]);
    setSelectedGroupId(null);
    setSelectedIds(copies.map((c) => c.id));
  }, [commit, newId]);

  /** Nudge every selected component by (dx, dy), clamped to the canvas top-left.
   * Single commit so multi-nudge is one render, not N. */
  const nudge = useCallback(
    (dx: number, dy: number) => {
      const ids = selectedIdsRef.current;
      if (ids.length === 0) return;
      const set = new Set(ids);
      commit(
        valueRef.current.map((c) =>
          set.has(c.id)
            ? ({ ...c, x: Math.max(0, c.x + dx), y: Math.max(0, c.y + dy) } as CanvasComponent)
            : c,
        ),
      );
    },
    [commit],
  );

  const layer = useCallback((id: string, dir: -1 | 1) => run({ type: 'layer', id, dir }), [run]);

  // ---- layers panel: hide / lock / reorder -------------------------------

  const toggleHidden = useCallback(
    (id: string) => {
      const c = valueRef.current.find((x) => x.id === id);
      run({ type: 'update', id, patch: { hidden: !c?.hidden } });
    },
    [run],
  );

  const toggleLocked = useCallback(
    (id: string) => {
      const c = valueRef.current.find((x) => x.id === id);
      run({ type: 'update', id, patch: { locked: !c?.locked } });
    },
    [run],
  );

  // Eye/lock on a group header toggles every member to the new unified state.
  const toggleGroupHidden = useCallback(
    (id: string) => {
      const g = effectiveGroups.find((x) => x.id === id);
      if (!g) return;
      const members = valueRef.current.filter((c) => g.memberIds.includes(c.id));
      run({ type: 'updateMany', ids: g.memberIds, patch: { hidden: !members.every((m) => m.hidden) } });
    },
    [run, effectiveGroups],
  );

  const toggleGroupLocked = useCallback(
    (id: string) => {
      const g = effectiveGroups.find((x) => x.id === id);
      if (!g) return;
      const members = valueRef.current.filter((c) => g.memberIds.includes(c.id));
      run({ type: 'updateMany', ids: g.memberIds, patch: { locked: !members.every((m) => m.locked) } });
    },
    [run, effectiveGroups],
  );

  /** Apply a new front-to-back order to the active page's components, preserving
   * every other page's components in place. `frontToBackIds` lists exactly the
   * active-page ids in their new display order (front first). */
  const reorderLayers = useCallback(
    (frontToBackIds: string[]) => {
      const backToFront = [...frontToBackIds].reverse();
      const byId = new Map(valueRef.current.map((c) => [c.id, c] as const));
      let cursor = 0;
      const next = valueRef.current.map((c) =>
        c.page !== activePage ? c : (byId.get(backToFront[cursor++]) ?? c),
      );
      commit(next);
    },
    [commit, activePage],
  );

  const zoomIn = useCallback(() => setZoom((z) => Math.min(2, Number((z + 0.1).toFixed(2)))), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2)))), []);
  const resetZoom = useCallback(() => setZoom(1), []);

  // Keyboard shortcuts (subscribe once; handlers are stable, state via refs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // Save works even while a text field is focused (suppress browser dialog).
      if (meta && (e.key === 's' || e.key === 'S')) {
        if (e.repeat) return;
        e.preventDefault();
        onSaveRef.current?.();
        return;
      }

      const target = e.target as HTMLElement;
      if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const ids = selectedIdsRef.current;
      const lower = e.key.toLowerCase();

      // Undo: Ctrl/Cmd+Z (plain). Redo: Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z.
      if (meta && lower === 'z') {
        if (e.repeat) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && lower === 'y') {
        if (e.repeat) return;
        e.preventDefault();
        redo();
        return;
      }
      // Copy: stash the current selection into the in-designer clipboard.
      if (meta && lower === 'c') {
        if (ids.length === 0 || e.repeat) return;
        e.preventDefault();
        copy();
        return;
      }
      // Paste: drop the clipboard back onto the canvas with fresh ids.
      if (meta && lower === 'v') {
        if (e.repeat) return;
        e.preventDefault();
        paste();
        return;
      }

      // Everything below requires a selection.
      if (ids.length === 0) return;
      const step = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          deleteMany(ids);
          break;
        case 'Escape':
          setSelectedIds([]);
          setSelectedGroupId(null);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          nudge(-step, 0);
          break;
        case 'ArrowRight':
          e.preventDefault();
          nudge(step, 0);
          break;
        case 'ArrowUp':
          e.preventDefault();
          nudge(0, -step);
          break;
        case 'ArrowDown':
          e.preventDefault();
          nudge(0, step);
          break;
        case 'd':
        case 'D':
          if (meta) {
            e.preventDefault();
            duplicateMany(ids);
          }
          break;
        case ']':
          if (meta) {
            e.preventDefault();
            ids.forEach((id) => layer(id, 1));
          }
          break;
        case '[':
          if (meta) {
            e.preventDefault();
            ids.forEach((id) => layer(id, -1));
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, copy, paste, deleteMany, duplicateMany, nudge, layer]);

  const selection = value.filter((c) => selectedIds.includes(c.id));
  const selectedGroup = effectiveGroups.find((g) => g.id === selectedGroupId) ?? null;

  const onContextOpen = (x: number, y: number, canvasX: number, canvasY: number) =>
    setMenu({ x, y, canvasX, canvasY });

  const iconBtn =
    'flex size-7 items-center justify-center rounded text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-stone-500 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-100';

  return (
    <div
      className={cn(
        'grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-rows-1 xl:grid-cols-[minmax(0,1fr)_340px]',
        className,
      )}
    >
      {/* Canvas */}
      <Panel
        title="Canvas"
        subtitle="Drag from the palette or right-click to add · shift-click to multi-select"
        bodyClassName="overflow-hidden p-0"
        actions={
          <>
            <button
              type="button"
              onClick={() => setRightTab('layers')}
              aria-label="Show layers"
              title="Show layers"
              aria-pressed={rightTab === 'layers'}
              className={cn(iconBtn, rightTab === 'layers' && 'bg-stone-100 text-stone-800 dark:bg-stone-700 dark:text-stone-100')}
            >
              <IconStack2 size={16} />
            </button>
            <div className="w-px h-6 bg-stone-300 dark:bg-stone-600 mx-1" />
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              className={iconBtn}
            >
              <IconArrowBackUp size={16} />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              aria-label="Redo"
              title="Redo (Ctrl+Y)"
              className={iconBtn}
            >
              <IconArrowForwardUp size={16} />
            </button>
            <div className="w-px h-6 bg-stone-300 dark:bg-stone-600 mx-1" />
            <button type="button" onClick={zoomOut} disabled={zoom <= 0.5} aria-label="Zoom out" className={iconBtn}>
              <IconZoomOut size={16} />
            </button>
            <button
              type="button"
              onClick={resetZoom}
              title="Reset zoom"
              className="inline-flex min-w-[3rem] items-center justify-center rounded px-1 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={zoomIn} disabled={zoom >= 2} aria-label="Zoom in" className={iconBtn}>
              <IconZoomIn size={16} />
            </button>
            <div className="w-px h-6 bg-stone-300 dark:bg-stone-600 mx-1" />
            {(pageBackgrounds?.length ?? 0) > 0 && (
              <select
                value={bgMode}
                onChange={(e) => setBgMode(e.target.value as 'off' | 'dim' | 'full')}
                title="Source PDF background"
                className="px-2 py-1 text-sm rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300"
              >
                <option value="full">Original PDF</option>
                <option value="dim">Dimmed PDF</option>
                <option value="off">No PDF</option>
              </select>
            )}
            {manualPages > 1 && (
              <select
                value={activePage}
                onChange={(e) => setActivePage(Number(e.target.value))}
                className="px-2 py-1 text-sm rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300"
              >
                {Array.from({ length: manualPages }).map((_, index) => (
                  <option key={index} value={index}>
                    Sayfa {index + 1}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={deletePage}
              disabled={manualPages <= 1}
              className={iconBtn}
              title="Delete current page"
            >
              <IconTrash size={16} />
            </button>
            <button
              type="button"
              onClick={() => setManualPages(manualPages + 1)}
              className={iconBtn}
              title="Add new page"
            >
              <IconPlus size={16} />
            </button>
          </>
        }
      >
        <CanvasDocument
          components={value}
          selectedIds={selectedIds}
          groups={effectiveGroups}
          selectedGroupId={selectedGroupId}
          canvasSize={canvasSize}
          zoom={zoom}
          guides={guides}
          guideLines={guideLines}
          manualPages={manualPages}
          activePage={activePage}
          onActivePageChange={setActivePage}
          onSelect={select}
          onSelectGroup={selectGroup}
          onChange={updateComponent}
          onCreate={createComponent}
          onContextOpen={onContextOpen}
          onGuides={setGuides}
          pageBackgrounds={pageBackgrounds}
          backgroundMode={bgMode}
        />
      </Panel>

      {/* Designer: palette + inspector + layers + canvas settings (tabbed) */}
      <Panel title="Designer" subtitle="Add, configure, and organize components" className="min-h-0">
        <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as typeof rightTab)}>
          <TabsList>
            <Tab value="design">Design</Tab>
            <Tab value="layers">Layers</Tab>
            <Tab value="canvas">Canvas</Tab>
          </TabsList>
          <TabPanel value="design">
            <ComponentPalette onAdd={addAtCenter} />
            <div className="mt-5 border-t border-stone-200 pt-4 dark:border-stone-700">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Properties</p>
              <PropertiesInspector
                selection={selection}
                selectedGroup={selectedGroup}
                groups={effectiveGroups}
                tokens={tokens}
                canGroup={!!onGroupsChange}
                onUpdate={updateComponent}
                onDeleteMany={deleteMany}
                onDuplicateMany={duplicateMany}
                onLayer={layer}
                onCreateGroup={createGroup}
                onRenameGroup={renameGroup}
                onSetGroupDirection={setGroupDirection}
                onUngroup={ungroup}
                onDeleteGroup={deleteGroup}
              />
            </div>
          </TabPanel>
          <TabPanel value="layers">
            <LayersPanel
              components={value}
              groups={effectiveGroups}
              selectedIds={selectedIds}
              selectedGroupId={selectedGroupId}
              activePage={activePage}
              onSelect={select}
              onSelectGroup={selectGroup}
              onReorder={reorderLayers}
              onToggleHidden={toggleHidden}
              onToggleLocked={toggleLocked}
              onToggleGroupHidden={toggleGroupHidden}
              onToggleGroupLocked={toggleGroupLocked}
            />
          </TabPanel>
          <TabPanel value="canvas">
            <CanvasSettings
              size={canvasSize}
              onChange={onCanvasSizeChange ?? (() => {})}
              guideLines={guideLines}
              onGuideLinesChange={setGuideLines}
            />
          </TabPanel>
        </Tabs>
      </Panel>

      {/* Right-click menu */}
      <ContextMenu open={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={() => setMenu(null)}>
        <DropdownLabel>Add component</DropdownLabel>
        {PALETTE.map((entry) => {
          const Icon = PALETTE_ICONS[entry.kind];
          return (
            <DropdownItem
              key={entry.kind}
              leftSection={Icon ? <Icon size={16} /> : undefined}
              onClick={() => {
                if (menu) createComponent(entry.kind, menu.canvasX, menu.canvasY);
                setMenu(null);
              }}
            >
              {entry.label}
            </DropdownItem>
          );
        })}
      </ContextMenu>
    </div>
  );
}
