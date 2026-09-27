import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  Organization,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import { Member, MemberSchema } from '../members/schemas/member.schema';
import { Role, RoleSchema } from '../roles/schemas/role.schema';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';

/**
 * Global authorization layer.
 *
 * Registered once (global) so PermissionsService + PermissionsGuard are
 * injectable from any feature module without re-importing. It owns the model
 * tokens that the permission resolver needs (Member, Role, Organization, User).
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: Member.name, schema: MemberSchema },
      { name: Role.name, schema: RoleSchema },
    ]),
  ],
  providers: [PermissionsService, PermissionsGuard],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
