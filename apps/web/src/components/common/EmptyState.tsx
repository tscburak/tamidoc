import { Button } from '../ui';

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="mx-auto max-w-md py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <h3 className="text-xl font-semibold text-stone-800 dark:text-stone-100">{title}</h3>
        {description && (
          <p className="text-sm text-stone-500 dark:text-stone-400">{description}</p>
        )}
        {actionLabel && onAction && (
          <Button variant="light" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
