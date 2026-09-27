import { useRef, useState, useEffect, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { guideTargets, type Guides } from '../../hooks/useSnap';
import { DND_MIME } from './constants';
import { bboxOf, screenToCanvas, type CanvasSize } from './coordinates';
import { AlignmentGuides } from './AlignmentGuides';
import { ComponentView } from './ComponentView';
import type { CanvasComponent, ComponentGroup, GuideLines } from './types';

export interface CanvasDocumentProps {
  components: CanvasComponent[];
  selectedIds: string[];
  groups: ComponentGroup[];
  /** id of the currently-selected group (mutually exclusive with component selection). */
  selectedGroupId: string | null;
  canvasSize: CanvasSize;
  zoom: number;
  guides: Guides;
  guideLines: GuideLines;
  /** Number of manual pages (1 = single page, 2+ = multiple pages) */
  manualPages?: number;
  /** Currently active page (0-indexed) */
  activePage?: number;
  /** Callback when active page changes */
  onActivePageChange?: (page: number) => void;
  onSelect: (id: string | null, additive: boolean) => void;
  /** Select a repeating group by clicking its label badge. */
  onSelectGroup: (id: string) => void;
  onChange: (id: string, patch: Partial<CanvasComponent>) => void;
  onCreate: (kind: string, x: number, y: number) => void;
  onContextOpen: (screenX: number, screenY: number, canvasX: number, canvasY: number) => void;
  onGuides: (guides: Guides) => void;
  /** Optional page background images (JPEG data URLs) for ghost rendering (PDF import) */
  pageBackgrounds?: string[];
  /** How the page background renders: original (100%), dimmed ghost, or hidden. */
  backgroundMode?: 'off' | 'dim' | 'full';
}

export function CanvasDocument({
  components,
  selectedIds,
  groups,
  selectedGroupId,
  canvasSize,
  zoom,
  guides,
  guideLines,
  activePage = 0,
  onSelect,
  onSelectGroup,
  onChange,
  onCreate,
  onContextOpen,
  onGuides,
  pageBackgrounds,
  backgroundMode = 'full',
}: CanvasDocumentProps) {
  const paperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [scrollStart, setScrollStart] = useState({ left: 0, top: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  const snapGuides: Guides = guideLines.enabled
    ? guideTargets(canvasSize, guideLines.padding)
    : { vertical: [], horizontal: [] };

  const toCanvas = (clientX: number, clientY: number) =>
    screenToCanvas(clientX, clientY, paperRef.current, zoom);

  // Track spacebar for drag mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const target = e.target as HTMLElement;
        // Only prevent default if not in an editable element
        if (
          !target.isContentEditable &&
          target.tagName !== 'INPUT' &&
          target.tagName !== 'TEXTAREA' &&
          target.tagName !== 'SELECT'
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setIsSpacePressed(true);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        if (
          !target.isContentEditable &&
          target.tagName !== 'INPUT' &&
          target.tagName !== 'TEXTAREA' &&
          target.tagName !== 'SELECT'
        ) {
          e.preventDefault();
        }
        setIsSpacePressed(false);
        setIsDragging(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true } as any);
      window.removeEventListener('keyup', handleKeyUp, { capture: true } as any);
    };
  }, []);

  // Handle space+drag or middle-click drag for panning the canvas
  const handleContainerPointerDown = (e: ReactPointerEvent) => {
    // Allow drag on spacebar+left-click or middle mouse button
    if (e.button === 1 || (e.button === 0 && isSpacePressed)) {
      e.preventDefault();
      const target = e.currentTarget as HTMLDivElement;
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setScrollStart({
        left: target.scrollLeft,
        top: target.scrollTop,
      });
      target.style.cursor = 'grabbing';
    }
  };

  const handleContainerPointerMove = (e: ReactPointerEvent) => {
    if (!isDragging) return;
    const target = e.currentTarget as HTMLDivElement;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    target.scrollLeft = scrollStart.left - dx;
    target.scrollTop = scrollStart.top - dy;
  };

  const handleContainerPointerUp = (e: ReactPointerEvent) => {
    if (isDragging) {
      const target = e.currentTarget as HTMLDivElement;
      setIsDragging(false);
      target.style.cursor = '';
    }
  };

  const handleContainerPointerLeave = () => {
    if (isDragging) {
      setIsDragging(false);
    }
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };

  const onContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    const { x, y } = toCanvas(e.clientX, e.clientY);
    onContextOpen(e.clientX, e.clientY, x, y);
  };

  const onBackgroundPointerDown = (_e: ReactPointerEvent) => {
    // Components stopPropagation on their own pointerdown, so this only fires
    // for clicks on empty paper → deselect.
    onSelect(null, false);
  };

  // Bounding boxes for repeating-group overlays, keyed by group id.
  const byId = new Map(components.map((c) => [c.id, c]));
  const selectedSet = new Set(selectedIds);

  // Filter components for the current page
  const pageComponents = components.filter((c) => c.page === activePage);

  // Also filter groups to only show components from current page
  const pageGroupBoxes = groups
    .map((g) => {
      const members = g.memberIds
        .map((id) => byId.get(id))
        .filter((c): c is CanvasComponent => !!c && c.page === activePage);
      if (members.length === 0) return null;
      return { group: g, box: bboxOf(members) };
    })
    .filter((g): g is { group: ComponentGroup; box: ReturnType<typeof bboxOf> } => g !== null);

  return (
    <div className="h-full w-full flex flex-col">
      {/* Canvas area - scrollable */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-stone-100 dark:bg-stone-900/60"
        onPointerDown={handleContainerPointerDown}
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
        onPointerLeave={handleContainerPointerLeave}
        style={{ cursor: isSpacePressed ? 'grab' : '' }}
      >
        <div className="flex items-center justify-center p-8 min-h-full">
          <div
            className="relative bg-white shadow-lg ring-1 ring-stone-300 dark:bg-stone-100 dark:ring-stone-700"
            style={{
              width: canvasSize.width * zoom,
              height: canvasSize.height * zoom,
            }}
          >
            <div
              ref={paperRef}
              tabIndex={0}
              aria-label={`Document canvas - Page ${activePage + 1}`}
              onContextMenu={onContextMenu}
              onDragOver={onDragOver}
              onDrop={(e) => {
                e.preventDefault();
                const kind = e.dataTransfer?.getData(DND_MIME);
                if (!kind) return;
                const { x, y } = toCanvas(e.clientX, e.clientY);
                onCreate(kind, x, y);
              }}
              onPointerDown={onBackgroundPointerDown}
              className="absolute inset-0"
              style={{
                width: canvasSize.width,
                height: canvasSize.height,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
            >
              {/* Source-PDF background for PDF import */}
              {pageBackgrounds?.[activePage] && backgroundMode !== 'off' && (
                <img
                  src={pageBackgrounds[activePage]}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
                  style={{ opacity: backgroundMode === 'dim' ? 0.4 : 1 }}
                />
              )}

              {pageComponents.map((c, i) => (
                <ComponentView
                  key={c.id}
                  component={c}
                  selected={selectedSet.has(c.id)}
                  siblings={pageComponents.filter((o) => o.id !== c.id)}
                  canvasSize={canvasSize}
                  zoom={zoom}
                  zIndex={i + 1}
                  snapGuides={snapGuides}
                  onSelect={onSelect}
                  onChange={onChange}
                  onGuides={onGuides}
                />
              ))}

              {/* Repeating-group overlays */}
              {pageGroupBoxes.map(({ group, box }) => {
                const active = selectedGroupId === group.id;
                return (
                  <div
                    key={group.id}
                    className="pointer-events-none absolute rounded-md"
                    style={{
                      left: box.x - 4,
                      top: box.y - 4,
                      width: box.width + 8,
                      height: box.height + 8,
                      zIndex: 999,
                      border: `1.5px dashed ${active ? '#ea580c' : '#fdba74'}`,
                      background: active ? 'rgba(234,88,12,0.04)' : 'transparent',
                    }}
                  >
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectGroup(group.id);
                      }}
                      className="pointer-events-auto absolute -top-3 left-1 flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow ring-1 ring-orange-600/50 transition-colors hover:bg-orange-600"
                    >
                      <span className="max-w-[10rem] truncate">{group.name}</span>
                      <span title={`Repeating · ${group.direction === 'row' ? 'row (→)' : 'column (↓)'}`}>
                        {group.direction === 'row' ? '↔' : '↕'}
                      </span>
                    </button>
                  </div>
                );
              })}

              {guideLines.enabled && (
                <div
                  className="pointer-events-none absolute border border-dashed border-sky-400/70"
                  style={{
                    left: guideLines.padding,
                    top: guideLines.padding,
                    right: guideLines.padding,
                    bottom: guideLines.padding,
                  }}
                />
              )}
              <AlignmentGuides guides={guides} canvasSize={canvasSize} />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
