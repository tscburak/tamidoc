import { cn } from '../../lib/cn';
import { solidFill, type Color } from './colors';

export type ProgressSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ProgressProps {
  value: number;
  color?: Color;
  size?: ProgressSize;
  className?: string;
}

const HEIGHT: Record<ProgressSize, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
};

export function Progress({ value, color = 'orange', size = 'md', className }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700', HEIGHT[size], className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-[width]', solidFill[color])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
