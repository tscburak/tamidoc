import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Organization-scoped tag. Templates reference tags by name (Template.tags
 * is a string[]); this collection defines the palette an admin curates so the
 * template editor offers a constrained, consistent set.
 */
@Schema({ timestamps: true })
export class Tag extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop()
  color?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const TagSchema = SchemaFactory.createForClass(Tag);

// Tag names are unique within an organization (case-insensitive via lower key).
TagSchema.index({ organizationId: 1, name: 1 }, { unique: true });
