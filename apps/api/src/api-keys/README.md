# Organization API keys

Owners and active organization admins can manage keys in **Organization Settings → API Keys**. Active members with the Owner role can also manage them. Keys belong to the organization; the creating user is recorded for auditing and is not impersonated by API requests.

## Create and use a key

1. Create a named key, choose permissions and template access, and set its expiration (90 days by default, or no expiration).
2. Copy the secret immediately. It is returned only once and is stored on the server as a SHA-256 hash of a randomly generated 256-bit secret.
3. Send `Authorization: Bearer YOUR_API_KEY` from your server. The fixed-template fill page's API tab provides the endpoint and request body.

The API base URL is the same one configured for the application. Paths below are relative to that base.

| Key permission | Available routes |
| --- | --- |
| `template:read` | `GET /organizations/:organizationId/templates`, `GET .../templates/:id`, `GET .../templates/:id/versions`, `GET .../templates/:id/versions/:version` |
| `template:generate` | `POST .../templates/:id/generate-pdf` (fixed), `POST .../templates/:id/generate` (composable), `POST .../templates/:id/validate` (composable validation) |

All other routes reject API keys. A key can access only its own organization. Optional template restrictions apply to individual endpoints and to list results and counts before pagination. Omitted `templateIds` allows all present and future organization templates; an empty list is rejected when creating a key.

Key management uses a signed-in owner/admin's session or user JWT:

- `GET /organizations/:organizationId/api-keys` — metadata only, including creator, expiration, last use, and revocation.
- `POST /organizations/:organizationId/api-keys` — `{ "name": "CRM", "permissions": ["template:generate"], "templateIds": ["TEMPLATE_ID"], "expiresAt": null }`. Omit `expiresAt` for 90 days, send a future ISO timestamp for a date, or `null` for no expiration. Returns `{ key, secret }` inside the application's normal `data` response envelope.
- `POST /organizations/:organizationId/api-keys/:id/revoke` — permanently revokes the key. Repeated revocation preserves the original timestamp and actor.

Invalid, expired, revoked, and deleted-organization keys return 401. Valid keys with insufficient permission or the wrong organization/template return 403. Explicit invalid credentials never fall back to a session cookie. Requests already authorized when revocation occurs may finish; subsequent authentication fails.

Secrets are not persisted in browser storage or written by the API client's development logger. Creation responses use `Cache-Control: no-store`. To rotate a key, create a replacement, update the integration, then revoke the old key.

## Verification

`npm test -- --runInBand api-keys.spec.ts` exercises the real HTTP controllers, guards, validation pipe, JWT strategy, and services with in-memory database doubles and stub PDF renderers. Frontend tests cover creation, restrictions, copying, revocation, failures, organization switching, and secret-log suppression. These tests do not require a running MongoDB instance.
