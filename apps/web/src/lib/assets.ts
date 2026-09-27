import { API_BASE_URL } from './api';

/**
 * Build the proxied organization logo URL.
 *
 * Logos are served through the API (`GET /organizations/:id/logo`) rather than
 * the raw storage URL stored on the org record. The proxy keeps the storage
 * backend (S3 / GDrive / OneDrive / Azure) private, applies auth, and sets
 * cache headers — so the same URL works regardless of `storageType`.
 *
 * Because the proxy path is constant per org (unlike raw storage URLs, which
 * change on every upload), pass a `version` that changes when the logo changes
 * — typically `organization.updatedAt`. The backend caches the response for
 * 24h, so without a version bump a re-uploaded logo stays stale client-side
 * until expiry.
 *
 * Use this anywhere an org logo is rendered as an <img>/Avatar src; fall back
 * to initials when the org has no logo (truthiness of `organization.logo`).
 */
export function getOrganizationLogoUrl(orgId: string, version?: string | number): string {
  const url = `${API_BASE_URL}/organizations/${orgId}/logo`;
  return version ? `${url}?v=${encodeURIComponent(version)}` : url;
}
