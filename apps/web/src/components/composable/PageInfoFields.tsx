import type { DocTheme } from './ThemeSettings';

export interface PageInfoValues {
  headerText?: string;
  footerText?: string;
}

export function PageInfoFields({ theme, values, onChange }: {
  theme: DocTheme;
  values: PageInfoValues;
  onChange: (values: PageInfoValues) => void;
}) {
  if (!theme.header?.enabled && !theme.footer?.enabled) return null;
  return (
    <div className="flex shrink-0 flex-col gap-3 border-b border-stone-200 pb-4 dark:border-stone-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Header & footer</p>
      {(['header', 'footer'] as const).map((key) => {
        const settings = theme[key];
        if (!settings?.enabled) return null;
        const field = key === 'header' ? 'headerText' : 'footerText';
        const editable = settings.editable === true;
        const value = values[field] ?? settings.text;
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-300">
              {key === 'header' ? 'Header' : 'Footer'}
              <input type="text" aria-label={`${key === 'header' ? 'Header' : 'Footer'} text`} maxLength={500}
                value={value} readOnly={!editable} placeholder={editable ? `Enter ${key} text` : 'No text'}
                onChange={(event) => onChange({ ...values, [field]: event.target.value })}
                className="h-9 w-full rounded-md border border-stone-300 bg-white px-2.5 text-sm text-stone-800 focus:border-orange-500 focus:outline-none read-only:bg-stone-50 read-only:text-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:read-only:bg-stone-800" />
            </label>
            {editable ? (value !== settings.text && (
              <button type="button" onClick={() => onChange({ ...values, [field]: settings.text })}
                className="self-start text-xs text-orange-700 hover:underline dark:text-orange-300">
                Reset {key} to default
              </button>
            )) : <p className="text-xs text-stone-400">Set by the template owner</p>}
          </div>
        );
      })}
    </div>
  );
}
