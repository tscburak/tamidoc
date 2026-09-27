/**
 * Theme and design-token system for composable documents.
 *
 * Content and presentation stay separate: components consume theme tokens
 * first and may only override at template or instance level.
 *
 * Resolution order (lowest → highest precedence):
 *   1. System defaults
 *   2. Organization theme
 *   3. Template theme
 *   4. Component defaults
 *   5. Component instance override
 */
import type { DocumentTheme } from './document-types';

export interface ThemeTokens {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: {
      heading: string;
      body: string;
      muted: string;
    };
    background: {
      page: string;
      surface: string;
    };
    border: string;
  };
  fonts: {
    heading: string;
    body: string;
    mono: string;
  };
  fontSizes: {
    xs: number;
    sm: number;
    base: number;
    lg: number;
    xl: number;
  };
  fontWeights: {
    normal: number;
    medium: number;
    semibold: number;
    bold: number;
  };
  lineHeights: {
    tight: number;
    normal: number;
    relaxed: number;
  };
  spacing: number[];
  radius: number[];
  shadows: string[];
  page: {
    size: 'A4' | 'letter' | '16:9';
    margins: { top: number; right: number; bottom: number; left: number };
  };
  header?: {
    enabled: boolean;
    text?: string;
    showLogo?: boolean;
  };
  footer?: {
    enabled: boolean;
    text?: string;
  };
  pageNumbering?: {
    enabled: boolean;
    format?: string;
  };
  logo?: string;
  organizationInfo?: string;
  watermark?: string;
}

/** Level 1 of the resolution order — ships with the platform. */
export const SYSTEM_THEME_DEFAULTS: ThemeTokens = {
  colors: {
    primary: '#f97316',
    secondary: '#0ea5e9',
    accent: '#8b5cf6',
    text: {
      heading: '#1c1917',
      body: '#44403c',
      muted: '#78716c',
    },
    background: {
      page: '#ffffff',
      surface: '#fafaf9',
    },
    border: '#e7e5e4',
  },
  fonts: {
    heading: 'Lato',
    body: 'Lato',
    mono: 'Courier',
  },
  fontSizes: {
    xs: 8,
    sm: 9.5,
    base: 11,
    lg: 13,
    xl: 16,
  },
  fontWeights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeights: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
  spacing: [0, 4, 8, 12, 16, 24, 32, 48],
  radius: [0, 2, 4, 8, 12, 16],
  shadows: ['none', '0 1pt 2pt rgba(0,0,0,0.08)'],
  page: {
    size: 'A4',
    margins: { top: 48, right: 48, bottom: 48, left: 48 },
  },
  header: { enabled: false },
  footer: { enabled: false },
  pageNumbering: { enabled: false, format: '{page} / {total}' },
};

export interface ThemePartial {
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    text?: {
      heading?: string;
      body?: string;
      muted?: string;
    };
    background?: {
      page?: string;
      surface?: string;
    };
    border?: string;
  };
  fonts?: {
    heading?: string;
    body?: string;
    mono?: string;
  };
  fontSizes?: Partial<ThemeTokens['fontSizes']>;
  fontWeights?: Partial<ThemeTokens['fontWeights']>;
  lineHeights?: Partial<ThemeTokens['lineHeights']>;
  spacing?: number[];
  radius?: number[];
  shadows?: string[];
  page?: {
    size?: 'A4' | 'letter' | '16:9';
    margins?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
  };
  header?: {
    enabled?: boolean;
    text?: string;
    showLogo?: boolean;
  };
  footer?: {
    enabled?: boolean;
    text?: string;
  };
  pageNumbering?: {
    enabled?: boolean;
    format?: string;
  };
  logo?: string;
  organizationInfo?: string;
  watermark?: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Deep-merge token layers; later layers win. Arrays replace, never concat. */
export function mergeThemeLayers(
  ...layers: (ThemePartial | undefined)[]
): ThemeTokens {
  const out = JSON.parse(JSON.stringify(SYSTEM_THEME_DEFAULTS)) as Record<
    string,
    unknown
  >;
  for (const layer of layers) {
    if (!layer) continue;
    const merge = (
      target: Record<string, unknown>,
      src: Record<string, unknown>,
    ) => {
      for (const [key, value] of Object.entries(src)) {
        if (value === undefined) continue;
        if (isPlainObject(value) && isPlainObject(target[key])) {
          merge(target[key], value);
        } else {
          target[key] = value;
        }
      }
    };
    merge(out, layer as Record<string, unknown>);
  }
  return out as unknown as ThemeTokens;
}

export interface ThemeResolutionInput {
  /** Level 2 — organization theme. */
  organization?: ThemePartial;
  /** Level 3 — template theme. */
  template?: ThemePartial;
  /** Level 4 — component defaults. */
  componentDefaults?: ThemePartial;
  /** Level 5 — single instance override. */
  instanceOverride?: ThemePartial;
}

