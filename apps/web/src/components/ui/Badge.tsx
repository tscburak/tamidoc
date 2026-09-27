import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { softTint, solidText, type Color } from './colors';

export type BadgeVariant = 'light' | 'filled' | 'outline';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  color?: Color;
  size?: BadgeSize;
  leftSection?: ReactNode;
}

const SIZE: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
};

const VARIANT: Record<BadgeVariant, (color: Color) => string> = {
  light: (c) => softTint[c],
  filled: (c) => solidText[c],
  outline: (c) => cn('border border-current', textColorFor(c)),
};

function textColorFor(color: Color): string {
  // outline variant keeps colored text + transparent bg
  const map: Record<Color, string> = {
    orange: 'text-orange-600',
    teal: 'text-teal-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
    green: 'text-green-600',
    gray: 'text-stone-500',
    stone: 'text-stone-600',
  };
  return map[color];
}

export function Badge({
  variant = 'light',
  color = 'gray',
  size = 'md',
  leftSection,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium leading-5',
        SIZE[size],
        VARIANT[variant](color),
        className,
      )}
      {...props}
    >
      {leftSection}
      {children}
    </span>
  );
}
