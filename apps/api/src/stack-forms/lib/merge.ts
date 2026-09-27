/**
 * Stack-form field unification.
 *
 * A Stack Form combines several published Templates into ONE fill form. Fields
 * are unified by a normalized form of their name (case/whitespace-insensitive)
 * so the submitter types each value once. Repeating groups are unified by
 * (normalized) group name the same way.
 *
 * The renderer reads fill values by the EXACT field name embedded in each
 * template's own canvas ({{token}} chips). Because unification renames fields to
 * canonical keys, each entry carries a `maps` object so the stored canonical
 * values can be remapped back to the original field names a given template
 * expects at render time (`buildEntryValues`).
 *
 * Everything here is pure and deterministic on field names, so the `preview`
 * endpoint and the `create` endpoint produce identical canonical keys for the
 * same templates — the builder review step shows exactly what will be persisted.
 */
import type {
  RenderTemplate,
  RenderField,
  RenderGroup,
  FillValues,
} from '../../pdf-render/lib/types';

/** Normalized canonical key: trim + lowercase + collapse internal whitespace.
 *  `Full Name` → `fullname`, `  Email Address ` → `emailaddress`. */
export function canonical(name: string): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

/** A template resolved and ready for stacking: identity + its render snapshot. */
export interface StackEntryInput {
  templateId: string;
  templateName: string;
  templateVersion: string;
  snapshot: RenderTemplate;
}

/** original field name → canonical scalar name. */
export type ScalarMap = Record<string, string>;
/** within a group: original field name → canonical field name. */
export type GroupFieldMap = Record<string, string>;

export interface GroupMap {
  /** canonical group name this original group maps to. */
  canonical: string;
  /** per-field remap inside the group. */
  fields: GroupFieldMap;
}

/** Per-entry remap tables — how to turn canonical FillValues back into the
 *  original-named FillValues this template's renderer expects. */
export interface EntryMaps {
  scalarMap: ScalarMap;
  groupMaps: Record<string, GroupMap>; // keyed by ORIGINAL group name
}

export interface MergeConflictVariant {
  templateName: string;
  value: unknown;
}

/** A disagreement between templates on a unified field's property. The builder
 *  review step surfaces these so the owner can pick a value before publishing. */
export interface MergeConflict {
  canonicalName: string;
  kind: 'scalar' | 'group';
  property: 'type' | 'options';
  variants: MergeConflictVariant[];
}

/** Manual link from the review mapping step: force a specific source field into
 *  the unified field identified by `targetName` (canonical). Group links keep
 *  the field in its own group but remap its canonical field name within it. */
export interface ManualLink {
  templateId: string;
  name: string;
  groupId?: string;
  groupName?: string;
  targetName: string;
}

export interface MergeEntry {
  templateId: string;
  templateName: string;
  templateVersion: string;
  maps: EntryMaps;
}

export interface MergeResult {
  unifiedFields: RenderField[];
  unifiedGroups: RenderGroup[];
  entries: MergeEntry[];
  conflicts: MergeConflict[];
}

/** A field occurrence in a specific template (used while unifying). */
interface FieldOcc {
  field: RenderField;
  templateName: string;
}

/**
 * Union dropdown options across occurrences, preserving first-seen order. Options
 * are stored as `string[]` at runtime (see template.schema / FieldInput); we
 * stringify defensively in case a snapshot holds the legacy `{value,label}[]`.
 */
