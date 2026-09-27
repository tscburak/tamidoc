import { IconAlertCircle } from '@tabler/icons-react';
import { Alert, Button } from '../ui';

interface ErrorDisplayProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorDisplay({ title = 'Error', message, onRetry, className }: ErrorDisplayProps) {
  return (
    <Alert
      variant="light"
      color="red"
      title={title}
      icon={<IconAlertCircle size={20} />}
      className={className}
    >
      <div className="mt-1 flex flex-col gap-2">
        <p>{message}</p>
        {onRetry && (
          <Button variant="light" color="red" size="xs" onClick={onRetry} className="w-fit">
            Retry
          </Button>
        )}
      </div>
    </Alert>
  );
}
