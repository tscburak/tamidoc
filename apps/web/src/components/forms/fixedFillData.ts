import type { TemplateField } from '../../context/TemplateStoreProvider';
import type { ComponentGroup } from '../designer/types';
import { initialValuesFor, type FillValues } from './DynamicFormFields';

/** Include blank fields so the JSON editor also serves as a payload example. */
export function initialFixedFillValues(
  fields: TemplateField[],
  groups: ComponentGroup[],
): FillValues {
  const defaults = initialValuesFor(fields, groups);
  return Object.fromEntries([
    ...fields
      .filter((field) => !field.groupId)
      .map((field) => [field.name, defaults[field.name] ?? '']),
    ...groups.map((group) => [
      group.name,
      [
        Object.fromEntries(
          fields
            .filter((field) => field.groupId === group.id)
            .map((field) => [
              field.name,
              (defaults[group.name] as Record<string, string>[])[0][
                field.name
              ] ?? '',
            ]),
        ),
      ],
    ]),
  ]);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseFixedFillJson(
  text: string,
  fields: TemplateField[],
  groups: ComponentGroup[],
): { values: FillValues; error?: never } | { values?: never; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Enter valid JSON.',
    };
  }
  if (!isObject(parsed))
    return {
      error:
        'Fill values must be a JSON object keyed by field and group names.',
    };
  const scalars = new Set(
    fields.filter((field) => !field.groupId).map((field) => field.name),
  );
  for (const [name, value] of Object.entries(parsed)) {
    const group = groups.find((candidate) => candidate.name === name);
    if (group) {
      if (!Array.isArray(value))
        return { error: `${name} must be an array of entry objects.` };
      const names = new Set(
        fields
          .filter((field) => field.groupId === group.id)
          .map((field) => field.name),
      );
      for (const [index, entry] of value.entries()) {
        if (!isObject(entry))
          return { error: `${name}[${index}] must be an object.` };
        for (const [key, item] of Object.entries(entry)) {
          if (!names.has(key))
            return { error: `Unknown field: ${name}[${index}].${key}.` };
          if (typeof item !== 'string')
            return { error: `${name}[${index}].${key} must be a string.` };
        }
      }
    } else {
      if (!scalars.has(name))
        return { error: `Unknown field or group: ${name}.` };
      if (typeof value !== 'string')
        return { error: `${name} must be a string.` };
    }
  }
  return { values: parsed as FillValues };
}

export function fixedFillEndpoint(
  baseUrl: string,
  organizationId: string,
  templateId: string,
): string {
  return new URL(
    `${baseUrl.replace(/\/$/, '')}/organizations/${encodeURIComponent(organizationId)}/templates/${encodeURIComponent(templateId)}/generate-pdf`,
    window.location.origin,
  ).href;
}
