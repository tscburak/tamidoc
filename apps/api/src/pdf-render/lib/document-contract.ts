/**
 * Document contract — the single JSON shape a human and an AI both produce.
 *
 * The LLM never designs the document. It only picks allowed components and
 * their contents; this module validates the contract BEFORE anything renders:
 *   1. JSON parse
 *   2. Root schema
 *   3. Component allowlist
 *   4. Component version pin check
 *   5. Per-component inputSchema
 *   6. Layout whitelist
 *   7. Count / content limits
 *   8. Unsafe content scan
 *   9. Structured result for the user
 *
 * A failed validation never renders. Callers can re-request only the broken
 * instances (schema repair) instead of regenerating the whole document.
 */
import { validatorFor } from './ajv-instance';
import {
  getActiveComponentVersion,
  getComponentDefinition,
  isReservedComponentKey,
} from './component-registry';
import { LAYOUT_JSON_SCHEMA, validateLayout } from './layout-contract';
import { validateBlocks } from './flow-blocks';
import type { LayoutContract } from './layout-contract';
import type { DocBlock } from './document-types';

export const DOCUMENT_SCHEMA_VERSION = '1.0';

export interface ComponentInstance {
  instanceId: string;
  componentKey: string;
  componentVersion: number;
  data: Record<string, unknown>;
  styles?: Record<string, unknown>;
  layout?: LayoutContract;
  hidden?: boolean;
  locked?: boolean;
}

export interface DocumentContract {
  schemaVersion: string;
  templateVersionId: string;
  title: string;
  locale: string;
  components: ComponentInstance[];
}

export interface ComponentConstraint {
  key: string;
  min?: number;
  max?: number;
  position?: 'first' | 'last';
  aiAllowed?: boolean;
  humanOnly?: boolean;
}

export interface OrderingRule {
  before: string;
  after: string;
}

export interface CompositionRules {
  requiredComponents: ComponentConstraint[];
  allowedComponents: ComponentConstraint[];
  forbiddenComponents?: string[];
  minComponents?: number;
  maxComponents?: number;
  orderingRules?: OrderingRule[];
  allowRepeatedComponents: boolean;
  maxPageCount?: number;
}

export interface ContractLimits {
  maxComponents?: number;
  /** Total characters across all string data (DoS guard for AI output). */
  maxChars?: number;
}

export interface ValidationIssue {
  instanceId?: string;
  path: string;
  message: string;
  fix: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
}

export const DEFAULT_CONTRACT_LIMITS: Required<ContractLimits> = {
  maxComponents: 200,
  maxChars: 500_000,
};

export const DOCUMENT_CONTRACT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: [
    'schemaVersion',
    'templateVersionId',
    'title',
    'locale',
    'components',
  ],
  properties: {
    schemaVersion: { const: DOCUMENT_SCHEMA_VERSION },
    templateVersionId: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    locale: { type: 'string', minLength: 2 },
    components: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['instanceId', 'componentKey', 'componentVersion', 'data'],
        properties: {
          instanceId: { type: 'string', minLength: 1 },
          componentKey: { type: 'string', minLength: 1 },
          componentVersion: { type: 'integer', minimum: 1 },
          data: { type: 'object' },
          styles: { type: 'object' },
          layout: LAYOUT_JSON_SCHEMA,
          hidden: { type: 'boolean' },
          locked: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

export interface ValidateContractOptions {
  /** Template allowlist. Absent = every registered component allowed. */
  allowedComponents?: string[];
  compositionRules?: CompositionRules;
  limits?: ContractLimits;
  /** When true, version checks also accept versions newer than current (preview). */
  allowFutureVersions?: boolean;
}

function countChars(value: unknown): number {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) {
    let total = 0;
    for (const item of value as unknown[]) total += countChars(item);
    return total;
  }
  if (value !== null && typeof value === 'object') {
    let total = 0;
    for (const item of Object.values(value as Record<string, unknown>))
      total += countChars(item);
    return total;
  }
  return 0;
}

/**
 * Parse raw AI output into a contract. Returns a ValidationResult-style
 * failure on malformed JSON instead of throwing, so callers surface one
 * uniform shape.
 */
export function parseDocumentContract(
  raw: string,
): { contract: DocumentContract } | { error: ValidationIssue } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      error: {
        path: '$',
        message: 'AI response is not valid JSON.',
        fix: 'Regenerate this section — the model returned malformed JSON.',
      },
    };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      error: {
        path: '$',
        message: 'Document contract must be a JSON object.',
        fix: 'Regenerate this section with a valid document contract object.',
      },
    };
  }
  return { contract: parsed as DocumentContract };
}

/**
 * Map an AI document contract onto the block list a human composer produces
 * (`{ id, type, inputs, pageBreak }`). One document shape, one validation +
 * render pipeline: after this mapping, contract components and fill-mode
 * blocks are indistinguishable. Hidden components are dropped; `layout`
 * fields other than `pageBreakBefore` have no renderer equivalent and are
 * ignored (the layout whitelist still gates what may appear).
 */
