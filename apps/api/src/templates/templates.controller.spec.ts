import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Response } from 'express';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { PdfRenderService } from '../pdf-render/pdf-render.service';
import { FlowRenderService } from '../pdf-render/flow-render.service';
import { DEFAULT_THEME } from '../pdf-render/lib/flow-layout';

jest.mock('../pdf-render/pdf-render.service', () => ({
  PdfRenderService: class {},
}));
jest.mock('../pdf-render/flow-render.service', () => ({
  FlowRenderService: class {},
}));

describe('composable template endpoints', () => {
  const config = {
    format: 'document',
    pageSize: 'A4',
    theme: DEFAULT_THEME,
    allowedBlocks: ['paragraph'],
  };
  const blocks = [{ id: 'p', type: 'paragraph', inputs: { text: 'Hello' } }];
  const templates = { findOne: jest.fn(), getVersion: jest.fn() };
  const renderer = { render: jest.fn() };
  const response = { setHeader: jest.fn(), end: jest.fn() };
  const controller = new TemplatesController(
    templates as unknown as TemplatesService,
    {} as PdfRenderService,
    renderer as unknown as FlowRenderService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    templates.findOne.mockResolvedValue({
      kind: 'document',
      name: 'Guide',
      version: 'v2.0',
      defaultVersion: 'v1.0',
      documentConfig: { ...config, allowedBlocks: ['code'] },
    });
    templates.getVersion.mockResolvedValue({
      kind: 'document',
      documentConfig: config,
    });
    renderer.render.mockResolvedValue(Buffer.from('%PDF-test'));
  });

  it('validates and renders using the same default snapshot', async () => {
    await expect(
      controller.validateDocument('org', 'id', { blocks }),
    ).resolves.toEqual({ ok: true, errors: [] });
    await controller.generateDocument(
      'org',
      'id',
      { title: 'Filled guide', blocks },
      response as unknown as Response,
    );
    expect(templates.getVersion).toHaveBeenCalledWith('id', 'org', 'v1.0');
    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks,
        title: 'Filled guide',
        theme: DEFAULT_THEME,
      }),
    );
    expect(response.end).toHaveBeenCalledWith(Buffer.from('%PDF-test'));
  });

  it('honors an explicit current-version override on both endpoints', async () => {
    await expect(
      controller.validateDocument('org', 'id', { blocks, version: 'v2.0' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      controller.generateDocument(
        'org',
        'id',
        { blocks, version: 'v2.0' },
        response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(templates.getVersion).not.toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('rejects missing configuration consistently', async () => {
    templates.getVersion.mockResolvedValue({ kind: 'document' });
    await expect(
      controller.validateDocument('org', 'id', { blocks }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.generateDocument(
        'org',
        'id',
        { blocks },
        response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns validation issues for malformed blocks on both endpoints', async () => {
    await expect(
      controller.validateDocument('org', 'id', { blocks: [null] }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      controller.generateDocument(
        'org',
        'id',
        { blocks: [null] },
        response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('does not let a legacy caller widen the template allowlist', async () => {
    const contract = {
      schemaVersion: '1.0',
      templateVersionId: 'v1.0',
      title: 'Guide',
      locale: 'en-US',
      components: [
        {
          instanceId: 'code',
          componentKey: 'code',
          componentVersion: 1,
          data: { code: 'let x = 1;' },
        },
      ],
    };
    await expect(
      controller.validateDocument('org', 'id', {
        contract,
        allowedComponents: ['code'],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('uses saved header/footer defaults and enforces their edit permissions', async () => {
    const theme = {
      ...DEFAULT_THEME,
      header: { enabled: true, text: 'Owner header', editable: false },
      footer: { enabled: true, text: 'Default footer', editable: true },
    };
    templates.getVersion.mockResolvedValue({
      kind: 'document',
      documentConfig: { ...config, theme },
    });
    await controller.generateDocument(
      'org',
      'id',
      { blocks },
      response as unknown as Response,
    );
    expect(renderer.render).toHaveBeenLastCalledWith(
      expect.objectContaining({
        theme: expect.objectContaining({
          header: theme.header,
          footer: theme.footer,
        }),
      }),
    );

    await controller.generateDocument(
      'org',
      'id',
      { blocks, footerText: '' },
      response as unknown as Response,
    );
    expect(renderer.render).toHaveBeenLastCalledWith(
      expect.objectContaining({
        theme: expect.objectContaining({
          footer: { ...theme.footer, text: '' },
        }),
      }),
    );
    expect(theme.footer.text).toBe('Default footer');

    await expect(
      controller.generateDocument(
        'org',
        'id',
        { blocks, headerText: 'Override' },
        response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      controller.validateDocument('org', 'id', {
        blocks,
        headerText: 'Override',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects text overrides for disabled page fields', async () => {
    await expect(
      controller.generateDocument(
        'org',
        'id',
        { blocks, footerText: 'Injected footer' },
        response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
