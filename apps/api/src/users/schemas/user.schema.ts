import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OAuthProvider = 'google' | 'microsoft' | 'github' | null;

export interface OAuthAccount {
  provider: 'google' | 'microsoft' | 'github';
  providerAccountId: string;
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  linkedAt: Date;
}

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ select: false }) // Don't return in queries by default
  passwordHash?: string;

  @Prop({ required: true, default: false })
  emailVerified: boolean;

  @Prop()
  avatar?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Organization',
    required: false,
    default: null,
  })
  organizationId?: Types.ObjectId | null;

  @Prop({ type: [String], ref: 'Role', default: [] })
  roleIds: string[];

  // OAuth Accounts (can have multiple: Google + Microsoft)
  @Prop({ type: [{ _id: false }] })
  oauthAccounts?: OAuthAccount[];

  // Permission cache (for performance)
  @Prop({ type: [String], default: [] })
  cachedPermissions: string[];

  @Prop({ default: true })
  isActive: boolean;

  // Password reset
  @Prop()
  passwordResetToken?: string;

  @Prop()
  passwordResetExpires?: Date;

  // Email verification
  @Prop()
  emailVerificationToken?: string;

  @Prop()
  emailVerificationExpires?: Date;

  // Tracking
  @Prop()
  lastLoginAt?: Date;

  @Prop({ default: false })
  isOAuthOnly: boolean; // User who only uses OAuth (no password)

  // Onboarding
  @Prop({ type: [String], default: [] })
  documentTypes: string[];

  @Prop()
  userType?: string;

  @Prop()
  organizationSize?: string;

  @Prop()
  occupation?: string;

  @Prop({ default: false })
  onboardingCompleted: boolean; // GUARD FIELD — false = must onboard

  @Prop()
  onboardingCompletedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ organizationId: 1 });
UserSchema.index({
  'oauthAccounts.provider': 1,
  'oauthAccounts.providerAccountId': 1,
});
UserSchema.index({ passwordResetToken: 1 });
UserSchema.index({ onboardingCompleted: 1 });
