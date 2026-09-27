import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { softTint, textColor, type Color } from './colors';

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: 'light' | 'filled';
  color?: Color;
  title?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
}

const BORDER: Record<Color, string> = {
  orange: 'border-orange-200',
  teal: 'border-teal-200',
  red: 'border-red-200',
  amber: 'border-amber-200',
  blue: 'border-blue-200',
  green: 'border-green-200',
  gray: 'border-stone-200',
  stone: 'border-stone-200',
};

export function Alert({
  variant = 'light',
  color = 'orange',
  title,
  icon,
  className,
  children,
  ...props
}: AlertProps) {
  const surface =
    variant === 'filled'
      ? 'bg-stone-800 text-white'
      : cn('border', BORDER[color], softTint[color]);

  return (
    <div
      role="alert"
      className={cn('flex gap-3 rounded-md p-3 text-sm', surface, className)}
      {...props}
    >
      {icon && (
        <span className={cn('shrink-0', variant !== 'filled' && textColor[color])}>{icon}</span>
      )}
      <div className="flex flex-col gap-1">
        {title && <p className="font-semibold leading-5">{title}</p>}
        {children && <div className="leading-5 opacity-90">{children}</div>}
      </div>
    </div>
  );
}
