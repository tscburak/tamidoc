import { OPS, type PDFPageProxy } from 'pdfjs-dist';
import { Path2D } from '@napi-rs/canvas';
import { decodeConstructPath, toDOMMatrix } from './extract-shapes';
import { IDENTITY, mul, type Matrix } from './pdf-matrix';
import type { ImportIssues } from './import-diagnostics';

export interface TextPaint {
  char: string;
  color: string;
  visible: boolean;
  paintOrder: number;
  clips: Path2D[];
}

/** TextContent omits paint state, and may combine several Tj/TJ operations.
 * Keep a Unicode stream per font so color changes inside an item survive.
 * PDF.js has already converted source color spaces to RGB at this boundary. */
export async function extractTextPaints(
  page: PDFPageProxy,
  issues?: ImportIssues,
) {
  const { fnArray, argsArray } = await page.getOperatorList();
  const paints = new Map<string, TextPaint[]>();
  let state = {
    font: '',
    fill: '#000000',
    stroke: '#000000',
    alpha: 1,
    strokeAlpha: 1,
    mode: 0,
    ctm: [...IDENTITY] as Matrix,
    clips: [] as Path2D[],
  };
  const stack: (typeof state)[] = [];
  let currentPath: Path2D | null = null;
  let pendingClip = false;
  const hex = (args: number[]) =>
    '#' +
    Array.from(args)
      .slice(0, 3)
      .map((v) => Math.round(v).toString(16).padStart(2, '0'))
      .join('');
  for (let i = 0; i < fnArray.length; i++) {
    const op = fnArray[i];
    const args = argsArray[i] ?? [];
    if (op === OPS.save || op === OPS.paintFormXObjectBegin) {
      stack.push({ ...state });
      if (op === OPS.paintFormXObjectBegin) {
        if (args[0]) state.ctm = mul(state.ctm, args[0]);
        if (args[1]) {
          const [x1, y1, x2, y2] = args[1];
          const path = new Path2D();
          path.rect(x1, y1, x2 - x1, y2 - y1);
          state.clips = [
            ...state.clips,
            path.transform(toDOMMatrix(state.ctm)),
          ];
        }
      }
    } else if (op === OPS.restore || op === OPS.paintFormXObjectEnd)
      state = stack.pop() ?? state;
    else if (op === OPS.transform) state.ctm = mul(state.ctm, args as Matrix);
    else if (op === OPS.constructPath) {
      const next = decodeConstructPath(args);
      if (currentPath && next) currentPath.addPath(next.path);
      else currentPath = next?.path ?? null;
    } else if (op === OPS.clip || op === OPS.eoClip) {
      pendingClip = true;
      if (op === OPS.eoClip) issues?.add('even-odd clipping');
    } else if (
      [
        OPS.endPath,
        OPS.fill,
        OPS.eoFill,
        OPS.stroke,
        OPS.closeStroke,
        OPS.fillStroke,
        OPS.eoFillStroke,
        OPS.closeFillStroke,
        OPS.closeEOFillStroke,
      ].includes(op)
    ) {
      if (pendingClip && currentPath)
        state.clips = [
          ...state.clips,
          currentPath.transform(toDOMMatrix(state.ctm)),
        ];
      currentPath = null;
      pendingClip = false;
    } else if (op === OPS.setFont) state.font = args[0];
    else if (op === OPS.setFillRGBColor) state.fill = hex(args);
    else if (op === OPS.setStrokeRGBColor) state.stroke = hex(args);
    else if (op === OPS.setTextRenderingMode) {
      state.mode = args[0];
      if ((state.mode & 3) === 1 || (state.mode & 3) === 2 || state.mode >= 4)
        issues?.add('outlined or clipping text');
    } else if (op === OPS.setGState) {
      for (const [key, value] of args[0] ?? []) {
        if (key === 'Font') state.font = value[0];
        if (key === 'ca') state.alpha = value;
        if (key === 'CA') state.strokeAlpha = value;
      }
    } else if (
      op === OPS.showText ||
      op === OPS.showSpacedText ||
      op === OPS.nextLineShowText ||
      op === OPS.nextLineSetSpacingShowText
    ) {
      const glyphs = args[op === OPS.nextLineSetSpacingShowText ? 2 : 0];
      if (!Array.isArray(glyphs)) continue;
      const list = paints.get(state.font) ?? [];
      const strokeOnly = (state.mode & 3) === 1;
      const alpha = strokeOnly ? state.strokeAlpha : state.alpha;
      const color =
        (strokeOnly ? state.stroke : state.fill) +
        (alpha < 1
          ? Math.round(Math.max(0, alpha) * 255)
              .toString(16)
              .padStart(2, '0')
          : '');
      for (const glyph of glyphs) {
        if (!glyph || typeof glyph === 'number') continue;
        for (const char of (glyph.unicode ?? '').normalize('NFKC')) {
          if (/\s/u.test(char)) continue;
          list.push({
            char,
            color,
            visible: (state.mode & 3) !== 3 && alpha > 0,
            paintOrder: i,
            clips: state.clips,
          });
        }
      }
      paints.set(state.font, list);
    }
  }
  return paints;
}

/** Failed matches leave the cursor unchanged so one missing item cannot
 * shift the styles of the rest of the page. */
export function matchTextPaints(
  text: string,
  paints: TextPaint[],
  cursor: number,
) {
  const chars = Array.from(text.normalize('NFKC')).filter(
    (c) => !/\s/u.test(c),
  );
  for (let start = cursor; start + chars.length <= paints.length; start++) {
    if (!chars.every((c, j) => paints[start + j].char === c)) continue;
    return {
      paints: paints.slice(start, start + chars.length),
      cursor: start + chars.length,
    };
  }
  return { paints: [] as TextPaint[], cursor };
}
