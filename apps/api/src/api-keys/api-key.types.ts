import type { Request } from 'express';

export const API_KEY_PERMISSIONS = [
  'template:read',
  'template:generate',
] as const;
export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number];

/** A service identity, independent of the user who created the credential. */
export interface ApiKeyPrincipal {
  id: string;
  organizationId: string;
  permissions: ApiKeyPermission[];
  /** Undefined means all templates; an empty array never grants access. */
  templateIds?: string[];
}

export interface ApiKeyRequest extends Request {
  apiKey?: ApiKeyPrincipal;
}

export interface ApiKeySummary extends ApiKeyPrincipal {
  name: string;
  prefix: string;
  createdByUserId: string;
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revokedByUserId: string | null;
}
