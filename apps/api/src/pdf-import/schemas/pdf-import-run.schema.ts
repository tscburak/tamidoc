import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongoSchema, Types } from 'mongoose';
import type { DetectionMetrics, FieldDecision } from '../lib/detection-types';

@Schema({ timestamps: true, collection: 'pdf_import_runs' })
export class PdfImportRun {
  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null })
  organizationId: Types.ObjectId | null;

  @Prop({ required: true })
  fileSha256: string;

  @Prop({ required: true })
  fileBytes: number;

  @Prop({ required: true })
  detectionRequested: boolean;

  @Prop({ required: true, enum: ['processing', 'completed', 'failed'] })
  status: string;

  @Prop()
  pageCount?: number;

  @Prop()
  errorCode?: string;

  @Prop()
  confidenceThreshold?: number;

  @Prop({ type: MongoSchema.Types.Mixed })
  metrics?: DetectionMetrics;

  @Prop({ type: [MongoSchema.Types.Mixed], default: [] })
  decisions: FieldDecision[];
}

export const PdfImportRunSchema = SchemaFactory.createForClass(PdfImportRun);
PdfImportRunSchema.index({ userId: 1, organizationId: 1, createdAt: -1 });
