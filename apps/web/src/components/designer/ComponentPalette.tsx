import { IconTypography, IconPhoto, IconSquare, IconCircle, IconMinus, type Icon } from '@tabler/icons-react';
import { DND_MIME, PALETTE, type PaletteEntry } from './constants';

export const PALETTE_ICONS: Record<string, Icon> = {
  text: IconTypography,
  image: IconPhoto,
  'shape:rectangle': IconSquare,
  'shape:ellipse': IconCircle,
  'shape:line': IconMinus,
};

/**
 * Draggable component palette. Drag a tile onto the canvas to create, or click
 * to add at the canvas center (fallback for touch / no-DnD).
 */
export function ComponentPalette({ onAdd }: { onAdd: (kind: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Components</p>
      <div className="grid grid-cols-3 gap-2">
        {PALETTE.map((entry: PaletteEntry) => {
          const Icon = PALETTE_ICONS[entry.kind] ?? IconSquare;
          return (
            <button
              key={entry.kind}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_MIME, entry.kind);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onAdd(entry.kind)}
              className="group flex flex-col items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2 py-3 text-stone-600 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-orange-700 dark:hover:bg-orange-950/40 dark:hover:text-orange-300"
              title={`Add ${entry.label}`}
            >
              <Icon size={20} />
              <span className="text-[11px] font-medium">{entry.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-stone-400 dark:text-stone-500">
        Drag onto the canvas, or right-click the canvas for more options.
      </p>
    </div>
  );
}