function unionOptions(lists: (string[] | undefined | null)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const opt of list) {
      const key =
        typeof opt === 'string' ? opt : String((opt as any)?.value ?? opt);
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

/**
 * Unify a list of field occurrences by canonical name. Returns the unified
 * fields (groupId left as-is on each — the caller rewrites it for group
 * members) plus any type/options conflicts.
 *
 * `forceKey` optionally overrides the bucket key for a specific occurrence —
 * used by manual links to force a field into an existing unified field instead
 * of its own canonical bucket.
 */
function unifyFields(
  occs: FieldOcc[],
  forceKey?: (o: FieldOcc) => string | undefined,
): {
  unified: RenderField[];
  conflicts: MergeConflict[];
  kind: 'scalar' | 'group';
} {
  const buckets = new Map<string, FieldOcc[]>();
  const order: string[] = [];
  for (const o of occs) {
    const key = forceKey?.(o) ?? canonical(o.field.name);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(o);
  }

  const unified: RenderField[] = [];
  const conflicts: MergeConflict[] = [];

  for (const key of order) {
    const group = buckets.get(key)!;
    const first = group[0].field;
    const u: RenderField = {
      name: first.name, // keep first-seen original casing for display
      type: first.type,
      required: group.some((o) => o.field.required),
      defaultValue: first.defaultValue,
      placeholder: first.placeholder,
      info: first.info,
      section: first.section,
      defaultToday: first.defaultToday,
      disabled: first.disabled,
      visible: first.visible,
      askOnGenerate: first.askOnGenerate,
      // Runtime options shape is string[] (DB schema + FieldInput); the
      // RenderField type annotation says {value,label}[] — cast to match runtime.
      options: unionOptions(
        group.map((o) => o.field.options as string[] | undefined),
      ) as any,
      groupId: first.groupId ?? undefined,
    };
    unified.push(u);

    const distinctTypes = new Set(group.map((o) => o.field.type));
    if (distinctTypes.size > 1) {
      conflicts.push({
        canonicalName: canonical(first.name),
        kind: 'scalar',
        property: 'type',
        variants: group.map((o) => ({
          templateName: o.templateName,
          value: o.field.type,
        })),
      });
    }

    // Flag option-set mismatches (informational — union is still used).
    const optionSets = group
      .map((o) =>
        unionOptions([o.field.options as string[] | undefined])
          .sort()
          .join('|'),
      )
      .filter((s, i, arr) => arr.indexOf(s) === i);
    if (optionSets.length > 1) {
      conflicts.push({
        canonicalName: canonical(first.name),
        kind: 'scalar',
        property: 'options',
        variants: group.map((o) => ({
          templateName: o.templateName,
          value: unionOptions([o.field.options as string[] | undefined]),
        })),
      });
    }
  }

  return { unified, conflicts, kind: 'scalar' };
}

/**
 * Merge N template entries into one unified field/group set plus per-entry maps.
 * Deterministic: same inputs (in order) → same canonical keys and same order.
 *
 * `manualLinks` forces specific source fields into a target unified field,
 * overriding the canonical name match (review mapping step).
 */
export function mergeStack(
  inputs: StackEntryInput[],
  manualLinks?: ManualLink[],
): MergeResult {
  // Forced-target lookups built from manual links.
  // scalar source key: `${templateId}::${name}`
  // group source key:  `${templateId}::${canonical(groupName)}::${name}`
  const forcedScalar = new Map<string, string>();
  const forcedGroupField = new Map<string, string>();
  for (const l of manualLinks ?? []) {
    const target = canonical(l.targetName);
    if (l.groupId || l.groupName) {
      forcedGroupField.set(
        `${l.templateId}::${canonical(l.groupName ?? '')}::${l.name}`,
        target,
      );
    } else {
      forcedScalar.set(`${l.templateId}::${l.name}`, target);
    }
  }

  // ---- Scalars: every non-group field across all entries ----
  const scalarOccs: FieldOcc[] = [];
  const scalarTplOf = new Map<object, string>(); // occ field ref → templateId (for force lookup)
  for (const entry of inputs) {
    for (const f of entry.snapshot.fields ?? []) {
      if (f.groupId) continue;
      const occ = { field: f, templateName: entry.templateName };
      scalarOccs.push(occ);
      scalarTplOf.set(f, entry.templateId);
    }
  }
  const scalarForceKey = (o: FieldOcc): string | undefined => {
    const t = scalarTplOf.get(o.field);
    if (!t) return undefined;
    return forcedScalar.get(`${t}::${o.field.name}`);
  };
  const { unified: unifiedScalars, conflicts: scalarConflicts } = unifyFields(
    scalarOccs,
    scalarForceKey,
  );

  // ---- Groups: unify by canonical group name, member fields re-unified inside ----
  const groupOccs = new Map<
    string,
    { group: RenderGroup; fields: FieldOcc[]; templateName: string }
  >();
  const groupOrder: string[] = [];
  // field-ref → { templateId, groupCanon } so manual links can target group fields.
  const groupFieldMeta = new Map<
    object,
    { templateId: string; groupCanon: string }
  >();
  for (const entry of inputs) {
    const snap = entry.snapshot;
    for (const g of snap.groups ?? []) {
      const key = canonical(g.name);
      if (!groupOccs.has(key)) {
        groupOccs.set(key, {
          group: g,
          fields: [],
          templateName: entry.templateName,
        });
        groupOrder.push(key);
      }
      const occ = groupOccs.get(key)!;
      for (const f of snap.fields ?? []) {
        if (f.groupId && f.groupId === g.id) {
          occ.fields.push({ field: f, templateName: entry.templateName });
          groupFieldMeta.set(f, {
            templateId: entry.templateId,
            groupCanon: key,
          });
        }
      }
    }
  }
  const groupForceKey = (o: FieldOcc): string | undefined => {
    const meta = groupFieldMeta.get(o.field);
    if (!meta) return undefined;
    return forcedGroupField.get(
      `${meta.templateId}::${meta.groupCanon}::${o.field.name}`,
    );
  };

  const unifiedGroups: RenderGroup[] = [];
  const groupFieldConflicts: MergeConflict[] = [];
  const unifiedGroupFields: RenderField[] = [];
  for (const key of groupOrder) {
    const occ = groupOccs.get(key)!;
    const { unified: memberFields, conflicts } = unifyFields(
      occ.fields,
      groupForceKey,
    );
    for (const c of conflicts) c.kind = 'group';
    groupFieldConflicts.push(...conflicts);
    const gid = key; // stable canonical id
    for (const mf of memberFields) {
      unifiedGroupFields.push({ ...mf, groupId: gid });
    }
    unifiedGroups.push({
      id: gid,
      name: occ.group.name, // first-seen original casing
      memberIds: [], // unused by fill UI + validator (fields bind via groupId)
      repeating: occ.group.repeating ?? true,
      direction: occ.group.direction ?? 'column',
    });
  }

  // ---- Per-entry maps ----
  const entries: MergeEntry[] = inputs.map((entry) => {
    const snap = entry.snapshot;
    const scalarMap: ScalarMap = {};
    for (const f of snap.fields ?? []) {
      if (f.groupId) continue;
      scalarMap[f.name] =
        forcedScalar.get(`${entry.templateId}::${f.name}`) ?? canonical(f.name);
    }
    const groupMaps: Record<string, GroupMap> = {};
    for (const g of snap.groups ?? []) {
      const gkey = canonical(g.name);
      const fields: GroupFieldMap = {};
      for (const f of snap.fields ?? []) {
        if (f.groupId && f.groupId === g.id) {
          fields[f.name] =
            forcedGroupField.get(`${entry.templateId}::${gkey}::${f.name}`) ??
            canonical(f.name);
        }
      }
      groupMaps[g.name] = { canonical: gkey, fields };
    }
    return {
      templateId: entry.templateId,
      templateName: entry.templateName,
      templateVersion: entry.templateVersion,
      maps: { scalarMap, groupMaps },
    };
  });

  return {
    unifiedFields: [...unifiedScalars, ...unifiedGroupFields],
    unifiedGroups,
    entries,
    conflicts: [...scalarConflicts, ...groupFieldConflicts],
  };
}

/**
 * Remap canonical FillValues back to the ORIGINAL field/group names a specific
 * template entry's renderer expects. Inverse of the fill form's canonical keys.
 */
export function buildEntryValues(
  maps: EntryMaps,
  values: FillValues,
): FillValues {
  const out: FillValues = {};
  for (const [orig, canon] of Object.entries(maps.scalarMap ?? {})) {
    if (canon in values) out[orig] = values[canon];
  }
  for (const [origGroupName, gm] of Object.entries(maps.groupMaps ?? {})) {
    const arr = values[gm.canonical];
    if (Array.isArray(arr)) {
      out[origGroupName] = arr.map((row) => {
        const r: Record<string, string> = {};
        if (row && typeof row === 'object') {
          for (const [origField, canonField] of Object.entries(gm.fields)) {
            if (canonField in row) r[origField] = row[canonField];
          }
        }
        return r;
      });
    }
  }
  return out;
}
