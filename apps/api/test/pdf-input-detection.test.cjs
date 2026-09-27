const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ConfigService } = require('@nestjs/config');
const mongoose = require('mongoose');
const {
  PdfImportService,
} = require('../dist/pdf-import/pdf-import.service.js');
const { loadPdf } = require('../dist/pdf-import/lib/pdf-loader.js');
const {
  renderTemplatePdf,
} = require('../dist/pdf-render/lib/template-pdf.js');
const {
  TemplateSchema,
} = require('../dist/templates/schemas/template.schema.js');
const Template = mongoose.model('PdfInputDetectionRoundtrip', TemplateSchema);
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

test('Jev-detected inputs survive schema serialization and fill as text and checkbox marks', async (t) => {
  const {
    PdfImportWorkflowService,
  } = require('../dist/pdf-import/pdf-import-workflow.service.js');
  const {
    JevFieldDetectionService,
  } = require('../dist/pdf-import/jev-field-detection.service.js');
  const {
    FIELD_CRITERIA,
  } = require('../dist/pdf-import/lib/detection-types.js');
  const config = new ConfigService({
    TYPESAFE_API_KEY: 'fixture',
    PDF_IMPORT_RENDER_SCALE: 1,
  });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const request = JSON.parse(options.body);
    const answers = {};
    for (const c of request.state.candidates) {
      const choice = c.hint === 'checkbox' ? 'checkbox' : 'email';
      answers[`${c.id}_type`] = {
        type: 'choice',
        choice,
        confidence: 1,
        probabilities: Object.fromEntries(
          Object.keys(FIELD_CRITERIA).map((k) => [k, k === choice ? 1 : 0]),
        ),
      };
      answers[`${c.id}_required`] = { type: 'noul', noul: 0 };
    }
    return new Response(
      JSON.stringify({
        model: 'jev-1.13.0',
        answers,
        usage: { input_tokens: 1000, output_tokens: 50 },
      }),
    );
  });
  const runs = {
    create: async (data) => ({
      ...data,
      _id: new mongoose.Types.ObjectId(),
      markModified() {},
      async save() {
        return this;
      },
    }),
  };
  const importer = new PdfImportWorkflowService(
    new PdfImportService(config),
    new JevFieldDetectionService(config),
    runs,
  );
  const source = await renderTemplatePdf(
    template([
      text('email', 'Email: _______________', 48, 80),
      text('consent', '[ ] Accept terms', 48, 140),
    ]),
    {},
    noImage,
  );
  const imported = await importer.importPdf(source, {
    userId: '000000000000000000000001',
  });
  assert.equal(imported.fields.length, 2);
  assert.equal(imported.detection.inputTokens, 1000);
  const saved = new Template({
    ...template(imported.components),
    fields: imported.fields,
    canvas: { size: imported.canvasSize, components: imported.components },
  }).toObject();
  const reloaded = Template.hydrate(
    JSON.parse(JSON.stringify(saved)),
  ).toObject();
  const values = Object.fromEntries(
    imported.fields.map((f) => [
      f.name,
        f.type === 'checkbox' ? 'true' : 'Çağrı Şule',
    ]),
  );
  const exported = await renderTemplatePdf(reloaded, values, noImage);
  const doc = await loadPdf(exported);
  try {
    const textContent = await (await doc.getPage(1)).getTextContent();
    const strings = textContent.items
      .filter((i) => 'str' in i)
      .map((i) => i.str);
    assert.ok(strings.includes('Çağrı Şule'));
    assert.ok(strings.includes('X'));
    assert.ok(!strings.includes('true'));
  } finally {
    await doc.destroy();
  }
});
