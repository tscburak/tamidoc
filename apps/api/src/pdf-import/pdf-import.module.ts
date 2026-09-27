import { Module } from '@nestjs/common';
import { PdfImportController } from './pdf-import.controller';
import { PdfImportService } from './pdf-import.service';
import { StorageModule } from '../storage/storage.module';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PdfImportRun,
  PdfImportRunSchema,
} from './schemas/pdf-import-run.schema';
import { JevFieldDetectionService } from './jev-field-detection.service';
import { PdfImportWorkflowService } from './pdf-import-workflow.service';

@Module({
  imports: [
    StorageModule,
    MongooseModule.forFeature([
      { name: PdfImportRun.name, schema: PdfImportRunSchema },
    ]),
  ],
  controllers: [PdfImportController],
  providers: [
    PdfImportService,
    JevFieldDetectionService,
    PdfImportWorkflowService,
  ],
})
export class PdfImportModule {}
