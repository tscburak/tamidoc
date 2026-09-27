import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconChevronUp,
  IconChevronDown,
  IconTrash,
  IconCopy,
  IconUpload,
  IconStack,
  IconRectangleRoundedTop,
  IconArrowsVertical,
  IconArrowsHorizontal,
  IconBold,
  IconItalic,
  IconUnderline,
} from '@tabler/icons-react';
import { Button, Dropdown, DropdownItem, Switch } from '../ui';
import { cn } from '../../lib/cn';
import { normalizeImageToPng } from '../../lib/image';
import { normalizeAngle } from './coordinates';
import type {
  CanvasComponent,
  ComponentGroup,
  FontStyle,
  FontWeight,
  GroupDirection,
  HorizontalAlign,
  ObjectFit,
  ShapeComponent,
  ShapeKind,
  TableBorder,
  TableComponent,
  TextDecoration,
  TextMark,
} from './types';

export interface PropertiesInspectorProps {
  /** Currently-selected components (0, 1, or many). Mutually exclusive with group. */
  selection: CanvasComponent[];
  selectedGroup: ComponentGroup | null;
  groups: ComponentGroup[];
  /** {{token}} field names defined in the document (for the text insert chips). */
  tokens: string[];
  /** Is the host providing group control? Hides the "make group" action when false. */
  canGroup: boolean;
  onUpdate: (id: string, patch: Partial<CanvasComponent>) => void;
  onDeleteMany: (ids: string[]) => void;
  onDuplicateMany: (ids: string[]) => void;
  onLayer: (id: string, dir: -1 | 1) => void;
  onCreateGroup: (memberIds: string[], name: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onSetGroupDirection: (id: string, direction: GroupDirection) => void;
  onUngroup: (id: string) => void;
  onDeleteGroup: (id: string) => void;
}

const inputCls =
  'h-8 w-full rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-800 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-stone-500 dark:text-stone-400">{label}</span>
      {children}
    </div>
  );
}

