import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { softTint, solidText, textColor, type Color } from './colors';

export type ThemeIconVariant = 'light' | 'filled' | 'white' | 'outline';

export interface ThemeIconProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  radius?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: ThemeIconVariant;
  color?: Color;
  children?: ReactNode;
}

const NAMED_SIZE = {
  xs: 'size-5',
  sm: 'size-6',
  md: 'size-8',
  lg: 'size-10',
  xl: 'size-12',
};

const RADIUS = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
};

export function ThemeIcon({
  size = 'md',
  radius = 'md',
  variant = 'light',
  color = 'orange',
  className,
  children,
  ...props
}: ThemeIconProps) {
  const sizeClass = typeof size === 'number' ? undefined : NAMED_SIZE[size];

  const variantClass =
    variant === 'filled'
      ? solidText[color]
      : variant === 'white'
        ? cn('bg-white', textColor[color])
        : variant === 'outline'
          ? cn('border border-stone-300 bg-white dark:border-stone-600 dark:bg-stone-800', textColor[color])
          : softTint[color];

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        sizeClass,
        RADIUS[radius],
        variantClass,
        className,
      )}
      style={typeof size === 'number' ? { width: size, height: size } : undefined}
      {...props}
    >
      {children}
    </span>
  );
}
