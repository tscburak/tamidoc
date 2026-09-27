/**
 * Block catalog + validation for composable (flow) templates. The catalog is
 * the single source of truth for three consumers:
 *   1. Fill UI        — generates the per-block input form (phase 2).
 *   2. AI validation  — validates agent-emitted JSON before render.
 *   3. Flow renderer  — `type` guides `flow-pdf.tsx`.
 *
 * Each block's `jsonSchema` is the machine-checkable contract (JSON Schema
 * draft 2020-12, validated at runtime with Ajv). The `validate` functions are
 * thin wrappers over the same compiled schemas so hand-rolled checks can never
 * drift from the published contract.
 */
import type { BlockType, DocBlock } from './document-types';
import { formatAjvErrors, validatorFor } from './ajv-instance';
import type { ValidateFunction } from 'ajv';
import { findUnsafeContent, isSafeImageSrc } from './sanitize';

export const BLOCK_TYPES: BlockType[] = [
  'heading',
  'paragraph',
  'bullet-list',
  'numbered-list',
  'image',
  'table',
  'quote',
  'callout',
  'code',
  'divider',
  'stat-grid',
  'section',
  'columns',
];

export const BLOCK_CATEGORY: Record<BlockType, string> = {
  heading: 'text',
  paragraph: 'text',
  'bullet-list': 'text',
  'numbered-list': 'text',
  quote: 'text',
  callout: 'text',
  code: 'text',
  image: 'media',
  table: 'data',
  'stat-grid': 'data',
  divider: 'layout',
  section: 'layout',
  columns: 'layout',
};

type Validator = (inputs: Record<string, unknown>) => string[];

export interface BlockSpec {
  type: BlockType;
  category: string;
  jsonSchema: Record<string, unknown>;
  validate: Validator;
}

function ajvValidator(schema: Record<string, unknown>): Validator {
  const validate: ValidateFunction = validatorFor(schema);
  return (inputs: Record<string, unknown>) => {
    const ok = validate(inputs);
    if (ok) return [];
    return formatAjvErrors(validate);
  };
}

/* ---------- catalog ------------------------------------------------------- */

