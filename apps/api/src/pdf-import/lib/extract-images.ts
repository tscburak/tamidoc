import { OPS } from 'pdfjs-dist';
import { createCanvas, ImageData, Path2D } from '@napi-rs/canvas';
import type { PDFPageProxy } from 'pdfjs-dist';
import { type Matrix, IDENTITY, mul, apply } from './pdf-matrix';
import { decodeConstructPath, toDOMMatrix } from './extract-shapes';
import type { ImportIssues } from './import-diagnostics';

/** Local ImageComponent shape matching the frontend ImageComponent. */
interface ImageComponent {
  paintOrder: number;
  id: string;
  kind: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  page: number;
  src: string; // data URL
  alt: string;
  objectFit: string;
  radius: number;
  field: string;
}

// --- Safety caps (mirrors pdf-parser's run caps philosophy) -----------------
const MAX_PER_PAGE = 100;
const MIN_DESIGN_PX = 0.1;
const MIN_SOURCE_PX = 1;
const RESOLVE_TIMEOUT_MS = 5000;

/** Verbose per-image diagnostics: PDF_IMPORT_DEBUG=1. */
const DEBUG = !!process.env.PDF_IMPORT_DEBUG;
const dbg = (...a: unknown[]) => {
  if (DEBUG) console.log('[img]', ...a);
};

// pdfjs ImageKind values (build/pdf.js)
const IMAGE_KIND_RGBA = 3; // RGBA_32BPP
const IMAGE_KIND_RGB = 2; // RGB_24BPP

/** Resolve an XObject image by id from the page's object stores.
 * `g_`-prefixed ids live in commonObjs; everything else in objs. Callback form
 * with a timeout — returns null if the object never resolves. */
function resolveObject(page: PDFPageProxy, objId: string): Promise<any> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: any) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const store: any = objId.startsWith('g_') ? page.commonObjs : page.objs;
      if (store.has?.(objId)) {
        finish(store.get(objId));
        return;
      }
      const timer = setTimeout(() => {
        dbg(`resolve TIMEOUT objId=${objId}`);
        finish(null);
      }, RESOLVE_TIMEOUT_MS);
      store.get(objId, (img: any) => {
        clearTimeout(timer);
        finish(img);
      });
    } catch {
      finish(null);
    }
  });
}

/** Normalize pdfjs image data to a RGBA Uint8ClampedArray (length w*h*4).
 * Handles RGBA_32BPP and RGB_24BPP (alpha padded to 255); other kinds → null. */
function toRgba(
  data: ArrayLike<number> | Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  kind: number,
): Uint8ClampedArray | null {
  const n = w * h;
  if (!Number.isSafeInteger(n) || n <= 0 || n > 16_000_000) return null;
  const out = new Uint8ClampedArray(n * 4);
  if (kind === IMAGE_KIND_RGBA) {
    out.set(
      data.length >= n * 4 ? (data as Uint8Array).subarray(0, n * 4) : data,
    );
    return out;
  }
  if (kind === IMAGE_KIND_RGB) {
    const src = data as Uint8Array;
    for (let i = 0; i < n; i++) {
      out[i * 4] = src[i * 3];
      out[i * 4 + 1] = src[i * 3 + 1];
      out[i * 4 + 2] = src[i * 3 + 2];
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  if (kind === 1) {
    const stride = Math.ceil(w / 8);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const value = data[y * stride + (x >> 3)] & (128 >> (x & 7)) ? 255 : 0;
        const offset = (y * w + x) * 4;
        out[offset] = out[offset + 1] = out[offset + 2] = value;
        out[offset + 3] = 255;
      }
    }
    return out;
  }
  return null;
}

/** Lossless encoding preserves logos, monochrome artwork and transparency. */
function encodeDataUrl(rgba: Uint8ClampedArray, w: number, h: number): string {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
  return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
}

/**
 * Extract embedded raster images from a PDF page as ImageComponents, placed at
 * their real positions.
 *
 * Walks the page's operator list tracking the graphics transform (CTM), and on
 * each image-paint op resolves the bitmap + computes the device-space bbox from
 * the unit square under the current CTM. NEVER throws — any failure skips the
 * image (it remains visible in the ghost background).
 *
 * @param page - PDF page proxy (1-indexed internally)
 * @param viewport - design-space viewport (scale + y-flip + /Rotate applied)
 * @param pageIndex - 0-indexed page number
 * @param budget - remaining image budget across the whole document
 * @returns Promise<ImageComponent[]>
 */
