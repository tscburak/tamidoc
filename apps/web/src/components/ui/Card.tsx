import { type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { accentBorder, type Color } from './colors';

export type CardPadding = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type CardRadius = 'sm' | 'md' | 'lg' | 'xl';
export type CardShadow = 'none' | 'sm' | 'md' | 'lg' | 'xl';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  p?: CardPadding;
  withBorder?: boolean;
  shadow?: CardShadow;
  radius?: CardRadius;
  /** Colored left accent bar (used for highlighted cards). */
  accent?: Color;
}

const PADDING: Record<CardPadding, string> = {
  none: '',
  xs: 'p-2',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
  xl: 'p-6',
};

const RADIUS: Record<CardRadius, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
};

const SHADOW: Record<CardShadow, string> = {
  none: '',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
};

export function Card({
  p = 'md',
  withBorder = false,
  shadow = 'none',
  radius = 'md',
  accent,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-stone-800',
        RADIUS[radius],
        PADDING[p],
        SHADOW[shadow],
        withBorder && 'border border-stone-200 dark:border-stone-700',
        accent && cn('border-l-4', accentBorder[accent]),
        className,
      )}
      {...props}
    />
  );
}