export function contractToBlocks(contract: DocumentContract): DocBlock[] {
  const blocks: DocBlock[] = [];
  for (const c of contract.components) {
    if (c.hidden) continue;
    blocks.push({
      id: c.instanceId,
      type: c.componentKey as DocBlock['type'],
      inputs: c.data ?? {},
      ...(c.layout?.pageBreakBefore ? { pageBreak: true } : {}),
    });
  }
  return blocks;
}

export function validateContract(
  contract: unknown,
  opts: ValidateContractOptions = {},
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const limits = { ...DEFAULT_CONTRACT_LIMITS, ...(opts.limits ?? {}) };

  // 2. Root schema ---------------------------------------------------------
  const rootValidate = validatorFor(DOCUMENT_CONTRACT_SCHEMA);
  if (!rootValidate(contract)) {
    for (const e of rootValidate.errors ?? []) {
      const path = e.instancePath
        ? `$${e.instancePath.replace(/\//g, '.')}`
        : '$';
      errors.push({
        path,
        message: `Invalid document contract: ${e.message ?? 'schema violation'}.`,
        fix: 'Regenerate the document with the required schemaVersion, templateVersionId, title, locale, and components fields.',
      });
    }
    return { ok: false, errors };
  }
  const doc = contract as DocumentContract;

  // 7a. Count limits --------------------------------------------------------
  const cap = opts.compositionRules?.maxComponents ?? limits.maxComponents;
  if (doc.components.length > cap) {
    errors.push({
      path: '$.components',
      message: `Too many components (${doc.components.length} > ${cap}).`,
      fix: `Remove components or split the document until at most ${cap} remain.`,
    });
  }
  const min = opts.compositionRules?.minComponents;
  if (min !== undefined && doc.components.length < min) {
    errors.push({
      path: '$.components',
      message: `Too few components (${doc.components.length} < ${min}).`,
      fix: `Add components until at least ${min} are present.`,
    });
  }
  const totalChars = countChars(doc.components.map((c) => c.data));
  if (totalChars > limits.maxChars) {
    errors.push({
      path: '$.components',
      message: `Content is too large (${totalChars} > ${limits.maxChars} characters).`,
      fix: 'Shorten component contents or split the document.',
    });
  }

  const seenIds = new Set<string>();
  /** Registry-known instances — everything else already has an error. */
  const knownIds = new Set<string>();

  doc.components.forEach((instance, index) => {
    const at = `$.components[${index}]`;

    if (seenIds.has(instance.instanceId)) {
      errors.push({
        instanceId: instance.instanceId,
        path: `${at}.instanceId`,
        message: `Duplicate instanceId "${instance.instanceId}".`,
        fix: 'Give every component a unique instanceId.',
      });
    }
    seenIds.add(instance.instanceId);

    // 3. Registry checks ----------------------------------------------------
    const def = getComponentDefinition(instance.componentKey);
    if (!def) {
      errors.push({
        instanceId: instance.instanceId,
        path: `${at}.componentKey`,
        message: isReservedComponentKey(instance.componentKey)
          ? `Component "${instance.componentKey}" is reserved but not available yet.`
          : `Unsupported component "${instance.componentKey}".`,
        fix: isReservedComponentKey(instance.componentKey)
          ? 'Pick an available component — this one has no renderer yet.'
          : 'Pick a component from the template’s allowed list.',
      });
      return;
    }
    knownIds.add(instance.instanceId);
    if (def.status !== 'active') {
      errors.push({
        instanceId: instance.instanceId,
        path: `${at}.componentKey`,
        message: `Component "${instance.componentKey}" is ${def.status}.`,
        fix: 'Replace it with an active component.',
      });
    }
    if (
      opts.compositionRules?.forbiddenComponents?.includes(
        instance.componentKey,
      )
    ) {
      errors.push({
        instanceId: instance.instanceId,
        path: `${at}.componentKey`,
        message: `Component "${instance.componentKey}" is forbidden by this template.`,
        fix: 'Remove this component or replace it with an allowed one.',
      });
    }

    // 4. Version pin ---------------------------------------------------------
    const active = getActiveComponentVersion(instance.componentKey);
    const pinned = def.versions.find(
      (v) => v.version === instance.componentVersion,
    );
    if (!pinned) {
      errors.push({
        instanceId: instance.instanceId,
        path: `${at}.componentVersion`,
        message: `Unknown version ${instance.componentVersion} for "${instance.componentKey}".`,
        fix: `Use an existing version (latest is ${active?.version ?? 1}).`,
      });
      return;
    }
    if (
      active &&
      instance.componentVersion > active.version &&
      !opts.allowFutureVersions
    ) {
      errors.push({
        instanceId: instance.instanceId,
        path: `${at}.componentVersion`,
        message: `Version ${instance.componentVersion} of "${instance.componentKey}" is not published yet.`,
        fix: `Use version ${active.version} or an older pinned version.`,
      });
    }

    // Styles against the pinned style schema (unknown style props rejected).
    if (instance.styles !== undefined) {
      const styleValidate = validatorFor(pinned.styleSchema);
      if (!styleValidate(instance.styles)) {
        errors.push({
          instanceId: instance.instanceId,
          path: `${at}.styles`,
          message: `${def.name} component has unsupported style properties.`,
          fix: 'Use only theme tokens and supported style fields.',
        });
      }
    }

    // 6. Layout whitelist ------------------------------------------------------
    if (instance.layout !== undefined) {
      for (const msg of validateLayout(instance.layout)) {
        errors.push({
          instanceId: instance.instanceId,
          path: `${at}.layout`,
          message: msg,
          fix: 'Use only supported layout keys and token values (stack/row/grid, col-1..12, gap tokens).',
        });
      }
    }
  });

  // 5 + 8. Per-component inputs + unsafe content ------------------------------
  // Single validator: the contract is mapped onto the same block list a human
  // composer produces, then validated identically (catalog schema, allowlist
  // with structural containers exempt, nesting rules, unsafe content scan).
  const blockIssues = validateBlocks(
    contractToBlocks(doc).filter(
      (b) => b.id !== undefined && knownIds.has(b.id),
    ),
    opts.allowedComponents,
  );
  const indexByInstance = new Map(
    doc.components.map((c, i) => [c.instanceId, i] as const),
  );
  for (const issue of blockIssues) {
    const idx =
      issue.instanceId !== undefined
        ? indexByInstance.get(issue.instanceId)
        : undefined;
    const at = idx !== undefined ? `$.components[${idx}]` : '$.components';
    const name =
      idx !== undefined
        ? (getComponentDefinition(doc.components[idx].componentKey)?.name ??
          'Component')
        : 'Component';
    const dataPath = issue.path.startsWith('inputs.')
      ? `${at}.data.${issue.path.slice('inputs.'.length)}`
      : issue.path === 'type'
        ? `${at}.componentKey`
        : at;
    errors.push({
      instanceId: issue.instanceId,
      path: dataPath,
      message: `${name} component: ${issue.message}`,
      fix: `Edit the ${name} component or regenerate only this section.`,
    });
  }

  // Composition rules ----------------------------------------------------------
  const rules = opts.compositionRules;
  if (rules) {
    const counts = new Map<string, number>();
    doc.components.forEach((c) =>
      counts.set(c.componentKey, (counts.get(c.componentKey) ?? 0) + 1),
    );

    for (const req of rules.requiredComponents ?? []) {
      const count = counts.get(req.key) ?? 0;
      if (count < (req.min ?? 1)) {
        errors.push({
          path: '$.components',
          message: `Missing required component "${req.key}".`,
          fix: `Add at least ${req.min ?? 1} "${req.key}" component(s) to the document.`,
        });
      }
      if (req.max !== undefined && count > req.max) {
        errors.push({
          path: '$.components',
          message: `Component "${req.key}" appears ${count} times (max ${req.max}).`,
          fix: `Keep at most ${req.max} "${req.key}" component(s).`,
        });
      }
      if (
        req.position === 'first' &&
        doc.components[0]?.componentKey !== req.key
      ) {
        errors.push({
          path: '$.components[0]',
          message: `"${req.key}" must be the first component.`,
          fix: `Move a "${req.key}" component to the top of the document.`,
        });
      }
      if (
        req.position === 'last' &&
        doc.components[doc.components.length - 1]?.componentKey !== req.key
      ) {
        errors.push({
          path: `$`,
          message: `"${req.key}" must be the last component.`,
          fix: `Move a "${req.key}" component to the end of the document.`,
        });
      }
    }
    for (const allow of rules.allowedComponents ?? []) {
      const count = counts.get(allow.key) ?? 0;
      if (allow.max !== undefined && count > allow.max) {
        errors.push({
          path: '$.components',
          message: `Component "${allow.key}" appears ${count} times (max ${allow.max}).`,
          fix: `Keep at most ${allow.max} "${allow.key}" component(s).`,
        });
      }
    }
    if (!rules.allowRepeatedComponents) {
      for (const [key, count] of counts) {
        if (count > 1) {
          errors.push({
            path: '$.components',
            message: `Component "${key}" is repeated but repeats are not allowed.`,
            fix: `Keep only one "${key}" component.`,
          });
        }
      }
    }
    for (const rule of rules.orderingRules ?? []) {
      const firstAfter = doc.components.findIndex(
        (c) => c.componentKey === rule.after,
      );
      const firstBefore = doc.components.findIndex(
        (c) => c.componentKey === rule.before,
      );
      if (firstAfter !== -1 && firstBefore !== -1 && firstBefore < firstAfter) {
        errors.push({
          path: '$.components',
          message: `"${rule.before}" must come after "${rule.after}".`,
          fix: `Reorder so "${rule.after}" appears before "${rule.before}".`,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