export async function extractImages(
  page: PDFPageProxy,
  viewport: { convertToViewportPoint: (x: number, y: number) => number[] },
  pageIndex: number,
  budget: number,
  issues?: ImportIssues,
): Promise<ImageComponent[]> {
  let opList: { fnArray: number[]; argsArray: any[] };
  try {
    opList = await page.getOperatorList();
  } catch (err) {
    issues?.add('image extraction failed');
    console.warn(
      `PDF import: getOperatorList failed (page ${pageIndex + 1}):`,
      (err as Error)?.message,
    );
    return [];
  }

  const { fnArray, argsArray } = opList;
  const components: ImageComponent[] = [];
  let ctm: Matrix = [...IDENTITY];
  let clips: { path: Path2D; evenOdd: boolean }[] = [];
  let alpha = 1;
  const stack: { ctm: Matrix; clips: typeof clips; alpha: number }[] = [];
  let currentPath: Path2D | null = null;
  let pendingClip: boolean | null = null;
  const origin = viewport.convertToViewportPoint(0, 0);
  const ex = viewport.convertToViewportPoint(1, 0);
  const ey = viewport.convertToViewportPoint(0, 1);
  const viewportMatrix: Matrix = [
    ex[0] - origin[0],
    ex[1] - origin[1],
    ey[0] - origin[0],
    ey[1] - origin[1],
    origin[0],
    origin[1],
  ];
  let counter = 0;
  const limit = Math.min(MAX_PER_PAGE, budget);

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] ?? [];

    try {
      if (fn === OPS.transform) {
        ctm = mul(ctm, args as Matrix);
      } else if (fn === OPS.save) {
        stack.push({ ctm, clips, alpha });
      } else if (fn === OPS.restore) {
        const state = stack.pop();
        if (state) ({ ctm, clips, alpha } = state);
      } else if (fn === OPS.paintFormXObjectBegin) {
        stack.push({ ctm, clips, alpha });
        if (Array.isArray(args[0]) && args[0].length === 6)
          ctm = mul(ctm, args[0] as Matrix);
        if (args[1]) {
          const [x1, y1, x2, y2] = args[1];
          const path = new Path2D();
          path.rect(x1, y1, x2 - x1, y2 - y1);
          clips = [
            ...clips,
            {
              path: path.transform(toDOMMatrix(mul(viewportMatrix, ctm))),
              evenOdd: false,
            },
          ];
        }
      } else if (fn === OPS.paintFormXObjectEnd) {
        const state = stack.pop();
        if (state) ({ ctm, clips, alpha } = state);
      } else if (fn === OPS.setGState) {
        for (const [key, value] of args[0] ?? [])
          if (key === 'ca') alpha = value;
      } else if (fn === OPS.constructPath) {
        const next = decodeConstructPath(args);
        if (currentPath && next) currentPath.addPath(next.path);
        else currentPath = next?.path ?? null;
      } else if (fn === OPS.clip || fn === OPS.eoClip) {
        pendingClip = fn === OPS.eoClip;
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
        ].includes(fn)
      ) {
        if (pendingClip !== null && currentPath) {
          clips = [
            ...clips,
            {
              path: currentPath.transform(
                toDOMMatrix(mul(viewportMatrix, ctm)),
              ),
              evenOdd: pendingClip,
            },
          ];
        }
        currentPath = null;
        pendingClip = null;
      } else if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintInlineImageXObject
      ) {
        if (components.length >= limit) {
          issues?.add('image complexity limit');
          continue;
        }
        const comp = await buildImageComponent(
          fn === OPS.paintInlineImageXObject
            ? (args[0] ?? null)
            : await resolveObject(page, args[0]),
          ctm,
          viewport,
          pageIndex,
          counter++,
          clips,
          alpha,
        );
        if (comp) components.push({ ...comp, paintOrder: i });
        else if (alpha > 0) issues?.add('unsupported image');
      } else if (
        [
          OPS.paintImageMaskXObject,
          OPS.paintImageMaskXObjectGroup,
          OPS.paintImageMaskXObjectRepeat,
          OPS.paintImageXObjectRepeat,
          OPS.paintInlineImageXObjectGroup,
        ].includes(fn)
      ) {
        issues?.add('image masks or repeated image groups');
      }
    } catch (err) {
      issues?.add('image extraction failed');
      console.warn(
        `PDF import: image op failed (page ${pageIndex + 1}):`,
        (err as Error)?.message,
      );
    }
  }

  return components;
}

