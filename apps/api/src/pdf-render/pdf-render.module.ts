import { Module } from '@nestjs/common';
import { PdfRenderService } from './pdf-render.service';
import { FlowRenderService } from './flow-render.service';

@Module({
  providers: [PdfRenderService, FlowRenderService],
  exports: [PdfRenderService, FlowRenderService],
})
export class PdfRenderModule {}