/**
 * Resolve the effective theme following the precedence order
 * system < organization < template < component defaults < instance.
 */
export function resolveTheme(input: ThemeResolutionInput = {}): ThemeTokens {
  return mergeThemeLayers(
    undefined,
    input.organization,
    input.template,
    input.componentDefaults,
    input.instanceOverride,
  );
}

/**
 * Adapt full tokens to the legacy flow-renderer theme shape so the
 * deterministic renderer keeps consuming one narrow interface.
 */
export function toDocumentTheme(tokens: ThemeTokens): DocumentTheme {
  return {
    fontFamily: tokens.fonts.body,
    baseFontSize: tokens.fontSizes.base,
    colors: {
      primary: tokens.colors.primary,
      heading: tokens.colors.text.heading,
      body: tokens.colors.text.body,
      muted: tokens.colors.text.muted,
    },
    spacing: tokens.spacing[3] ?? 12,
  };
}

/** JSON Schema for theme token payloads (template/org level). */
export const THEME_TOKENS_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    colors: {
      type: 'object',
      properties: {
        primary: { type: 'string' },
        secondary: { type: 'string' },
        accent: { type: 'string' },
        text: {
          type: 'object',
          properties: {
            heading: { type: 'string' },
            body: { type: 'string' },
            muted: { type: 'string' },
          },
          additionalProperties: false,
        },
        background: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            surface: { type: 'string' },
          },
          additionalProperties: false,
        },
        border: { type: 'string' },
      },
      additionalProperties: false,
    },
    fonts: {
      type: 'object',
      properties: {
        heading: { type: 'string' },
        body: { type: 'string' },
        mono: { type: 'string' },
      },
      additionalProperties: false,
    },
    page: {
      type: 'object',
      properties: {
        size: { enum: ['A4', 'letter', '16:9'] },
        margins: {
          type: 'object',
          properties: {
            top: { type: 'number' },
            right: { type: 'number' },
            bottom: { type: 'number' },
            left: { type: 'number' },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    logo: { type: 'string' },
    organizationInfo: { type: 'string' },
    watermark: { type: 'string' },
  },
  additionalProperties: true,
};

/**
 * Template-level default style override for one component type (resolution
 * level 4). Only token-safe properties — never raw CSS. Authors set these in
 * the template designer; the renderer applies them under instance overrides.
 */
export interface ComponentStyleOverride {
  /** Text color hex, e.g. "#1c1917". */
  color?: string;
  /** Background fill hex (callout, code, quote accents). */
  background?: string;
  /** Font-size token relative to the theme base size. */
  fontSize?: 'xs' | 'sm' | 'base' | 'lg' | 'xl';
}

export const FONT_SIZE_TOKENS = ['xs', 'sm', 'base', 'lg', 'xl'] as const;

/** Token → multiplier applied on top of the theme base size. */
export const FONT_SIZE_MULTIPLIERS: Record<string, number> = {
  xs: 0.75,
  sm: 0.85,
  base: 1,
  lg: 1.2,
  xl: 1.45,
};

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Resolve the effective style override for a component type. Unknown keys and
 * malformed values are dropped (never passed to the renderer).
 */
export function getComponentStyle(
  defaults: Record<string, unknown> | undefined,
  componentKey: string,
): ComponentStyleOverride {
  if (!defaults || typeof defaults !== 'object') return {};
  const raw = defaults[componentKey];
  if (!raw || typeof raw !== 'object') return {};
  const rec = (raw as { styles?: unknown }).styles ?? raw;
  if (!rec || typeof rec !== 'object') return {};
  const src = rec as Record<string, unknown>;
  const out: ComponentStyleOverride = {};
  if (typeof src.color === 'string' && HEX_COLOR_RE.test(src.color.trim())) {
    out.color = src.color.trim();
  }
  if (
    typeof src.background === 'string' &&
    HEX_COLOR_RE.test(src.background.trim())
  ) {
    out.background = src.background.trim();
  }
  if (
    typeof src.fontSize === 'string' &&
    (FONT_SIZE_TOKENS as readonly string[]).includes(src.fontSize)
  ) {
    out.fontSize = src.fontSize as ComponentStyleOverride['fontSize'];
  }
  return out;
}

/** JSON Schema for template-level componentDefaults payloads. */
export const COMPONENT_DEFAULTS_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  propertyNames: { type: 'string', minLength: 1 },
  additionalProperties: {
    type: 'object',
    properties: {
      styles: {
        type: 'object',
        properties: {
          color: {
            type: 'string',
            pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$',
          },
          background: {
            type: 'string',
            pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$',
          },
          fontSize: { enum: [...FONT_SIZE_TOKENS] },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
};
