import { cn } from '../../lib/cn';

interface BrandLogoProps {
  /**
   * Logo color variant. `color` = primary orange mark for light surfaces;
   * `white` = solid white mark for dark or colored backgrounds.
   */
  variant?: 'color' | 'white';
  className?: string;
  /** Accessible label. Pass an empty string to mark the logo decorative. */
  alt?: string;
}

/**
 * Tamidoc brand mark — renders the real product logo.
 *
 * Size it with a height utility via `className` (e.g. `h-8`); width scales
 * automatically to preserve the logo's aspect ratio.
 */
export function BrandLogo({ variant = 'color', className, alt = 'Tamidoc' }: BrandLogoProps) {
  return (
    <img
      src={variant === 'white' ? '/logo-white.svg' : '/logo.svg'}
      alt={alt}
      aria-hidden={alt === '' ? true : undefined}
      draggable={false}
      className={cn('h-8 w-auto shrink-0 select-none', className)}
    />
  );
}