function NumberField({
  value,
  onChange,
  min,
  step = 1,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState<string>(Number.isFinite(value) ? String(value) : '');
  // Sync from outside (undo/redo, drag, duplicate)
  useEffect(() => {
    setDraft(Number.isFinite(value) ? String(value) : '');
  }, [value]);

  const commit = () => {
    if (draft.trim() === '') {
      onChange(min ?? 0);
      return;
    }
    const n = Number(draft);
    const base = Number.isFinite(n) ? n : (min ?? 0);
    const clamped = min !== undefined ? Math.max(min, base) : base;
    onChange(clamped);
  };

  return (
    <input
      type="number"
      aria-label={ariaLabel}
      value={draft}
      min={min}
      step={step}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={inputCls}
    />
  );
}

/** Drop marks that fall outside the current content (or have collapsed to 0)
 * so typing/deleting doesn't leave dangling marks pointing past `end`. */
function sanitizeMarks(marks: TextMark[] | undefined, contentLength: number): TextMark[] | undefined {
  if (!marks || marks.length === 0) return marks;
  const out: TextMark[] = [];
  for (const m of marks) {
    const start = Math.max(0, Math.min(m.start, contentLength));
    const end = Math.max(0, Math.min(m.end, contentLength));
    if (end <= start) continue;
    const next: TextMark = { start, end };
    if (m.fontWeight) next.fontWeight = m.fontWeight;
    if (m.color) next.color = m.color;
    if (typeof m.fontSize === 'number') next.fontSize = m.fontSize;
    if (m.fontStyle) next.fontStyle = m.fontStyle;
    if (m.textDecoration) next.textDecoration = m.textDecoration;
    out.push(next);
  }
  return out.length ? out : undefined;
}

type MarkStyle = Pick<TextMark, 'fontWeight' | 'fontStyle' | 'textDecoration' | 'fontSize' | 'color'>;
/** Every style slot readable/writable by key name (values may be undefined). */
type StyleMap = Record<keyof MarkStyle, MarkStyle[keyof MarkStyle]>;
interface BaseTextStyle {
  fontWeight: FontWeight;
  fontStyle: FontStyle;
  textDecoration: TextDecoration;
  fontSize: number;
  color: string;
}

const STYLE_KEYS: (keyof MarkStyle)[] = ['fontWeight', 'fontStyle', 'textDecoration', 'fontSize', 'color'];
/** Neutral value used to switch a style back off (re-clicking the active button). */
const STYLE_OFF: Partial<MarkStyle> = { fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none' };

function effectiveStyleAt(marks: TextMark[], base: BaseTextStyle, pos: number): MarkStyle {
  const eff: StyleMap = {} as StyleMap;
  for (const k of STYLE_KEYS) eff[k] = base[k];
  for (const m of marks) {
    if (m.start <= pos && pos < m.end) {
      for (const k of STYLE_KEYS) {
        const v = m[k];
        if (v !== undefined) eff[k] = v;
      }
    }
  }
  return eff as MarkStyle;
}

function styleEquals(a: MarkStyle, b: MarkStyle): boolean {
  return STYLE_KEYS.every((k) => a[k] === b[k]);
}

/** Emit only the style keys that differ from the base (marks are overrides). */
function styleDiff(base: BaseTextStyle, eff: MarkStyle): MarkStyle {
  const props: StyleMap = {} as StyleMap;
  for (const k of STYLE_KEYS) {
    if (eff[k] !== undefined && eff[k] !== base[k]) props[k] = eff[k];
  }
  return props as MarkStyle;
}

/** Apply `patch` to the char range [a, b) of `content`, merging into any marks
 * that overlap the range (so italic doesn't wipe an existing bold). Overlapping
 * marks are flattened per char first, then re-emitted as clean non-overlapping
 * runs. If every char in the range already carries the patched style, it's
 * toggled back off instead. */
function mergeMarkRange(
  content: string,
  base: BaseTextStyle,
  marks: TextMark[] | undefined,
  a: number,
  b: number,
  patch: Partial<MarkStyle>,
): TextMark[] | undefined {
  const len = content.length;
  const aa = Math.max(0, Math.min(a, len));
  const bb = Math.max(0, Math.min(b, len));
  if (bb <= aa) return marks;
  const list = marks ?? [];

  // Toggle-off: the whole selection already carries `patch`.
  let toggleOff = true;
  const keys = Object.keys(patch) as (keyof MarkStyle)[];
  for (let pos = aa; pos < bb && toggleOff; pos++) {
    const eff = effectiveStyleAt(list, base, pos);
    for (const k of keys) {
      if (eff[k] !== patch[k]) {
        toggleOff = false;
        break;
      }
    }
  }

  const points = new Set<number>([aa, bb]);
  for (const m of list) {
    points.add(m.start);
    points.add(m.end);
  }
  const sorted = [...points].filter((p) => p >= 0 && p <= len).sort((x, y) => x - y);

  const out: TextMark[] = [];
  let run: { start: number; end: number; props: MarkStyle } | null = null;

  for (let i = 0; i + 1 < sorted.length; i++) {
    const s = sorted[i];
    const e = sorted[i + 1];
    if (e <= s) continue;

    let eff = effectiveStyleAt(list, base, s) as StyleMap;
    if (s >= aa && e <= bb) {
      if (toggleOff) {
        for (const k of keys) eff[k] = STYLE_OFF[k] ?? base[k];
      } else {
        eff = { ...eff, ...patch } as StyleMap;
      }
    }

    const props = styleDiff(base, eff as MarkStyle);
    const hasProps = STYLE_KEYS.some((k) => props[k] !== undefined);
    if (!hasProps) {
      if (run) {
        out.push({ start: run.start, end: run.end, ...run.props });
        run = null;
      }
      continue;
    }
    if (run && run.end === s && styleEquals(run.props, props)) {
      run.end = e;
    } else {
      if (run) out.push({ start: run.start, end: run.end, ...run.props });
      run = { start: s, end: e, props };
    }
  }
  if (run) out.push({ start: run.start, end: run.end, ...run.props });
  return out.length ? out : undefined;
}

/** True when a color value means "no paint": the `transparent` sentinel, an
 * empty string (user cleared the hex field), or an 8-digit hex with zero alpha
 * (the legacy `#00000000` default used for shape strokes). The canvas renders
 * all of these as see-through via CSS; the PDF renderer must skip them.
 * Null/undefined are treated as transparent too — shapes loaded from the DB or
 * created by PDF import may omit these fields. */
function isNoneColor(color: string | undefined | null): boolean {
  if (!color) return true;
  const c = color.trim().toLowerCase();
  if (c === '' || c === 'transparent' || c === 'none') return true;
  return /^#[0-9a-f]{6}00$/.test(c);
}

function ColorField({
  value,
  onChange,
  allowTransparent = false,
}: {
  value: string;
  onChange: (v: string) => void;
  allowTransparent?: boolean;
}) {
  const transparent = allowTransparent && isNoneColor(value);
  const safe = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : '#000000';
  return (
    <div className="flex flex-col gap-1.5">
      {allowTransparent && (
        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">
          <input
            type="checkbox"
            checked={transparent}
            onChange={(e) => onChange(e.target.checked ? 'transparent' : '#000000')}
            className="size-3.5 rounded border-stone-300 text-orange-500 focus:ring-orange-500/40 dark:border-stone-600"
          />
          Transparent
        </label>
      )}
      <div className={cn('flex items-center gap-2', transparent && 'pointer-events-none opacity-40')}>
        <input
          type="color"
          aria-label="Color picker"
          value={safe.slice(0, 7)}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-stone-300 bg-white dark:border-stone-600"
        />
        <input
          type="text"
          aria-label="Hex color"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputCls, 'font-mono uppercase')}
        />
      </div>
    </div>
  );
}

