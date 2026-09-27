import { type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface DividerProps {
  label?: ReactNode;
  labelPosition?: 'left' | 'center' | 'right';
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function Divider({
  label,
  labelPosition = 'left',
  orientation = 'horizontal',
  className,
}: DividerProps) {
  const line = 'border-stone-200 dark:border-stone-700';

  if (orientation === 'vertical') {
    return <div className={cn('h-full w-px border-l', line, className)} />;
  }

  if (!label) {
    return <div className={cn('w-full border-t', line, className)} />;
  }

  const justify =
    labelPosition === 'center' ? 'justify-center' : labelPosition === 'right' ? 'justify-end' : 'justify-start';

  return (
    <div className={cn('flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400', justify, className)}>
      <div className={cn('h-px flex-1 border-t', line)} />
      <span>{label}</span>
      <div className={cn('h-px flex-1 border-t', line)} />
    </div>
  );
}
