import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

/**
 * One filled submission of a Stack Form. `values` are the CANONICAL FillValues
 * (keyed by unified field/group names). PDFs are generated on demand from these
 * values, one per stack entry, when the owner previews/downloads — none are
 * stored at submit time (same rationale as Submission).
 */
@Schema({ timestamps: true })
export class StackSubmission extends Document {
  @Prop({ type: Types.ObjectId, ref: 'StackForm', required: true })
  stackFormId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  /** Canonical FillValues: scalars keyed by unified field name; repeating
   *  groups keyed by unified group name → array of { field: value }. Mixed
   *  because the nested array-of-objects shape is fragile under Mongoose casting. */
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  values: any;

  /** Owner-entered values for ask-on-generate fields, keyed by entry index
   *  (string) → { originalFieldName: value }. Persisted on first download and
   *  prefilled on the next. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  generateValues?: any;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata?: { ip?: string; userAgent?: string };

  createdAt: Date;
  updatedAt: Date;
}

export const StackSubmissionSchema =
  SchemaFactory.createForClass(StackSubmission);
export type StackSubmissionDocument = StackSubmission & Document;

StackSubmissionSchema.index({ stackFormId: 1, createdAt: -1 });
StackSubmissionSchema.index({ organizationId: 1, createdAt: -1 });