/** Build one ImageComponent from a resolved pdfjs image object + current CTM. */
async function buildImageComponent(
  img: any,
  ctm: Matrix,
  viewport: { convertToViewportPoint: (x: number, y: number) => number[] },
  pageIndex: number,
  seq: number,
  clips: { path: Path2D; evenOdd: boolean }[] = [],
  alpha = 1,
): Promise<ImageComponent | null> {
  if (!img) return null;
  const w: number = img.width;
  const h: number = img.height;
  dbg(`#${seq} kind=${img.kind} native=${w}x${h}`);
  if (!w || !h) return null;
  if (w < MIN_SOURCE_PX || h < MIN_SOURCE_PX) {
    dbg(`#${seq} SKIP source too small`);
    return null; // tiny fills / bullets
  }

  // Image occupies the unit square [0,0]→[1,1] under the current CTM; convert
  // the corners to design px via the viewport (y-flip + /Rotate safe).
  const corners: [number, number][] = [
    apply([0, 0], ctm),
    apply([1, 0], ctm),
    apply([0, 1], ctm),
    apply([1, 1], ctm),
  ].map(([x, y]) => viewport.convertToViewportPoint(x, y)) as [
    number,
    number,
  ][];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const designX = Math.min(...xs);
  const designY = Math.min(...ys);
  const designW = Math.max(...xs) - designX;
  const designH = Math.max(...ys) - designY;
  if (designW < MIN_DESIGN_PX || designH < MIN_DESIGN_PX) {
    dbg(
      `#${seq} SKIP design too small (${Math.round(designW)}x${Math.round(designH)})`,
    );
    return null;
  }

  const rgba = toRgba(img.data, w, h, img.kind);
  if (!rgba) {
    // kind 1 (GRAYSCALE_1BPP) and unknown layouts land here — the image then
    // only exists in the ghost background, which looks bandy.
    dbg(
      `#${seq} SKIP unsupported kind=${img.kind} (dataLen=${img.data?.length})`,
    );
    return null;
  }
  dbg(
    `#${seq} box=${Math.round(designW)}x${Math.round(designH)} srcPerPixel=${(w / designW).toFixed(2)} ` +
      `(1.0 = native matches design; <1 = upscaled ⇒ pixelated)`,
  );

  let src: string;
  try {
    src = encodeDataUrl(rgba, w, h);
    // Bake reflection, rotation and shear into the bitmap. An axis-aligned
    // bounding box alone turns rotated images upright and stretches them.
    const [bottomLeft, bottomRight, topLeft, topRight] = corners;
    const upright =
      Math.abs(topLeft[0] - designX) < 0.001 &&
      Math.abs(topLeft[1] - designY) < 0.001 &&
      Math.abs(topRight[1] - designY) < 0.001 &&
      Math.abs(bottomLeft[0] - designX) < 0.001 &&
      bottomRight[0] > bottomLeft[0];
    if (!upright || clips.length || alpha !== 1) {
      const source = createCanvas(w, h);
      source.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
      const ratio = Math.min(2, 2000 / designW, 2000 / designH);
      const canvas = createCanvas(
        Math.max(1, Math.ceil(designW * ratio)),
        Math.max(1, Math.ceil(designH * ratio)),
      );
      const ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, -designX * ratio, -designY * ratio);
      for (const clip of clips)
        ctx.clip(clip.path, clip.evenOdd ? 'evenodd' : 'nonzero');
      ctx.globalAlpha = alpha;
      ctx.setTransform(
        ((topRight[0] - topLeft[0]) * ratio) / w,
        ((topRight[1] - topLeft[1]) * ratio) / w,
        ((bottomLeft[0] - topLeft[0]) * ratio) / h,
        ((bottomLeft[1] - topLeft[1]) * ratio) / h,
        (topLeft[0] - designX) * ratio,
        (topLeft[1] - designY) * ratio,
      );
      ctx.drawImage(source, 0, 0);
      src = `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
    }
  } catch (err) {
    console.warn(
      `PDF import: image encode failed (page ${pageIndex + 1}):`,
      (err as Error)?.message,
    );
    return null;
  }

  return {
    paintOrder: 0,
    id: `img_${pageIndex}_${seq}`,
    kind: 'image',
    x: designX,
    y: designY,
    width: designW,
    height: designH,
    rotation: 0,
    page: pageIndex,
    src,
    alt: '',
    objectFit: 'fill',
    radius: 0,
    field: '',
  };
}
