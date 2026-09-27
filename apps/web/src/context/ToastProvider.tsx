import { useCallback, useRef, useState, useEffect, type ReactNode } from 'react';
import { IconX } from '@tabler/icons-react';
import { cn } from '../lib/cn';
import { ToastContext, type ToastColor, type ToastItem } from './toast';
import { initializeToastSystem } from '../utils/toast-provider';

const ACCENT_BAR: Record<ToastColor, string> = {
  teal: 'bg-teal-600',
  orange: 'bg-orange-600',
  amber: 'bg-amber-500',
  red: 'bg-red-600',
  gray: 'bg-stone-400',
  blue: 'bg-blue-600',
};

const AUTO_DISMISS_MS = 4000;

/**
 * Lightweight toast system replacing `@mantine/notifications`.
 * `useToast().show({ title, message, color })` mirrors the old API.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (options: { title?: string; message?: string; color?: ToastColor }) => {
      const id = nextId.current++;
      const item: ToastItem = {
        id,
        title: options.title,
        message: options.message,
        color: options.color ?? 'teal',
      };
      setToasts((current) => [...current, item]);
      window.setTimeout(() => remove(id), AUTO_DISMISS_MS);
    },
    [remove],
  );

  // Initialize global toast system for error handling
  useEffect(() => {
    initializeToastSystem({ show });
  }, [show]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[1000] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-lg border border-stone-200 bg-white p-4 pl-5 shadow-lg dark:border-stone-700 dark:bg-stone-800"
            role="status"
          >
            <span
              className={cn('absolute inset-y-0 left-0 w-1', ACCENT_BAR[toast.color])}
              aria-hidden
            />
            <div className="flex-1">
              {toast.title && (
                <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">
                  {toast.title}
                </p>
              )}
              {toast.message && (
                <p className="text-sm text-stone-600 dark:text-stone-300">{toast.message}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => remove(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 text-stone-400 transition-colors hover:text-stone-700 dark:hover:text-stone-200"
            >
              <IconX size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
