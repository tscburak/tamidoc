/* Scratch runtime verification for the PDF-import pipeline.
 * Generates a test PDF (heading + 3-line paragraph + blank + positioned image),
 * then runs the real extract pipeline on it and logs results.
 * Run: npx ts-node -r tsconfig-paths/register scripts/verify-import.ts
 */
import React from 'react';
import * as fs from 'fs';
import { renderToBuffer, Document, Page, Text, View, Image, Svg, Circle, Path, Rect } from '@react-pdf/renderer';
import { createCanvas } from '@napi-rs/canvas';
import { loadPdf } from '../src/pdf-import/lib/pdf-loader';
import { extractTextRuns } from '../src/pdf-import/lib/pdf-parser';
import { groupRunsIntoParagraphs } from '../src/pdf-import/lib/group-paragraphs';
import { detectFields } from '../src/pdf-import/lib/detect-fields';
import { extractImages } from '../src/pdf-import/lib/extract-images';
import { extractShapes } from '../src/pdf-import/lib/extract-shapes';
import { deriveDividers, medianFontSizePx } from '../src/pdf-import/lib/table-structure';
import { rasterizePageToJpegDataUrl } from '../src/pdf-import/lib/pdf-rasterizer';

/** Run the real extraction pipeline over a user-supplied PDF and dump per-page
 * results — the diagnostic mode for "this image looks wrong" reports.
 * Pair with PDF_IMPORT_DEBUG=1 for per-image kind/native-size/skip-reason logs.
 * Run: npx ts-node -r tsconfig-paths/register scripts/verify-import.ts file.pdf */
async function runOnRealPdf(filePath: string): Promise<void> {
  const buf = fs.readFileSync(filePath);
  console.log('PDF bytes:', buf.length);
  const doc = await loadPdf(buf);
  const pageCount = Math.min(doc.numPages, 5);
  for (let p = 0; p < pageCount; p++) {
    const page = await doc.getPage(p + 1);
    const scale = 96 / 72;
    const viewport = page.getViewport({ scale });

    const runs = await extractTextRuns(page, scale, p);
    const vectors = await extractShapes(page, viewport, p, 240);
    const dividers = deriveDividers(vectors, Math.max(40, medianFontSizePx(runs) * 2.5));
    const paragraphs = groupRunsIntoParagraphs(runs, { dividers });
    console.log(
      `\n===== PAGE ${p + 1}: ${runs.length} runs → ${paragraphs.length} paragraphs | ` +
        `dividers v/h: ${dividers.vertical.length}/${dividers.horizontal.length} | ` +
        `paper=${Math.round(viewport.width)}x${Math.round(viewport.height)} rotate=${page.rotate}`,
    );

    const images = await extractImages(page, viewport, p, 100);
    console.log(`images: ${images.length}`);
    for (const img of images) {
      console.log(
        `  img @(${Math.round(img.x)},${Math.round(img.y)}) ${Math.round(img.width)}x${Math.round(img.height)} ` +
          `${img.src.slice(5, 15)} srcLen=${img.src.length}`,
      );
    }

    console.log(`vectors: ${vectors.length}`);
    for (const v of vectors.slice(0, 15)) {
      const d = v.kind === 'shape' ? `shape=${v.shape} stroke=${v.stroke} sw=${v.strokeWidth}` : 'raster';
      console.log(`  ${v.id} @(${Math.round(v.x)},${Math.round(v.y)}) ${Math.round(v.width)}x${Math.round(v.height)} ${d}`);
    }
  }
  console.log('\nDONE');
}

