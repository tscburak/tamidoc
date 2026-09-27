import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { DropdownContext } from './Dropdown';

export interface ContextMenuProps {
  open: boolean;
  /** Screen (client) coordinates to anchor the menu at. */
  x: number;
  y: number;
  onClose: () => void;
  /** DropdownLabel / DropdownItem / DropdownDivider children. */
  children: ReactNode;
  className?: string;
}

/**
 * Right-click style menu opened at an arbitrary screen point (unlike Dropdown,
 * which anchors to a trigger element). Portaled to <body>; items reuse the
 * Dropdown components, so wrapping them in DropdownContext.Provider makes
 * DropdownItem auto-close on select. Closes on outside-click / Esc / scroll /
 * resize so it never drifts.
 */
export function ContextMenu({ open, x, y, onClose, children, className }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Keep the menu on screen.
  const left = Math.min(x, window.innerWidth - 208);
  const top = Math.min(y, window.innerHeight - 240);

  return createPortal(
    <DropdownContext.Provider value={{ close: onClose }}>
      <div
        ref={ref}
        className={cn(
          'fixed z-[1100] min-w-[12rem] rounded-md border border-stone-200 bg-white p-1 shadow-lg dark:border-stone-700 dark:bg-stone-800',
          className,
        )}
        style={{ left, top }}
      >
        {children}
      </div>
    </DropdownContext.Provider>,
    document.body,
  );
}