export const BLOCK_CATALOG: Record<BlockType, BlockSpec> = {
  heading: {
    type: 'heading',
    category: 'text',
    jsonSchema: {
      type: 'object',
      required: ['text', 'level'],
      properties: {
        text: { type: 'string', minLength: 1 },
        level: { type: 'integer', minimum: 1, maximum: 4 },
        align: { enum: ['left', 'center', 'right'] },
      },
      additionalProperties: false,
    },
    validate: (i) => ajvValidator(BLOCK_CATALOG.heading.jsonSchema)(i),
  },
  paragraph: {
    type: 'paragraph',
    category: 'text',
    jsonSchema: {
      type: 'object',
      required: ['text'],
      properties: { text: { type: 'string', minLength: 1 } },
      additionalProperties: false,
    },
    validate: (i) => ajvValidator(BLOCK_CATALOG.paragraph.jsonSchema)(i),
  },
  'bullet-list': {
    type: 'bullet-list',
    category: 'text',
    jsonSchema: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          items: { type: 'string' },
        },
        style: { enum: ['disc', 'circle', 'square', 'dash'] },
      },
      additionalProperties: false,
    },
    validate: (i) => ajvValidator(BLOCK_CATALOG['bullet-list'].jsonSchema)(i),
  },
  'numbered-list': {
    type: 'numbered-list',
    category: 'text',
    jsonSchema: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          items: { type: 'string' },
        },
        start: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
    validate: (i) => ajvValidator(BLOCK_CATALOG['numbered-list'].jsonSchema)(i),
  },
  image: {
    type: 'image',
    category: 'media',
    jsonSchema: {
      type: 'object',
      required: ['src'],
      properties: {
        src: { type: 'string', minLength: 1 },
        alt: { type: 'string' },
        caption: { type: 'string' },
        width: { enum: ['full', 'half', 'third'] },
      },
      additionalProperties: false,
    },
    validate: (i) => ajvValidator(BLOCK_CATALOG.image.jsonSchema)(i),
  },
  table: {
    type: 'table',
    category: 'data',
    jsonSchema: {
      type: 'object',
      required: ['columns', 'rows'],
      properties: {
        columns: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['label'],
            properties: {
              label: { type: 'string' },
              align: { enum: ['left', 'center', 'right'] },
            },
            additionalProperties: true,
          },
        },
        rows: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['cells'],
            properties: {
              cells: { type: 'array', items: { type: 'string' } },
            },
            additionalProperties: true,
          },
        },
        header: { type: 'boolean' },
        zebra: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    validate: (i) => ajvValidator(BLOCK_CATALOG.table.jsonSchema)(i),
  },
  quote: {
    type: 'quote',
    category: 'text',
    jsonSchema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string', minLength: 1 },
        author: { type: 'string' },
      },
      additionalProperties: false,
    },
    validate: (i) => ajvValidator(BLOCK_CATALOG.quote.jsonSchema)(i),
  },
  callout: {
    type: 'callout',
    category: 'text',
    jsonSchema: {
      type: 'object',
      required: ['body'],
      properties: {
        tone: { enum: ['info', 'success', 'warning', 'danger'] },
        variant: { enum: ['info', 'success', 'warning', 'danger'] },
        title: { type: 'string' },
        body: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
    validate: (i) => ajvValidator(BLOCK_CATALOG.callout.jsonSchema)(i),
  },
  code: {
    type: 'code',
    category: 'text',
    jsonSchema: {
      type: 'object',
      required: ['code'],
      properties: {
        code: { type: 'string', minLength: 1 },
        language: { type: 'string' },
      },
      additionalProperties: false,
    },
    validate: (i) => ajvValidator(BLOCK_CATALOG.code.jsonSchema)(i),
  },
  divider: {
    type: 'divider',
    category: 'layout',
    jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
    validate: (i) => ajvValidator(BLOCK_CATALOG.divider.jsonSchema)(i),
  },
  'stat-grid': {
    type: 'stat-grid',
    category: 'data',
    jsonSchema: {
      type: 'object',
      required: ['stats'],
      properties: {
        stats: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['value', 'label'],
            properties: {
              value: { type: 'string' },
              label: { type: 'string' },
            },
            additionalProperties: true,
          },
        },
        columns: { type: 'integer', minimum: 1, maximum: 12 },
      },
      additionalProperties: false,
    },
    validate: (i) => ajvValidator(BLOCK_CATALOG['stat-grid'].jsonSchema)(i),
  },
  section: {
    type: 'section',
    category: 'layout',
    jsonSchema: {
      type: 'object',
      required: ['blocks'],
      properties: {
        direction: { enum: ['vertical', 'horizontal'] },
        justify: { enum: ['start', 'center', 'end', 'between'] },
        align: { enum: ['start', 'center', 'end', 'stretch'] },
        blocks: {
          type: 'array',
          items: { type: 'object' },
        },
      },
      additionalProperties: false,
    },
    validate: (i) => ajvValidator(BLOCK_CATALOG.section.jsonSchema)(i),
  },
  columns: {
    type: 'columns',
    category: 'layout',
    jsonSchema: {
      type: 'object',
      required: ['columns'],
      properties: {
        columns: {
          type: 'array',
          minItems: 1,
          items: { type: 'array', items: { type: 'object' } },
        },
        ratio: { type: 'array', items: { type: 'number' } },
      },
      additionalProperties: false,
    },
    validate: (i) => ajvValidator(BLOCK_CATALOG.columns.jsonSchema)(i),
  },
};

/* ---------- document validation ------------------------------------------- */

/**
 * The single validation issue shape shared by every document path (validate
 * endpoint, generate endpoint, AI contract). `instanceId` is the block id —
 * the frontend groups issues by it to highlight blocks.
 */
export interface BlockIssue {
  instanceId?: string;
  path: string;
  message: string;
  fix: string;
}

/** Nesting rules (mirrors the composer UI): one container level max. */
export function canNestInside(parentType: string, childType: string): boolean {
  if (parentType === 'section') return childType !== 'section';
  if (parentType === 'columns')
    return childType !== 'columns' && childType !== 'section';
  return false;
}

