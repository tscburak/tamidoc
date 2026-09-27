/**
 * Shared primitives for the react-pdf renderers — extracted from
 * `template-pdf.tsx` so the Fixed-layout Template (form) and Composable Template (document) renderers
 * measure and resolve fonts/images/colors identically. Kept in one file so a
 * font-weight or DPI change here can never silently drift between the two.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Font } from '@react-pdf/renderer';

/** Design px → PDF points (canvas is @ 96 DPI; PDF is @ 72 DPI). */
export const PT = 72 / 96;
export const p = (px: number): number => px * PT;

/**
 * Lato is delivered in two weights (Regular=400, Bold=700). `semibold` (600)
 * and `medium` (500) map to Bold — acceptable drift for the available weights.
 */

/** Lato font files are bundled in src/pdf-render/assets/fonts (legacy pdfkit
 * layout) and copied into dist/.../assets/fonts by nest. Try several candidate
 * locations so dev (`src/...`) and prod (`dist/src/...`) both work. */
export function resolveFontPath(file: string): string | null {
  const candidates = [
    resolve(__dirname, '../assets/fonts', file),
    // With test/scripts included in the build, JS is in dist/src but Nest
    // still copies assets to dist/pdf-render. Resolve independently of cwd.
    resolve(__dirname, '../../../pdf-render/assets/fonts', file),
    resolve(process.cwd(), 'src/pdf-render/assets/fonts', file),
    resolve(process.cwd(), 'dist/src/pdf-render/assets/fonts', file),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

const REGULAR_PATH = resolveFontPath('Lato-Regular.ttf');
const BOLD_PATH = resolveFontPath('Lato-Bold.ttf');

let fontsRegistered = false;
export function ensureFontsRegistered(): void {
  if (fontsRegistered) return;
  if (!REGULAR_PATH || !BOLD_PATH) {
    throw new Error(
      'Bundled Lato PDF fonts are missing. Rebuild the backend with its font assets.',
    );
  }
  if (REGULAR_PATH) {
    Font.register({ family: 'Lato', src: REGULAR_PATH, fontWeight: 'normal' });
    Font.register({ family: 'Lato', src: REGULAR_PATH, fontWeight: 400 });
  }
  if (BOLD_PATH) {
    Font.register({ family: 'Lato', src: BOLD_PATH, fontWeight: 'bold' });
    Font.register({ family: 'Lato', src: BOLD_PATH, fontWeight: 700 });
  }
  for (const family of [
    'DejaVuSerifCondensed',
    'DejaVuSans',
    'DejaVuSansMono',
  ]) {
    const italic = family === 'DejaVuSerifCondensed' ? 'Italic' : 'Oblique';
    for (const face of [
      { suffix: '', fontWeight: 400, fontStyle: 'normal' as const },
      { suffix: '-Bold', fontWeight: 700, fontStyle: 'normal' as const },
      { suffix: `-${italic}`, fontWeight: 400, fontStyle: 'italic' as const },
      {
        suffix: `-Bold${italic}`,
        fontWeight: 700,
        fontStyle: 'italic' as const,
      },
    ]) {
      const file = `${family}${face.suffix}.ttf`;
      const src = resolveFontPath(file);
      if (!src)
        throw new Error(
          `Bundled PDF font is missing: ${file}. Rebuild the backend with its font assets.`,
        );
      Font.register({
        family,
        src,
        fontWeight: face.fontWeight,
        fontStyle: face.fontStyle,
      });
    }
  }
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

export function fontFamily(bold: boolean): string {
  if (bold) return BOLD_PATH ? 'Lato' : 'Helvetica-Bold';
  return REGULAR_PATH ? 'Lato' : 'Helvetica';
}

export const WEIGHT_NUM: Record<string, number> = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

export function fontWeightFor(name: string): number {
  return WEIGHT_NUM[name] ?? 400;
}

/* ---------- color helpers ------------------------------------------------- */

export function isTransparent(color: string | undefined | null): boolean {
  if (!color) return true;
  const c = color.trim().toLowerCase();
  if (c === '' || c === 'transparent' || c === 'none') return true;
  return /^#[0-9a-f]{6}00$/.test(c);
}

/* ---------- images -------------------------------------------------------- */

/** react-pdf's <Image> accepts a Buffer via `src={{ data: buffer, format }}`.
 * We pre-resolve buffers in the entry point so component code stays sync. */
export type ImageData = { data: Buffer; format: 'png' | 'jpg' | 'jpeg' };

export function imageDataFromRaw(
  rawSrc: string,
  imageCache: Map<string, Buffer | null>,
): ImageData | null {
  if (rawSrc.startsWith('data:')) {
    const m = /^data:image\/([a-z]+);base64,([\s\S]*)$/.exec(rawSrc);
    if (!m) return null;
    const fmt = m[1].toLowerCase();
    const format: 'png' | 'jpg' | 'jpeg' =
      fmt === 'png' ? 'png' : fmt === 'jpg' || fmt === 'jpeg' ? 'jpeg' : 'png';
    try {
      return { data: Buffer.from(m[2], 'base64'), format };
    } catch {
      return null;
    }
  }
  const buf = imageCache.get(rawSrc);
  if (!buf) return null;
  // react-pdf infers format from the Buffer magic; default to jpg (works for
  // most photos uploaded via the fill form). PNG fallback if first byte is
  // 0x89 (PNG signature).
  const isPng = buf[0] === 0x89;
  return { data: buf, format: isPng ? 'png' : 'jpeg' };
}
