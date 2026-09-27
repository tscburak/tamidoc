import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { API_KEY_PERMISSIONS, type ApiKeyPermission } from '../api-key.types';

@Schema({ timestamps: true })
export class ApiKey {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByUserId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  /** Public identifier only; no part of the secret is shown after creation. */
  @Prop({ required: true, unique: true })
  prefix: string;

  @Prop({ required: true, select: false })
  keyHash: string;

  @Prop({ type: [String], enum: API_KEY_PERMISSIONS, required: true })
  permissions: ApiKeyPermission[];

  @Prop({ type: [Types.ObjectId], ref: 'Template', default: undefined })
  templateIds?: Types.ObjectId[];

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;

  @Prop({ type: Date, default: null })
  lastUsedAt: Date | null;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  revokedByUserId: Types.ObjectId | null;

  createdAt: Date;
  updatedAt: Date;
}

export type ApiKeyDocument = HydratedDocument<ApiKey>;
export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);
ApiKeySchema.index({ organizationId: 1, createdAt: -1 });
