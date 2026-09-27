import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Mark a handler as requiring one of the given permissions (ANY-of semantics).
 * The PermissionsGuard resolves the caller's effective permissions for the
 * target organization (from the URL param `organizationId` or `id`, falling
 * back to the JWT's organizationId) and allows the request if at least one
 * listed permission is held. Owners bypass the check.
 */
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
