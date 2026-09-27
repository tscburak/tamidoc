/**
 * Left-panel block library: search + category filter + per-type Add buttons.
 * Renders inline (no dropdown) so it can live in a fill-mode side panel.
 * Every action is button-based and keyboard accessible.
 */
import { useMemo, useState } from 'react';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { BLOCK_TYPES } from './blockCatalog';
import { cn } from '../../lib/cn';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'text', label: 'Text' },
  { value: 'media', label: 'Media' },
  { value: 'data', label: 'Data' },
  { value: 'layout', label: 'Layout' },
] as const;

export function BlockPicker({
  allowedTypes,
  onAdd,
}: {
  allowedTypes: Set<string>;
  onAdd: (type: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BLOCK_TYPES.filter(
      (b) =>
        allowedTypes.has(b.type) &&
        (category === 'all' || b.category === category) &&
        (!q ||
          b.name.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q)),
    );
  }, [query, category, allowedTypes]);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="relative shrink-0">
        <IconSearch
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search components…"
          aria-label="Search components"
          className="w-full rounded-md border border-stone-300 bg-white py-1.5 pl-8 pr-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-orange-500 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
        />
      </div>
      <div className="flex shrink-0 flex-wrap gap-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(c.value)}
            aria-pressed={category === c.value}
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
              category === c.value
                ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200'
                : 'text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-col gap-0.5 overflow-auto">
        {options.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-stone-400">
            {allowedTypes.size === 0
              ? 'No components are active for this template.'
              : 'No components match.'}
          </p>
        )}
        {options.map((b) => (
          <div
            key={b.type}
            className="flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-700 dark:text-stone-200">
                {b.name}
              </p>
              <p className="truncate text-xs text-stone-400">{b.description}</p>
            </div>
            <button
              type="button"
              onClick={() => onAdd(b.type)}
              aria-label={`Add ${b.name}`}
              className="flex shrink-0 items-center gap-1 rounded-md border border-stone-300 px-2 py-0.5 text-xs font-medium text-stone-600 hover:border-orange-400 hover:text-orange-700 dark:border-stone-600 dark:text-stone-300"
            >
              <IconPlus size={12} /> Add
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
