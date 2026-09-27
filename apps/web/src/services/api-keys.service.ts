import apiClient from '../lib/api';

export type ApiKeyPermission = 'template:read' | 'template:generate';
export interface ApiKeySummary {
  id: string;
  organizationId: string;
  name: string;
  prefix: string;
  permissions: ApiKeyPermission[];
  templateIds?: string[];
  createdByUserId: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedByUserId: string | null;
}
export interface CreateApiKeyInput {
  name: string;
  permissions: ApiKeyPermission[];
  templateIds?: string[];
  expiresAt?: string | null;
}
export interface CreatedApiKey {
  key: ApiKeySummary;
  secret: string;
}

const config = {
  _sensitive: true,
  _skipSuccessNotification: true,
  _skipErrorNotification: true,
} as never;
const base = (organizationId: string) =>
  `/organizations/${encodeURIComponent(organizationId)}/api-keys`;

export const apiKeysService = {
  async list(organizationId: string): Promise<ApiKeySummary[]> {
    const response = await apiClient.get<{ keys: ApiKeySummary[] }>(
      base(organizationId),
      config,
    );
    return response.data.keys;
  },
  async create(
    organizationId: string,
    input: CreateApiKeyInput,
  ): Promise<CreatedApiKey> {
    const response = await apiClient.post<CreatedApiKey>(
      base(organizationId),
      input,
      config,
    );
    return response.data;
  },
  async revoke(organizationId: string, id: string): Promise<ApiKeySummary> {
    const response = await apiClient.post<ApiKeySummary>(
      `${base(organizationId)}/${encodeURIComponent(id)}/revoke`,
      {},
      config,
    );
    return response.data;
  },
};
