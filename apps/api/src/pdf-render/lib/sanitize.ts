/**
 * Content security policy for composable documents.
 *
 * - AI must never emit HTML, CSS, or JavaScript. The renderer only runs
 *   registered components; anything outside a component's JSON Schema is
 *   rejected or stripped.
 * - Rich-text fields are sanitized to an allowlist of formatting tags.
 * - Image/URL sources are restricted to safe schemes and storage references.
 */
import sanitizeHtml from 'sanitize-html';

/** Contract keys that must never appear in a document contract. */
export const FORBIDDEN_CONTRACT_KEYS = [
  'className',
  'class',
  'css',
  'style',
  'html',
  'script',
  '__html',
  'dangerouslySetInnerHTML',
  'onClick',
  'onLoad',
  'onError',
] as const;

/** Schemes allowed for link/image sources. */
const SAFE_URL_SCHEMES = ['http', 'https', 'data', 'mailto'];

const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'a',
    'ul',
    'ol',
    'li',
    'code',
    'pre',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
};

/**
 * Sanitize a rich-text string to the formatting allowlist.
 * Strips `<script>`, `<style>`, event handlers, and unsafe URLs.
 */
export function sanitizeRichText(input: string): string {
  if (!input) return '';
  return sanitizeHtml(input, RICH_TEXT_OPTIONS);
}

/**
 * True when a URL is safe to render or link: http(s), mailto, image data
 * URLs, or a bare storage key / relative path (resolved via StorageService).
 */
export function isSafeUrl(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  // Bare storage keys and relative paths contain no scheme — always internal.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return true;
  const scheme = trimmed.split(':')[0].toLowerCase();
  if (!SAFE_URL_SCHEMES.includes(scheme)) return false;
  if (scheme === 'data') {
    return /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(trimmed);
  }
  return true;
}

/** Image sources follow the URL policy. */
export function isSafeImageSrc(value: string): boolean {
  return isSafeUrl(value);
}

/**
 * Recursively remove forbidden keys (`className`, raw CSS/HTML/script
 * handlers, …) from a plain object. Returns the list of removed paths.
 */
export function stripForbiddenProps(
  value: Record<string, unknown>,
  basePath = '',
): string[] {
  const removed: string[] = [];
  const forbidden = new Set<string>(FORBIDDEN_CONTRACT_KEYS);
  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const childPath = path ? `${path}.${key}` : key;
      if (forbidden.has(key) || key.startsWith('on')) {
        delete obj[key];
        removed.push(childPath);
      } else {
        walk(obj[key], childPath);
      }
    }
  };
  walk(value, basePath);
  return removed;
}

/**
 * Scan component data for unsafe rich-text/URL content without mutating it.
 * Returns actionable findings for the validation result.
 */
export function findUnsafeContent(
  data: Record<string, unknown>,
): { path: string; message: string; fix: string }[] {
  const findings: { path: string; message: string; fix: string }[] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      if (/<\s*script|<\s*style|javascript:/i.test(node)) {
        findings.push({
          path,
          message: 'contains forbidden HTML, CSS, or script content',
          fix: 'Remove HTML/CSS/script and use plain or rich-text formatting instead.',
        });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, val] of Object.entries(node)) {
        const child = path ? `${path}.${key}` : key;
        if (
          (key === 'src' || key === 'url' || key === 'href') &&
          typeof val === 'string' &&
          !isSafeUrl(val)
        ) {
          findings.push({
            path: child,
            message: `URL scheme is not allowed: "${val.slice(0, 60)}"`,
            fix: 'Use an http(s) URL, an uploaded image, or a storage reference.',
          });
        } else {
          walk(val, child);
        }
      }
    }
  };
  walk(data, '');
  return findings;
}
