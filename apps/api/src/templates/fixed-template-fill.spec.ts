import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Response } from 'express';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { PdfRenderService } from '../pdf-render/pdf-render.service';
import { FlowRenderService } from '../pdf-render/flow-render.service';
import type { RenderTemplate } from '../pdf-render/lib/types';

jest.mock('../pdf-render/pdf-render.service', () => ({
  PdfRenderService: class {},
}));
jest.mock('../pdf-render/flow-render.service', () => ({
  FlowRenderService: class {},
}));

describe('fixed template JSON/API generation', () => {
  const saved: RenderTemplate = {
    name: 'Invoice',
    canvas: { size: { width: 595, height: 842 }, components: [] },
    fields: [
      { name: 'customer', type: 'text', required: true },
      { name: 'quantity', type: 'number', required: true, groupId: 'items' },
      {
        name: 'approved',
        type: 'checkbox',
        required: true,
        askOnGenerate: true,
      },
    ],
    groups: [
      {
        id: 'items',
        name: 'Items',
        memberIds: [],
        repeating: true,
        direction: 'column',
      },
    ],
  };
  const values = {
    customer: 'Ada',
    Items: [{ quantity: '2' }, { quantity: '3' }],
    approved: 'true',
  };
  const current = {
    kind: 'form',
    name: saved.name,
    version: 'v2.0',
    defaultVersion: 'v1.0',
    toObject: () => ({
      ...saved,
      fields: [{ name: 'current', type: 'text', required: true }],
    }),
  };
  const templates = { findOne: jest.fn(), getVersion: jest.fn() };
  const renderer = { render: jest.fn() };
  const response = { setHeader: jest.fn(), end: jest.fn() };
  const controller = new TemplatesController(
    templates as unknown as TemplatesService,
    renderer as unknown as PdfRenderService,
    {} as FlowRenderService,
  );
  const generate = (data: Record<string, unknown>, version?: string) =>
    controller.generatePdf(
      'org',
      'template',
      { values: data, version },
      response as unknown as Response,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    templates.findOne.mockResolvedValue(current);
    templates.getVersion.mockResolvedValue({
      ...saved,
      kind: 'form',
      version: 'v1.0',
    });
    renderer.render.mockResolvedValue(Buffer.from('%PDF-test'));
  });

  it('uses the pinned version, preserves repeating entries, and returns a PDF', async () => {
    await generate(values);
    expect(templates.findOne).toHaveBeenCalledWith('template', 'org');
    expect(templates.getVersion).toHaveBeenCalledWith(
      'template',
      'org',
      'v1.0',
    );
    expect(renderer.render).toHaveBeenCalledWith(saved, values);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(response.end).toHaveBeenCalledWith(Buffer.from('%PDF-test'));
  });

  it('allows an explicit current version and falls back to current when no default is pinned', async () => {
    await generate({ current: 'Current data' }, 'v2.0');
    expect(templates.getVersion).not.toHaveBeenCalled();
    templates.findOne.mockResolvedValue({
      ...current,
      defaultVersion: undefined,
    });
    await generate({ current: 'Unpinned data' });
    expect(templates.getVersion).not.toHaveBeenCalled();
    expect(renderer.render).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fields: [{ name: 'current', type: 'text', required: true }],
      }),
      { current: 'Unpinned data' },
    );
  });

  it.each([
    [{ ...values, customer: { nested: 'bad' } }, 'customer'],
    [{ ...values, Items: 'bad' }, 'Items'],
    [{ ...values, Items: [null] }, 'Items'],
    [{ ...values, Items: [{ quantity: 2 }] }, 'quantity'],
    [{ ...values, typo: 'bad' }, 'typo'],
    [{ ...values, Items: [{ quantity: '1', typo: 'bad' }] }, 'typo'],
    [{ ...values, Items: [{ quantity: '1' }, {}] }, 'quantity'],
    [{ ...values, approved: 'false' }, 'approved'],
  ])(
    'rejects malformed or incomplete values before rendering: %j',
    async (data, field) => {
      try {
        await generate(data);
        throw new Error('Expected a validation failure');
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        const detail = (
          error as UnprocessableEntityException
        ).getResponse() as { errors: string[] };
        expect(detail.errors.some((message) => message.includes(field))).toBe(
          true,
        );
      }
      expect(renderer.render).not.toHaveBeenCalled();
    },
  );

  it('rejects composable templates and composable snapshots', async () => {
    templates.getVersion.mockResolvedValue({ ...saved, kind: 'document' });
    await expect(generate(values)).rejects.toBeInstanceOf(BadRequestException);
    templates.findOne.mockResolvedValue({ ...current, kind: 'document' });
    await expect(generate(values, 'v2.0')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(renderer.render).not.toHaveBeenCalled();
  });
});
