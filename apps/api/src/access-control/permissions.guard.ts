import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { PermissionsService } from './permissions.service';

/**
 * Enforces @Permissions(...) metadata. ANY-of semantics: the request is
 * allowed if the caller holds at least one of the listed permissions for the
 * target organization. Owners (org creator / Owner role) bypass the check.
 *
 * The target organization is resolved, in order, from:
 *   req.params.organizationId → req.params.id → req.user.organizationId
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as
      { userId: string; organizationId?: string } | undefined;
    if (!user?.userId) {
      throw new ForbiddenException('Authentication required');
    }

    const organizationId =
      request.params?.organizationId ||
      request.params?.id ||
      user.organizationId;
    if (!organizationId) {
      throw new ForbiddenException(
        'No organization context for permission check',
      );
    }

    const allowed = await this.permissionsService.hasAnyPermission(
      user.userId,
      organizationId,
      required,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }
    return true;
  }
}
