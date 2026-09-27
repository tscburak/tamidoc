import { Injectable, Logger } from '@nestjs/common';
import { renderTemplatePdf } from './lib/template-pdf';
import type { FillValues, RenderTemplate } from './lib/types';
import { StorageService } from '../storage/storage.service';

/**
 * Renders a filled template to a PDF buffer using @react-pdf/renderer (pure
 * JS, no headless browser). Drawing logic lives in `lib/template-pdf.tsx`;
 * this wraps it for DI.
 *
 * Image-field values can be either inline `data:` URLs (legacy / designer-time)
 * or S3 storage keys (the public-form upload path). Both are resolved to
 * Buffers via the injected StorageService so the renderer stays decoupled from
 * the storage backend.
 */
@Injectable()
export class PdfRenderService {
  private readonly logger = new Logger(PdfRenderService.name);

  constructor(private readonly storageService: StorageService) {}

  async render(template: RenderTemplate, values: FillValues): Promise<Buffer> {
    try {
      return await renderTemplatePdf(template, values, (value: string) =>
        this.storageService.resolveImage(value),
      );
    } catch (e) {
      this.logger.error('PDF rendering failed', e);
      throw e;
    }
  }
}
