import type { CanvasComponent, ComponentGroup } from './types';

/**
 * Split text content into literal-text and {{token}} merge-field segments.
 * Used to render `{{date}}`-style placeholders as distinct chips on the canvas.
 */
export interface Segment {
  type: 'text' | 'token';
  value: string;
}

export function splitContent(content: string): Segment[] {
  if (!content) return [];
  // Capture the delimiter so both tokens and the text between them are kept.
  return content
    .split(/(\{\{[^}]+\}\})/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('{{') && part.endsWith('}}')
        ? { type: 'token', value: part.slice(2, -2) }
        : { type: 'text', value: part },
    );
}

/**
 * Unique form-field names defined by `{{token}}` placeholders across all text
 * components, in order of first appearance. These are the document's fillable
 * text fields — e.g. "Sayın {{Yetkili Adı}}" defines a field named "Yetkili Adı".
 */
export function extractFieldNames(components: CanvasComponent[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const c of components) {
    if (c.kind === 'text') {
      for (const seg of splitContent(c.content)) {
        if (seg.type === 'token' && seg.value.trim() && !seen.has(seg.value)) {
          seen.add(seg.value);
          names.push(seg.value);
        }
      }
    } else if (c.kind === 'table') {
      for (const cell of c.cells ?? []) {
        for (const seg of splitContent(cell)) {
          if (seg.type === 'token' && seg.value.trim() && !seen.has(seg.value)) {
            seen.add(seg.value);
            names.push(seg.value);
          }
        }
      }
    }
  }
  return names;
}

export type FieldKind = 'text' | 'image';

export interface ExtractedField {
  name: string;
  kind: FieldKind;
  /** Set when the field comes from a component that is a member of a repeating
   * group. Such fields are array-valued (one value per group instance). */
  groupId?: string;
}

/** Compound identity key for a field — names are unique only within a namespace
 * (a group, or the top level), so two groups can both have a `company` field. */
export function fieldKey(groupId: string | undefined, name: string): string {
  return `${groupId ?? ''}::${name}`;
}

/**
 * All form fields in the document: text fields (from {{token}} placeholders)
 * plus image fields (image components with a field name set), in component
 * order, de-duplicated by compound key (first occurrence wins). Fields that
 * belong to a repeating-group member are tagged with their `groupId`.
 */
export function extractFields(
  components: CanvasComponent[],
  groups: ComponentGroup[] = [],
): ExtractedField[] {
  // component id → group id (a component belongs to at most one group)
  const groupOf = new Map<string, string>();
  for (const g of groups) {
    for (const id of g.memberIds) groupOf.set(id, g.id);
  }

  const seen = new Set<string>();
  const fields: ExtractedField[] = [];
  for (const c of components) {
    const groupId = groupOf.get(c.id);
    if (c.kind === 'text') {
      for (const seg of splitContent(c.content)) {
        const name = seg.value.trim();
        const key = fieldKey(groupId, name);
        if (seg.type === 'token' && name && !seen.has(key)) {
          seen.add(key);
          fields.push({ name, kind: 'text', groupId });
        }
      }
    } else if (c.kind === 'image') {
      const name = c.field.trim();
      const key = fieldKey(groupId, name);
      if (name && !seen.has(key)) {
        seen.add(key);
        fields.push({ name, kind: 'image', groupId });
      }
    } else if (c.kind === 'table') {
      // Table cells can contain {{token}} placeholders too
      for (const cell of c.cells ?? []) {
        for (const seg of splitContent(cell)) {
          const name = seg.value.trim();
          const key = fieldKey(groupId, name);
          if (seg.type === 'token' && name && !seen.has(key)) {
            seen.add(key);
            fields.push({ name, kind: 'text', groupId });
          }
        }
      }
    }
  }
  return fields;
}

/** Escape a string for safe insertion into rendered text content. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Render merged content for display: each `{{token}}` is replaced by
 * `resolve(token)`. Unknown tokens resolve to '' (blank) — the filler shows
 * empty space for unfilled fields rather than a literal placeholder. The
 * result is plain text (callers render it as-is); values are HTML-escaped.
 */
export function mergeContent(content: string, resolve: (token: string) => string): string {
  if (!content) return '';
  return content.replace(/\{\{([^}]+)\}\}/g, (_m, token) => escapeHtml(resolve(token.trim())));
}