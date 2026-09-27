/**
 * Layout contract for composable documents.
 *
 * The layout system is a Tailwind-like but closed declarative syntax. Authors
 * (human or AI) may only use whitelisted keys and token values — never
 * `className`, raw CSS, `<style>`, scripts, or arbitrary HTML. The short
 * string syntax is parsed into a `LayoutContract` first and validated against
 * the whitelist; it is never applied as CSS directly.
 *
 * Supported short syntax (whitespace-separated tokens):
 *   stack | row | grid            → display
 *   col-1 … col-12                → grid columns
 *   span-1 … span-12              → grid span
 *   gap-<scale>                   → gap token
 *   justify-left|center|right|between|around
 *   align-start|center|end|stretch → vertical alignment
 *   page-break-before
 *   keep-together
 */

export interface LayoutContract {
  display?: 'stack' | 'row' | 'grid';
  /** Grid column count (1–12). */
  columns?: number;
  /** Grid span of this instance (1–12). */
  span?: number;
  gap?: string;
  /** Horizontal alignment. */
  align?: 'left' | 'center' | 'right' | 'justify' | 'between' | 'around';
  /** Vertical alignment. */
  valign?: 'start' | 'center' | 'end' | 'stretch';
  padding?: string;
  margin?: string;
  width?: string;
  pageBreakBefore?: boolean;
  keepTogether?: boolean;
}

/** Whitelisted spacing/size tokens. No arbitrary values allowed. */
export const SCALE_TOKENS = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const;

export const WIDTH_TOKENS = [
  'auto',
  'full',
  'half',
  'third',
  ...SCALE_TOKENS,
] as const;

export const ALIGN_TOKENS = [
  'left',
  'center',
  'right',
  'justify',
  'between',
  'around',
] as const;

export const VALIGN_TOKENS = ['start', 'center', 'end', 'stretch'] as const;

/** JSON Schema for a LayoutContract — consumed by Ajv validation. */
export const LAYOUT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    display: { enum: ['stack', 'row', 'grid'] },
    columns: { type: 'integer', minimum: 1, maximum: 12 },
    span: { type: 'integer', minimum: 1, maximum: 12 },
    gap: { enum: [...SCALE_TOKENS] },
    align: { enum: [...ALIGN_TOKENS] },
    valign: { enum: [...VALIGN_TOKENS] },
    padding: { enum: [...SCALE_TOKENS] },
    margin: { enum: [...SCALE_TOKENS] },
    width: { enum: [...WIDTH_TOKENS] },
    pageBreakBefore: { type: 'boolean' },
    keepTogether: { type: 'boolean' },
  },
  additionalProperties: false,
};

const JUSTIFY_RE = /^justify-(left|center|right|between|around)$/;
const ALIGN_RE = /^align-(start|center|end|stretch)$/;
const GAP_RE = /^gap-(none|xs|sm|md|lg|xl)$/;
const COL_RE = /^col-(\d{1,2})$/;
const SPAN_RE = /^span-(\d{1,2})$/;

export interface ParsedLayout {
  layout: LayoutContract;
  /** Tokens that are not part of the whitelist. Empty = fully valid. */
  errors: string[];
}

/**
 * Parse short layout syntax into a whitelist-checked LayoutContract.
 * Unknown tokens are reported in `errors`, never passed through.
 */
export function parseLayoutString(input: string): ParsedLayout {
  const layout: LayoutContract = {};
  const errors: string[] = [];
  const tokens = input.trim().split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    if (token === 'stack' || token === 'row' || token === 'grid') {
      layout.display = token;
      continue;
    }
    if (token === 'page-break-before') {
      layout.pageBreakBefore = true;
      continue;
    }
    if (token === 'keep-together') {
      layout.keepTogether = true;
      continue;
    }
    let m = COL_RE.exec(token);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 12) layout.columns = n;
      else errors.push(`"${token}" is out of range (col-1..col-12)`);
      continue;
    }
    m = SPAN_RE.exec(token);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 12) layout.span = n;
      else errors.push(`"${token}" is out of range (span-1..span-12)`);
      continue;
    }
    m = GAP_RE.exec(token);
    if (m) {
      layout.gap = m[1];
      continue;
    }
    m = JUSTIFY_RE.exec(token);
    if (m) {
      layout.align = m[1] as LayoutContract['align'];
      continue;
    }
    m = ALIGN_RE.exec(token);
    if (m) {
      layout.valign = m[1] as LayoutContract['valign'];
      continue;
    }
    errors.push(`unsupported layout token "${token}"`);
  }

  return { layout, errors };
}

/**
 * Validate an already-parsed layout object against the whitelist.
 * Returns human-actionable error strings (empty = valid).
 */
export function validateLayout(layout: unknown): string[] {
  const errors: string[] = [];
  if (layout === undefined || layout === null) return errors;
  if (typeof layout !== 'object' || Array.isArray(layout)) {
    return ['layout must be an object'];
  }
  const l = layout as Record<string, unknown>;
  const allowed = Object.keys(LAYOUT_JSON_SCHEMA.properties ?? {});
  for (const key of Object.keys(l)) {
    if (!allowed.includes(key)) {
      errors.push(
        `layout.${key} is not allowed (allowed: ${allowed.join(', ')})`,
      );
    }
  }
  if (
    l.display !== undefined &&
    !['stack', 'row', 'grid'].includes(l.display as string)
  ) {
    errors.push('layout.display must be stack|row|grid');
  }
  for (const key of ['columns', 'span'] as const) {
    const v = l[key];
    if (
      v !== undefined &&
      (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 12)
    ) {
      errors.push(`layout.${key} must be an integer 1..12`);
    }
  }
  const enumCheck = (
    key: 'gap' | 'padding' | 'margin',
    values: readonly string[],
  ) => {
    const v = l[key];
    if (v !== undefined && !values.includes(v as string)) {
      errors.push(`layout.${key} must be one of ${values.join('|')}`);
    }
  };
  enumCheck('gap', SCALE_TOKENS);
  enumCheck('padding', SCALE_TOKENS);
  enumCheck('margin', SCALE_TOKENS);
  if (
    l.width !== undefined &&
    !(WIDTH_TOKENS as readonly string[]).includes(l.width as string)
  ) {
    errors.push(`layout.width must be one of ${WIDTH_TOKENS.join('|')}`);
  }
  if (
    l.align !== undefined &&
    !(ALIGN_TOKENS as readonly string[]).includes(l.align as string)
  ) {
    errors.push(`layout.align must be one of ${ALIGN_TOKENS.join('|')}`);
  }
  if (
    l.valign !== undefined &&
    !(VALIGN_TOKENS as readonly string[]).includes(l.valign as string)
  ) {
    errors.push(`layout.valign must be one of ${VALIGN_TOKENS.join('|')}`);
  }
  for (const key of ['pageBreakBefore', 'keepTogether'] as const) {
    if (l[key] !== undefined && typeof l[key] !== 'boolean') {
      errors.push(`layout.${key} must be a boolean`);
    }
  }
  return errors;
}
