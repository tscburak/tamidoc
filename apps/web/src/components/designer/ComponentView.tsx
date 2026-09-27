import { canvasFontFamily } from './fonts';
import { useLayoutEffect, useRef, useState, useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '../../lib/cn';
import { resizeBox, snapMove, snapResize, type Handle, type Guides } from '../../hooks/useSnap';
import { normalizeAngle, type CanvasSize } from './coordinates';
import { ComponentBody } from './ComponentBody';
import type { Box, CanvasComponent, FontStyle, FontWeight, TextComponent, TextDecoration, TextMark } from './types';

const WEIGHT: Record<FontWeight, number> = { normal: 400, medium: 500, semibold: 600, bold: 700 };

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Effective per-char style (base overridden by overlapping marks). */
function effectiveAt(
  marks: TextMark[] | undefined,
  base: { fontSize: number; fontWeight: FontWeight; fontStyle: FontStyle; textDecoration: TextDecoration; color: string },
  pos: number,
) {
  let fontSize = base.fontSize;
  let fontWeight = base.fontWeight;
  let fontStyle = base.fontStyle;
  let textDecoration = base.textDecoration;
  let color = base.color;
  if (marks) {
    for (const m of marks) {
      if (m.start <= pos && pos < m.end) {
        if (typeof m.fontSize === 'number') fontSize = m.fontSize;
        if (m.fontWeight) fontWeight = m.fontWeight;
        if (m.fontStyle) fontStyle = m.fontStyle;
        if (m.textDecoration) textDecoration = m.textDecoration;
        if (m.color) color = m.color;
      }
    }
  }
  return { fontSize, fontWeight, fontStyle, textDecoration, color };
}

/** Render the edited text as inline HTML with marks applied. Used with
 * `dangerouslySetInnerHTML` inside the contenteditable so the visible text —
 * and therefore caret/selection — has the same per-char metrics as the marks. */
function renderEditHtml(
  content: string,
  marks: TextMark[] | undefined,
  base: { fontSize: number; fontWeight: FontWeight; fontStyle: FontStyle; textDecoration: TextDecoration; color: string },
): string {
  let html = '';
  let i = 0;
  while (i < content.length) {
    const s = effectiveAt(marks, base, i);
    let j = i + 1;
    while (j < content.length) {
      const n = effectiveAt(marks, base, j);
      if (
        n.fontSize !== s.fontSize ||
        n.fontWeight !== s.fontWeight ||
        n.fontStyle !== s.fontStyle ||
        n.textDecoration !== s.textDecoration ||
        n.color !== s.color
      ) break;
      j++;
    }
    const style = `font-size:${s.fontSize}px;font-weight:${WEIGHT[s.fontWeight]};font-style:${s.fontStyle};text-decoration:${s.textDecoration};color:${s.color}`;
    html += `<span style="${style}">${escapeHtml(content.slice(i, j))}</span>`;
    i = j;
  }
  return html;
}

/** Flat text offset of an arbitrary DOM boundary (node + char/child offset)
 * measured from the start of `root`. Works for both text nodes and elements. */
function flatPosOf(root: HTMLElement, node: Node, offset: number): number {
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(node, offset);
  return pre.toString().length;
}

/** Flat text offsets of the current selection/caret within `root`. Backward
 * selections (drag right-to-left) put `range.start` at the visual end, so each
 * boundary is measured independently and sorted — otherwise the range would be
 * inverted and marks would land on the excluded text. */
function getFlatSelection(root: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  let start = flatPosOf(root, range.startContainer, range.startOffset);
  let end = flatPosOf(root, range.endContainer, range.endOffset);
  if (start > end) [start, end] = [end, start];
  return { start, end };
}

/** Place the selection/caret at flat text offsets within `root`. */
function setFlatSelection(root: HTMLElement, start: number, end: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  let pos = 0;
  let last: Text | null = null;
  while (walker.nextNode()) {
    const t = walker.currentNode as Text;
    last = t;
    const len = t.data.length;
    const next = pos + len;
    if (!startNode && start <= next) {
      startNode = t;
      startOffset = Math.max(0, Math.min(start - pos, len));
    }
    if (!endNode && end <= next) {
      endNode = t;
      endOffset = Math.max(0, Math.min(end - pos, len));
      break;
    }
    pos = next;
  }
  if (!startNode) {
    if (last) {
      startNode = last;
      startOffset = last.data.length;
      endNode = last;
      endOffset = last.data.length;
    } else {
      range.selectNodeContents(root);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
  }
  if (!endNode) {
    endNode = last ?? startNode;
    endOffset = last ? last.data.length : startOffset;
  }
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Resize handle size (design px). */
const HS = 10;
const HALF = HS / 2;

/** Rotation handle: grip distance above the top edge, and grip radius (design px). */
const ROT_OFFSET = 24;
const ROT_R = 8;

const HANDLES: { key: Handle; pos: (w: number, h: number) => { left: number; top: number }; cursor: string }[] = [
  { key: 'nw', pos: () => ({ left: -HALF, top: -HALF }), cursor: 'nwse-resize' },
  { key: 'n', pos: (w) => ({ left: w / 2 - HALF, top: -HALF }), cursor: 'ns-resize' },
  { key: 'ne', pos: (w) => ({ left: w - HALF, top: -HALF }), cursor: 'nesw-resize' },
  { key: 'e', pos: (w, h) => ({ left: w - HALF, top: h / 2 - HALF }), cursor: 'ew-resize' },
  { key: 'se', pos: (w, h) => ({ left: w - HALF, top: h - HALF }), cursor: 'nwse-resize' },
  { key: 's', pos: (w, h) => ({ left: w / 2 - HALF, top: h - HALF }), cursor: 'ns-resize' },
  { key: 'sw', pos: (_w, h) => ({ left: -HALF, top: h - HALF }), cursor: 'nesw-resize' },
  { key: 'w', pos: (_w, h) => ({ left: -HALF, top: h / 2 - HALF }), cursor: 'ew-resize' },
];

export interface ComponentViewProps {
  component: CanvasComponent;
  selected: boolean;
  siblings: CanvasComponent[];
  canvasSize: CanvasSize;
  zoom: number;
  zIndex: number;
  /** Extra snap targets (e.g. alignment guide lines). */
  snapGuides?: Guides;
  /** `additive` true = toggle in the selection set (shift-click); false = select
   * only this component (plain click). `null` = deselect (background click). */
  onSelect: (id: string, additive: boolean) => void;
  onChange: (id: string, patch: Partial<CanvasComponent>) => void;
  onGuides: (guides: Guides) => void;
}

interface Session {
  mode: 'move' | 'resize' | 'rotate';
  handle?: Handle;
  startClientX: number;
  startClientY: number;
  orig: Box;
  pointerId: number;
}

/** Shift mark ranges to follow edits made in the editor. Given the text
 * before/after a single edit: marks before the edit point keep their
 * positions, marks after it shift by the length delta, and marks fully inside
 * a replaced selection are dropped. */
function adjustMarksForEdit(
  original: string,
  edited: string,
  marks: TextMark[] | undefined,
): TextMark[] | undefined {
  if (!marks || marks.length === 0) return marks;
  const minLen = Math.min(original.length, edited.length);
  let start = 0;
  while (start < minLen && original[start] === edited[start]) start++;
  let endO = original.length;
  let endE = edited.length;
  while (endO > start && endE > start && original[endO - 1] === edited[endE - 1]) {
    endO--;
    endE--;
  }
  const delta = endE - endO;
  const len = edited.length;
  const out: TextMark[] = [];
  for (const m of marks) {
    let s = m.start;
    let e = m.end;
    if (e <= start) {
      // Entirely before the edit point — unchanged.
      out.push(m);
      continue;
    }
    if (s >= endO) {
      // Entirely after the edit point — shift by the length delta.
      s += delta;
      e += delta;
    } else if (s >= start && e <= endO) {
      // Fully inside the replaced region — dropped with the old text.
      continue;
    } else if (s < start && e > endO) {
      // Spans across the edit point — keep, shift the tail.
      e += delta;
    } else if (s < start) {
      // Overlaps the left edge of the replaced region — trim to it.
      e = start;
    } else {
      // Overlaps the right edge — shift the part after the edit.
      s += delta;
      e += delta;
    }
    s = Math.max(0, Math.min(s, len));
    e = Math.max(0, Math.min(e, len));
    if (e > s) out.push({ ...m, start: s, end: e });
  }
  return out.length ? out : undefined;
}

export function ComponentView({
  component,
  selected,
  siblings,
  canvasSize,
  zoom,
  zIndex,
  snapGuides,
  onSelect,
  onChange,
  onGuides,
}: ComponentViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editDivRef = useRef<HTMLDivElement>(null);
  const session = useRef<Session | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editMarks, setEditMarks] = useState<TextMark[] | undefined>();
  const editTextRef = useRef('');
  const editMarksRef = useRef<TextMark[] | undefined>(undefined);
  /** Latest flat selection within the contenteditable (survives blur so the
   * properties panel can read it after the textarea loses focus). */
  const editSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const compositionRef = useRef(false);
  const finishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // hidden/locked components are non-interactive on the canvas — they're only
  // selectable/manipulable from the Layers panel.
  const hidden = !!component.hidden;
  const locked = !!component.locked;
  const interactive = !hidden && !locked;

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (component.kind === 'text' && interactive && !isEditing) {
      e.stopPropagation();
      setIsEditing(true);
      setEditText(component.content);
      editTextRef.current = component.content;
      setEditMarks(component.marks);
      editMarksRef.current = component.marks;
      editSelectionRef.current = null;
      // Select the component when double-clicking
      onSelect(component.id, false);
    }
  };

  const finishEditing = () => {
    if (isEditing && component.kind === 'text') {
      // Clear any pending finish timeout
      if (finishTimeoutRef.current) {
        clearTimeout(finishTimeoutRef.current);
        finishTimeoutRef.current = null;
      }
      // Clean up global reference
      if ((window as any).__canvasEditingTextarea?.componentId === component.id) {
        delete (window as any).__canvasEditingTextarea;
      }
      setIsEditing(false);
      const content = editTextRef.current;
      const marks = editMarksRef.current;
      if (content !== component.content || marks !== component.marks) {
        onChange(component.id, { content, marks });
      }
    }
  };

  // Delayed finish to allow formatting buttons to work
  const scheduleFinish = () => {
    if (finishTimeoutRef.current) {
      clearTimeout(finishTimeoutRef.current);
    }
    finishTimeoutRef.current = setTimeout(() => {
      finishEditing();
    }, 200); // 200ms delay to allow button clicks to process
  };

  // Cancel scheduled finish (e.g., when user continues typing)
  const cancelScheduledFinish = () => {
    if (finishTimeoutRef.current) {
      clearTimeout(finishTimeoutRef.current);
      finishTimeoutRef.current = null;
    }
  };

  /** Read the contenteditable's text + caret, shift marks accordingly, and push
   * both into state. Called on input / after IME composition. */
  const syncEditFromDom = () => {
    const div = editDivRef.current;
    if (!div) return;
    const prev = editTextRef.current;
    const next = div.innerText ?? '';
    const selection = getFlatSelection(div);
    editSelectionRef.current = selection;
    if (next === prev) return;
    editTextRef.current = next;
    setEditText(next);
    editMarksRef.current = adjustMarksForEdit(prev, next, editMarksRef.current);
    setEditMarks(editMarksRef.current);
    persistLastEdit();
    cancelScheduledFinish();
  };

  const captureEditSelection = () => {
    const div = editDivRef.current;
    if (!div) return;
    editSelectionRef.current = getFlatSelection(div);
    persistLastEdit();
  };

  /** Persist the last on-canvas edit state (content, marks, selection) so the
   * properties panel can still act on it after the edit session ends (e.g.
   * when picking a color from the native picker takes >200ms and the bridge
   * is torn down by finishEditing). */
  const persistLastEdit = () => {
    (window as any).__canvasLastEdit = {
      componentId: component.id,
      content: editTextRef.current,
      marks: editMarksRef.current,
      selection: editSelectionRef.current,
    };
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    cancelScheduledFinish(); // Keep editing during keyboard interaction
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      editDivRef.current?.blur();
    } else if (e.key === 'Enter' && e.shiftKey) {
      // Insert a real "\n" text node (not a <br>) so text offsets stay
      // consistent between the DOM, innerText, and flat selections.
      e.preventDefault();
      document.execCommand('insertText', false, '\n');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      const text = component as TextComponent;
      editTextRef.current = text.content;
      setEditText(text.content);
      editMarksRef.current = text.marks;
      setEditMarks(text.marks);
      editSelectionRef.current = null;
      editDivRef.current?.blur();
    }
  };

  // Update content when component changes externally (e.g., from properties panel)
  useEffect(() => {
    if (isEditing && component.kind === 'text') {
      setEditText(component.content);
      editTextRef.current = component.content;
      setEditMarks(component.marks);
      editMarksRef.current = component.marks;
      editSelectionRef.current = null;
    }
  }, [(component as TextComponent).content, (component as TextComponent).marks, isEditing, component.kind]);

  // Focus + place the caret on entering edit mode.
  useEffect(() => {
    if (isEditing && component.kind === 'text' && editDivRef.current) {
      editDivRef.current.focus();
      const len = editTextRef.current.length;
      setFlatSelection(editDivRef.current, len, len);
    }
  }, [isEditing, component.kind]);

  // Restore the caret/selection after React rewrites the contenteditable's
  // innerHTML (which clears the browser's selection).
  useLayoutEffect(() => {
    if (isEditing && component.kind === 'text' && editDivRef.current) {
      const sel = editSelectionRef.current;
      if (sel) setFlatSelection(editDivRef.current, sel.start, sel.end);
    }
  }, [editText, editMarks, isEditing, component.kind]);

  // Expose the editing node globally for properties panel to read the live
  // text, marks, and selection (survives blur so formatting buttons can act
  // on the on-canvas selection).
  useEffect(() => {
    if (isEditing && editDivRef.current && component.kind === 'text') {
      (window as any).__canvasEditingTextarea = {
        ref: editDivRef.current,
        componentId: component.id,
        content: () => editTextRef.current,
        marks: () => editMarksRef.current,
        setMarks: (next: TextMark[] | undefined) => {
          editMarksRef.current = next;
          setEditMarks(next);
        },
        getSelection: () => editSelectionRef.current ?? (editDivRef.current ? getFlatSelection(editDivRef.current) : null),
        setSelection: (start: number, end: number) => {
          const div = editDivRef.current;
          if (!div) return;
          div.focus();
          setFlatSelection(div, start, end);
          editSelectionRef.current = { start, end };
        },
        focus: () => editDivRef.current?.focus(),
        getContent: () => editTextRef.current,
      };
    }
    // Only cleanup when actually done editing (finishEditing handles this)
    return () => {
      // Don't auto-cleanup - let finishEditing handle it
    };
  }, [isEditing, component.id, component.kind]);

  const begin = (e: ReactPointerEvent, mode: 'move' | 'resize' | 'rotate', handle?: Handle) => {
    if (!interactive || e.button !== 0) return;
    // Don't start move/resize if currently editing text
    if (isEditing && component.kind === 'text') return;
    e.stopPropagation();
    if (mode === 'move') {
      if (e.shiftKey) onSelect(component.id, true); // toggle membership in the set
      else if (!selected) onSelect(component.id, false); // plain click selects only this
      // already-selected + no shift: keep current (multi) selection intact for dragging
    } else {
      // resize / rotate handle: ensure selected, but never collapse a multi-selection
      if (!selected) onSelect(component.id, false);
    }
    rootRef.current?.setPointerCapture(e.pointerId);
    session.current = {
      mode,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      orig: { x: component.x, y: component.y, width: component.width, height: component.height },
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const s = session.current;
    if (!s) return;

    if (s.mode === 'rotate') {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      // A rotated rectangle's bounding box is symmetric about its center, so
      // the AABB center is the true geometric center at any zoom/rotation.
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // Handle-above-center = 0°, clockwise positive (matches CSS rotate).
      let deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15; // snap to 15° increments
      onChange(component.id, { rotation: normalizeAngle(deg) });
      return;
    }

    const dx = (e.clientX - s.startClientX) / zoom;
    const dy = (e.clientY - s.startClientY) / zoom;

    if (s.mode === 'move') {
      const candidate: Box = { ...s.orig, x: s.orig.x + dx, y: s.orig.y + dy };
      const snap = snapMove(candidate, siblings, canvasSize, snapGuides);
      onChange(component.id, { x: snap.x, y: snap.y });
      onGuides({ vertical: snap.vertical, horizontal: snap.horizontal });
    } else if (s.handle) {
      // Rotate the screen-space delta into the box's local (axis-aligned) frame
      // so resize handles track the cursor at any rotation. CSS rotate(θ) is
      // clockwise (screen y grows downward); the inverse is rotation by -θ.
      const rad = (component.rotation * Math.PI) / 180;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      const localDx = dx * cosR + dy * sinR;
      const localDy = -dx * sinR + dy * cosR;
      const candidate = resizeBox(s.orig, s.handle, localDx, localDy);
      const snap = snapResize(s.handle, candidate, siblings, canvasSize, snapGuides);
      onChange(component.id, { x: snap.box.x, y: snap.box.y, width: snap.box.width, height: snap.box.height });
      onGuides({ vertical: snap.vertical, horizontal: snap.horizontal });
    }
  };

  const onPointerUp = (_e: ReactPointerEvent) => {
    const s = session.current;
    if (!s) return;
    try {
      rootRef.current?.releasePointerCapture(s.pointerId);
    } catch {
      /* ignore */
    }
    session.current = null;
    onGuides({ vertical: [], horizontal: [] });
  };

  return (
    <div
      ref={rootRef}
      onPointerDown={(e) => {
        // When editing text, allow normal caret/selection behavior
        if (!isEditing) begin(e, 'move');
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={handleDoubleClick}
      style={{
        position: 'absolute',
        left: component.x,
        top: component.y,
        width: component.width,
        height: component.height,
        zIndex: selected ? 1000 : zIndex,
        transform: `rotate(${component.rotation}deg)`,
        transformOrigin: '50% 50%',
        // Hidden/locked layers are click-through on the canvas — interact with
        // them from the Layers panel instead.
        pointerEvents: interactive ? undefined : 'none',
      }}
      className={cn(
        isEditing ? '' : 'touch-none select-none',
        hidden && 'opacity-20',
        selected
          ? locked
            ? 'outline outline-2 outline-dashed outline-stone-400'
            : 'outline outline-2 outline-orange-500'
          : locked
            ? 'cursor-default'
            : 'cursor-pointer',
      )}
    >
      {isEditing && component.kind === 'text' ? (
        <div
          ref={editDivRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onInput={() => {
            if (compositionRef.current) return;
            syncEditFromDom();
          }}
          onBlur={() => {
            persistLastEdit();
            scheduleFinish();
          }}
          onFocus={() => {
            cancelScheduledFinish(); // Keep editing when focused
          }}
          onClick={(e) => {
            e.stopPropagation();
            cancelScheduledFinish(); // Keep editing when clicking
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            cancelScheduledFinish(); // Keep editing when interacting
          }}
          onMouseUp={(e) => {
            e.stopPropagation();
            cancelScheduledFinish(); // Keep editing when selecting
            captureEditSelection();
          }}
          onKeyUp={() => {
            cancelScheduledFinish(); // Keep editing during keyboard navigation
            captureEditSelection();
          }}
          onSelect={() => {
            captureEditSelection();
          }}
          onKeyDown={handleEditKeyDown}
          onCompositionStart={() => {
            compositionRef.current = true;
          }}
          onCompositionEnd={() => {
            compositionRef.current = false;
            syncEditFromDom();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            if (text) document.execCommand('insertText', false, text);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          className="absolute inset-0 resize-none outline-none overflow-auto whitespace-pre-wrap break-words cursor-text"
          style={{
            fontFamily: canvasFontFamily(component.fontFamily),
            fontSize: `${component.fontSize}px`,
            lineHeight: component.lineHeight,
            color: component.color,
            caretColor: component.color,
            textAlign: component.align,
            padding: '0',
            margin: '0',
            border: 'none',
            boxSizing: 'border-box',
            background: 'transparent',
          }}
          dangerouslySetInnerHTML={{
            __html: renderEditHtml(editText, editMarks, {
              fontSize: component.fontSize,
              fontWeight: component.fontWeight,
              fontStyle: component.fontStyle,
              textDecoration: component.textDecoration,
              color: component.color,
            }),
          }}
        />
      ) : (
        <ComponentBody component={component} />
      )}
      {selected && !hidden && !isEditing &&
        HANDLES.map((h) => (
          <div
            key={h.key}
            onPointerDown={(e) => begin(e, 'resize', h.key)}
            style={{ position: 'absolute', width: HS, height: HS, ...h.pos(component.width, component.height), cursor: h.cursor }}
            className="rounded-sm border border-orange-500 bg-white shadow"
          />
        ))}
      {selected && !hidden && !isEditing && (
        <>
          {/* Rotation handle: a grip on a stem above the top-center, orbiting
              with the box. Drag to rotate (Shift = 15° steps). */}
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{ left: component.width / 2 - 0.5, top: -ROT_OFFSET, width: 1, height: ROT_OFFSET, background: '#f97316' }}
          />
          <div
            onPointerDown={(e) => begin(e, 'rotate')}
            title="Drag to rotate · hold Shift for 15° steps"
            className="absolute touch-none rounded-full border border-orange-500 bg-white shadow"
            style={{
              left: component.width / 2 - ROT_R,
              top: -ROT_OFFSET - ROT_R,
              width: ROT_R * 2,
              height: ROT_R * 2,
              cursor: 'grab',
            }}
          />
        </>
      )}
    </div>
  );
}
