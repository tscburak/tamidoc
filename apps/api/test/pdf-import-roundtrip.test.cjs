// Native Node interop is required by react-pdf's ESM dependencies.
const { test } = require('node:test');
const assert = require('node:assert/strict');
// Match production: resolve bundled fonts without relying on source files in cwd.
process.chdir(require('node:os').tmpdir());
const { ConfigService } = require('@nestjs/config');
const mongoose = require('mongoose');
const {
  PdfImportService,
} = require('../dist/pdf-import/pdf-import.service.js');
const { loadPdf } = require('../dist/pdf-import/lib/pdf-loader.js');
const { extractTextRuns } = require('../dist/pdf-import/lib/pdf-parser.js');
const {
  renderTemplatePdf,
} = require('../dist/pdf-render/lib/template-pdf.js');
const {
  TemplateSchema,
} = require('../dist/templates/schemas/template.schema.js');

const Template = mongoose.model('PdfImportRoundtrip', TemplateSchema);
const noImage = async () => null;

const text = (id, content, x, y, extra = {}) => ({
  id,
  kind: 'text',
  content,
  x,
  y,
  width: 500,
  height: 24,
  rotation: 0,
  page: 0,
  fontFamily: 'Lato',
  fontSize: 16,
  fontWeight: 'normal',
  fontStyle: 'normal',
  textDecoration: 'none',
  color: '#000000',
  align: 'left',
  lineHeight: 1.5,
  ...extra,
});
const template = (components) => ({
  name: 'Unicode import fixture',
  fields: [],
  groups: [],
  canvas: { size: { width: 794, height: 1123 }, components },
});

test('Turkish paragraphs preserve text, fonts and baselines through import, schema serialization and export', async () => {
  const lines = [
    'Yukarıdaki kişinin bilgileri örnek niteliğindedir.',
    'İstanbul, Iğdır ve Şişli: ç, ğ, ı, İ, ö, ş, ü.',
    'ÇĞİÖŞÜ — Türkçe karakterler doğru görünür.',
  ];
  const original = await renderTemplatePdf(
    template([
      ...lines.map((line, i) => text(`line_${i}`, line, 48, 120 + i * 24)),
      text('next', 'Ayrı paragraf kendi yerinde kalır.', 48, 240),
      text('footer', 'İmza: Şule', 48, 1040, { fontWeight: 'bold' }),
    ]),
    {},
    noImage,
  );
  const imported = await new PdfImportService(
    new ConfigService({
      PDF_IMPORT_RENDER_SCALE: 1,
    }),
  ).importPdf(original);
  assert.deepEqual(imported.warnings, []);
  const components = imported.components.filter((c) => c.kind === 'text');
  assert.equal(components.length, 3);
  const paragraph = components.find((c) => c.content.startsWith(lines[0]));
  assert.equal(paragraph.content, lines.join(' '));
  assert.equal(paragraph.importedText.fragments.length, 3);

  // Exercise the same schema casting/serialization as template persistence,
  // without requiring or writing to a database.
  const saved = new Template({
    ...template(imported.components),
    canvas: { size: imported.canvasSize, components: imported.components },
  }).toObject();
  const reloaded = Template.hydrate(
    JSON.parse(JSON.stringify(saved)),
  ).toObject();
  const savedParagraph = reloaded.canvas.components.find(
    (c) => c.id === paragraph.id,
  );
  assert.equal(savedParagraph.fontFamily, 'Lato');
  assert.equal(savedParagraph.fontAscent, paragraph.fontAscent);
  assert.deepEqual(
    savedParagraph.importedText,
    JSON.parse(JSON.stringify(paragraph.importedText)),
  );

  const exported = await renderTemplatePdf(reloaded, {}, noImage);
  const beforeDoc = await loadPdf(original);
  const afterDoc = await loadPdf(exported);
  try {
    assert.equal(
      afterDoc.numPages,
      1,
      'Import/export must not introduce a blank page',
    );
    const before = await extractTextRuns(
      await beforeDoc.getPage(1),
      96 / 72,
      0,
    );
    const after = await extractTextRuns(await afterDoc.getPage(1), 96 / 72, 0);
    assert.deepEqual(
      after.map((r) => r.text),
      before.map((r) => r.text),
    );
    for (let i = 0; i < before.length; i++) {
      assert.equal(after[i].fontFamily, before[i].fontFamily);
      assert.equal(after[i].fontWeight, before[i].fontWeight);
      assert.ok(Math.abs(after[i].x - before[i].x) < 0.1);
      assert.ok(Math.abs(after[i].baselineY - before[i].baselineY) < 0.1);
    }
  } finally {
    await beforeDoc.destroy();
    await afterDoc.destroy();
  }

  // A replacement must wrap as a paragraph instead of reusing stale fragments.
  savedParagraph.content =
    'Değiştirilen Türkçe paragraf yeni satırlara doğru biçimde yayılır.';
  savedParagraph.width = 180;
  savedParagraph.height = 180;
  const edited = await loadPdf(await renderTemplatePdf(reloaded, {}, noImage));
  try {
    const runs = await extractTextRuns(await edited.getPage(1), 96 / 72, 0);
    const changed = runs.filter(
      (r) => r.y >= savedParagraph.y - 1 && r.y < 220,
    );
    assert.ok(changed.length > 1, 'Edited text should wrap');
    assert.equal(
      changed.map((r) => r.text.trim()).join(' '),
      savedParagraph.content,
    );
  } finally {
    await edited.destroy();
  }
});
