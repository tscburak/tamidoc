import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { buttonClasses, type ButtonStyleOptions } from './button-classes';

export interface ButtonProps
  extends ButtonStyleOptions,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  loading?: boolean;
}

export function Button({
  variant,
  color,
  size,
  fullWidth,
  leftSection,
  rightSection,
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonClasses({ variant, color, size, fullWidth }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {!loading && leftSection}
      {children}
      {!loading && rightSection}
    </button>
  );
}
