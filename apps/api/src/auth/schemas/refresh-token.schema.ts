import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class RefreshToken extends Document {
  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ type: String, required: false, default: null })
  organizationId?: string | null;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({
    type: {
      userAgent: { type: String, required: false },
      ip: { type: String, required: false },
    },
    required: false,
  })
  deviceInfo?: {
    userAgent?: string;
    ip?: string;
  };

  @Prop({ default: false })
  isRevoked: boolean;

  @Prop()
  revokedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

// Index for cleanup
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for user lookups
RefreshTokenSchema.index({ userId: 1, isRevoked: 1 });
