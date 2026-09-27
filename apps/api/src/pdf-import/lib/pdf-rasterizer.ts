import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { PDFPageProxy } from 'pdfjs-dist';

/**
 * Rasterize a PDF page to a JPEG data URL.
 *
 * @param page - PDF page proxy
 * @param scale - Render scale multiplier (default 2 for ~144 dpi equivalent)
 * @returns Promise<string> - JPEG data URL
 */
export async function rasterizePageToJpegDataUrl(
  page: PDFPageProxy,
  scale: number = 2,
): Promise<string> {
  return rasterizePage(page, scale, 'jpeg');
}

/** Lossless artwork used for reference previews and unsupported-page fallback. */
export async function rasterizePageToPngDataUrl(
  page: PDFPageProxy,
  scale = 3,
): Promise<string> {
  return rasterizePage(page, scale, 'png');
}

/** The designer uses a shared page size. Pad references without stretching
 * source artwork when a PDF mixes portrait, landscape or smaller pages. */
export async function padPageReference(
  src: string,
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): Promise<string> {
  const source = await loadImage(src);
  const scale = Math.min(
    source.width / sourceWidth,
    source.height / sourceHeight,
    4096 / canvasWidth,
    4096 / canvasHeight,
  );
  const canvas = createCanvas(
    Math.ceil(canvasWidth * scale),
    Math.ceil(canvasHeight * scale),
  );
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, sourceWidth * scale, sourceHeight * scale);
  return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
}

async function rasterizePage(
  page: PDFPageProxy,
  scale: number,
  format: 'png' | 'jpeg',
): Promise<string> {
  scale = Number.isFinite(scale) && scale > 0 ? Math.min(scale, 4) : 3;
  // Get viewport with scale
  const viewport = page.getViewport({ scale });

  // Cap rendered dimensions to avoid huge images
  const maxDimension = 4096;
  let finalWidth = viewport.width;
  let finalHeight = viewport.height;
  let actualScale = scale;

  if (finalWidth > maxDimension || finalHeight > maxDimension) {
    const dimensionRatio = Math.min(
      maxDimension / finalWidth,
      maxDimension / finalHeight,
    );
    finalWidth *= dimensionRatio;
    finalHeight *= dimensionRatio;
    actualScale = scale * dimensionRatio;
  }

  // Recalculate viewport with adjusted scale
  const adjustedViewport = page.getViewport({ scale: actualScale });

  // Create canvas and render
  // Scratch canvases (image masks, filters) come from the transport-level
  // @napi-rs/canvas factory configured in pdf-loader's getDocument() call.
  const canvas = createCanvas(
    Math.ceil(adjustedViewport.width),
    Math.ceil(adjustedViewport.height),
  );
  const context = canvas.getContext('2d');

  // Set white background (PDFs often have transparent backgrounds)
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Render PDF page to canvas
  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport: adjustedViewport,
  }).promise;

  const bytes =
    format === 'png'
      ? canvas.toBuffer('image/png')
      : canvas.toBuffer('image/jpeg', 0.95);
  return `data:image/${format};base64,${bytes.toString('base64')}`;
}
