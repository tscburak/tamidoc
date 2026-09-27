// Use Node's native ESM interop for react-pdf and its import-only dependencies.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DOMMatrix, Path2D } = require('@napi-rs/canvas');
globalThis.DOMMatrix = DOMMatrix;
globalThis.Path2D = Path2D;
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.js');
const { renderDocumentPdf } = require('../dist/pdf-render/lib/flow-pdf.js');
const { DEFAULT_THEME } = require('../dist/pdf-render/lib/flow-layout.js');

test('table headers preserve labels and every data row; quotes render with the template font', async () => {
  const doc = {
    name: 'Guide',
    format: 'document',
    pageSize: 'A4',
    theme: DEFAULT_THEME,
    blocks: [
      {
        id: 'table',
        type: 'table',
        inputs: {
          columns: [{ label: 'Plan' }],
          rows: [{ cells: ['Starter'] }, { cells: ['Pro'] }],
        },
      },
      { id: 'quote', type: 'quote', inputs: { text: 'A useful quote' } },
    ],
  };
  const pdf = await renderDocumentPdf(doc, async () => null);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const parsed = await getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;
  try {
    const content = await (await parsed.getPage(1)).getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    for (const expected of ['Plan', 'Starter', 'Pro', 'A useful quote'])
      assert.ok(text.includes(expected), text);
  } finally {
    await parsed.destroy();
  }
});

for (const fontFamily of ['Arial', 'Georgia', 'unknown-font']) {
  test(`renders ${fontFamily} without an unregistered-font error`, async () => {
    const pdf = await renderDocumentPdf(
      {
        name: 'Guide',
        format: 'document',
        pageSize: 'A4',
        theme: { ...DEFAULT_THEME, fontFamily },
        blocks: [
          { id: 'p', type: 'paragraph', inputs: { text: 'Hello world' } },
        ],
      },
      async () => null,
    );
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  });
}

test('horizontal section children share page width without overflowing', async () => {
  const pdf = await renderDocumentPdf(
    {
      name: 'Guide',
      format: 'document',
      pageSize: 'A4',
      theme: DEFAULT_THEME,
      blocks: [
        {
          id: 'section',
          type: 'section',
          inputs: {
            direction: 'horizontal',
            blocks: [
              {
                id: 'left',
                type: 'paragraph',
                inputs: { text: 'Left column' },
              },
              {
                id: 'right',
                type: 'paragraph',
                inputs: { text: 'Right column' },
              },
            ],
          },
        },
      ],
    },
    async () => null,
  );
  const parsed = await getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;
  try {
    const content = await (await parsed.getPage(1)).getTextContent();
    const left = content.items.find((item) => item.str === 'Left column');
    const right = content.items.find((item) => item.str === 'Right column');
    assert.ok(left && right);
    assert.equal(left.transform[4], 48);
    assert.ok(Math.abs(right.transform[4] - 303.5) < 1);
    assert.equal(left.transform[5], right.transform[5]);
  } finally {
    await parsed.destroy();
  }
});
