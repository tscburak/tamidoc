import type { OrganizationResponse } from './organization';

export type SystemRoleKey = 'owner' | 'admin' | 'member';

export interface Role {
  _id: string;
  organizationId: string;
  name: string;
  key: string;
  description?: string;
  permissions: string[];
  color?: string;
  isSystem: boolean;
  systemKey?: SystemRoleKey;
  createdAt: string;
  updatedAt: string;
}

export interface MemberUser {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
}

export type MemberStatus = 'active' | 'invited';

export interface Member {
  _id: string;
  organizationId: string;
  userId?: MemberUser | null;
  roleIds: Role[];
  status: MemberStatus;
  inviteEmail?: string;
  joinedAt?: string;
  invitedBy?: string;
  createdAt: string;
}

export type InviteType = 'link' | 'email';
export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Invite {
  _id: string;
  organizationId: string;
  token: string;
  type: InviteType;
  email?: string;
  roleId: Role;
  status: InviteStatus;
  expiresAt?: string;
  maxUses?: number;
  useCount: number;
  acceptedBy: string[];
  createdBy: string;
  createdAt: string;
}

export interface Tag {
  _id: string;
  organizationId: string;
  name: string;
  color?: string;
}

export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
}

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: PermissionDefinition[];
}

export interface InvitePreview {
  token: string;
  type: InviteType;
  email?: string;
  status: InviteStatus;
  organization: Pick<OrganizationResponse, '_id' | 'name' | 'logo'>;
  role: Pick<Role, '_id' | 'name' | 'key' | 'color'>;
  /** True when the authenticated visitor is already an active member. */
  alreadyMember?: boolean;
}
