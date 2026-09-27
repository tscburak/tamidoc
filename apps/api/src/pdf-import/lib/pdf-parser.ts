import type { PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import { mul, type Matrix } from './pdf-matrix';
import { extractTextPaints, matchTextPaints } from './text-paints';
import { createCanvas } from '@napi-rs/canvas';
import type { ImportIssues } from './import-diagnostics';
import { apply } from './pdf-matrix';
import { resolveImportFont } from './font-fallback';

export type FontWeightLite = 'normal' | 'bold';
export type FontStyleLite = 'normal' | 'italic';
export interface ImportTextMark {
  start: number;
  end: number;
  color?: string;
}

/** One PDF text item, retaining source geometry instead of reflowing columns. */
export interface TextRun {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSizePx: number;
  baselineY: number;
  text: string;
  fontWeight: FontWeightLite;
  fontStyle: FontStyleLite;
  fontFamily?: string;
  fontSubstituted?: boolean;
  fontAscent?: number;
  color?: string;
  rotation?: number;
  paintOrder?: number;
  marks?: ImportTextMark[];
}

/** Probe inset for clip checks (PDF user units / points). react-pdf wraps
 * every text fragment in an exactly-fitting clip whose bounds sit ~0.02pt
 * inside the glyph extents (rounding), so a strict corner test flags our own
 * exports as "clipped text" and flattens the whole page to an image.
 * Insetting the probe corners ignores sub-pixel slop while genuine clipping
 * still misses by far more. */
export const TEXT_CLIP_EPS = 0.5;

/** Inset text-extent corners toward the run center for clip probing. Narrow
 * runs clamp to their midpoint so the probes never cross over. */
export function insetTextCorners(
  pdfWidth: number,
  ascent: number,
  descent: number,
  eps = TEXT_CLIP_EPS,
): [number, number][] {
  const insetX = Math.min(eps, pdfWidth / 2);
  const insetY = Math.min(eps, (ascent + descent) / 2);
  return [
    [insetX, ascent - insetY],
    [pdfWidth - insetX, ascent - insetY],
    [insetX, -descent + insetY],
    [pdfWidth - insetX, -descent + insetY],
  ];
}

export async function extractTextRuns(
  page: PDFPageProxy,
  scale: number,
  pageIndex: number,
  issues?: ImportIssues,
  substitutions?: Set<string>,
): Promise<TextRun[]> {
  // The operator list resolves commonObjs fonts without polling or timers.
  const paints = await extractTextPaints(page, issues);
  const textContent = await page.getTextContent({
    includeMarkedContent: false,
  });
  const viewport = page.getViewport({ scale });
  const cursors = new Map<string, number>();
  const runs: TextRun[] = [];
  const clipContext = createCanvas(1, 1).getContext('2d');
  for (const raw of textContent.items) {
    if (!('str' in raw) || !raw.str.trim()) continue;
    const item = raw;
    const style = textContent.styles[item.fontName];
    const font = page.commonObjs.has(item.fontName)
      ? page.commonObjs.get(item.fontName)
      : null;
    const fontName = font?.name ?? '';
    const italic = !!font?.italic || /italic|oblique/i.test(fontName);
    const resolvedFont = resolveImportFont(
      fontName,
      style?.fontFamily ?? '',
      item.str,
      italic,
      !!font?.isType3Font,
    );
    if (style?.vertical || item.dir === 'rtl')
      issues?.add('vertical or bidirectional text');
    const tx = mul(viewport.transform as Matrix, item.transform as Matrix);
    const fontSize = Math.hypot(tx[2], tx[3]);
    const width = Math.abs(item.width * scale);
    if (!Number.isFinite(fontSize) || fontSize <= 0 || width <= 0) continue;
    if (
      Math.abs(Math.hypot(tx[0], tx[1]) - fontSize) > fontSize * 0.01 ||
      Math.abs(tx[0] * tx[2] + tx[1] * tx[3]) > fontSize * fontSize * 0.01
    ) {
      issues?.add('stretched or skewed text');
    }
    const angle =
      Math.atan2(tx[1], tx[0]) + (style?.vertical ? Math.PI / 2 : 0);
    const ascent = Number.isFinite(style?.ascent) ? style.ascent : 0.8;
    const descent = Number.isFinite(style?.descent)
      ? Math.abs(style.descent)
      : 0.2;
    const height = fontSize * Math.max(1, ascent + descent);
    const topX = tx[4] + Math.sin(angle) * fontSize * ascent;
    const topY = tx[5] - Math.cos(angle) * fontSize * ascent;
    // Components rotate about their center; PDF text uses its baseline.
    const centerX =
      topX + (Math.cos(angle) * width) / 2 - (Math.sin(angle) * height) / 2;
    const centerY =
      topY + (Math.sin(angle) * width) / 2 + (Math.cos(angle) * height) / 2;
    const matched = matchTextPaints(
      item.str,
      paints.get(item.fontName) ?? [],
      cursors.get(item.fontName) ?? 0,
    );
    cursors.set(item.fontName, matched.cursor);
    if (matched.paints.length && matched.paints.every((p) => !p.visible))
      continue;
    if (resolvedFont.substituted)
      substitutions?.add(
        `${fontName || 'Unknown font'} → ${resolvedFont.family}`,
      );
    if (!matched.paints.length) issues?.add('unresolved text styling');
    const pdfTransform = item.transform as Matrix;
    const pdfWidth = width / Math.hypot(tx[0], tx[1]);
    const corners = insetTextCorners(pdfWidth, ascent, descent);
    if (
      matched.paints.some((paint) =>
        paint.clips.some((clip) =>
          corners.some(
            (corner) =>
              !clipContext.isPointInPath(clip, ...apply(corner, pdfTransform)),
          ),
        ),
      )
    ) {
      issues?.add('clipped text');
    }
    const color = matched.paints.find((p) => p.visible)?.color ?? '#000000';
    const marks: ImportTextMark[] = [];
    let offset = 0;
    let paintIndex = 0;
    for (const char of item.str) {
      const normalized = Array.from(char.normalize('NFKC')).filter(
        (c) => !/\s/u.test(c),
      );
      const paint = matched.paints[paintIndex];
      if (normalized.length) {
        const charColor =
          paint?.visible === false ? '#00000000' : (paint?.color ?? color);
        if (charColor !== color) {
          const last = marks[marks.length - 1];
          if (last?.end === offset && last.color === charColor)
            last.end += char.length;
          else
            marks.push({
              start: offset,
              end: offset + char.length,
              color: charColor,
            });
        }
        paintIndex += normalized.length;
      }
      offset += char.length;
    }
    runs.push({
      page: pageIndex,
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
      fontSizePx: fontSize,
      baselineY: tx[5],
      text: item.str,
      // Condensed describes width, never weight.
      fontWeight:
        font?.bold ||
        font?.black ||
        /bold|black|heavy|semibold|demi/i.test(fontName)
          ? 'bold'
          : 'normal',
      fontStyle: italic ? 'italic' : 'normal',
      fontFamily: resolvedFont.family,
      ...(resolvedFont.substituted ? { fontSubstituted: true } : {}),
      color,
      fontAscent: ascent,
      rotation: (angle * 180) / Math.PI,
      paintOrder: matched.paints[0]?.paintOrder ?? Number.MAX_SAFE_INTEGER,
      marks: marks.length ? marks : undefined,
    });
  }
  return runs;
}
