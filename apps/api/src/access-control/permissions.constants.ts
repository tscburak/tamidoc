/**
 * Organization-scoped permission catalog.
 *
 * Permissions are flat strings of the form `{resource}:{action}`. They are
 * attached to Roles (org-scoped) and resolved at request time by the
 * PermissionsService. Owners implicitly hold every permission.
 *
 * PERMISSION_GROUPS is the structured form consumed by the frontend role
 * editor (grouped checkboxes) and surfaced via GET /auth/permissions.
 */

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

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'organization',
    label: 'Organization',
    permissions: [
      {
        key: 'organization:read',
        label: 'View organization',
        description: 'See organization details and settings',
      },
      {
        key: 'organization:update',
        label: 'Edit organization',
        description: 'Update name, branding and details',
      },
      {
        key: 'organization:delete',
        label: 'Delete organization',
        description: 'Permanently delete the organization',
      },
    ],
  },
  {
    key: 'template',
    label: 'Templates',
    permissions: [
      {
        key: 'template:read',
        label: 'View templates',
        description: 'List and open templates',
      },
      {
        key: 'template:create',
        label: 'Create templates',
        description: 'Create new templates',
      },
      {
        key: 'template:design',
        label: 'Edit design',
        description: 'Modify template canvas, fields and versions',
      },
      {
        key: 'template:publish',
        label: 'Publish & archive',
        description: 'Publish or archive templates',
      },
      {
        key: 'template:delete',
        label: 'Delete templates',
        description: 'Delete templates',
      },
    ],
  },
  {
    key: 'form',
    label: 'Forms & Submissions',
    permissions: [
      {
        key: 'form:read',
        label: 'View forms',
        description: 'View forms and submissions',
      },
      {
        key: 'form:delete',
        label: 'Delete forms',
        description: 'Delete forms and submissions',
      },
    ],
  },
  {
    key: 'member',
    label: 'Members',
    permissions: [
      {
        key: 'member:read',
        label: 'View members',
        description: 'List organization members and invites',
      },
      {
        key: 'member:invite',
        label: 'Invite members',
        description: 'Create invite links and email invitations',
      },
      {
        key: 'member:manage',
        label: 'Manage members',
        description: 'Change member roles and remove members',
      },
    ],
  },
  {
    key: 'role',
    label: 'Roles',
    permissions: [
      {
        key: 'role:read',
        label: 'View roles',
        description: 'List roles and their permissions',
      },
      {
        key: 'role:manage',
        label: 'Manage roles',
        description: 'Create, edit and delete custom roles',
      },
    ],
  },
  {
    key: 'tag',
    label: 'Tags',
    permissions: [
      {
        key: 'tag:read',
        label: 'View tags',
        description: 'List organization tags',
      },
      {
        key: 'tag:manage',
        label: 'Manage tags',
        description: 'Create, edit and delete tags',
      },
    ],
  },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

/** Permissions backed by routes in the Community distribution. */
export const COMMUNITY_PERMISSION_GROUPS: PermissionGroup[] =
  PERMISSION_GROUPS.filter((group) => group.key !== 'member' && group.key !== 'role');
export const COMMUNITY_PERMISSIONS: string[] = COMMUNITY_PERMISSION_GROUPS.flatMap(
  (group) => group.permissions.map((permission) => permission.key),
);

/** Default permission sets for the three system roles seeded on org creation. */
export const SYSTEM_ROLE_PERMISSIONS: Record<
  'owner' | 'admin' | 'member',
  string[]
> = {
  owner: [...ALL_PERMISSIONS],
  admin: ALL_PERMISSIONS.filter((p) => p !== 'organization:delete'),
  member: [
    'organization:read',
    'template:read',
    'form:read',
    'member:read',
    'role:read',
    'tag:read',
  ],
};

export const SYSTEM_ROLE_LABELS: Record<'owner' | 'admin' | 'member', string> =
  {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
  };
