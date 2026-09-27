/**
 * Header & footer tab for Composable Templates: per-page running header,
 * footer line, defaults, fill permissions, and page numbering.
 */
import { Switch } from '../ui';
import type { DocTheme } from './ThemeSettings';

const inputCls =
  'h-8 w-full rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500';

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      {children}
    </div>
  );
}

export function HeaderFooterSettings({
  theme,
  onChange,
}: {
  theme: DocTheme;
  onChange: (theme: DocTheme) => void;
}) {
  const numbering = theme.pageNumbering ?? { enabled: true };

  return (
    <div className="flex flex-col gap-5">
      {(['header', 'footer'] as const).map((key) => {
        const settings = theme[key] ?? { enabled: false, text: '', editable: false };
        const label = key === 'header' ? 'Header' : 'Footer';
        return (
          <Section key={key} label={label}>
            <div className="flex flex-col gap-3">
              <Switch label={`Show ${key} on every page`} checked={settings.enabled}
                onChange={(event) => onChange({ ...theme, [key]: { ...settings, enabled: event.target.checked } })} />
              {settings.enabled && (
                <>
                  <label className="flex flex-col gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-300">
                    Default text
                    <input type="text" aria-label={`${label} default text`} maxLength={500}
                      value={settings.text} placeholder={key === 'header' ? 'Company or document information' : 'Contact details or a closing note'}
                      onChange={(event) => onChange({ ...theme, [key]: { ...settings, text: event.target.value } })}
                      className={inputCls} />
                  </label>
                  <Switch label={`Allow fillers to edit ${key}`} checked={settings.editable === true}
                    description={settings.editable ? 'Fillers start with your default and can change or clear it.' : 'Your text stays fixed in every generated document.'}
                    onChange={(event) => onChange({ ...theme, [key]: { ...settings, editable: event.target.checked } })} />
                </>
              )}
            </div>
          </Section>
        );
      })}

      <Section label="Page numbers">
        <Switch
          label="Show “Page X / Y”"
          description="Bottom-right of every page."
          checked={numbering.enabled}
          onChange={(e) => onChange({ ...theme, pageNumbering: { ...numbering, enabled: e.target.checked } })}
        />
      </Section>
    </div>
  );
}
