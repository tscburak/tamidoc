import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SystemRoleKey = 'owner' | 'admin' | 'member';

/**
 * Organization-scoped role. A role bundles a set of permission strings
 * (see permissions.constants). System roles (owner/admin/member) are seeded
 * automatically on organization creation and cannot be deleted.
 */
@Schema({ timestamps: true })
export class Role extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  /** Unique-per-org slug used as a stable key. */
  @Prop({ required: true, lowercase: true, trim: true })
  key: string;

  @Prop()
  description?: string;

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop()
  color?: string;

  /** System roles are protected from deletion and key/name edits. */
  @Prop({ default: false })
  isSystem: boolean;

  /** Identifies which built-in role this is (owner/admin/member), if any. */
  @Prop()
  systemKey?: SystemRoleKey;

  createdAt: Date;
  updatedAt: Date;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

// A role key is unique within an organization.
RoleSchema.index({ organizationId: 1, key: 1 }, { unique: true });