async function main() {
  // Real-PDF diagnostic mode: verify-import.ts <file.pdf>
  const realPdf = process.argv[2];
  if (realPdf) {
    await runOnRealPdf(realPdf);
    return;
  }

  // 1. Build a small PNG (red rect + "LOGO" text) to embed as an image.
  const c = createCanvas(240, 96);
  const cx = c.getContext('2d');
  cx.fillStyle = '#dc2626';
  cx.fillRect(0, 0, 240, 96);
  cx.fillStyle = '#ffffff';
  cx.font = 'bold 40px sans-serif';
  cx.fillText('LOGO', 40, 62);
  const png = c.toBuffer('image/png');
  const pngDataUrl = `data:image/png;base64,${png.toString('base64')}`;

  // 1b. Transparent PNG (logo on alpha) — must extract as PNG, not a black JPEG.
  const c2 = createCanvas(200, 200);
  const c2x = c2.getContext('2d');
  c2x.fillStyle = '#2563eb';
  c2x.beginPath();
  c2x.arc(100, 100, 80, 0, Math.PI * 2);
  c2x.fill();
  const alphaPngDataUrl = `data:image/png;base64,${c2.toBuffer('image/png').toString('base64')}`;

  // 2. Render a test PDF. Page A4 (595x842 pt). Image placed at a known spot.
  const IMAGE = { left: 360, top: 40, width: 180, height: 72 }; // pt
  const ALPHA_IMAGE = { left: 60, top: 40, width: 90, height: 90 }; // pt
  // Vector fixtures (pt) — expected extraction targets.
  const BGRECT = { left: 60, top: 500, width: 200, height: 100, fill: '#e0e7ff' };
  const DIVIDER = { left: 60, top: 640, width: 300, borderWidth: 2, color: '#dc2626' };
  const CIRCLE = { left: 350, top: 480, size: 100, cx: 50, cy: 50, r: 40 };
  const CURVE = { left: 60, top: 660, width: 200, height: 100 };
  // Certificate-style decorative border: stroke-only rect a few % inside the
  // page. Must extract as a real shape (not be dropped as a "crop mark").
  const BORDER = { left: 30, top: 30, width: 535, height: 782, borderWidth: 3 };
  // Centered two-line title (different line widths, same center) — must infer
  // align:center from staggered lefts + consistent centers.
  const TITLE = { left: 40, top: 320, width: 240 };
  // Table: ONE path chaining six rect sub-paths (3 rows × 2 cols) — how
  // real-world tables arrive (single constructPath, single paint op). Cell
  // texts sit <3em apart, so only derived dividers can split the columns;
  // header texts are centered inside their cells. (The Svg is sized tight to
  // the grid: react-pdf drops siblings after an oversized full-page SVG.)
  const TABLE = { left: 300, top: 180, cw: 120, rh: 36, rows: 3, cols: 2 };
  let tableD = '';
  for (let r = 0; r < TABLE.rows; r++) {
    for (let c = 0; c < TABLE.cols; c++) {
      const x = c * TABLE.cw;
      const y = r * TABLE.rh;
      tableD += `M ${x} ${y} L ${x + TABLE.cw} ${y} L ${x + TABLE.cw} ${y + TABLE.rh} L ${x} ${y + TABLE.rh} Z `;
    }
  }
  const CELLS = [
    { text: 'ITEM NO AND CODE', x: 310, y: 184, w: 100, center: true },
    { text: 'QUANTITY', x: 420, y: 184, w: 120, center: true },
    { text: 'Widget A-1 description', x: 305, y: 220, w: 115 },
    { text: '12 pcs', x: 427, y: 220, w: 40 },
    { text: 'Gadget B-2 extra text', x: 305, y: 256, w: 115 },
    { text: '3 pcs', x: 427, y: 256, w: 40 },
  ];
  const buffer = await renderToBuffer(
    React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: 'A4', style: { padding: 40 } },
        React.createElement(Text, { style: { fontSize: 20, fontWeight: 'bold' } }, 'Offer Letter'),
        React.createElement(View, { style: { marginTop: 12 } },
          React.createElement(Text, { style: { fontSize: 12 } }, 'Dear candidate, we are pleased to offer you a position.'),
          React.createElement(Text, { style: { fontSize: 12 } }, 'Your start date will be the first Monday of next month.'),
          React.createElement(Text, { style: { fontSize: 12 } }, 'Please review the terms below and sign where indicated.'),
        ),
        // Mixed-style line: bold run inside normal text → one component with
        // in-text marks, NOT separate layers.
        React.createElement(
          Text,
          { style: { fontSize: 12, marginTop: 8 } },
          'This offer is ',
          React.createElement(Text, { style: { fontWeight: 'bold' } }, 'strictly confidential'),
          ' until signed.',
        ),
        React.createElement(View, { style: { marginTop: 16 } },
          React.createElement(Text, { style: { fontSize: 12 } }, 'Name: ____________________________   Date: ___________'),
        ),
        // Multi-line answer area: labeled blank + two continuation blank
        // lines → must become ONE longtext field spanning all three lines.
        React.createElement(View, { style: { marginTop: 16 } },
          React.createElement(Text, { style: { fontSize: 12 } }, 'Address: ____________________________'),
          React.createElement(Text, { style: { fontSize: 12 } }, '__________________________________'),
          React.createElement(Text, { style: { fontSize: 12 } }, '__________________________________'),
        ),
        React.createElement(
          View,
          { style: { position: 'absolute', left: IMAGE.left, top: IMAGE.top, width: IMAGE.width, height: IMAGE.height } },
          React.createElement(Image, { src: pngDataUrl, style: { width: '100%', height: '100%' } }),
        ),
        React.createElement(
          View,
          { style: { position: 'absolute', left: ALPHA_IMAGE.left, top: ALPHA_IMAGE.top, width: ALPHA_IMAGE.width, height: ALPHA_IMAGE.height } },
          React.createElement(Image, { src: alphaPngDataUrl, style: { width: '100%', height: '100%' } }),
        ),
        // Vector fixtures: background rect, divider, circle, complex curve.
        React.createElement(View, {
          style: {
            position: 'absolute', left: BGRECT.left, top: BGRECT.top,
            width: BGRECT.width, height: BGRECT.height, backgroundColor: BGRECT.fill,
          },
        }),
        React.createElement(View, {
          style: {
            position: 'absolute', left: DIVIDER.left, top: DIVIDER.top, width: DIVIDER.width,
            borderBottom: `${DIVIDER.borderWidth}px solid ${DIVIDER.color}`,
          },
        }),
        React.createElement(
          Svg,
          { style: { position: 'absolute', left: CIRCLE.left, top: CIRCLE.top, width: CIRCLE.size, height: CIRCLE.size } },
          React.createElement(Circle, {
            cx: CIRCLE.cx, cy: CIRCLE.cy, r: CIRCLE.r,
            fill: '#22c55e', stroke: '#166534', strokeWidth: 2,
          }),
        ),
        React.createElement(
          Svg,
          { style: { position: 'absolute', left: CURVE.left, top: CURVE.top, width: CURVE.width, height: CURVE.height } },
          React.createElement(Path, {
            d: 'M 10 80 C 40 10, 65 10, 95 80 S 150 150, 180 80',
            stroke: '#7c3aed', fill: 'none', strokeWidth: 3,
          }),
        ),
        // Centered title (multi-line, staggered widths).
        React.createElement(
          View,
          { style: { position: 'absolute', left: TITLE.left, top: TITLE.top, width: TITLE.width } },
          React.createElement(Text, { style: { fontSize: 16, textAlign: 'center' } }, 'DELIVERY NOTE'),
          React.createElement(Text, { style: { fontSize: 16, textAlign: 'center' } }, 'Summary of Items'),
        ),
        // Table grid: one path, six rect sub-paths, sized tight to the grid.
        React.createElement(
          Svg,
          {
            style: {
              position: 'absolute', left: TABLE.left, top: TABLE.top,
              width: TABLE.cols * TABLE.cw, height: TABLE.rows * TABLE.rh,
            },
          },
          React.createElement(Path, { d: tableD, stroke: '#334155', fill: 'none', strokeWidth: 1 }),
        ),
        // Per-cell texts (absolute, sub-3em column gaps).
        ...CELLS.map((cell) =>
          React.createElement(
            View,
            { key: cell.text, style: { position: 'absolute', left: cell.x, top: cell.y, width: cell.w } },
            React.createElement(
              Text,
              { style: { fontSize: 10, ...(cell.center ? { textAlign: 'center' } : {}) } },
              cell.text,
            ),
          ),
        ),
        // Certificate border LAST: its full-page SVG would drop later siblings.
        React.createElement(
          Svg,
          { style: { position: 'absolute', left: 0, top: 0, width: 595, height: 842 } },
          React.createElement(Rect, {
            x: BORDER.left, y: BORDER.top,
            width: BORDER.width, height: BORDER.height,
            stroke: '#000000', fill: 'none', strokeWidth: BORDER.borderWidth,
          }),
        ),
      ),
    ),
  );

  const buf = Buffer.from(buffer as any);
  console.log('PDF bytes:', buf.length);

  // 3. Run the real pipeline.
  const doc = await loadPdf(buf);
  const page = await doc.getPage(1);
  const scale = 96 / 72;
  const viewport = page.getViewport({ scale });

  // Shapes first (mirrors the service) — dividers feed text grouping + align.
  const vectors = await extractShapes(page, viewport, 0, 240);
  const runs = await extractTextRuns(page, scale, 0);
  const dividers = deriveDividers(vectors, Math.max(40, medianFontSizePx(runs) * 2.5));
  console.log('\n=== text runs:', runs.length);
  for (const r of runs) console.log(`  [${r.fontWeight}/${r.fontStyle} fs=${Math.round(r.fontSizePx)}] "${r.text.slice(0, 50)}"`);
  console.log(`=== dividers: ${dividers.vertical.length} vertical / ${dividers.horizontal.length} horizontal`);

  const paragraphs = groupRunsIntoParagraphs(runs, { dividers });
  console.log('\n=== paragraphs:', paragraphs.length);
  for (const p of paragraphs) console.log(`  (fs=${Math.round(p.fontSizePx)} ${p.fontWeight}/${p.fontStyle}, ${p.lines.length}L) "${p.content.replace(/\n/g, ' / ').slice(0, 70)}"`);

  const { components, candidates } = detectFields(paragraphs, 0, {
    pageWidth: Math.round(viewport.width),
    dividers,
  });
  console.log('\n=== components:', components.length, '| candidates:', candidates.length);
  for (const c of components) {
    const marks = (c as any).marks as { start: number; end: number; fontWeight?: string; fontStyle?: string }[] | undefined;
    const markInfo = marks?.length
      ? ` marks=[${marks.map((m) => `${m.start}-${m.end}${m.fontWeight ? ':' + m.fontWeight : ''}${m.fontStyle ? ':' + m.fontStyle : ''}`).join(', ')}]`
      : '';
    const summary = c.kind === 'text' ? `text "${c.content.replace(/\n/g, '/').slice(0, 200)}"${markInfo}` : `image ${Math.round(c.width)}x${Math.round(c.height)} src=${(c as any).src.slice(0, 30)}...`;
    console.log(`  ${c.kind} @(${Math.round(c.x)},${Math.round(c.y)}) ${summary}`);
  }
  for (const c of candidates) console.log(`  candidate id=${c.id} comp=${c.componentId} type=${c.heuristicType} name=${c.heuristicName} label="${c.label}"`);

  // Stacked blank area: the three Address lines must yield ONE longtext
  // candidate whose component covers all three source lines.
  const addrCand = candidates.find((c) => c.heuristicName === 'address');
  const addrComp = components.find((c) => c.id === addrCand?.componentId);
  console.log(
    'stacked blank area:',
    addrCand && addrComp
      ? `type=${addrCand.heuristicType} content="${addrComp.content.replace(/\n/g, '/')}" h=${Math.round(addrComp.height)} — ` +
          `match? ${addrCand.heuristicType === 'longtext' && !addrComp.content.includes('\n') && addrComp.height > 2 * addrComp.fontSize}`
      : 'NOT FOUND',
  );

  const images = await extractImages(page, viewport, 0, 100);
  console.log('\n=== extracted images:', images.length);
  for (const img of images) {
    console.log(`  img @(${Math.round(img.x)},${Math.round(img.y)}) ${Math.round(img.width)}x${Math.round(img.height)} srcLen=${img.src.length}`);
    const designLeft = IMAGE.left * scale;
    const designTop = IMAGE.top * scale;
    const designW = IMAGE.width * scale;
    const designH = IMAGE.height * scale;
    console.log(`  expected ~(${Math.round(designLeft)},${Math.round(designTop)}) ${Math.round(designW)}x${Math.round(designH)}`);
    console.log(`  match? x:${Math.abs(img.x - designLeft) < 10}, y:${Math.abs(img.y - designTop) < 10}, w:${Math.abs(img.width - designW) < 10}, h:${Math.abs(img.height - designH) < 10}`);
  }

  // Transparent-PNG fixture: must survive as PNG (alpha intact), not flatten to black JPEG.
  const alphaImg = images.find(
    (im) => Math.abs(im.x - ALPHA_IMAGE.left * scale) < 10 && Math.abs(im.y - ALPHA_IMAGE.top * scale) < 10,
  );
  console.log(
    'transparent png:',
    alphaImg
      ? `format=${alphaImg.src.slice(5, 14)} @(${Math.round(alphaImg.x)},${Math.round(alphaImg.y)}) — ` +
          `match? ${alphaImg.src.startsWith('data:image/png')}`
      : 'NOT FOUND',
  );

  // Vector extraction — shapes land below images in the service; here directly.
  console.log('\n=== extracted vectors:', vectors.length);
  for (const v of vectors) {
    const d =
      v.kind === 'shape'
        ? `shape=${v.shape} fill=${v.fill} stroke=${v.stroke} sw=${v.strokeWidth}`
        : `raster srcLen=${v.src.length}`;
    console.log(`  ${v.id} @(${Math.round(v.x)},${Math.round(v.y)}) ${Math.round(v.width)}x${Math.round(v.height)} ${d}`);
  }
  const near = (a: number, b: number, tol = 12) => Math.abs(a - b) < tol;

  const bgRect = vectors.find(
    (v) => v.kind === 'shape' && v.shape === 'rectangle' && v.fill === BGRECT.fill,
  );
  console.log(
    'bgrect:',
    bgRect && bgRect.kind === 'shape'
      ? `@(${Math.round(bgRect.x)},${Math.round(bgRect.y)}) ${Math.round(bgRect.width)}x${Math.round(bgRect.height)} — ` +
          `match? ${near(bgRect.x, BGRECT.left * scale) && near(bgRect.y, BGRECT.top * scale) && near(bgRect.width, BGRECT.width * scale) && near(bgRect.height, BGRECT.height * scale)}`
      : 'NOT FOUND',
  );

  const divider = vectors.find(
    (v) => v.kind === 'shape' && v.stroke === DIVIDER.color && v.width > 100,
  );
  console.log(
    'divider:',
    divider && divider.kind === 'shape'
      ? `shape=${divider.shape} @(${Math.round(divider.x)},${Math.round(divider.y)}) ${Math.round(divider.width)}x${Math.round(divider.height)} — ` +
          `match? ${near(divider.x, DIVIDER.left * scale) && near(divider.y, DIVIDER.top * scale)}`
      : 'NOT FOUND',
  );

  const ellipse = vectors.find((v) => v.kind === 'shape' && v.shape === 'ellipse');
  console.log(
    'ellipse:',
    ellipse && ellipse.kind === 'shape'
      ? `@(${Math.round(ellipse.x)},${Math.round(ellipse.y)}) ${Math.round(ellipse.width)}x${Math.round(ellipse.height)} — ` +
          `match? ${near(ellipse.width, (CIRCLE.r * 2 + 2) * scale) && near(ellipse.height, (CIRCLE.r * 2 + 2) * scale) && near(ellipse.x, (CIRCLE.left + CIRCLE.cx - CIRCLE.r - 1) * scale) && near(ellipse.y, (CIRCLE.top + CIRCLE.cy - CIRCLE.r - 1) * scale)}`
      : 'NOT FOUND',
  );

  const complex = vectors.find((v) => v.kind === 'image' && v.id.startsWith('vec_'));
  console.log(
    'complex curve rasterized:',
    complex && complex.kind === 'image'
      ? `@(${Math.round(complex.x)},${Math.round(complex.y)}) ${Math.round(complex.width)}x${Math.round(complex.height)} srcLen=${complex.src.length}`
      : 'NOT FOUND',
  );

  const border = vectors.find(
    (v) => v.kind === 'shape' && v.stroke === '#000000' && v.width > 600 && v.height > 900,
  );
  console.log(
    'certificate border:',
    border && border.kind === 'shape'
      ? `@(${Math.round(border.x)},${Math.round(border.y)}) ${Math.round(border.width)}x${Math.round(border.height)} sw=${border.strokeWidth.toFixed(1)} — ` +
          `match? ${near(border.x, (BORDER.left - BORDER.borderWidth / 2) * scale, 15) && near(border.y, (BORDER.top - BORDER.borderWidth / 2) * scale, 15) && near(border.width, (BORDER.width + BORDER.borderWidth) * scale, 15)}`
      : 'NOT FOUND',
  );

  // Table grid: the six-subpath path must decompose into 6 rectangle shapes
  // at the expected cells (stroke color #334155 filters out other rects).
  const tableLeft = TABLE.left * scale;
  const tableTop = TABLE.top * scale;
  const tableRight = (TABLE.left + TABLE.cols * TABLE.cw) * scale;
  const tableBottom = (TABLE.top + TABLE.rows * TABLE.rh) * scale;
  const inTable = (v: { x: number; y: number; width: number; height: number }) =>
    v.x >= tableLeft - 6 && v.y >= tableTop - 6 && v.x + v.width <= tableRight + 6 && v.y + v.height <= tableBottom + 6;
  const cellShapes = vectors.filter((v) => v.kind === 'shape' && v.shape === 'rectangle' && inTable(v));
  console.log(
    `table cells: ${cellShapes.length} rect shapes in table bbox (expect 6) — ` +
      `match? ${cellShapes.length === 6}`,
  );

  // Per-cell text: 6 separate text components inside the table, none glued
  // across the column divider (sub-3em gaps prove the divider split).
  const cellTexts = components.filter((c) => c.kind === 'text' && inTable(c) && c.content.trim() !== '');
  console.log(`table cell texts: ${cellTexts.length} (expect 6) — match? ${cellTexts.length === 6}`);
  for (const t of cellTexts) console.log(`    "${t.content}" align=${t.align}`);

  // Centered header cell (single line centered in its divider band).
  const headerCell = cellTexts.find((t) => t.content.includes('QUANTITY'));
  console.log(
    'centered header cell:',
    headerCell ? `align=${headerCell.align} — match? ${headerCell.align === 'center'}` : 'NOT FOUND',
  );

  // Centered title: staggered lefts, consistent centers → align:center.
  const titleComp = components.find((c) => c.kind === 'text' && c.content.includes('DELIVERY NOTE'));
  console.log(
    'centered title:',
    titleComp ? `align=${titleComp.align} lines=${titleComp.content.split('\n').length} — match? ${titleComp.align === 'center'}` : 'NOT FOUND',
  );

  // Rasterize (exercises pdfjs render + scratch canvases → the path that
  // crashed with "Cannot find module 'canvas'" before the factory fix).
  const jpeg = await rasterizePageToJpegDataUrl(page, 2);
  console.log('\n=== rasterized:', jpeg.slice(0, 40), `... len=${jpeg.length}`);

  console.log('\nDONE');
}

main().catch((e) => {
  console.error('VERIFY FAILED:', e);
  process.exit(1);
});
