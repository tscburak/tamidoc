import apiClient from '../lib/api';
import type {
  CreateOrganizationDto,
  OrganizationResponse,
  CreateOrganizationResponse,
} from '../types/organization';

class OrganizationService {
  /**
   * Create a new organization
   * Returns organization, updated user, and new auth cookies are set automatically
   */
  async createOrganization(data: CreateOrganizationDto): Promise<CreateOrganizationResponse> {
    const response = await apiClient.post<CreateOrganizationResponse>('/organizations', data);
    return response.data;
  }

  /**
   * Get organizations owned by the current user
   */
  async getMyOrganizations(): Promise<{ organizations: OrganizationResponse[] }> {
    const response = await apiClient.get<{ organizations: OrganizationResponse[] }>('/organizations/mine');
    return response.data;
  }

  /**
   * Get organization by ID
   */
  async getOrganizationById(id: string): Promise<OrganizationResponse> {
    const response = await apiClient.get<OrganizationResponse>(`/organizations/${id}`);
    return response.data;
  }

  /**
   * Get organization by slug
   */
  async getOrganizationBySlug(slug: string): Promise<OrganizationResponse> {
    const response = await apiClient.get<OrganizationResponse>(`/organizations/slug/${slug}`);
    return response.data;
  }

  /**
   * Update organization
   */
  async updateOrganization(id: string, data: Partial<CreateOrganizationDto>): Promise<OrganizationResponse> {
    const response = await apiClient.put<OrganizationResponse>(`/organizations/${id}`, data);
    return response.data;
  }

  /**
   * Upload organization logo
   * @param orgId - Organization ID
   * @param file - File object to upload
   * @returns Updated organization with logo URL
   */
  async uploadLogo(orgId: string, file: File): Promise<{ organization: OrganizationResponse }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<{ organization: OrganizationResponse }>(
      `/organizations/${orgId}/logo`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    );
    return response.data;
  }

  /**
   * Get organization members
   */
  async getOrganizationMembers(id: string): Promise<any[]> {
    const response = await apiClient.get<{ members: any[] }>(`/organizations/${id}/members`);
    return response.data.members;
  }

  /**
   * Delete organization
   */
  async deleteOrganization(id: string): Promise<void> {
    await apiClient.delete(`/organizations/${id}`);
  }

  /**
   * Switch active organization
   * Updates the user's active org and refreshes auth cookies
   */
  async switchOrganization(organizationId: string): Promise<{ user: any; tokens: any }> {
    const response = await apiClient.post<{ user: any; tokens: any }>('/auth/switch-organization', { organizationId });
    return response.data;
  }
}

export const organizationService = new OrganizationService();
