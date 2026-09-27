import { cn } from '../../lib/cn';
import { Spinner, type SpinnerSize } from '../ui';

interface LoadingSpinnerProps {
  fullScreen?: boolean;
  size?: SpinnerSize;
  className?: string;
}

export function LoadingSpinner({ fullScreen = false, size = 'lg', className }: LoadingSpinnerProps) {
  return (
    <div className={cn('flex items-center justify-center', fullScreen && 'min-h-screen', className)}>
      <Spinner size={size} />
    </div>
  );
}
