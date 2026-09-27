import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Member } from '../members/schemas/member.schema';
import { Role } from '../roles/schemas/role.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { User } from '../users/schemas/user.schema';
import {
  ALL_PERMISSIONS,
  COMMUNITY_PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLE_LABELS,
} from './permissions.constants';

/**
 * Resolves a user's effective permissions within an organization.
 *
 * Owner (org creator, or anyone holding the system Owner role) implicitly
 * holds every permission. Otherwise the permission set is the union of the
 * permissions attached to the user's active roles in that organization.
 *
 * Resolved fresh from the DB on each call so role/permission changes take
 * effect immediately (the JWT carries a cache that may be stale).
 */
@Injectable()
export class PermissionsService {
  constructor(
    @InjectModel(Member.name) private memberModel: Model<Member>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
    @InjectModel(Organization.name)
    private organizationModel: Model<Organization>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  /** True if the user is the org creator or holds the system Owner role. */
  async isOrgOwner(userId: string, organizationId: string): Promise<boolean> {
    const oid = this.toObjectOrString(organizationId);
    const org = await this.organizationModel
      .findById(oid)
      .select('createdBy')
      .lean();
    if (org?.createdBy && org.createdBy.toString() === userId) {
      return true;
    }
    const member = await this.memberModel
      .findOne({ userId: new Types.ObjectId(userId), organizationId: oid, status: 'active' })
      .populate('roleIds')
      .lean();
    return Boolean(
      member &&
      (member.roleIds as unknown as Role[]).some(
        (r) => r?.systemKey === 'owner',
      ),
    );
  }

  /** True if the user has an active membership in the organization. */
  async isOrgMember(userId: string, organizationId: string): Promise<boolean> {
    const count = await this.memberModel.countDocuments({
      userId: new Types.ObjectId(userId),
      organizationId: this.toObjectOrString(organizationId),
      status: 'active',
    });
    return count > 0;
  }

  /** Returns the active Member document (lean, roles populated) or null. */
  async getMember(userId: string, organizationId: string) {
    return this.memberModel
      .findOne({
        userId: new Types.ObjectId(userId),
        organizationId: this.toObjectOrString(organizationId),
        status: 'active',
      })
      .populate('roleIds')
      .lean();
  }

  async getEffectivePermissions(
    userId: string,
    organizationId: string,
  ): Promise<string[]> {
    if (await this.isOrgOwner(userId, organizationId)) {
      return process.env.TAMIDOC_EDITION === 'enterprise'
        ? [...ALL_PERMISSIONS]
        : [...COMMUNITY_PERMISSIONS];
    }
    const member = await this.getMember(userId, organizationId);
    if (!member) {
      return [];
    }
    const perms = new Set<string>();
    for (const role of member.roleIds as unknown as Role[]) {
      // Community uses only the fixed Owner/Admin/Member roles. Enterprise
      // may add custom roles, but they must never grant access after a
      // deployment is switched back to Community.
      const granted = process.env.TAMIDOC_EDITION === 'enterprise'
        ? role?.permissions || []
        : role?.systemKey
          ? SYSTEM_ROLE_PERMISSIONS[role.systemKey]
          : [];
      for (const p of granted) {
        if (process.env.TAMIDOC_EDITION === 'enterprise' || COMMUNITY_PERMISSIONS.includes(p)) {
          perms.add(p);
        }
      }
    }
    return [...perms];
  }

  async hasAnyPermission(
    userId: string,
    organizationId: string,
    permissions: string[],
  ): Promise<boolean> {
    if (!permissions.length) {
      return true;
    }
    const effective = await this.getEffectivePermissions(
      userId,
      organizationId,
    );
    return permissions.some((p) => effective.includes(p));
  }

  /** Seed the three system roles for a freshly created organization. Returns
   * the created role documents (owner/admin/member) for caller use. */
  async seedSystemRoles(organizationId: string) {
    const oid = new Types.ObjectId(organizationId);
    const entries: Array<
      { systemKey: 'owner' | 'admin' | 'member' } & Record<string, unknown>
    > = [
      {
        systemKey: 'owner',
        name: SYSTEM_ROLE_LABELS.owner,
        key: 'owner',
        permissions: SYSTEM_ROLE_PERMISSIONS.owner,
        color: '#C65D2E',
        isSystem: true,
      },
      {
        systemKey: 'admin',
        name: SYSTEM_ROLE_LABELS.admin,
        key: 'admin',
        permissions: SYSTEM_ROLE_PERMISSIONS.admin,
        color: '#2563EB',
        isSystem: true,
      },
      {
        systemKey: 'member',
        name: SYSTEM_ROLE_LABELS.member,
        key: 'member',
        permissions: SYSTEM_ROLE_PERMISSIONS.member,
        color: '#6B7280',
        isSystem: true,
      },
    ];
    const created = await this.roleModel.create(
      entries.map((e) => ({ ...e, organizationId: oid })),
    );
    return created;
  }

  /** Idempotent backfill for organizations created before the roles/members
   * feature existed. Seeds the system roles and an Owner membership row for the
   * org creator the first time roles or members are queried. Safe to call
   * repeatedly — no-ops once roles exist. */
  async ensureOrgSeeded(organizationId: string): Promise<void> {
    const oid = new Types.ObjectId(organizationId);
    const org = await this.organizationModel
      .findById(oid)
      .select('createdBy')
      .lean();
    if (!org) return;

    // Seed system roles only once. But the Owner membership backfill below must
    // run regardless — an org can have roles yet no Owner Member row (e.g. created
    // before the members feature, or the row was removed). Without it the creator
    // is invisible to member-scoped checks and can be re-added as a duplicate.
    const roleCount = await this.roleModel.countDocuments({
      organizationId: oid,
    });
    if (roleCount === 0) {
      await this.seedSystemRoles(organizationId);
    }

    if (org.createdBy) {
      const creatorId = org.createdBy;
      const existing = await this.memberModel.findOne({
        organizationId: oid,
        userId: creatorId,
      });
      if (!existing) {
        const ownerRole = await this.roleModel.findOne({
          organizationId: oid,
          systemKey: 'owner',
        });
        if (ownerRole) {
          await this.memberModel.create({
            organizationId: oid,
            userId: creatorId,
            roleIds: [ownerRole._id],
            status: 'active',
            joinedAt: new Date(),
          });
        }
      }
    }
  }

  private toObjectOrString(id: string): Types.ObjectId {
    return new Types.ObjectId(id);
  }
}
