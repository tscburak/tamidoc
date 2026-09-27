/**
 * Per-component default style editor (template resolution level 4).
 * Token-safe only: hex colors + font-size token. Empty = theme default.
 */
import { FONT_SIZE_OPTIONS, isHexColor, type ComponentStyle } from './blockCatalog';
import { cn } from '../../lib/cn';

export function ComponentStyleEditor({
  typeName, style, onChange, onReset,
}: {
  typeName: string;
  style: ComponentStyle;
  onChange: (patch: Partial<ComponentStyle>) => void;
  onReset: () => void;
}) {
  const colorInput = (key: 'color' | 'background', label: string, swatchFallback: string) => {
    const value = style[key] ?? '';
    const invalid = value !== '' && !isHexColor(value);
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-stone-600 dark:text-stone-300">{label}</label>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={isHexColor(value) ? value : swatchFallback}
            onChange={(e) => onChange({ [key]: e.target.value })}
            aria-label={`${typeName} ${label} picker`}
            className="size-7 shrink-0 cursor-pointer rounded border border-stone-300 bg-white p-0.5 dark:border-stone-600 dark:bg-stone-900"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange({ [key]: e.target.value })}
            placeholder="Theme default"
            aria-label={`${typeName} ${label} hex`}
            spellCheck={false}
            className={cn(
              'h-7 min-w-0 flex-1 rounded-md border bg-white px-2 font-mono text-xs text-stone-800 placeholder:font-sans placeholder:text-stone-400 focus:outline-none focus:ring-1 dark:bg-stone-900 dark:text-stone-100',
              invalid
                ? 'border-red-400 focus:border-red-500 focus:ring-red-500/40'
                : 'border-stone-300 focus:border-orange-500 focus:ring-orange-500/40 dark:border-stone-600',
            )}
          />
        </div>
        {invalid && (
          <p className="text-[11px] text-red-600 dark:text-red-400">Use a hex color like #f97316.</p>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-orange-200 bg-orange-50/50 p-2.5 dark:border-orange-900/60 dark:bg-orange-950/20">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-stone-700 dark:text-stone-200">
          Customize: {typeName}
        </span>
        <button
          type="button"
          onClick={onReset}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-stone-400 hover:bg-stone-200/60 hover:text-stone-600 dark:hover:bg-stone-800"
        >
          Reset
        </button>
      </div>
      {colorInput('color', 'Text color', '#000000')}
      {colorInput('background', 'Background', '#ffffff')}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-stone-600 dark:text-stone-300">Font size</label>
        <select
          value={style.fontSize ?? ''}
          onChange={(e) => onChange({ fontSize: e.target.value as ComponentStyle['fontSize'] })}
          className="h-7 w-full rounded-md border border-stone-300 bg-white px-1.5 text-xs text-stone-700 focus:border-orange-500 focus:outline-none dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"
        >
          {FONT_SIZE_OPTIONS.map((o) => (
            <option key={o.label} value={o.value ?? ''}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
