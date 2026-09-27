import { type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Card } from './Card';

export interface PanelProps {
  title: string;
  subtitle?: string;
  /** Right-aligned header content (e.g. toolbar buttons). */
  actions?: ReactNode;
  /** Extra class for the scrollable body (e.g. disable padding/scroll). */
  bodyClassName?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Workspace panel: fixed header (title/subtitle + optional actions) over a
 * scrollable body. Used by the template designer and the editor host pages.
 */
export function Panel({ title, subtitle, actions, bodyClassName, className, children }: PanelProps) {
  return (
    <Card withBorder radius="lg" p="none" className={cn('flex flex-col', className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200 px-4 py-3 dark:border-stone-700">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-100">{title}</h3>
          {subtitle && <p className="truncate text-xs text-stone-500 dark:text-stone-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      <div className={cn('min-h-0 flex-1 overflow-y-auto p-4', bodyClassName)}>{children}</div>
    </Card>
  );
}
