/**
 * Plus-button with a popup menu of addable components. The menu renders in a
 * portal pinned to the viewport (flipped upward when space is short), so it
 * never clips inside the scrollable layer tree. Used by the fill-mode layer
 * tree (top-level add + per-section / per-column add).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconPlus } from '@tabler/icons-react';
import type { BlockTypeDef } from './blockCatalog';
import { cn } from '../../lib/cn';

const MENU_WIDTH = 192;
const MENU_MAX_HEIGHT = 224;
const GAP = 4;

export function AddBlockMenu({
  options,
  onAdd,
  title = 'Add block',
  small = false,
}: {
  options: BlockTypeDef[];
  onAdd: (type: string) => void;
  title?: string;
  small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({
    top: 0,
    left: 0,
    up: false,
  });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - GAP;
    const up =
      below < Math.min(MENU_MAX_HEIGHT, options.length * 52 + 8) &&
      r.top > below;
    setPos({
      left: Math.max(
        8,
        Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8),
      ),
      top: up ? Math.max(8, r.top - GAP) : r.bottom + GAP,
      up,
    });
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onScroll = (event: Event) => {
      if (
        event.target instanceof Node &&
        menuRef.current?.contains(event.target)
      )
        return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        btnRef.current?.focus();
      }
    };
    window.addEventListener('resize', close);
    // Capture scrolls anywhere (tree scroll included) — menu would detach.
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={() => {
          if (!open) place();
          setOpen((v) => !v);
        }}
        className={
          small
            ? 'flex size-6 shrink-0 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-orange-600 dark:hover:bg-stone-800'
            : 'flex shrink-0 items-center gap-1 rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-600 hover:border-orange-400 hover:text-orange-700 dark:border-stone-600 dark:text-stone-300'
        }
      >
        <IconPlus size={small ? 12 : 14} />
        {!small && 'Add'}
      </button>
      {open &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 cursor-default bg-transparent"
            />
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-50 max-h-56 w-48 overflow-auto rounded-md border border-stone-200 bg-white p-1 shadow-lg dark:border-stone-700 dark:bg-stone-900"
              style={{
                left: pos.left,
                width: MENU_WIDTH,
                ...(pos.up
                  ? { bottom: window.innerHeight - pos.top }
                  : { top: pos.top }),
              }}
            >
              {options.length === 0 && (
                <p className="px-2 py-2 text-[11px] text-stone-400">
                  Nothing addable here.
                </p>
              )}
              {options.map((b) => (
                <button
                  key={b.type}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onAdd(b.type);
                    setOpen(false);
                  }}
                  className="block w-full rounded px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  <span
                    className={cn(
                      'block truncate text-xs font-medium text-stone-700 dark:text-stone-200',
                    )}
                  >
                    {b.name}
                  </span>
                  <span className="block truncate text-[10px] text-stone-400">
                    {b.description}
                  </span>
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
