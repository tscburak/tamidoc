import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type FormStatus = 'active' | 'paused' | 'archived';

/**
 * A Form is a published, shareable instance of a Template. It embeds a snapshot
 * of the template's render data ({ name, canvas, groups, fields }) at publish
 * time, so editing or deleting the source Template never changes a live form or
 * its past submissions (version pinning + survival). Public fillers resolve a
 * form by its unguessable `token`; submissions belong to the form's org.
 */
@Schema({ timestamps: true })
export class Form extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'Template', required: true })
  templateId: Types.ObjectId;

  @Prop({ required: true })
  templateVersion: string;

  /** Snapshot of the template's render data ({ name, canvas, groups, fields }).
   * Stored as Mixed: write-once at publish, consumed only by the renderer. */
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  templateSnapshot: any;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  @Prop({ enum: ['active', 'paused', 'archived'], default: 'active' })
  status: FormStatus;

  /** Unguessable public link token. */
  @Prop({ required: true, unique: true })
  token: string;

  /** bcrypt hash of the form password; absent means no password. */
  @Prop()
  passwordHash?: string;

  /** Absent means the form never expires. */
  @Prop()
  expiresAt?: Date;

  @Prop({ default: 0 })
  submissionCount: number;

  /** Optional per-field overrides confirmed in the form review step, keyed
   * `${groupId ?? ''}::${fieldName}` (exact name). Applied on top of the
   * snapshot fields for public fill + validation. Absent = no overrides. */
  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  fieldOverrides?: any;

  createdAt: Date;
  updatedAt: Date;
}

export const FormSchema = SchemaFactory.createForClass(Form);
export type FormDocument = Form & Document;

// Indexes (mirror the Template org-scoping convention)
FormSchema.index({ organizationId: 1, status: 1 });
FormSchema.index({ organizationId: 1, createdAt: -1 });
FormSchema.index({ token: 1 }, { unique: true });
FormSchema.index({ templateId: 1 });
