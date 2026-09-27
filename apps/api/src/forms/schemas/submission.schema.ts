import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

/**
 * A Submission is a single filled, persisted document. It attaches to a Form
 * (and therefore to the template version the form captured at publish time)
 * and persists the original fill values. PDFs are generated on demand from
 * the stored values when the owner downloads them; optional `pdfUrl` /
 * `pdfStorageKey` exist only as an archive slot for already-rendered copies
 * (e.g. an explicit "Save copy to external storage" action or a workflow
 * hook). New submissions do not write them.
 */
@Schema({ timestamps: true })
export class Submission extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Form', required: true })
  formId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  /** FillValues: scalars keyed by field name; repeating groups keyed by group
   * name → array of per-entry { field: value } objects. Mixed because the
   * nested array-of-objects shape is fragile under Mongoose casting. */
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  values: any;

  /** Owner-entered values for ask-on-generate fields (scalars keyed by field
   *  name), persisted on first download and prefilled on the next. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  generateValues?: any;

  /** Optional archival copy of the rendered PDF in object storage. Only set
   * if the owner explicitly archived a copy or an integration exported one
   * (future). New auto-submissions leave these unset. */
  @Prop()
  pdfUrl?: string;

  @Prop()
  pdfStorageKey?: string;

  @Prop({ required: true })
  templateVersion: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata?: { ip?: string; userAgent?: string };

  createdAt: Date;
  updatedAt: Date;
}

export const SubmissionSchema = SchemaFactory.createForClass(Submission);
export type SubmissionDocument = Submission & Document;

SubmissionSchema.index({ formId: 1, createdAt: -1 });
SubmissionSchema.index({ organizationId: 1, createdAt: -1 });
