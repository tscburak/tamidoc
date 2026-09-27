import { useEffect, useRef, useState } from 'react';
import { IconLock, IconLockOpen } from '@tabler/icons-react';
import { Switch } from '../ui';
import { cn } from '../../lib/cn';
import { PAGE_PRESETS } from './constants';
import type { CanvasSize } from './coordinates';
import type { GuideLines } from './types';

const inputCls =
  'h-8 w-full rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-800 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100';

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      {children}
    </div>
  );
}

/**
 * Canvas/page settings shown in the Designer "Canvas" tab: preset page sizes
 * (with a "Custom" state), orientation, and an arbitrary custom width/height
 * (design px) with an optional aspect-ratio lock.
 */
export function CanvasSettings({
  size,
  onChange,
  guideLines,
  onGuideLinesChange,
}: {
  size: CanvasSize;
  onChange: (size: CanvasSize) => void;
  guideLines: GuideLines;
  onGuideLinesChange: (guideLines: GuideLines) => void;
}) {
  const [locked, setLocked] = useState(false);
  const widthRef = useRef<HTMLInputElement>(null);

  // Local draft state for width/height to avoid eager clamping while typing
  const [widthDraft, setWidthDraft] = useState(String(Math.round(size.width)));
  const [heightDraft, setHeightDraft] = useState(String(Math.round(size.height)));

  // Sync drafts when size changes externally (e.g., preset selection, lock toggle)
  useEffect(() => {
    setWidthDraft(String(Math.round(size.width)));
    setHeightDraft(String(Math.round(size.height)));
  }, [size.width, size.height]);

  const landscape = size.width > size.height;
  const preset = PAGE_PRESETS.find(
    (p) =>
      (p.width === size.width && p.height === size.height) ||
      (p.width === size.height && p.height === size.width),
  );
  const isCustom = !preset;

  const ratio = size.width / size.height || 1;

  const setOrientation = (o: 'portrait' | 'landscape') => {
    const isLandscape = size.width > size.height;
    if (o === 'landscape' && !isLandscape) onChange({ width: size.height, height: size.width });
    if (o === 'portrait' && isLandscape) onChange({ width: size.height, height: size.width });
  };

  const onWidth = (w: number) => {
    const width = Math.max(50, w);
    onChange(locked ? { width, height: Math.max(50, Math.round(width / ratio)) } : { width, height: size.height });
  };
  const onHeight = (h: number) => {
    const height = Math.max(50, h);
    onChange(locked ? { width: Math.max(50, Math.round(height * ratio)), height } : { width: size.width, height });
  };

  return (
    <div className="flex flex-col gap-5">
      <Section label="Page size">
        <div className="grid grid-cols-2 gap-2">
          {PAGE_PRESETS.map((p) => {
            const active = preset?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange({ width: p.width, height: p.height })}
                className={cn(
                  'rounded-md border px-2.5 py-2 text-left transition-colors',
                  active
                    ? 'border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-orange-300 hover:bg-orange-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-orange-700 dark:hover:bg-orange-950/40',
                )}
              >
                <span className="block text-sm font-medium">{p.label}</span>
                <span className="text-[10px] text-stone-400">
                  {p.width}×{p.height}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => widthRef.current?.focus()}
          className={cn(
            'mt-2 flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left transition-colors',
            isCustom
              ? 'border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
              : 'border-stone-200 bg-white text-stone-600 hover:border-orange-300 hover:bg-orange-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-orange-700 dark:hover:bg-orange-950/40',
          )}
        >
          <span className="text-sm font-medium">Custom</span>
          <span className="text-[10px] text-stone-400">
            {Math.round(size.width)}×{Math.round(size.height)}
          </span>
        </button>
      </Section>

      <Section label="Orientation">
        <div className="flex gap-2">
          {(['portrait', 'landscape'] as const).map((o) => {
            const active = (o === 'landscape') === landscape;
            return (
              <button
                key={o}
                type="button"
                onClick={() => setOrientation(o)}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors',
                  active
                    ? 'border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                    : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
                )}
              >
                {o}
              </button>
            );
          })}
        </div>
      </Section>

      <Section label="Dimensions">
        <div className="flex items-end gap-1.5">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-stone-500 dark:text-stone-400">Width</span>
            <input
              ref={widthRef}
              type="number"
              aria-label="Page width"
              min={50}
              value={widthDraft}
              onChange={(e) => setWidthDraft(e.target.value)}
              onBlur={() => onWidth(Number(widthDraft) || 50)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className={inputCls}
            />
          </label>
          <button
            type="button"
            onClick={() => setLocked((v) => !v)}
            aria-pressed={locked}
            aria-label={locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            title={locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            className={cn(
              'mb-1 flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors',
              locked
                ? 'border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                : 'border-stone-300 text-stone-500 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-700',
            )}
          >
            {locked ? <IconLock size={15} /> : <IconLockOpen size={15} />}
          </button>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-stone-500 dark:text-stone-400">Height</span>
            <input
              type="number"
              aria-label="Page height"
              min={50}
              value={heightDraft}
              onChange={(e) => setHeightDraft(e.target.value)}
              onBlur={() => onHeight(Number(heightDraft) || 50)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className={inputCls}
            />
          </label>
          <span className="pb-2 text-xs text-stone-400">px</span>
        </div>
      </Section>

      <Section label="Alignment guides">
        <Switch
          label="Show border lines"
          checked={guideLines.enabled}
          onChange={(e) => onGuideLinesChange({ ...guideLines, enabled: e.target.checked })}
        />
        <label className="mt-3 flex flex-col gap-1">
          <span className="text-xs text-stone-500 dark:text-stone-400">Padding from edges</span>
          <input
            type="number"
            aria-label="Guide padding"
            min={0}
            value={guideLines.padding}
            onChange={(e) =>
              onGuideLinesChange({ ...guideLines, padding: Math.max(0, Number(e.target.value) || 0) })
            }
            className={inputCls}
          />
        </label>
        <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
          Components magnetically snap to these lines while dragging.
        </p>
      </Section>
    </div>
  );
}
