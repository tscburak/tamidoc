import { ConfigService } from '@nestjs/config';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PdfImportService } from './pdf-import.service';
import { pdfFixture } from '../../test/pdf-fixture';
import { loadPdf } from './lib/pdf-loader';
import { extractShapes } from './lib/extract-shapes';
import { extractImages } from './lib/extract-images';
import { extractTextRuns } from './lib/pdf-parser';

const service = () =>
  new PdfImportService(new ConfigService({ PDF_IMPORT_RENDER_SCALE: 1 }));
const scale = 96 / 72;

async function withPage<T>(
  content: string,
  fn: (page: any) => Promise<T>,
  options?: Parameters<typeof pdfFixture>[1],
) {
  const doc = await loadPdf(pdfFixture(content, options));
  try {
    return await fn(await doc.getPage(1));
  } finally {
    await doc.destroy();
  }
}

async function sampleImage(
  comp: { src: string; x: number; y: number; width: number; height: number },
  x: number,
  y: number,
) {
  const img = await loadImage(comp.src);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return Array.from(
    ctx.getImageData(
      Math.floor(((x - comp.x) / comp.width) * img.width),
      Math.floor(((y - comp.y) / comp.height) * img.height),
      1,
      1,
    ).data,
  );
}

describe('PDF import fidelity (real PDFs)', () => {
  it('keeps mPDF square-capped table rules editable with their full stroke footprint', async () => {
    await withPage(
      '2 J 2 j 2 w 20 200 m 120 200 l S 160 200 m 160 100 l S',
      async (page) => {
        const vectors = await extractShapes(
          page,
          page.getViewport({ scale }),
          0,
          2000,
        );
        expect(vectors).toHaveLength(2);
        expect(vectors[0]).toMatchObject({ kind: 'shape', shape: 'line' });
        expect(vectors[0].x).toBeCloseTo(19 * scale);
        expect(vectors[0].width).toBeCloseTo(102 * scale);
        expect(vectors[0].height).toBeCloseTo(2 * scale);
        expect(vectors[1]).toMatchObject({
          kind: 'shape',
          shape: 'rectangle',
          fill: '#000000',
        });
        expect(vectors[1].y).toBeCloseTo(99 * scale);
        expect(vectors[1].height).toBeCloseTo(102 * scale);
      },
    );
  });

  it('still preserves rounded caps and clips intersecting a square cap as artwork', async () => {
    for (const operators of [
      '1 J 2 w 20 200 m 120 200 l S',
      '20 190 100 20 re W n 2 J 2 w 20 200 m 120 200 l S',
    ]) {
      await withPage(operators, async (page) => {
        const [vector] = await extractShapes(
          page,
          page.getViewport({ scale }),
          0,
          2000,
        );
        expect(vector.kind).toBe('image');
      });
    }
  });

  it('retains blank pages and pads mixed page sizes without scaling the content', async () => {
    const result = await service().importPdf(
      pdfFixture('', {
        additionalPages: [
          { width: 600, height: 150, content: '1 0 0 rg 500 20 40 30 re f' },
        ],
      }),
    );
    expect(result.pageCount).toBe(2);
    expect(result.canvasSize).toEqual({ width: 800, height: 400 });
    expect(result.components[0]).toMatchObject({ id: 'pdf_blank_0', page: 0 });
    expect(result.components[1].x).toBeCloseTo(500 * scale);
    expect(result.components[1].width).toBeCloseTo(40 * scale);
    expect(result.warnings[0]).toContain('padded');
    const first = await loadImage(result.pages[0].background);
    const second = await loadImage(result.pages[1].background);
    expect(first.width / first.height).toBe(2);
    expect(second.width / second.height).toBe(2);
  });

  it('reports configured page truncation', async () => {
    const result = await new PdfImportService(
      new ConfigService({
        PDF_IMPORT_MAX_PAGES: 1,
        PDF_IMPORT_RENDER_SCALE: 1,
      }),
    ).importPdf(
      pdfFixture('', {
        additionalPages: [{ width: 300, height: 300, content: '' }],
      }),
    );
    expect(result.pageCount).toBe(1);
    expect(result.warnings).toEqual(['Imported the first 1 of 2 pages.']);
  });

  it('leaves blanks, checkboxes and punctuation literal and creates no fields', async () => {
    const result = await service().importPdf(
      pdfFixture(
        'BT /F1 12 Tf 20 260 Td (Name: ______  Date: ....  [ ]  ---) Tj ET',
      ),
    );
    expect(result.warnings).toEqual([]);
    expect(result.fields).toEqual([]);
    // PDF.js normalizes word spaces; all printable blanks remain literal.
    expect(
      result.components
        .filter((c) => c.kind === 'text')
        .map((c) => c.content)
        .join(''),
    ).toBe('Name: ______ Date: .... [ ] ---');
    expect(result.components.some((c) => c.content?.includes('{{'))).toBe(
      false,
    );
  });

  it('retains mixed weights, italics, colors, font families and fractional sizes', async () => {
    const result = await service().importPdf(
      pdfFixture(`BT 20 260 Td
      /F1 12.25 Tf 0 0 1 rg (Blue ) Tj /F2 12.25 Tf (bold ) Tj
      /F3 12.25 Tf 1 0 0 rg (italic) Tj ET
      BT /F4 9 Tf 20 220 Td (Mono) Tj ET`),
    );
    expect(result.warnings).toEqual([]);
    const texts = result.components.filter((c) => c.kind === 'text');
    expect(texts.find((c) => c.content?.includes('Blue'))).toMatchObject({
      color: '#0000ff',
      fontWeight: 'normal',
      fontSize: 12.25 * scale,
      fontFamily: 'Helvetica',
    });
    expect(texts.find((c) => c.content?.includes('bold'))).toMatchObject({
      color: '#0000ff',
      marks: expect.arrayContaining([
        expect.objectContaining({ start: 5, end: 9, fontWeight: 'bold' }),
      ]),
    });
    expect(texts.find((c) => c.content === 'italic')).toMatchObject({
      color: '#ff0000',
      fontStyle: 'italic',
      fontFamily: 'Times-Roman',
    });
    expect(texts.find((c) => c.content === 'Mono')).toMatchObject({
      fontFamily: 'Courier',
    });
  });

  it('preserves color switches within a text item and excludes invisible OCR text', async () => {
    const result = await service().importPdf(
      pdfFixture(`BT /F1 12 Tf 20 260 Td
      1 0 0 rg (RED) Tj 0 0 1 rg (BLUE) Tj ET
      BT /F1 12 Tf 3 Tr 20 230 Td (Hidden OCR) Tj ET`),
    );
    expect(result.warnings).toEqual([]);
    const texts = result.components.filter((c) => c.kind === 'text');
    expect(texts.map((c) => c.content).join('')).toBe('REDBLUE');
    const combined = texts.find((c) => c.content === 'REDBLUE');
    if (combined)
      expect(combined.marks).toEqual([{ start: 3, end: 7, color: '#0000ff' }]);
    else expect(texts.find((c) => c.content === 'BLUE')?.color).toBe('#0000ff');
  });

  it('preserves paint order, default black, subpixel rules and full-page borders', async () => {
    const result = await service().importPdf(
      pdfFixture(`0.2 w 1 1 298 298 re S
      20 240 m 180 240 l S
      BT /F1 12 Tf 20 260 Td (Covered) Tj ET
      1 0 0 rg 15 250 100 20 re f`),
    );
    expect(result.warnings).toEqual([]);
    expect(result.components[0]).toMatchObject({
      kind: 'shape',
      shape: 'rectangle',
      stroke: '#000000',
    });
    expect(result.components[1]).toMatchObject({
      kind: 'shape',
      shape: 'line',
    });
    expect(result.components[1].strokeWidth).toBeCloseTo(0.2 * scale);
    expect(result.components[2].kind).toBe('text');
    expect(result.components[3]).toMatchObject({
      kind: 'shape',
      fill: '#ff0000',
    });
  });

  it('transforms complex paths once and keeps compound-path holes and opacity', async () => {
    await withPage(
      'q 2 0 0 2 30 40 cm /A gs 1 0 0 rg 0 0 80 80 re 20 20 40 40 re f* Q',
      async (page) => {
        const vectors = await extractShapes(
          page,
          page.getViewport({ scale }),
          0,
          2000,
        );
        expect(vectors).toHaveLength(1);
        const comp = vectors[0];
        expect(comp.kind).toBe('image');
        if (comp.kind !== 'image')
          throw new Error('Expected rasterized compound path');
        expect(await sampleImage(comp, 40 * scale, (300 - 50) * scale)).toEqual(
          [255, 0, 0, 102],
        );
        expect(
          (await sampleImage(comp, 100 * scale, (300 - 110) * scale))[3],
        ).toBe(0);
      },
    );
  });

  it('preserves dashed strokes instead of turning them into solid rules', async () => {
    await withPage('1 w [10 10] 0 d 20 200 m 120 200 l S', async (page) => {
      const [comp] = await extractShapes(
        page,
        page.getViewport({ scale }),
        0,
        2000,
      );
      if (comp.kind !== 'image') throw new Error('Expected dashed artwork');
      expect(
        (await sampleImage(comp, 25 * scale, 100 * scale))[3],
      ).toBeGreaterThan(150);
      expect((await sampleImage(comp, 35 * scale, 100 * scale))[3]).toBe(0);
    });
  });

  it('clips artwork and restores the graphics state', async () => {
    await withPage(
      'q 20 20 40 40 re W n 1 0 0 rg 0 0 100 100 re f Q 140 20 20 20 re f',
      async (page) => {
        const vectors = await extractShapes(
          page,
          page.getViewport({ scale }),
          0,
          2000,
        );
        const comp = vectors[0];
        if (comp.kind !== 'image') throw new Error('Expected clipped artwork');
        expect((await sampleImage(comp, 30 * scale, 270 * scale))[3]).toBe(255);
        expect((await sampleImage(comp, 10 * scale, 290 * scale))[3]).toBe(0);
        expect(vectors[1]).toMatchObject({ kind: 'shape', fill: '#000000' });
      },
    );
  });

  it('retains page rotation, crop-box origin and large text sizes', async () => {
    await withPage(
      'BT /F1 110 Tf 30 80 Td (A) Tj ET',
      async (page) => {
        const [run] = await extractTextRuns(page, scale, 0);
        expect(run.fontSizePx).toBeCloseTo(110 * scale);
        expect(run.rotation).toBeCloseTo(90);
        expect(run.baselineY).toBeCloseTo((30 - 10) * scale);
      },
      { rotate: 90, pageBox: '/CropBox [10 20 290 280]' },
    );
  });

  it('preserves monochrome image bits with row padding and rotation', async () => {
    const pixels = String.fromCharCode(0b10100000, 0b01000000);
    await withPage(
      'q 0 30 -20 0 100 100 cm /Im Do Q',
      async (page) => {
        const images = await extractImages(
          page,
          page.getViewport({ scale }),
          0,
          100,
        );
        expect(images).toHaveLength(1);
        const comp = images[0];
        expect(comp.width).toBeCloseTo(20 * scale);
        expect(comp.height).toBeCloseTo(30 * scale);
        expect(
          (await sampleImage(comp, 85 * scale, 195 * scale))[0],
        ).toBeGreaterThan(200);
        expect(
          (await sampleImage(comp, 95 * scale, 195 * scale))[0],
        ).toBeLessThan(60);
      },
      {
        resources: '/XObject << /Im 9 0 R >>',
        objects: [
          `<< /Type /XObject /Subtype /Image /Width 3 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 1 /Length 2 >>\nstream\n${pixels}\nendstream`,
        ],
      },
    );
  });

  it('preserves unsupported artwork as an exported image instead of dropping it', async () => {
    const result = await service().importPdf(
      pdfFixture('BT /F1 24 Tf 1 Tr 20 250 Td (Outline) Tj ET'),
    );
    expect(result.fields).toEqual([]);
    expect(result.warnings[0]).toContain('preserved as an image');
    expect(result.components).toHaveLength(1);
    expect(result.components[0]).toMatchObject({
      kind: 'image',
      src: result.pages[0].background,
      field: '',
    });
    expect(result.components[0].src).toMatch(/^data:image\/png;base64,/);
  });
});
