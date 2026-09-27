const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ConfigService } = require('@nestjs/config');
const mongoose = require('mongoose');
require('ts-node/register/transpile-only');
const { pdfFixture } = require('./pdf-fixture.ts');
const { PdfImportService } = require('../dist/pdf-import/pdf-import.service.js');
const { loadPdf } = require('../dist/pdf-import/lib/pdf-loader.js');
const { extractTextRuns } = require('../dist/pdf-import/lib/pdf-parser.js');
const { renderTemplatePdf } = require('../dist/pdf-render/lib/template-pdf.js');
const { TemplateSchema } = require('../dist/templates/schemas/template.schema.js');
const { importedTextFragments } = require('../dist/pdf-render/lib/imported-text.js');

// Verify deployed asset resolution without depending on the source cwd.
process.chdir(require('node:os').tmpdir());

test('unknown fonts stay editable and retain widths/baselines after save and export', async () => {
  const fonts = Object.fromEntries([
    ['F1', 'BespokeSans'], ['F2', 'BespokeSans-BoldOblique'],
    ['F3', 'BespokeSerif-Italic'], ['F4', 'BespokeMono-BoldOblique'],
  ].map(([key, name]) => [key, `<< /Type /Font /Subtype /Type1 /BaseFont /${name} >>`]));
  const source = pdfFixture(`
    BT /F1 12 Tf 20 260 Td (Regular text) Tj ET
    BT /F2 12 Tf 20 220 Td (Bold italic text) Tj ET
    BT /F3 12 Tf 20 180 Td (Serif text) Tj ET
    BT /F4 12 Tf 20 140 Td (Monospace text) Tj ET
    BT /F1 12 Tf 0 1 -1 0 270 30 Tm (Rotated label) Tj ET
    1 w 20 100 m 220 100 l S`, { fonts });
  const imported = await new PdfImportService(new ConfigService({ PDF_IMPORT_RENDER_SCALE: 1 })).importPdf(source);
  assert.equal(imported.components.filter(c => c.kind === 'text').length, 5);
  assert.equal(imported.components.filter(c => c.kind === 'image').length, 0);
  assert.equal(imported.components.filter(c => c.kind === 'shape').length, 1);
  assert.equal(imported.warnings.length, 1);
  assert.match(imported.warnings[0], /substituted fonts.*BespokeSans.*Text remains editable/);
  const texts = imported.components.filter(c => c.kind === 'text');
  assert.deepEqual(texts.map(c => c.fontFamily), ['DejaVuSans', 'DejaVuSans', 'DejaVuSerifCondensed', 'DejaVuSansMono', 'DejaVuSans']);
  assert.deepEqual(texts.map(c => [c.fontWeight, c.fontStyle]), [['normal', 'normal'], ['bold', 'italic'], ['normal', 'italic'], ['bold', 'italic'], ['normal', 'normal']]);
  assert.ok(texts.every(c => c.importedText.fragments.every(f => f.fitWidth === true)));

  const Template = mongoose.model('FontFallbackRoundtrip', TemplateSchema);
  const stored = new Template({ name: 'Fallback fixture', fields: [], groups: [], canvas: { size: imported.canvasSize, components: imported.components } }).toObject();
  const reloaded = Template.hydrate(JSON.parse(JSON.stringify(stored))).toObject();
  assert.ok(reloaded.canvas.components.filter(c => c.kind === 'text').every(c => importedTextFragments(c)?.[0].fitWidth));
  const exported = await renderTemplatePdf(reloaded, {}, async () => null);
  const before = await loadPdf(source), after = await loadPdf(exported);
  try {
    const originalRuns = await extractTextRuns(await before.getPage(1), 96 / 72, 0);
    const finalRuns = await extractTextRuns(await after.getPage(1), 96 / 72, 0);
    // PDF.js may split words at substitute-font spaces. Compare the visible
    // line text and its complete extent rather than internal item counts.
    assert.equal(finalRuns.map(r => r.text).join(' '), originalRuns.map(r => r.text).join(' '));
    for (const run of originalRuns) {
      const matches = finalRuns.filter(r => Math.abs(r.baselineY - run.baselineY) < 0.1 && Math.abs(r.rotation - run.rotation) < 0.1);
      assert.equal(matches.map(r => r.text).join(' '), run.text, 'Text, baseline and rotation preserved');
      for (const actual of matches) {
        assert.equal(actual.fontFamily, run.fontFamily);
        assert.equal(actual.fontWeight, run.fontWeight);
        assert.equal(actual.fontStyle, run.fontStyle);
      }
      const width = run.rotation ? matches[0].width : Math.max(...matches.map(r => r.x + r.width)) - Math.min(...matches.map(r => r.x));
      assert.ok(Math.abs(width - run.width) < 0.1, `Width preserved: ${width} vs ${run.width}`);
    }
  } finally { await before.destroy(); await after.destroy(); }

  const edited = reloaded.canvas.components.find(c => c.kind === 'text');
  edited.content = 'Edited: Çağrı Şule İğdır';
  edited.width = 360;
  assert.equal(importedTextFragments(edited), undefined, 'Editing restores normal text layout');
  const editedPdf = await loadPdf(await renderTemplatePdf(reloaded, {}, async () => null));
  try {
    const runs = await extractTextRuns(await editedPdf.getPage(1), 96 / 72, 0);
    assert.ok(runs.some(r => r.text === edited.content && r.fontFamily === 'DejaVuSans'));
  } finally { await editedPdf.destroy(); }
});

test('extended Turkish characters in a standard font use Unicode fallback instead of flattening', async () => {
  const source = pdfFixture('BT /F1 12 Tf 20 260 Td (\\001\\002 \\003\\004 \\005\\006) Tj ET', {
    fonts: { F1: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /BaseEncoding /WinAnsiEncoding /Differences [1 /Gbreve /gbreve /Scedilla /scedilla /Idotaccent /dotlessi] >> >>' },
  });
  const imported = await new PdfImportService(new ConfigService({ PDF_IMPORT_RENDER_SCALE: 1 })).importPdf(source);
  const text = imported.components.find(c => c.kind === 'text');
  assert.ok(text);
  assert.equal(text.content, 'Ğğ Şş İı');
  assert.equal(text.fontFamily, 'DejaVuSans');
  assert.ok(!imported.components.some(c => c.kind === 'image'));
  assert.match(imported.warnings[0], /substituted fonts/);
  const pdf = await loadPdf(await renderTemplatePdf({ name: 'Unicode fallback', fields: [], groups: [], canvas: { size: imported.canvasSize, components: imported.components } }, {}, async () => null));
  try {
    const runs = await extractTextRuns(await pdf.getPage(1), 96 / 72, 0);
    assert.equal(runs.map(r => r.text).join(''), text.content);
  } finally { await pdf.destroy(); }
});
