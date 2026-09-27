import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { IRequestWithUser } from '../auth/interfaces/request.interface';
import { ApiKeysService } from './api-keys.service';

@Injectable()
export class ApiKeyManagementGuard implements CanActivate {
  constructor(private readonly keys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IRequestWithUser>();
    if (
      !request.user?.userId ||
      !(await this.keys.canManage(
        request.user.userId,
        request.params.organizationId as string,
      ))
    ) {
      throw new ForbiddenException(
        'Only organization owners and admins can manage API keys',
      );
    }
    return true;
  }
}
