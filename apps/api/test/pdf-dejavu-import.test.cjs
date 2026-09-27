const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ConfigService } = require('@nestjs/config');
const mongoose = require('mongoose');
const { createCanvas } = require('@napi-rs/canvas');
const { PdfImportService } = require('../dist/pdf-import/pdf-import.service.js');
const { loadPdf } = require('../dist/pdf-import/lib/pdf-loader.js');
const { extractTextRuns } = require('../dist/pdf-import/lib/pdf-parser.js');
const { renderTemplatePdf } = require('../dist/pdf-render/lib/template-pdf.js');
const { TemplateSchema } = require('../dist/templates/schemas/template.schema.js');

// Match production's compiled asset lookup; no source font files via cwd.
process.chdir(require('node:os').tmpdir());

test('DejaVu form text stays editable in all four faces with Turkish glyphs after save and export', async () => {
  const logo = createCanvas(16, 16);
  const context = logo.getContext('2d');
  context.fillStyle = '#4455cc';
  context.fillRect(0, 0, 16, 16);
  const texts = [
    ['normal', 'normal', 'Normal: Örnek izin formu, Çağrı Şule.'],
    ['bold', 'normal', 'Kalın: Çalışan bilgileri, İğdır.'],
    ['normal', 'italic', 'İtalik: Başlangıç tarihi, Şişli.'],
    ['bold', 'italic', 'Kalın italik: İmza ve yönetici onayı.'],
  ].map(([fontWeight, fontStyle, content], i) => ({
    id: `text_${i}`, kind: 'text', x: 60, y: 80 + i * 60, width: 500, height: 30,
    rotation: 0, page: 0, fontFamily: 'DejaVuSerifCondensed', fontWeight, fontStyle,
    content, fontSize: 16, textDecoration: 'none', color: '#000000', align: 'left', lineHeight: 1.4,
  }));
  const components = [...texts,
    { id: 'rule', kind: 'shape', page: 0, x: 60, y: 120, width: 500, height: 1,
      rotation: 0, shape: 'line', fill: 'transparent', stroke: '#000000', strokeWidth: 1, radius: 0 },
    { id: 'logo', kind: 'image', page: 0, x: 60, y: 20, width: 24, height: 24,
      rotation: 0, src: `data:image/png;base64,${logo.toBuffer('image/png').toString('base64')}`,
      alt: 'Fixture logo', objectFit: 'fill', radius: 0, field: '' },
  ];
  const source = await renderTemplatePdf({ name: 'Public synthetic form', canvas: { size: { width: 794, height: 1123 }, components }, fields: [], groups: [] }, {}, async () => null);
  const imported = await new PdfImportService(new ConfigService({ PDF_IMPORT_RENDER_SCALE: 1 })).importPdf(source);
  assert.deepEqual(imported.warnings, []);
  assert.equal(imported.components.filter(c => c.kind === 'text').length, 4);
  assert.equal(imported.components.filter(c => c.kind === 'image').length, 1);
  assert.ok(imported.components.some(c => c.kind === 'shape'));
  assert.ok(!imported.components.some(c => c.id.startsWith('pdf_page_')));
  for (const expected of texts) {
    const actual = imported.components.find(c => c.content === expected.content);
    assert.ok(actual);
    assert.equal(actual.fontFamily, expected.fontFamily);
    assert.equal(actual.fontWeight, expected.fontWeight);
    assert.equal(actual.fontStyle, expected.fontStyle);
  }
  const Template = mongoose.model('DejaVuImportRoundtrip', TemplateSchema);
  const stored = new Template({ name: 'Saved editable form', fields: [], groups: [], canvas: { size: imported.canvasSize, components: imported.components } }).toObject();
  const reloaded = Template.hydrate(JSON.parse(JSON.stringify(stored))).toObject();
  const exported = await renderTemplatePdf(reloaded, {}, async () => null);
  const before = await loadPdf(source), after = await loadPdf(exported);
  try {
    assert.equal(after.numPages, 1);
    const originalRuns = await extractTextRuns(await before.getPage(1), 96 / 72, 0);
    const finalRuns = await extractTextRuns(await after.getPage(1), 96 / 72, 0);
    assert.equal(finalRuns.length, originalRuns.length);
    for (const run of originalRuns) {
      const actual = finalRuns.find(r => r.text === run.text);
      assert.ok(actual, 'Export retains every Unicode text item');
      assert.equal(actual.fontFamily, run.fontFamily);
      assert.equal(actual.fontWeight, run.fontWeight);
      assert.equal(actual.fontStyle, run.fontStyle);
      assert.ok(Math.abs(actual.baselineY - run.baselineY) < 0.1);
      assert.ok(Math.abs(actual.x - run.x) < 0.1);
      assert.ok(Math.abs(actual.width - run.width) < 0.1);
    }
  } finally { await before.destroy(); await after.destroy(); }
});
