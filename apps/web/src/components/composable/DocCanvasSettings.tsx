/**
 * Canvas tab for Composable Templates: page-size presets + orientation + document format.
 * Same visual language as the fixed-layout `CanvasSettings` (preset cards +
 * two-option selector), adapted to flow documents — no pixel dimensions or
 * drag guides, since blocks flow instead of sitting at x/y coordinates.
 */
import { cn } from '../../lib/cn';
import { PAGE_PRESETS } from '../designer/constants';

export type DocPageSize = 'A4' | 'A3' | 'A5' | 'letter' | 'legal' | 'tabloid' | '16:9';
export type DocFormat = 'document' | 'slides';
export type DocOrientation = 'portrait' | 'landscape';

const PAGE_SIZES = [
  ...PAGE_PRESETS.map((preset) => ({
    id: (preset.id.startsWith('a') ? preset.id.toUpperCase() : preset.id) as DocPageSize,
    label: preset.label,
    dims: `${preset.width} × ${preset.height}`,
  })),
  { id: '16:9' as const, label: 'Wide 16:9', dims: '1280 × 720' },
];

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      {children}
    </div>
  );
}

export function DocCanvasSettings({
  pageSize,
  format,
  orientation,
  spacing,
  padding = 48,
  onPageSizeChange,
  onFormatChange,
  onOrientationChange,
  onSpacingChange,
  onPaddingChange,
}: {
  pageSize: DocPageSize;
  format: DocFormat;
  orientation: DocOrientation;
  spacing: number;
  padding?: number;
  onPageSizeChange: (size: DocPageSize) => void;
  onFormatChange: (format: DocFormat) => void;
  onOrientationChange: (orientation: DocOrientation) => void;
  onSpacingChange: (spacing: number) => void;
  onPaddingChange: (padding: number) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Section label="Page size">
        <div className="grid grid-cols-2 gap-2">
          {PAGE_SIZES.map((p) => {
            const active = pageSize === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-label={`${p.label} page size`}
                onClick={() => onPageSizeChange(p.id)}
                aria-pressed={active}
                className={cn(
                  'rounded-md border px-2.5 py-2 text-left transition-colors',
                  active
                    ? 'border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-orange-300 hover:bg-orange-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-orange-700 dark:hover:bg-orange-950/40',
                )}
              >
                <span className="block text-sm font-medium">{p.label}</span>
                <span className="text-[10px] text-stone-400">
                  {p.dims}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section label="Orientation">
        <div className="flex gap-2">
          {(
            [
              { id: 'portrait', label: 'Portrait' },
              { id: 'landscape', label: 'Landscape' },
            ] as const
          ).map((o) => {
            const active = orientation === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onOrientationChange(o.id)}
                aria-pressed={active}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors',
                  active
                    ? 'border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                    : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section label="Page padding">
        <div className="grid grid-cols-3 gap-2">
          {([{ label: 'Compact', value: 32 }, { label: 'Normal', value: 48 }, { label: 'Spacious', value: 64 }]).map((option) => (
            <button key={option.value} type="button" aria-pressed={padding === option.value}
              onClick={() => onPaddingChange(option.value)}
              className={cn('rounded-md border px-2 py-2 text-xs font-medium', padding === option.value
                ? 'border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300')}>
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-stone-500">Space around the content, with extra room for headers and footers.</p>
      </Section>

      <Section label="Spacing">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-stone-500 dark:text-stone-400">
            Component gap ({spacing}px)
          </span>
          <input
            type="range"
            min={0}
            max={48}
            step={2}
            value={spacing}
            onChange={(e) => onSpacingChange(Number(e.target.value))}
            aria-label="Component gap"
            className="w-full accent-orange-600"
          />
        </label>
      </Section>

      <Section label="Format">
        <div className="flex gap-2">
          {(
            [
              { id: 'document', label: 'Document' },
              { id: 'slides', label: 'Slides' },
            ] as const
          ).map((o) => {
            const active = format === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onFormatChange(o.id)}
                aria-pressed={active}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                    : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
          {format === 'slides'
            ? 'Page breaks start new slides; blocks between breaks share a slide.'
            : 'Blocks flow across continuous pages; page breaks force new pages.'}
        </p>
      </Section>
    </div>
  );
}
