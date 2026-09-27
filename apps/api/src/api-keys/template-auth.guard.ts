import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from '../access-control/permissions.guard';
import { API_KEY_ACCESS } from './api-key-access.decorator';
import type { ApiKeyPermission, ApiKeyRequest } from './api-key.types';
import { ApiKeysService } from './api-keys.service';

@Injectable()
export class TemplateAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly keys: ApiKeysService,
    private readonly userPermissions: PermissionsGuard,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token?.startsWith('tdk_')) {
      // A browser session or JWT continues through the existing permission guard.
      await super.canActivate(context);
      return this.userPermissions.canActivate(context);
    }
    const principal = await this.keys.authenticate(token);
    const permission = this.reflector.get<ApiKeyPermission | undefined>(
      API_KEY_ACCESS,
      context.getHandler(),
    );
    if (!permission || !principal.permissions.includes(permission))
      throw new ForbiddenException('API key does not permit this operation');
    if (request.params.organizationId !== principal.organizationId)
      throw new ForbiddenException('API key belongs to another organization');
    const templateId = request.params.id;
    if (
      templateId &&
      principal.templateIds &&
      !principal.templateIds.includes(templateId as string)
    )
      throw new ForbiddenException('API key does not permit this template');
    request.apiKey = principal;
    await this.keys.recordUsage(principal.id);
    return true;
  }
}
