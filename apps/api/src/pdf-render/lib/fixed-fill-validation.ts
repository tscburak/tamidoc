import type { RenderTemplate } from './types';

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Validate external JSON before it reaches string merging and group layout. */
export function validateFixedFillValues(
  template: RenderTemplate,
  values: unknown,
): string[] {
  if (!isObject(values))
    return ['values must be an object keyed by field and group names.'];
  const errors: string[] = [];
  const scalars = new Set(
    template.fields
      .filter((field) => !field.groupId)
      .map((field) => field.name),
  );
  for (const [name, value] of Object.entries(values)) {
    const path = `values[${JSON.stringify(name)}]`;
    const group = template.groups.find((item) => item.name === name);
    if (group) {
      if (!Array.isArray(value)) {
        errors.push(`${path} must be an array of entry objects.`);
        continue;
      }
      const names = new Set(
        template.fields
          .filter((field) => field.groupId === group.id)
          .map((field) => field.name),
      );
      for (const [index, entry] of value.entries()) {
        if (!isObject(entry)) {
          errors.push(`${path}[${index}] must be an object.`);
          continue;
        }
        for (const [key, item] of Object.entries(entry)) {
          const fieldPath = `${path}[${index}][${JSON.stringify(key)}]`;
          if (!names.has(key))
            errors.push(`${fieldPath} is not a field in this group.`);
          else if (typeof item !== 'string')
            errors.push(`${fieldPath} must be a string.`);
        }
      }
    } else if (!scalars.has(name)) {
      errors.push(`${path} is not a field or group in this template version.`);
    } else if (typeof value !== 'string') {
      errors.push(`${path} must be a string.`);
    }
  }
  return errors;
}
