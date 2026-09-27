/**
 * Theme tab for Composable Templates: font, base size, text colors, block
 * spacing. These tokens feed the preview and the PDF renderer; component
 * defaults (middle panel) override them per component type.
 */
import { useState } from 'react';
import { isHexColor } from './blockCatalog';
import { cn } from '../../lib/cn';

export interface DocHeaderFooter {
  enabled: boolean;
  text: string;
  editable?: boolean;
}

export interface DocTheme {
  fontFamily: string;
  baseFontSize: number;
  colors: { primary: string; heading: string; body: string; muted: string };
  spacing: number;
  pagePadding?: number;
  /** Per-page running header (blank text falls back to the document title). */
  header?: DocHeaderFooter;
  /** Per-page footer line. */
  footer?: DocHeaderFooter;
  /** Per-page "Page X / Y" numbering. */
  pageNumbering?: { enabled: boolean; format?: string };
}

const FONT_OPTIONS = [
  { value: 'Lato', label: 'Lato (default)' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Times-Roman', label: 'Times' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Courier', label: 'Courier (mono)' },
];

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

function ColorRow({
  label, value, onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [lastCommitted, setLastCommitted] = useState(value);
  // Sync when the theme changes externally (e.g. reset to defaults) — the
  // render-time adjustment pattern keeps typing uninterrupted otherwise.
  if (value !== lastCommitted) {
    setLastCommitted(value);
    setDraft(value);
  }
  const invalid = draft !== '' && !isHexColor(draft);
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={isHexColor(draft) ? draft : '#000000'}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
        aria-label={`${label} picker`}
        className="size-7 shrink-0 cursor-pointer rounded border border-stone-300 bg-white p-0.5 dark:border-stone-600 dark:bg-stone-900"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs text-stone-600 dark:text-stone-300">{label}</span>
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (isHexColor(e.target.value)) onChange(e.target.value);
          }}
          spellCheck={false}
          aria-label={`${label} hex`}
          className={cn(
            'h-7 w-full rounded-md border bg-white px-2 font-mono text-xs text-stone-800 focus:outline-none focus:ring-1 dark:bg-stone-900 dark:text-stone-100',
            invalid
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500/40'
              : 'border-stone-300 focus:border-orange-500 focus:ring-orange-500/40 dark:border-stone-600',
          )}
        />
      </div>
    </div>
  );
}

export function ThemeSettings({
  theme,
  onChange,
  onReset,
}: {
  theme: DocTheme;
  onChange: (theme: DocTheme) => void;
  onReset: () => void;
}) {
  const set = <K extends keyof DocTheme>(key: K, value: DocTheme[K]) =>
    onChange({ ...theme, [key]: value });
  const setColor = (key: keyof DocTheme['colors']) => (hex: string) =>
    onChange({ ...theme, colors: { ...theme.colors, [key]: hex } });

  return (
    <div className="flex flex-col gap-5">
      <Section label="Typography">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-stone-500 dark:text-stone-400">Font family</span>
          <select
            value={theme.fontFamily}
            onChange={(e) => set('fontFamily', e.target.value)}
            className={inputCls}
          >
            {FONT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-2 flex flex-col gap-1">
          <span className="text-xs text-stone-500 dark:text-stone-400">
            Base font size ({theme.baseFontSize}pt)
          </span>
          <input
            type="range"
            min={8}
            max={16}
            step={0.5}
            value={theme.baseFontSize}
            onChange={(e) => set('baseFontSize', Number(e.target.value))}
            aria-label="Base font size"
            className="w-full accent-orange-600"
          />
        </label>
      </Section>

      <Section label="Colors">
        <div className="flex flex-col gap-2">
          <ColorRow label="Primary / accents" value={theme.colors.primary} onChange={setColor('primary')} />
          <ColorRow label="Headings" value={theme.colors.heading} onChange={setColor('heading')} />
          <ColorRow label="Body text" value={theme.colors.body} onChange={setColor('body')} />
          <ColorRow label="Muted text" value={theme.colors.muted} onChange={setColor('muted')} />
        </div>
      </Section>

      <Section label="Spacing">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-stone-500 dark:text-stone-400">
            Block gap ({theme.spacing}px)
          </span>
          <input
            type="range"
            min={0}
            max={48}
            step={2}
            value={theme.spacing}
            onChange={(e) => set('spacing', Number(e.target.value))}
            aria-label="Block gap"
            className="w-full accent-orange-600"
          />
        </label>
      </Section>

      <button
        type="button"
        onClick={onReset}
        className="self-start rounded-md px-2 py-1 text-xs font-medium text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800"
      >
        Reset to defaults
      </button>
    </div>
  );
}
