import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { solidFill, type Color } from './colors';

export type AvatarSize = number | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarRadius = 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  src?: string | null;
  alt?: string;
  size?: AvatarSize;
  radius?: AvatarRadius;
  color?: Color;
  /** Fallback content (e.g. initials) shown when there is no `src`. */
  children?: ReactNode;
}

const NAMED_SIZE: Record<Exclude<AvatarSize, number>, string> = {
  xs: 'size-6 text-xs',
  sm: 'size-7 text-xs',
  md: 'size-9 text-sm',
  lg: 'size-10 text-sm',
  xl: 'size-12 text-base',
};

const RADIUS: Record<AvatarRadius, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-full',
};

export function Avatar({
  src,
  alt,
  size = 'md',
  radius = 'xl',
  color = 'gray',
  className,
  children,
  ...props
}: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold',
        typeof size !== 'number' && NAMED_SIZE[size],
        RADIUS[radius],
        !src && solidFill[color],
        !src && 'text-white',
        className,
      )}
      style={typeof size === 'number' ? { width: size, height: size } : undefined}
      {...props}
    >
      {src ? <img src={src} alt={alt} className="size-full object-cover" /> : children}
    </span>
  );
}