/**
 * Validate a block list against the catalog — the single validator for fill,
 * generate, and AI paths. Checks per block, recursively through section and
 * columns children:
 *   1. known block type
 *   2. nesting rules (one container level, no section-in-section)
 *   3. template allowlist (structural containers exempt)
 *   4. per-block JSON Schema inputs
 *   5. unsafe content scan + safe image sources
 *
 * `allowedBlocks` restricts which leaf types may appear — empty/undefined
 * means every catalog type is allowed. Issues on nested children without an
 * id are attributed to the enclosing top-level block.
 */
export function validateBlocks(
  blocks: unknown[],
  allowedBlocks?: readonly string[],
): BlockIssue[] {
  const allowed =
    allowedBlocks && allowedBlocks.length > 0 ? new Set(allowedBlocks) : null;
  const out: BlockIssue[] = [];

  const walk = (
    list: unknown[],
    topId: string,
    parentType: string | null,
  ): void => {
    list.forEach((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        out.push({
          instanceId: topId,
          path: 'block',
          message: 'Block must be an object.',
          fix: 'Provide a block with a type and inputs.',
        });
        return;
      }
      const block = value as DocBlock;
      const instanceId =
        typeof block.id === 'string' && block.id ? block.id : topId;
      const push = (path: string, message: string, fix: string): void => {
        out.push({ instanceId, path, message, fix });
      };

      const spec =
        typeof block.type === 'string' &&
        Object.hasOwn(BLOCK_CATALOG, block.type)
          ? BLOCK_CATALOG[block.type]
          : undefined;
      if (!spec) {
        push(
          'type',
          `Unknown block type "${block.type}".`,
          'Pick a block type from the template’s allowed list.',
        );
        return;
      }

      if (
        block.pageBreak !== undefined &&
        typeof block.pageBreak !== 'boolean'
      ) {
        push(
          'pageBreak',
          'Page break must be a boolean.',
          'Use true or false for pageBreak.',
        );
      }

      if (
        !block.inputs ||
        typeof block.inputs !== 'object' ||
        Array.isArray(block.inputs)
      ) {
        push(
          'inputs',
          'Block inputs must be an object.',
          'Provide an inputs object for this block.',
        );
        return;
      }

      // 2. Nesting rules ---------------------------------------------------
      if (parentType && !canNestInside(parentType, block.type)) {
        push(
          'type',
          `A ${parentType} block cannot contain a "${block.type}" block — one container level is allowed.`,
          'Move the nested block out of the container, or flatten it one level.',
        );
        return;
      }

      // 3. Allowlist — containers are structural, the allowlist governs the
      // leaf components inside them.
      const isContainer = block.type === 'section' || block.type === 'columns';
      if (allowed && !isContainer && !allowed.has(block.type)) {
        push(
          'type',
          `Block type "${block.type}" is not allowed by this template.`,
          'Use only block types allowed by this template.',
        );
      }

      // 4. Input schema ----------------------------------------------------
      for (const msg of spec.validate(block.inputs ?? {})) {
        const space = msg.indexOf(' ');
        const path = space === -1 ? msg : msg.slice(0, space);
        const message = space === -1 ? msg : msg.slice(space + 1);
        push(
          path,
          message,
          `Fix the ${spec.type} block’s inputs (see the highlighted field).`,
        );
      }

      // 5. Unsafe content ----------------------------------------------------
      const inputs = block.inputs ?? {};
      for (const finding of findUnsafeContent(inputs)) {
        push(
          finding.path ? `inputs.${finding.path}` : 'inputs',
          finding.message,
          finding.fix,
        );
      }
      if (
        block.type === 'image' &&
        typeof inputs.src === 'string' &&
        inputs.src &&
        !isSafeImageSrc(inputs.src)
      ) {
        push(
          'inputs.src',
          'Image source URL scheme is not allowed.',
          'Use an http(s) URL, an uploaded image, or a storage reference.',
        );
      }

      // Recurse into containers ----------------------------------------------
      if (block.type === 'columns') {
        const cols = inputs.columns;
        if (Array.isArray(cols)) {
          (cols as DocBlock[][]).forEach((colBlocks) => {
            if (Array.isArray(colBlocks))
              walk(colBlocks, instanceId, 'columns');
          });
        }
      } else if (block.type === 'section') {
        const kids = inputs.blocks;
        if (Array.isArray(kids)) {
          walk(kids as DocBlock[], instanceId, 'section');
        }
      }
    });
  };

  blocks.forEach((block, i) => walk([block], `block_${i}`, null));
  return out;
}
