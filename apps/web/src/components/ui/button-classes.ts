import { cn } from '../../lib/cn';
import { solidBg, softBg, textHover, type Color } from './colors';

export type ButtonVariant = 'filled' | 'light' | 'subtle' | 'default' | 'white';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  color?: Color;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 gap-1.5 px-2.5 text-xs',
  sm: 'h-8 gap-2 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-11 gap-2 px-5 text-base',
};

const DEFAULT_VARIANT =
  'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700';
const WHITE_VARIANT = 'bg-white text-stone-800 hover:bg-stone-100';

/** Resolve a Button's className from its style props. Reused for link buttons. */
export function buttonClasses({
  variant = 'filled',
  color = 'orange',
  size = 'md',
  fullWidth,
}: ButtonStyleOptions = {}): string {
  const variantClass =
    variant === 'default'
      ? DEFAULT_VARIANT
      : variant === 'white'
        ? WHITE_VARIANT
        : variant === 'subtle'
          ? textHover[color]
          : variant === 'light'
            ? softBg[color]
            : solidBg[color];

  return cn(
    'inline-flex select-none items-center justify-center rounded-md font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-60',
    SIZE[size],
    variantClass,
    fullWidth && 'w-full',
  );
}
