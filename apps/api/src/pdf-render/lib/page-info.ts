import type { DocumentTheme } from './document-types';
import type { BlockIssue } from './flow-blocks';
import { normalizeTheme } from './flow-layout';

/** Resolve fill-time text using permissions from the saved template version. */
export function resolvePageInfo(
  theme: DocumentTheme | undefined,
  values: {
    headerText?: string;
    footerText?: string;
  },
): { theme: DocumentTheme; errors: BlockIssue[] } {
  const resolved = normalizeTheme(theme);
  const errors: BlockIssue[] = [];
  for (const key of ['header', 'footer'] as const) {
    const field = key === 'header' ? 'headerText' : 'footerText';
    const value = values[field];
    if (value === undefined) continue;
    const settings = resolved[key];
    if (!settings?.enabled || settings.editable !== true) {
      errors.push({
        path: field,
        message: `The ${key} is fixed by the template owner.`,
        fix: `Use the template's ${key} text.`,
      });
      continue;
    }
    if (typeof value !== 'string' || value.length > 500) {
      errors.push({
        path: field,
        message: `The ${key} must be text of at most 500 characters.`,
        fix: 'Shorten the text and try again.',
      });
      continue;
    }
    // Empty strings deliberately clear an editable default; don't use truthiness.
    resolved[key] = { ...settings, text: value };
  }
  return { theme: resolved, errors };
}
