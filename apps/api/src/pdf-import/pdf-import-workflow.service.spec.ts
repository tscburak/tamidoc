import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { PdfImportService } from './pdf-import.service';
import { PdfImportWorkflowService } from './pdf-import-workflow.service';
import { JevFieldDetectionService } from './jev-field-detection.service';
import { PdfImportRun } from './schemas/pdf-import-run.schema';
import { pdfFixture } from '../../test/pdf-fixture';
import { FIELD_CRITERIA } from './lib/detection-types';

const actor = {
  userId: '000000000000000000000001',
  organizationId: '000000000000000000000002',
};

describe('PDF import workflow and stored metrics', () => {
  afterEach(() => jest.restoreAllMocks());

  function setup(extra = {}) {
    const saved: any[] = [];
    const doc: any = { _id: new Types.ObjectId(), markModified: jest.fn() };
    doc.save = jest.fn(() => {
      saved.push(JSON.parse(JSON.stringify(doc)));
      return Promise.resolve(doc);
    });
    const db = {
      create: jest.fn((value) => {
        Object.assign(doc, value);
        return Promise.resolve(doc);
      }),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    const config = new ConfigService({
      PDF_IMPORT_RENDER_SCALE: 1,
      TYPESAFE_API_KEY: 'test',
      ...extra,
    });
    const importer = new PdfImportService(config);
    const service = new PdfImportWorkflowService(
      importer,
      new JevFieldDetectionService(config),
      db as unknown as Model<PdfImportRun>,
    );
    return { service, importer, db, saved, doc };
  }

  function mockSuccess() {
    return jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_url, options) => {
        const request = JSON.parse(String(options?.body));
        const answers: Record<string, unknown> = {};
        for (const c of request.state.candidates) {
          answers[`${c.id}_type`] = {
            type: 'choice',
            choice: 'text',
            confidence: 0.97,
            probabilities: Object.fromEntries(
              Object.keys(FIELD_CRITERIA).map((key) => [
                key,
                key === 'text' ? 1 : 0,
              ]),
            ),
          };
          answers[`${c.id}_required`] = { type: 'noul', noul: 0.1 };
        }
        return new Response(
          JSON.stringify({
            model: 'jev-1.13.0',
            answers,
            usage: { input_tokens: 1000, output_tokens: 50 },
          }),
        );
      });
  }

  it('adds linked fields to real PDF blanks without changing any original component', async () => {
    mockSuccess();
    const { service, importer, db, saved } = setup();
    const pdf = pdfFixture(
      'BT /F1 12 Tf 20 260 Td (Name: ______ Date: ______) Tj ET',
    );
    const original = await importer.importPdf(pdf);
    const result = await service.importPdf(pdf, actor);
    expect(result.fields).toHaveLength(2);
    expect(result.fields.map((f) => f.name)).toEqual(['Name', 'Date']);
    expect(result.components.slice(0, original.components.length)).toEqual(
      original.components,
    );
    for (const field of result.fields)
      expect(
        result.components.find((c) => c.id === field.componentId)?.content,
      ).toBe(`{{${field.name}}}`);
    expect(result.detection).toMatchObject({
      status: 'completed',
      requestCount: 1,
      detectedCount: 2,
      inputTokens: 1000,
      outputTokens: 50,
      usageComplete: true,
      costComplete: true,
    });
    expect(result.detection?.estimatedCostUsd).toBeCloseTo(0.000042, 10);
    expect(db.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: new Types.ObjectId(actor.userId),
        organizationId: new Types.ObjectId(actor.organizationId),
        status: 'processing',
        fileBytes: pdf.length,
      }),
    );
    expect(saved.at(-1)).toMatchObject({
      status: 'completed',
      pageCount: 1,
      metrics: result.detection,
    });
    expect(saved.at(-1).decisions).toHaveLength(2);
    expect(JSON.stringify(saved)).not.toContain('Name:');
  });

  it('shares one field across repeated labels (repetitive inputs stay in sync)', async () => {
    mockSuccess();
    const { service } = setup();
    const content = 'BT /F1 12 Tf 20 260 Td (Name: ______) Tj ET';
    const result = await service.importPdf(
      pdfFixture(content, {
        additionalPages: [{ width: 300, height: 300, content }],
      }),
      actor,
    );
    expect(result.fields.map((f) => f.name)).toEqual(['Name']);
    const overlays = result.components.filter((c) => c.id.startsWith('jev_'));
    expect(overlays.map((c) => c.page)).toEqual([0, 1]);
    expect(overlays.map((c) => c.content)).toEqual(['{{Name}}', '{{Name}}']);
  });

  it.each([
    ['disabled', false, 'test'],
    ['missing_api_key', true, ''],
  ])(
    'stores a skipped run for %s without a paid call',
    async (reason, enabled, key) => {
      const request = mockSuccess();
      const { service, saved } = setup({ TYPESAFE_API_KEY: key });
      const result = await service.importPdf(
        pdfFixture('BT /F1 12 Tf 20 260 Td (Name: ____) Tj ET'),
        actor,
        enabled,
      );
      expect(result.fields).toEqual([]);
      expect(result.detection).toMatchObject({
        status: 'skipped',
        reason,
        estimatedCostUsd: 0,
        requestCount: 0,
      });
      expect(request).not.toHaveBeenCalled();
      expect(saved.at(-1).status).toBe('completed');
    },
  );

  it('does not call Jev for a PDF with no candidate inputs', async () => {
    const request = mockSuccess();
    const { service } = setup();
    const result = await service.importPdf(
      pdfFixture('BT /F1 12 Tf 20 260 Td (Ordinary paragraph) Tj ET'),
      actor,
    );
    expect(result.detection).toMatchObject({
      reason: 'no_candidates',
      estimatedCostUsd: 0,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps successful batch fields and usage when the next batch fails', async () => {
    const request = mockSuccess();
    const succeed = request.getMockImplementation()!;
    request
      .mockImplementationOnce(succeed)
      .mockResolvedValueOnce(new Response('overloaded', { status: 529 }));
    const { service, saved } = setup();
    const content = Array.from(
      { length: 13 },
      (_, i) => `BT /F1 8 Tf 20 ${280 - i * 18} Td (Field ${i}: ______) Tj ET`,
    ).join('\n');
    const result = await service.importPdf(pdfFixture(content), actor);
    expect(result.fields).toHaveLength(12);
    expect(result.detection).toMatchObject({
      status: 'partial',
      requestCount: 2,
      inputTokens: 1000,
      usageComplete: false,
      estimatedCostUsd: null,
      costComplete: false,
    });
    expect(result.detection?.knownCostUsd).toBeCloseTo(0.000042, 10);
    expect(saved.at(-1).metrics.attempts).toHaveLength(2);
    expect(result.warnings.some((w) => w.includes('incomplete'))).toBe(true);
  });

  it('records extraction failure without invoking Jev', async () => {
    const request = mockSuccess();
    const { service, importer, saved } = setup();
    jest
      .spyOn(importer, 'extractPdf')
      .mockRejectedValue(new Error('invalid PDF'));
    await expect(
      service.importPdf(Buffer.from('broken'), actor),
    ).rejects.toThrow('invalid PDF');
    expect(saved.at(-1)).toMatchObject({
      status: 'failed',
      errorCode: 'import_failed',
      metrics: { status: 'failed', requestCount: 0 },
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('caps paid evaluations and reports the unevaluated remainder', async () => {
    const request = mockSuccess();
    const { service, importer } = setup();
    jest.spyOn(importer, 'extractPdf').mockResolvedValue({
      result: {
        canvasSize: { width: 400, height: 400 },
        pageCount: 1,
        pages: [],
        components: [],
        fields: [],
        warnings: [],
      },
      textlessPages: [],
      candidates: Array.from({ length: 130 }, (_, index) => ({
        id: `input_0_${index}`,
        page: 0,
        source: 'blank',
        label: `Field ${index}`,
        context: 'Name: ____',
        hint: 'text',
        required: false,
        x: 10,
        y: 20,
        width: 100,
        height: 20,
        fontSize: 14,
      })),
    });
    const result = await service.importPdf(Buffer.from('fixture'), actor);
    expect(request).toHaveBeenCalledTimes(10);
    expect(result.detection).toMatchObject({
      candidateCount: 130,
      evaluatedCount: 120,
      detectedCount: 120,
      status: 'partial',
    });
    expect(result.warnings.some((warning) => warning.includes('120'))).toBe(
      true,
    );
  });

  it('does not call a paid provider when the run cannot be persisted', async () => {
    const request = mockSuccess();
    const { service, db } = setup();
    db.create.mockRejectedValue(new Error('database unavailable'));
    await expect(service.importPdf(Buffer.from('pdf'), actor)).rejects.toThrow(
      'database unavailable',
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('scopes history and detail to the requesting user and active organization', async () => {
    const { service, db } = setup();
    const chain: any = {
      sort: jest.fn(),
      limit: jest.fn(),
      select: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    };
    for (const key of ['sort', 'limit', 'select', 'lean'])
      chain[key].mockReturnValue(chain);
    db.find.mockReturnValue(chain);
    await service.list(actor);
    expect(db.find).toHaveBeenCalledWith({
      userId: new Types.ObjectId(actor.userId),
      organizationId: new Types.ObjectId(actor.organizationId),
    });
    expect(chain.limit).toHaveBeenCalledWith(50);
    db.findOne.mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve(null) }),
    });
    const id = '000000000000000000000003';
    await expect(service.get(id, actor)).rejects.toThrow(
      'Import run not found',
    );
    expect(db.findOne).toHaveBeenCalledWith({
      _id: id,
      userId: new Types.ObjectId(actor.userId),
      organizationId: new Types.ObjectId(actor.organizationId),
    });
  });
});