const iconBtn =
  'flex flex-1 items-center justify-center gap-1 rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700';

export function PropertiesInspector(props: PropertiesInspectorProps) {
  const { selection, selectedGroup, canGroup } = props;

  if (selectedGroup) return <GroupPanel {...props} group={selectedGroup} />;

  if (selection.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-stone-300 p-4 text-center text-xs text-stone-400 dark:border-stone-600 dark:text-stone-500">
        Select a component to edit its properties.
        {canGroup && <span className="mt-1 block">Shift-click several, then make a repeating group.</span>}
      </p>
    );
  }

  if (selection.length > 1) return <MultiPanel {...props} />;

  return <SinglePanel {...props} component={selection[0]} />;
}

/* --------------------------- Single component ------------------------------ */

function SinglePanel({
  component,
  tokens,
  onUpdate,
  onDeleteMany,
  onDuplicateMany,
  onLayer,
}: PropertiesInspectorProps & { component: CanvasComponent }) {
  const patch = (p: Partial<CanvasComponent>) => onUpdate(component.id, p);

  return (
    <div className="flex flex-col gap-4">
      {/* Common: position & size */}
      <div className="grid grid-cols-4 gap-2">
        <Row label="X">
          <NumberField ariaLabel="X" value={Math.round(component.x)} onChange={(n) => patch({ x: n })} />
        </Row>
        <Row label="Y">
          <NumberField ariaLabel="Y" value={Math.round(component.y)} onChange={(n) => patch({ y: n })} />
        </Row>
        <Row label="W">
          <NumberField ariaLabel="Width" min={1} value={Math.round(component.width)} onChange={(n) => patch({ width: n })} />
        </Row>
        <Row label="H">
          <NumberField ariaLabel="Height" min={1} value={Math.round(component.height)} onChange={(n) => patch({ height: n })} />
        </Row>
      </div>

      <Row label="Rotation (°)">
        <NumberField
          ariaLabel="Rotation degrees"
          value={Math.round(normalizeAngle(component.rotation))}
          onChange={(n) => patch({ rotation: normalizeAngle(n) })}
        />
      </Row>

      {/* Per-kind controls */}
      {component.kind === 'text' && <TextControls component={component} tokens={tokens} patch={patch} />}
      {component.kind === 'image' && <ImageControls component={component} patch={patch} />}
      {component.kind === 'shape' && <ShapeControls component={component} patch={patch} />}
      {component.kind === 'table' && <TableControls component={component} patch={patch} />}

      {/* Actions */}
      <div className="flex gap-2">
        <button type="button" className={iconBtn} onClick={() => onLayer(component.id, 1)} title="Bring forward">
          <IconChevronUp size={14} /> Forward
        </button>
        <button type="button" className={iconBtn} onClick={() => onLayer(component.id, -1)} title="Send backward">
          <IconChevronDown size={14} /> Back
        </button>
      </div>
      <div className="flex gap-2">
        <Button variant="default" size="sm" className="flex-1" leftSection={<IconCopy size={14} />} onClick={() => onDuplicateMany([component.id])}>
          Duplicate
        </Button>
        <Button variant="default" color="red" size="sm" className="flex-1" leftSection={<IconTrash size={14} />} onClick={() => onDeleteMany([component.id])}>
          Delete
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------- Multi-select ------------------------------- */

function MultiPanel({ selection, groups, canGroup, onDeleteMany, onDuplicateMany, onCreateGroup }: PropertiesInspectorProps) {
  const suggested = `Group ${groups.length + 1}`;
  const [name, setName] = useState(suggested);
  const ids = selection.map((c) => c.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
        {selection.length} components selected
      </div>

      {canGroup && (
        <Row label="Make repeating group">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              aria-label="Group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={suggested}
              className={cn(inputCls, 'font-mono')}
            />
            <Button variant="default" size="sm" leftSection={<IconStack size={14} />} onClick={() => onCreateGroup(ids, name)}>
              Group
            </Button>
          </div>
          <span className="text-[11px] text-stone-400 dark:text-stone-500">
            These components repeat together at fill time (e.g. one entry per group).
          </span>
        </Row>
      )}

      <div className="flex gap-2">
        <Button variant="default" size="sm" className="flex-1" leftSection={<IconCopy size={14} />} onClick={() => onDuplicateMany(ids)}>
          Duplicate all
        </Button>
        <Button variant="default" color="red" size="sm" className="flex-1" leftSection={<IconTrash size={14} />} onClick={() => onDeleteMany(ids)}>
          Delete all
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ Group panel -------------------------------- */

function GroupPanel({
  group,
  onRenameGroup,
  onSetGroupDirection,
  onUngroup,
  onDeleteGroup,
}: PropertiesInspectorProps & { group: ComponentGroup }) {
  const dirs: { value: GroupDirection; label: string; icon: typeof IconArrowsVertical; hint: string }[] = [
    { value: 'column', label: 'Column', icon: IconArrowsVertical, hint: 'Stack entries vertically (down)' },
    { value: 'row', label: 'Row', icon: IconArrowsHorizontal, hint: 'Place entries side by side (right)' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 rounded-md bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
        <IconStack size={14} /> Repeating group
      </div>

      <Row label="Group name">
        <input
          type="text"
          aria-label="Group name"
          value={group.name}
          onChange={(e) => onRenameGroup(group.id, e.target.value)}
          className={cn(inputCls, 'font-mono')}
        />
        <span className="text-[11px] text-stone-400 dark:text-stone-500">
          Used as the array key when filling (e.g. data.{group.name || '…'}).
        </span>
      </Row>

      <Row label="Layout">
        <div className="flex gap-1">
          {dirs.map((d) => {
            const active = (group.direction ?? 'column') === d.value;
            const Icon = d.icon;
            return (
              <button
                key={d.value}
                type="button"
                title={d.hint}
                aria-pressed={active}
                onClick={() => onSetGroupDirection(group.id, d.value)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md border py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                    : 'border-stone-300 text-stone-500 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-700',
                )}
              >
                <Icon size={15} /> {d.label}
              </button>
            );
          })}
        </div>
        <span className="text-[11px] text-stone-400 dark:text-stone-500">
          Entries fill the page then flow to the next. Column fills downward then opens a new column; row fills across then opens a new row.
        </span>
      </Row>

      <p className="text-xs text-stone-500 dark:text-stone-400">
        {group.memberIds.length} {group.memberIds.length === 1 ? 'component' : 'components'} in this group.
      </p>

      <div className="flex gap-2">
        <Button variant="default" size="sm" className="flex-1" leftSection={<IconRectangleRoundedTop size={14} />} onClick={() => onUngroup(group.id)}>
          Ungroup
        </Button>
        <Button variant="default" color="red" size="sm" className="flex-1" leftSection={<IconTrash size={14} />} onClick={() => onDeleteGroup(group.id)}>
          Delete
        </Button>
      </div>
      <p className="text-[11px] text-stone-400 dark:text-stone-500">
        Ungroup keeps the components; Delete removes them too.
      </p>
    </div>
  );
}

/* ----------------------------------- Text ----------------------------------- */

function TextControls({
  component,
  tokens,
  patch,
}: {
  component: Extract<CanvasComponent, { kind: 'text' }>;
  tokens: string[];
  patch: (p: Partial<CanvasComponent>) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const newFieldRef = useRef<HTMLInputElement>(null);

  // Debug helper - check canvas textarea state (available as window.debugCanvasTextarea())
  const debugCanvasTextarea = () => {
    const canvasData = (window as any).__canvasEditingTextarea;
    return {
      component: component.id,
      isActive: canvasData?.componentId === component.id,
      canvasData,
      textarea: canvasData?.ref ? {
        value: canvasData.getContent?.()?.substring(0, 100),
        selection: canvasData.getSelection?.(),
        focused: document.activeElement === canvasData.ref,
      } : null,
    };
  };

  // Expose debug function to window for console testing
  useEffect(() => {
    (window as any).debugCanvasTextarea = debugCanvasTextarea;
    return () => {
      delete (window as any).debugCanvasTextarea;
    };
  }, [component.id, debugCanvasTextarea]);

  const insertToken = (token: string) => {
    const el = textareaRef.current;
    const text = `{{${token}}}`;
    if (!el) {
      patch({ content: component.content + text, marks: sanitizeMarks(component.marks, component.content.length + text.length) });
      return;
    }
    const start = el.selectionStart ?? component.content.length;
    const end = el.selectionEnd ?? component.content.length;
    const next = component.content.slice(0, start) + text + component.content.slice(end);
    patch({ content: next, marks: sanitizeMarks(component.marks, next.length) });
    // Restore caret after the inserted token.
    requestAnimationFrame(() => {
      const caret = start + text.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const commitNewField = () => {
    const el = newFieldRef.current;
    const name = (el?.value ?? '').trim();
    if (!name) return;
    insertToken(name);
    if (el) el.value = '';
  };

  /** Apply a style across the current selection. The selection is in `content`
   * coordinates, which is exactly the mark coordinate system. When editing on
   * the canvas the live text/marks are read and written via the
   * `__canvasEditingTextarea` bridge so the on-canvas editor updates
   * immediately; otherwise the controlled `component` is patched. */
  const applyMark = (patch_: Partial<Omit<TextMark, 'start' | 'end'>>) => {
    // Try to use canvas editing first, fall back to properties panel textarea
    const canvasData = (window as any).__canvasEditingTextarea;
    const isCanvasActive = canvasData?.componentId === component.id;

    let content: string;
    let marks: TextMark[] | undefined;
    let start: number;
    let end: number;
    if (isCanvasActive && canvasData?.ref) {
      content = canvasData.content?.() ?? component.content;
      marks = canvasData.marks?.() ?? component.marks;
      const sel = canvasData.getSelection?.();
      if (!sel || sel.end <= sel.start) return false;
      start = sel.start;
      end = sel.end;
    } else {
      // Fall back to the last on-canvas edit state if one exists for this
      // component — it survives the edit session ending (e.g. when the native
      // color picker dialog steals focus and the 200ms finish timer runs).
      const lastEdit = (window as any).__canvasLastEdit;
      if (lastEdit?.componentId === component.id && lastEdit.selection && lastEdit.selection.end > lastEdit.selection.start) {
        content = lastEdit.content;
        marks = lastEdit.marks;
        start = lastEdit.selection.start;
        end = lastEdit.selection.end;
      } else {
        const el = textareaRef.current;
        if (!el) return false;
        content = component.content;
        marks = component.marks;
        start = el.selectionStart ?? 0;
        end = el.selectionEnd ?? 0;
        if (end <= start) return false;
      }
    }

    const next = mergeMarkRange(
      content,
      {
        fontWeight: component.fontWeight,
        fontStyle: component.fontStyle,
        textDecoration: component.textDecoration,
        fontSize: component.fontSize,
        color: component.color,
      },
      marks,
      start,
      end,
      patch_,
    );

    // If editing on canvas, write through the bridge and keep editing; the
    // final content+marks are committed together when editing finishes.
    if (isCanvasActive) {
      canvasData.setMarks?.(next);
      setTimeout(() => {
        canvasData.setSelection?.(start, end);
        canvasData.focus?.();
      }, 0);
    } else {
      patch({ marks: next });
    }

    // Consume any persisted on-canvas selection — a subsequent click without
    // a new selection must affect the whole text, not reuse this range.
    const lastEdit = (window as any).__canvasLastEdit;
    if (lastEdit?.componentId === component.id) lastEdit.selection = null;

    return true;
  };

  const aligns: { value: HorizontalAlign; icon: typeof IconAlignLeft }[] = [
    { value: 'left', icon: IconAlignLeft },
    { value: 'center', icon: IconAlignCenter },
    { value: 'right', icon: IconAlignRight },
  ];

  return (
    <>
      <Row label="Content">
        <textarea
          ref={textareaRef}
          rows={3}
          value={component.content}
          onChange={(e) => patch({ content: e.target.value, marks: sanitizeMarks(component.marks, e.target.value.length) })}
          onFocus={() => {
            // Editing from the panel — the textarea selection should win, so
            // invalidate any leftover on-canvas persisted selection.
            const lastEdit = (window as any).__canvasLastEdit;
            if (lastEdit?.componentId === component.id) lastEdit.selection = null;
          }}
          placeholder="Type text… use {{field name}} for fillable fields"
          className={cn(inputCls, 'h-auto resize-none py-1.5')}
        />
      </Row>
      <Row label="Insert field">
        <div className="flex flex-wrap gap-1.5">
          {tokens.length === 0 ? (
            <span className="text-xs text-stone-400">No fields yet — type a name below.</span>
          ) : (
            tokens.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => insertToken(t)}
                className="rounded bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100 dark:bg-orange-950/50 dark:text-orange-300 dark:hover:bg-orange-900/60"
              >
                {`{{${t}}}`}
              </button>
            ))
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <input
            ref={newFieldRef}
            type="text"
            placeholder="new-field-name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitNewField();
              }
            }}
            className={cn(inputCls, 'font-mono')}
          />
          <Button variant="default" size="sm" onClick={commitNewField}>
            Insert
          </Button>
        </div>
      </Row>

      <div className="grid grid-cols-2 gap-3">
        <Row label="Font size">
          <NumberField ariaLabel="Font size" min={6} value={component.fontSize} onChange={(n) => patch({ fontSize: n })} />
        </Row>
        <Row label="Line height">
          <NumberField ariaLabel="Line height" min={0.5} step={0.1} value={component.lineHeight} onChange={(n) => patch({ lineHeight: n })} />
        </Row>
      </div>

      <Row label="Text style">
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Bold"
            onClick={() => {
              if (!applyMark({ fontWeight: 'bold' })) {
                patch({ fontWeight: component.fontWeight === 'bold' ? 'normal' : 'bold' });
              }
            }}
            className={cn(
              iconBtn,
              component.fontWeight === 'bold'
                ? 'border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                : 'border-stone-300 text-stone-500 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-700',
            )}
          >
            <IconBold size={16} />
          </button>
          <button
            type="button"
            aria-label="Italic"
            onClick={() => {
              if (!applyMark({ fontStyle: 'italic' })) {
                patch({ fontStyle: component.fontStyle === 'italic' ? 'normal' : 'italic' });
              }
            }}
            className={cn(
              iconBtn,
              component.fontStyle === 'italic'
                ? 'border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                : 'border-stone-300 text-stone-500 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-700',
            )}
          >
            <IconItalic size={16} />
          </button>
          <button
            type="button"
            aria-label="Underline"
            onClick={() => {
              if (!applyMark({ textDecoration: 'underline' })) {
                patch({ textDecoration: component.textDecoration === 'underline' ? 'none' : 'underline' });
              }
            }}
            className={cn(
              iconBtn,
              component.textDecoration === 'underline'
                ? 'border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                : 'border-stone-300 text-stone-500 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-700',
            )}
          >
            <IconUnderline size={16} />
          </button>
        </div>
      </Row>

      <Row label="Color">
        <ColorField value={component.color} onChange={(v) => {
          if(!applyMark({ color: v })) patch({ color: v })}} />
      </Row>

      <Row label="Align">
        <div className="flex gap-1">
          {aligns.map((a) => (
            <button
              key={a.value}
              type="button"
              aria-label={`Align ${a.value}`}
              onClick={() => patch({ align: a.value })}
              className={cn(
                'flex flex-1 items-center justify-center rounded-md border py-1.5 transition-colors',
                component.align === a.value
                  ? 'border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                  : 'border-stone-300 text-stone-500 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-700',
              )}
            >
              <a.icon size={16} />
            </button>
          ))}
        </div>
      </Row>
    </>
  );
}

/* ---------------------------------- Image ----------------------------------- */

function ImageControls({
  component,
  patch,
}: {
  component: Extract<CanvasComponent, { kind: 'image' }>;
  patch: (p: Partial<CanvasComponent>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    // Normalize (re-encode as a clean non-interlaced PNG) so pdfkit renders it
    // correctly — raw screenshots/interlaced PNGs come out broken/faint.
    const dataUrl = await normalizeImageToPng(file);
    patch({ src: dataUrl });
  };

  return (
    <>
      <Row label="Field name (optional)">
        <input
          type="text"
          aria-label="Field name"
          value={component.field}
          onChange={(e) => patch({ field: e.target.value })}
          placeholder="e.g. logo, photo, signature"
          className={cn(inputCls, 'font-mono')}
        />
        <span className="text-[11px] text-stone-400 dark:text-stone-500">
          Set a name to make this a fillable image field.
        </span>
      </Row>

      <Row label="Default image">
        <input
          type="text"
          aria-label="Image URL"
          value={component.src.startsWith('data:') ? '' : component.src}
          placeholder={component.src.startsWith('data:') ? 'Uploaded image' : 'https://…'}
          onChange={(e) => patch({ src: e.target.value })}
          className={inputCls}
        />
      </Row>
      <div className="flex items-center gap-2">
        <Button variant="default" size="sm" leftSection={<IconUpload size={14} />} onClick={() => fileRef.current?.click()}>
          Upload
        </Button>
        {component.src && (
          <img
            src={component.src}
            alt=""
            className="size-10 rounded-md border border-stone-300 object-cover dark:border-stone-600"
          />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
      </div>
      <Row label="Alt text">
        <input type="text" aria-label="Alt text" value={component.alt} onChange={(e) => patch({ alt: e.target.value })} className={inputCls} />
      </Row>
      <div className="grid grid-cols-2 gap-3">
        <Row label="Object fit">
          <Dropdown
            panelClassName="w-full"
            trigger={
              <div className={cn(inputCls, 'flex cursor-pointer items-center justify-between capitalize')}>
                <span>{component.objectFit}</span>
                <span className="text-xs text-stone-400">▼</span>
              </div>
            }
          >
            {(['cover', 'contain', 'fill'] as ObjectFit[]).map((f) => (
              <DropdownItem key={f} className="capitalize" onClick={() => patch({ objectFit: f })}>
                {f}
              </DropdownItem>
            ))}
          </Dropdown>
        </Row>
        <Row label="Corner radius">
          <NumberField ariaLabel="Corner radius" min={0} value={component.radius} onChange={(n) => patch({ radius: Math.max(0, n) })} />
        </Row>
      </div>
    </>
  );
}

/* ---------------------------------- Shape ----------------------------------- */

function ShapeControls({
  component,
  patch,
}: {
  component: ShapeComponent;
  patch: (p: Partial<CanvasComponent>) => void;
}) {
  const isLine = component.shape === 'line';
  return (
    <>
      <Row label="Shape">
        <Dropdown
          panelClassName="w-full"
          trigger={
            <div className={cn(inputCls, 'flex cursor-pointer items-center justify-between capitalize')}>
              <span>{component.shape}</span>
              <span className="text-xs text-stone-400">▼</span>
            </div>
          }
        >
          {(['rectangle', 'ellipse', 'line'] as ShapeKind[]).map((s) => (
            <DropdownItem key={s} className="capitalize" onClick={() => patch({ shape: s })}>
              {s}
            </DropdownItem>
          ))}
        </Dropdown>
      </Row>
      {!isLine && (
        <Row label="Fill">
          <ColorField value={component.fill} onChange={(v) => patch({ fill: v })} allowTransparent />
        </Row>
      )}
      <Row label="Stroke">
        <ColorField value={component.stroke} onChange={(v) => patch({ stroke: v })} allowTransparent />
      </Row>
      <div className="grid grid-cols-2 gap-3">
        <Row label="Stroke width">
          <NumberField ariaLabel="Stroke width" min={0} value={component.strokeWidth} onChange={(n) => patch({ strokeWidth: n })} />
        </Row>
        {component.shape === 'rectangle' && (
          <Row label="Corner radius">
            <NumberField ariaLabel="Corner radius" min={0} value={component.radius} onChange={(n) => patch({ radius: n })} />
          </Row>
        )}
      </div>
    </>
  );
}

function TableControls({ component, patch }: { component: TableComponent; patch: (p: Partial<TableComponent>) => void }) {
  const onRowsChange = (n: number) => {
    const rows = Math.max(1, Math.round(n));
    const cols = component.cols;
    const currentCells = component.cells ?? [];
    // Preserve existing cells, pad with empty strings, or truncate
    const newCells = Array.from({ length: rows * cols }, (_, i) => currentCells[i] ?? '');
    patch({ rows, cells: newCells });
  };

  const onColsChange = (n: number) => {
    const cols = Math.max(1, Math.round(n));
    const rows = component.rows;
    const currentCells = component.cells ?? [];
    // Preserve existing cells, pad with empty strings, or truncate
    const newCells = Array.from({ length: rows * cols }, (_, i) => {
      // Rebuild row-major from old layout: old cell at (r, c) moves to new position
      const oldR = Math.floor(i / cols);
      const oldC = i % cols;
      const oldIdx = oldR * component.cols + oldC;
      return oldIdx < currentCells.length ? currentCells[oldIdx] ?? '' : '';
    });
    patch({ cols, cells: newCells });
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Row label="Rows">
          <NumberField ariaLabel="Rows" min={1} value={component.rows} onChange={(n) => onRowsChange(n)} />
        </Row>
        <Row label="Cols">
          <NumberField ariaLabel="Columns" min={1} value={component.cols} onChange={(n) => onColsChange(n)} />
        </Row>
      </div>

      <Row label="Row height">
        <NumberField ariaLabel="Row height" min={12} value={component.rowHeight} onChange={(n) => patch({ rowHeight: n })} />
      </Row>

      <Row label="Border">
        <Dropdown
          panelClassName="w-full"
          trigger={
            <div className={inputCls}>
              <span className="capitalize">{component.border}</span>
              <span className="text-xs text-stone-400">▼</span>
            </div>
          }
        >
          {(['none', 'outline', 'grid'] as TableBorder[]).map((b) => (
            <DropdownItem key={b} className="capitalize" onClick={() => patch({ border: b })}>
              {b}
            </DropdownItem>
          ))}
        </Dropdown>
      </Row>

      <div className="flex items-center gap-2">
        <Switch
          label="Zebra striping"
          checked={component.zebra}
          onChange={(e) => patch({ zebra: e.target.checked })}
        />
        {component.zebra && (
          <ColorField value={component.zebraColor} onChange={(v) => patch({ zebraColor: v })} allowTransparent />
        )}
      </div>

      {component.zebra && (
        <Row label="Zebra color">
          <ColorField value={component.zebraColor} onChange={(v) => patch({ zebraColor: v })} allowTransparent />
        </Row>
      )}

      <Row label="Header fill">
        <ColorField value={component.headerFill} onChange={(v) => patch({ headerFill: v })} allowTransparent />
      </Row>

      <div className="grid grid-cols-3 gap-3">
        <Row label="Size">
          <NumberField ariaLabel="Font size" min={8} value={component.fontSize} onChange={(n) => patch({ fontSize: n })} />
        </Row>
        <Row label="Weight">
          <Dropdown
            panelClassName="w-full"
            trigger={
              <div className={inputCls}>
                <span className="capitalize">{component.fontWeight}</span>
                <span className="text-xs text-stone-400">▼</span>
              </div>
            }
          >
            {(['normal', 'medium', 'semibold', 'bold'] as FontWeight[]).map((w) => (
              <DropdownItem key={w} className="capitalize" onClick={() => patch({ fontWeight: w })}>
                {w}
              </DropdownItem>
            ))}
          </Dropdown>
        </Row>
        <Row label="Align">
          <Dropdown
            panelClassName="w-full"
            trigger={
              <div className={inputCls}>
                <span className="capitalize">{component.align}</span>
                <span className="text-xs text-stone-400">▼</span>
              </div>
            }
          >
            {(['left', 'center', 'right'] as HorizontalAlign[]).map((a) => (
              <DropdownItem key={a} className="capitalize" onClick={() => patch({ align: a })}>
                {a}
              </DropdownItem>
            ))}
          </Dropdown>
        </Row>
      </div>

      <Row label="Color">
        <ColorField value={component.color} onChange={(v) => patch({ color: v })} />
      </Row>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-stone-400 hover:text-stone-600">Edit cell contents</summary>
        <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${component.cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: component.rows * component.cols }, (_, i) => {
            const r = Math.floor(i / component.cols);
            const c = i % component.cols;
            const cellValue = (component.cells ?? [])[i] ?? '';
            return (
              <input
                key={i}
                type="text"
                value={cellValue}
                onChange={(e) => {
                  const newCells = [...(component.cells ?? [])];
                  newCells[i] = e.target.value;
                  patch({ cells: newCells });
                }}
                placeholder={`R${r + 1}C${c + 1}`}
                className="h-7 w-full rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-800 transition-colors placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
              />
            );
          })}
        </div>
      </details>
    </>
  );
}
