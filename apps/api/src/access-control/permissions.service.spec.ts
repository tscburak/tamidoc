import { Types, type Model } from 'mongoose';
import { PermissionsService } from './permissions.service';
import { COMMUNITY_PERMISSIONS } from './permissions.constants';
import type { Member } from '../members/schemas/member.schema';
import type { Role } from '../roles/schemas/role.schema';
import type { Organization } from '../organizations/schemas/organization.schema';
import type { User } from '../users/schemas/user.schema';

describe('Community permission boundary', () => {
  const previousEdition = process.env.TAMIDOC_EDITION;
  afterAll(() => {
    if (previousEdition === undefined) delete process.env.TAMIDOC_EDITION;
    else process.env.TAMIDOC_EDITION = previousEdition;
  });

  it('uses fixed system permissions and ignores custom roles from existing Enterprise data', async () => {
    process.env.TAMIDOC_EDITION = 'community';
    const membership = {
      roleIds: [
        { systemKey: 'admin', permissions: [] },
        { key: 'custom', permissions: ['organization:delete'] },
      ],
    };
    const memberQuery = {
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(membership),
    };
    const memberModel = { findOne: jest.fn().mockReturnValue(memberQuery) };
    const organizationModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ createdBy: new Types.ObjectId() }),
        }),
      }),
    };
    const service = new PermissionsService(
      memberModel as unknown as Model<Member>,
      {} as Model<Role>,
      organizationModel as unknown as Model<Organization>,
      {} as Model<User>,
    );
    const permissions = await service.getEffectivePermissions(
      new Types.ObjectId().toString(),
      new Types.ObjectId().toString(),
    );
    expect(permissions).toContain('template:create');
    expect(permissions).not.toContain('organization:delete');
    expect(permissions).not.toContain('role:manage');
    expect(permissions.every((permission) => COMMUNITY_PERMISSIONS.includes(permission))).toBe(true);
    expect(memberModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
  });
});
