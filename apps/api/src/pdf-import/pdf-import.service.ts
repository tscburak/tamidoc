import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { loadPdf } from './lib/pdf-loader';
import { extractTextRuns } from './lib/pdf-parser';
import { textComponents } from './lib/text-components';
import { deriveDividers, medianFontSizePx } from './lib/table-structure';
import { extractImages } from './lib/extract-images';
import { extractShapes } from './lib/extract-shapes';
import {
  rasterizePageToPngDataUrl,
  padPageReference,
} from './lib/pdf-rasterizer';
import type { PdfImportResponseDto } from './dto/pdf-import-response.dto';
import {
  collectInputCandidates,
  type InputCandidate,
} from './lib/field-candidates';

// Local type matching frontend CanvasComponent
interface CanvasComponent {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  page: number;
  content?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  marks?: {
    start: number;
    end: number;
    color?: string;
    fontWeight?: string;
    fontStyle?: string;
  }[];
  fontFamily?: string;
  color?: string;
  align?: string;
  lineHeight?: number;
  src?: string;
  alt?: string;
  objectFit?: string;
  radius?: number;
  field?: string;
  shape?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

interface PageDto {
  width: number;
  height: number;
  background: string;
}

@Injectable()
export class PdfImportService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Import document artwork and styled text without adding input overlays.
   *
   * @param buffer - PDF file content as Buffer
   * @returns Promise<PdfImportResponseDto>
   */
  async importPdf(buffer: Buffer): Promise<PdfImportResponseDto> {
    return (await this.extractPdf(buffer)).result;
  }

  async extractPdf(
    buffer: Buffer,
    detectFields = false,
  ): Promise<{
    result: PdfImportResponseDto;
    candidates: InputCandidate[];
    textlessPages: number[];
  }> {
    const configuredMax = Number(this.config.get('PDF_IMPORT_MAX_PAGES', 20));
    const maxPages = Number.isFinite(configuredMax)
      ? Math.max(1, Math.floor(configuredMax))
      : 20;
    const renderScale = Number(this.config.get('PDF_IMPORT_RENDER_SCALE', 3));
    const doc = await loadPdf(buffer);
    const pageCount = Math.min(doc.numPages, maxPages);
    const pages: PageDto[] = [];
    const components: CanvasComponent[] = [];
    const warnings: string[] = [];
    const candidates: InputCandidate[] = [];
    const textlessPages: number[] = [];
    if (doc.numPages > maxPages)
      warnings.push(`Imported the first ${maxPages} of ${doc.numPages} pages.`);

    try {
      for (let p = 0; p < pageCount; p++) {
        const page = await doc.getPage(p + 1);
        const scale = 96 / 72;
        const viewport = page.getViewport({ scale });
        const width = viewport.width;
        const height = viewport.height;
        const issues = new Set<string>();
        const substitutions = new Set<string>();
        const shapeComps = await extractShapes(page, viewport, p, 2000, issues);
        const runs = await extractTextRuns(page, scale, p, issues, substitutions);
        const imageComps = await extractImages(page, viewport, p, 100, issues);
        const annotations = await page.getAnnotations({ intent: 'display' });
        if (detectFields) {
          candidates.push(
            ...collectInputCandidates(
              runs,
              shapeComps,
              annotations,
              viewport,
              p,
            ),
          );
          if (!runs.length) textlessPages.push(p);
        }
        if (annotations.some((a) => a.subtype !== 'Link'))
          issues.add('annotation artwork');
        const background = await rasterizePageToPngDataUrl(page, renderScale);
        if (issues.size) {
          // A reference-only background is never exported. Preserve unsupported
          // artwork as a real component so saving/exporting cannot lose it.
          components.push({
            id: `pdf_page_${p}`,
            kind: 'image',
            x: 0,
            y: 0,
            width,
            height,
            rotation: 0,
            page: p,
            src: background,
            alt: `PDF page ${p + 1}`,
            objectFit: 'fill',
            radius: 0,
            field: '',
          });
          warnings.push(
            `Page ${p + 1} was preserved as an image to retain its appearance (${[...issues].join(', ')}).`,
          );
        } else {
          if (substitutions.size)
            warnings.push(
              `Page ${p + 1}: substituted fonts (${[...substitutions].join(', ')}). Text remains editable; typography may differ.`,
            );
          const pageComponents = [
            ...shapeComps,
            ...imageComps,
            ...textComponents(runs, {
              dividers: deriveDividers(shapeComps, medianFontSizePx(runs) * 2),
              paintBreaks: [...shapeComps, ...imageComps].map(
                (c) => c.paintOrder,
              ),
            }),
          ]
            .sort((a, b) => a.paintOrder - b.paintOrder)
            .map(({ paintOrder, ...component }) => component);
          components.push(...pageComponents);
          if (!pageComponents.length)
            components.push({
              id: `pdf_blank_${p}`,
              kind: 'shape',
              x: 0,
              y: 0,
              width,
              height,
              rotation: 0,
              page: p,
              shape: 'rectangle',
              fill: '#ffffff',
              stroke: 'transparent',
              strokeWidth: 0,
              radius: 0,
            });
        }
        pages.push({ width, height, background });
        page.cleanup();
      }
    } finally {
      await doc.destroy();
    }

    // The fixed designer has one shared page size. Never crop a later page.
    const canvasSize = pages.length
      ? {
          width: Math.max(...pages.map((page) => page.width)),
          height: Math.max(...pages.map((page) => page.height)),
        }
      : { width: 816, height: 1056 };
    if (
      pages.some(
        (page) =>
          page.width !== canvasSize.width || page.height !== canvasSize.height,
      )
    ) {
      for (const page of pages) {
        if (
          page.width === canvasSize.width &&
          page.height === canvasSize.height
        )
          continue;
        page.background = await padPageReference(
          page.background,
          page.width,
          page.height,
          canvasSize.width,
          canvasSize.height,
        );
      }
      warnings.push(
        'Mixed page sizes were padded to a shared canvas size without scaling the artwork.',
      );
    }

    return {
      candidates,
      textlessPages,
      result: {
        canvasSize,
        pageCount: pages.length,
        pages,
        components,
        fields: [],
        warnings,
      },
    };
  }
}
