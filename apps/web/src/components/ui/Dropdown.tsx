import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

interface DropdownContextValue {
  close: () => void;
}
export const DropdownContext = createContext<DropdownContextValue>({ close: () => {} });

export interface DropdownProps {
  /** The element that toggles the menu when clicked. */
  trigger: ReactNode;
  /** Menu panel content (DropdownLabel / DropdownItem / DropdownDivider). */
  children: ReactNode;
  align?: 'start' | 'end';
  /** Open below (default) or above the trigger. */
  placement?: 'top' | 'bottom';
  /** Extra panel classes (e.g. a fixed width). */
  panelClassName?: string;
  className?: string;
  /** Whether to close dropdown on scroll/resize (default: true). */
  closeOnScroll?: boolean;
  /** Controlled open state */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Click-triggered dropdown menu replacing Mantine's `Menu`.
 *
 * The panel is portaled to <body> and positioned `fixed` relative to the
 * trigger's rect, so it floats above everything and is never clipped or pushed
 * by an ancestor's `overflow` (e.g. the sidebar scroll container). Closes on
 * outside-click / Esc / scroll / resize / item-select.
 */
export function Dropdown({
  trigger,
  children,
  align = 'start',
  placement = 'bottom',
  panelClassName,
  className,
  closeOnScroll = true,
  open: controlledOpen,
  onOpenChange,
}: DropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  // Resolved placement after auto-flip: starts at `placement`, flips to the
  // opposite side when the panel would overflow the viewport and more room is
  // available on the other side (so bottom-anchored menus don't get clipped).
  const [resolvedPlacement, setResolvedPlacement] = useState<'top' | 'bottom'>(placement);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    if (controlledOpen !== undefined) {
      // Controlled mode - call onOpenChange
      const newValue = typeof value === 'function' ? value(controlledOpen) : value;
      onOpenChange?.(newValue);
    } else {
      // Uncontrolled mode - use internal state
      setInternalOpen(value);
    }
  }, [controlledOpen, onOpenChange]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  const toggle = useCallback(() => {
    // Re-measure on every toggle so position tracks layout changes.
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setResolvedPlacement(placement);
    setOpen((o) => !o);
  }, [setOpen, placement]);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        (triggerRef.current && triggerRef.current.contains(target)) ||
        (panelRef.current && panelRef.current.contains(target))
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    // Close on any scroll (incl. nested containers, via capture) or resize so
    // the fixed panel never drifts away from its trigger.
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);

    if (closeOnScroll) {
      window.addEventListener('scroll', close, true);
      window.addEventListener('resize', close);
    }

    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);

      if (closeOnScroll) {
        window.removeEventListener('scroll', close, true);
        window.removeEventListener('resize', close);
      }
    };
  }, [open, close, closeOnScroll]);

  // Auto-flip: once the panel is in the DOM, measure it and flip to the
  // opposite side if it would overflow the viewport and the other side has
  // more room. Runs before paint so the menu never flickers into a clipped
  // position.
  useLayoutEffect(() => {
    if (!open || !rect || !panelRef.current) return;
    const panelHeight = panelRef.current.getBoundingClientRect().height;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if (resolvedPlacement === 'bottom' && panelHeight > spaceBelow && spaceAbove > spaceBelow) {
      setResolvedPlacement('top');
    } else if (resolvedPlacement === 'top' && panelHeight > spaceAbove && spaceBelow > spaceAbove) {
      setResolvedPlacement('bottom');
    }
  }, [open, rect, resolvedPlacement]);

  const transform = [
    align === 'end' ? 'translateX(-100%)' : '',
    resolvedPlacement === 'top' ? 'translateY(-100%)' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <DropdownContext.Provider value={{ close }}>
      <div ref={triggerRef} className={className} onClick={toggle}>
        {trigger}
      </div>
      {open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            className={cn(
              'fixed z-[1100] min-w-[12rem] overflow-hidden rounded-md border border-stone-200 bg-white p-1 shadow-lg dark:border-stone-700 dark:bg-stone-800',
              panelClassName,
            )}
              style={{
                top: resolvedPlacement === 'bottom' ? rect.bottom + 8 : rect.top - 8,
                left: align === 'start' ? rect.left : rect.right,
                transform: transform || undefined,
              }}
          >
            {children}
          </div>,
          document.body,
        )}
    </DropdownContext.Provider>
  );
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2.5 py-1 text-xs font-semibold text-stone-400 dark:text-stone-500">{children}</p>
  );
}

export interface DropdownItemProps extends Omit<HTMLAttributes<HTMLButtonElement>, 'color'> {
  leftSection?: ReactNode;
  color?: 'red' | 'default';
}

export function DropdownItem({
  leftSection,
  color = 'default',
  onClick,
  className,
  children,
  ...props
}: DropdownItemProps) {
  const { close } = useContext(DropdownContext);
  return (
    <button
      type="button"
      onClick={(event) => {
        onClick?.(event);
        close();
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm transition-colors',
        color === 'red'
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950'
          : 'text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700',
        className,
      )}
      {...props}
    >
      {leftSection}
      {children}
    </button>
  );
}

export function DropdownDivider() {
  return <div className="my-1 h-px border-t border-stone-200 dark:border-stone-700" />;
}
