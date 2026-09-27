/**
 * Normalize an uploaded image into a PDF-safe data URL.
 *
 * pdfkit's bundled PNG decoder is minimal: it garbles **interlaced (Adam7)**
 * PNGs and mishandles some exotic color types / embedded ICC profiles (which
 * shows up as faint, washed-out, or shifted colors). Re-encoding through the
 * browser's native `<canvas>` decoder normalizes *anything the browser can
 * display* into a plain non-interlaced sRGB image that pdfkit renders correctly.
 *
 * Alpha is preserved (canvas → `image/png` keeps transparency), so logos and
 * signatures keep their see-through backgrounds. No new dependency — this uses
 * the canvas the browser already ships, which fits the project's lightweight
 * (pdfkit-over-Puppeteer) rendering choice.
 *
 * Best-effort: if decoding or re-encoding throws for any reason, the original
 * file's data URL is returned so the upload is never blocked.
 */
export async function normalizeImageToPng(file: File): Promise<string> {
  const original = await readFileAsDataUrl(file);
  try {
    const img = await loadImage(original);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return original;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original; // canvas blocked / unsupported → keep raw bytes
    // Draw onto a transparent canvas (no fill) so alpha is preserved on export.
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return original;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}
