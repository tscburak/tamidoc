import * as path from 'path';
import * as pdfjs from 'pdfjs-dist';
import { createCanvas, type Canvas as NodeCanvas } from '@napi-rs/canvas';

const PDFJS_ROOT = path.dirname(require.resolve('pdfjs-dist/package.json'));

// pdfjs concatenates baseUrl + filename directly (`${this.baseUrl}${filename}`)
// and reads via fs.readFile, so use forward slashes and a trailing separator.
const STANDARD_FONT_DATA_URL = `${PDFJS_ROOT.replace(/\\/g, '/')}/standard_fonts/`;
const CMAP_URL = `${PDFJS_ROOT.replace(/\\/g, '/')}/cmaps/`;

/**
 * A canvas factory for pdfjs in Node.js.
 * Uses @napi-rs/canvas which provides prebuilt binaries (no native build step).
 */
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return {
      canvas,
      context: context as unknown as CanvasRenderingContext2D,
    };
  }

  reset(
    canvasAndContext: { canvas: NodeCanvas },
    width: number,
    height: number,
  ) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy() {
    // No-op for @napi-rs/canvas
  }
}

/**
 * Load a PDF from a Buffer and return the PDF document proxy.
 * @param buffer - PDF file content as a Buffer
 * @returns Promise<any> - PDF document proxy with numPages and getPage methods
 */
export async function loadPdf(buffer: Buffer): Promise<pdfjs.PDFDocumentProxy> {
  // Use pdfjs-dist with legacy worker for Node.js compatibility
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // Use legacy worker for Node.js environment
    useWorkerFetch: false,
    isEvalSupported: false,
    // pdfjs's default Node factory require()s the heavyweight `canvas`
    // package; substitute our @napi-rs/canvas-based factory. Must be set
    // here — pdfjs 3.x ignores the per-render `canvasFactory` parameter
    // and uses the transport-level factory for scratch canvases.
    canvasFactory: new NodeCanvasFactory(),
    // pdfjs 3.x only honors these at getDocument() too. Needed for PDFs
    // referencing non-embedded standard-14 fonts (e.g. pdfkit's default
    // Helvetica) and CJK encodings; the Node factories read them from disk.
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    // `canvasFactory` exists at runtime but is missing from the 3.x typings.
  });

  return await loadingTask.promise;
}
