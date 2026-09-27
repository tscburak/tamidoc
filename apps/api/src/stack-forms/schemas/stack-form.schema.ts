import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

/** `draft` = created but not yet published from the builder review step; only
 *  `active` stacks accept public submissions. */
export type StackFormStatus = 'draft' | 'active' | 'paused' | 'archived';

/**
 * One member template of a stack form. `templateSnapshot` is the render data
 * ({ name, canvas, groups, fields }) captured at publish time (write-once) so
 * editing/deleting the source Template never changes a live stack or its past
 * submissions — same version-pinning/survival guarantee as Form.templateSnapshot.
 *
 * `scalarMap` / `groupMaps` remap canonical fill values back to the original
 * field/group names this template's renderer expects (see lib/merge.ts).
 */
export class StackEntry {
  @Prop({ type: Types.ObjectId, ref: 'Template', required: true })
  templateId: Types.ObjectId;

  @Prop({ required: true })
  templateName: string;

  @Prop({ required: true })
  templateVersion: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  templateSnapshot: any;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  scalarMap: any;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  groupMaps: any;
}

/**
 * A Stack Form publishes several Templates as ONE fill form. Fields are unified
 * by name (see lib/merge.ts) so the submitter types each value once; each
 * submission renders one PDF per entry. Public fillers resolve a stack by its
 * unguessable `token`; submissions belong to the stack's org.
 */
@Schema({ timestamps: true })
export class StackForm extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ type: [StackEntry], required: true })
  entries: StackEntry[];

  /** Unified field set the submitter sees (canonical). Group members carry a
   *  groupId referencing a unifiedGroups[].id. */
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  unifiedFields: any[];

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  unifiedGroups: any[];

  /** Manual field links from the review mapping step (draft-relevant; stored so
   *  a draft can be re-merged/reviewed after a page refresh). */
  @Prop({ type: MongooseSchema.Types.Mixed })
  links?: any;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  @Prop({ enum: ['draft', 'active', 'paused', 'archived'], default: 'active' })
  status: StackFormStatus;

  /** Unguessable public link token. */
  @Prop({ required: true, unique: true })
  token: string;

  /** bcrypt hash of the stack password; absent means no password. */
  @Prop()
  passwordHash?: string;

  /** Absent means the stack never expires. */
  @Prop()
  expiresAt?: Date;

  @Prop({ default: 0 })
  submissionCount: number;

  createdAt: Date;
  updatedAt: Date;
}

export const StackFormSchema = SchemaFactory.createForClass(StackForm);
export type StackFormDocument = StackForm & Document;

StackFormSchema.index({ organizationId: 1, status: 1 });
StackFormSchema.index({ organizationId: 1, createdAt: -1 });
StackFormSchema.index({ token: 1 }, { unique: true });
