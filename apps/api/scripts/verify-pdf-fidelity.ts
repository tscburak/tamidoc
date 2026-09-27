import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigService } from '@nestjs/config';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { pdfFixture } from '../test/pdf-fixture';
import { PdfImportService } from '../src/pdf-import/pdf-import.service';
import { loadPdf } from '../src/pdf-import/lib/pdf-loader';
import { extractTextRuns } from '../src/pdf-import/lib/pdf-parser';
import { renderTemplatePdf } from '../src/pdf-render/lib/template-pdf';
import { rasterizePageToPngDataUrl } from '../src/pdf-import/lib/pdf-rasterizer';
import type { RenderComponent } from '../src/pdf-render/lib/types';

async function pixels(src: string) {
  const img = await loadImage(src);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height).data;
}

async function main() {
  const source = pdfFixture(`
    0.3 w 5 5 290 290 re S
    BT /F1 12 Tf 20 260 Td 0 0 1 rg (Normal) Tj ET
    BT /F2 12 Tf 20 230 Td 0 0 0 rg (Bold) Tj ET
    BT /F3 12 Tf 20 200 Td 1 0 0 rg (Italic) Tj ET
    BT /F4 12 Tf 20 170 Td 0 0 0 rg (Monospace) Tj ET
    BT /F1 12 Tf 160 260 Td 1 0 0 rg (RED) Tj 0 0 1 rg (BLUE) Tj ET
    20 255 m 60 255 l S
    q 2 0 0 2 30 30 cm /A gs 0 0 1 rg 0 0 40 40 re 10 10 20 20 re f* Q
  `);
  const imported = await new PdfImportService(
    new ConfigService({ PDF_IMPORT_RENDER_SCALE: 2 }),
  ).importPdf(source);
  assert.deepEqual(imported.warnings, []);
  const exported = await renderTemplatePdf(
    {
      name: 'PDF fidelity fixture',
      canvas: {
        size: imported.canvasSize,
        components: imported.components as RenderComponent[],
      },
      fields: [],
      groups: [],
    },
    {},
    async () => null,
  );
  const originalDoc = await loadPdf(source);
  const resultDoc = await loadPdf(exported);
  try {
    const originalPage = await originalDoc.getPage(1);
    const resultPage = await resultDoc.getPage(1);
    const before = await extractTextRuns(originalPage, 96 / 72, 0);
    const after = await extractTextRuns(resultPage, 96 / 72, 0);
    for (const run of before) {
      const fragments = after
        .filter(
          (r) =>
            Math.abs(r.baselineY - run.baselineY) < 1 &&
            r.x >= run.x - 1 &&
            r.x + r.width <= run.x + run.width + 1,
        )
        .sort((a, b) => a.x - b.x);
      const actual = fragments[0];
      assert.ok(actual, `Export lost or wrapped text: ${run.text}`);
      assert.equal(fragments.map((r) => r.text).join(''), run.text);
      assert.equal(actual.fontFamily, run.fontFamily);
      assert.equal(actual.fontWeight, run.fontWeight);
      assert.equal(actual.fontStyle, run.fontStyle);
      assert.equal(actual.color, run.color);
      const colors = (r: typeof run) =>
        r.text
          .split('')
          .map(
            (_, index) =>
              r.marks?.find((mark) => mark.start <= index && index < mark.end)
                ?.color ?? r.color,
          );
      assert.deepEqual(fragments.flatMap(colors), colors(run));
      assert.ok(
        Math.abs(actual.baselineY - run.baselineY) < 1,
        `Baseline drift: ${run.text}`,
      );
      assert.ok(
        Math.abs(actual.x - run.x) < 1,
        `Horizontal drift: ${run.text}`,
      );
    }
    const beforeImage = await rasterizePageToPngDataUrl(originalPage, 2);
    const afterImage = await rasterizePageToPngDataUrl(resultPage, 2);
    const artifactDir = join(tmpdir(), 'tamidoc-pdf-fidelity');
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, 'source.png'),
      Buffer.from(beforeImage.split(',')[1], 'base64'),
    );
    writeFileSync(
      join(artifactDir, 'export.png'),
      Buffer.from(afterImage.split(',')[1], 'base64'),
    );
    console.log(`Visual artifacts: ${artifactDir}`);
    const beforePixels = await pixels(beforeImage);
    const afterPixels = await pixels(afterImage);
    assert.equal(afterPixels.length, beforePixels.length);
    let changed = 0;
    let ink = 0;
    for (let i = 0; i < beforePixels.length; i += 4) {
      if (
        beforePixels[i] < 240 ||
        beforePixels[i + 1] < 240 ||
        beforePixels[i + 2] < 240
      )
        ink++;
      if (
        Math.max(
          ...[0, 1, 2].map((c) =>
            Math.abs(beforePixels[i + c] - afterPixels[i + c]),
          ),
        ) > 32
      )
        changed++;
    }
    console.log(
      `Rendered round trip: ${changed} changed pixels / ${ink} source artwork pixels`,
    );
    assert.ok(
      changed / ink < 0.15,
      'Visual drift exceeded 15% of source ink pixels',
    );
  } finally {
    await originalDoc.destroy();
    await resultDoc.destroy();
  }
  const fallback = await new PdfImportService(
    new ConfigService({ PDF_IMPORT_RENDER_SCALE: 2 }),
  ).importPdf(pdfFixture('BT /F1 24 Tf 1 Tr 20 250 Td (Outline) Tj ET'));
  assert.equal(fallback.components[0].kind, 'image');
  const fallbackBuffer = await renderTemplatePdf(
    {
      name: 'Artwork preservation',
      canvas: {
        size: fallback.canvasSize,
        components: fallback.components as RenderComponent[],
      },
      fields: [],
      groups: [],
    },
    {},
    async () => null,
  );
  const fallbackDoc = await loadPdf(fallbackBuffer);
  try {
    const page = await fallbackDoc.getPage(1);
    const reference = await pixels(fallback.pages[0].background);
    const exportedPixels = await pixels(
      await rasterizePageToPngDataUrl(page, 2),
    );
    assert.deepEqual(
      exportedPixels,
      reference,
      'Fallback page artwork changed during export',
    );
  } finally {
    await fallbackDoc.destroy();
  }
  console.log('PDF import/export fidelity checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
