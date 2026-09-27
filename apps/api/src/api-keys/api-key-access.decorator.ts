import { SetMetadata } from '@nestjs/common';
import type { ApiKeyPermission } from './api-key.types';

export const API_KEY_ACCESS = 'api-key:access';
/** API keys are denied by default. Opt in only endpoints serving integrations. */
export const AllowApiKey = (permission: ApiKeyPermission) =>
  SetMetadata(API_KEY_ACCESS, permission);
