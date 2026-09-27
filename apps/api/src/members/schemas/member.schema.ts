import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MemberStatus = 'active' | 'invited';

/**
 * Membership join record — the source of truth for who is in an organization,
 * which roles they hold, and how/when they joined. Supersedes the legacy
 * "User.organizationId" derivation (that field now only tracks the *active*
 * org for JWT scoping).
 *
 * For email invites to users that do not exist yet, `userId` is null and
 * `inviteEmail` carries the target address until the invite is accepted.
 */
@Schema({ timestamps: true })
export class Member extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: false,
    default: null,
    index: true,
  })
  userId?: Types.ObjectId | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Role' }], default: [] })
  roleIds: Types.ObjectId[];

  @Prop({ enum: ['active', 'invited'], default: 'active' })
  status: MemberStatus;

  /** Set for pending email invites before the invitee has a user account. */
  @Prop()
  inviteEmail?: string;

  @Prop()
  joinedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  invitedBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const MemberSchema = SchemaFactory.createForClass(Member);

// A user can appear at most once per organization. Sparse so pending email
// invites (userId null) do not collide on the null value.
MemberSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true, sparse: true },
);
MemberSchema.index({ organizationId: 1, status: 1 });
