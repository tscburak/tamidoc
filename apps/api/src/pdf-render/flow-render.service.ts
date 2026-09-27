import { Injectable, Logger } from '@nestjs/common';
import { renderDocumentPdf } from './lib/flow-pdf';
import type { RenderDocument } from './lib/document-types';
import { StorageService } from '../storage/storage.service';

/**
 * Renders a composable (flow) template to a PDF buffer via @react-pdf/renderer.
 * Mirrors `PdfRenderService` for the Fixed-layout Template renderer: DI wrapper around
 * the pure drawing logic in `lib/flow-pdf.tsx`, resolving image sources through
 * the shared StorageService.
 */
@Injectable()
export class FlowRenderService {
  private readonly logger = new Logger(FlowRenderService.name);

  constructor(private readonly storageService: StorageService) {}

  async render(doc: RenderDocument): Promise<Buffer> {
    try {
      return await renderDocumentPdf(doc, (value: string) =>
        this.storageService.resolveImage(value),
      );
    } catch (e) {
      this.logger.error('Flow document rendering failed', e);
      throw e;
    }
  }
}
