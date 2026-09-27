import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SubscriptionPlan = 'free' | 'pro' | 'enterprise';
export type StorageType = 'platform' | 's3' | 'gdrive' | 'onedrive' | 'azure';

@Schema({ timestamps: true })
export class Organization extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string; // For subdomains/URLs

  @Prop({ type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' })
  plan: SubscriptionPlan;

  // Limits
  @Prop({ default: 5 })
  maxUsers: number;

  @Prop({ default: 10 })
  maxTemplates: number;

  @Prop({ default: 100 }) // MB
  maxStorage: number;

  // Settings
  @Prop({
    type: {
      allowCustomRoles: { type: Boolean, default: true },
      defaultRoleId: { type: String, default: null },
      requireEmailVerification: { type: Boolean, default: false },
      allowOAuthRegistration: { type: Boolean, default: true },
      branding: {
        primaryColor: { type: String, default: '#C65D2E' },
        accentColor: { type: String, default: '#2D6A4F' },
        font: { type: String, default: 'Inter' },
        logo: String,
        customDomain: String,
      },
    },
    default: {},
  })
  settings: {
    allowCustomRoles: boolean;
    defaultRoleId?: string;
    requireEmailVerification: boolean;
    allowOAuthRegistration: boolean;
    branding?: {
      primaryColor: string;
      accentColor?: string;
      font?: string;
      logo?: string;
      customDomain?: string;
    };
  };

  // Storage Configuration
  @Prop({
    type: {
      storageType: {
        type: String,
        enum: ['platform', 's3', 'gdrive', 'onedrive', 'azure'],
        default: 'platform',
      },
      config: {
        // S3
        bucket: String,
        region: String,
        accessKeyId: String,
        secretAccessKey: String,
        // Google Drive
        clientId: String,
        clientSecret: String,
        redirectUri: String,
        // OneDrive
        tenantId: String,
        // Azure
        connectionString: String,
        containerName: String,
      },
    },
    required: false,
  })
  storageConfig: {
    storageType: StorageType;
    config?: Record<string, string>;
  };

  @Prop()
  logo?: string;

  @Prop()
  description?: string;

  @Prop()
  website?: string;

  @Prop()
  industry?: string;

  @Prop()
  size?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ default: Date.now })
  trialEndsAt?: Date;

  // Subscription tracking
  @Prop()
  subscriptionId?: string; // Stripe/Paddle/etc.

  createdAt: Date;
  updatedAt: Date;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);

// Indexes
OrganizationSchema.index({ slug: 1 }, { unique: true });
OrganizationSchema.index({ createdBy: 1 });
