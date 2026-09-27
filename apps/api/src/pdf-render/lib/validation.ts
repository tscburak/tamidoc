import type { FillValues, RenderField, RenderTemplate } from './types';

/** A value counts as filled unless it's blank (checkbox needs the literal 'true'). */
export function isFilled(type: string, v: unknown): boolean {
  if (typeof v !== 'string') return false;
  if (type === 'checkbox') return v === 'true';
  return v.trim().length > 0;
}

/**
 * Compound keys (`${groupId ?? ''}::${name}`) of required fields lacking a value.
 * Scalars need a filled `values[name]`; group fields need EVERY entry of
 * `values[groupName]` to have that field filled. Mirrors the client-side rule.
 */
export function findMissingRequired(
  template: RenderTemplate,
  values: FillValues,
): string[] {
  const missing: string[] = [];
  for (const f of template.fields) {
    if (!f.required) continue;
    // Disabled / hidden fields aren't user-fillable, so they can't block submit
    // (hidden fields resolve to their defaultValue in the PDF regardless).
    // Ask-on-generate fields are also absent from the fill form — the form
    // owner supplies them at document generation time instead.
    if (f.disabled || f.visible === false || f.askOnGenerate) continue;
    const gid = f.groupId ?? null;
    if (gid) {
      const g = template.groups.find((gr) => gr.id === gid);
      const arr = g ? values[g.name] : undefined;
      const entries = Array.isArray(arr) ? arr : [];
      if (
        entries.length === 0 ||
        entries.some((e) => !isFilled(f.type, e?.[f.name]))
      ) {
        missing.push(`${gid}::${f.name}`);
      }
    } else if (!isFilled(f.type, values[f.name])) {
      missing.push(`::${f.name}`);
    }
  }
  return missing;
}

/** Ask-on-generate scalar fields (the ones the form owner is prompted for). */
export const askScalarFields = (fields: RenderField[]): RenderField[] =>
  fields.filter((f) => f.askOnGenerate && !f.groupId);

/**
 * Field names of required ask-on-generate scalars still blank in the
 * owner-provided generation values. Optional ask fields may stay blank.
 */
export function findMissingGenerateValues(
  fields: RenderField[],
  values: FillValues,
): string[] {
  const missing: string[] = [];
  for (const f of askScalarFields(fields)) {
    if (!f.required || f.disabled) continue;
    if (!isFilled(f.type, values[f.name])) missing.push(f.name);
  }
  return missing;
}
