import { create } from 'zustand';
import { organizationService } from '../services/organization.service';
import type { OrganizationResponse, CreateOrganizationDto } from '../types/organization';
import { useUserStore } from './userStore';

interface OrganizationState {
  // State
  organizations: OrganizationResponse[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchOrganizations: () => Promise<void>;
  createOrganization: (data: CreateOrganizationDto) => Promise<OrganizationResponse>;
  updateOrganization: (organizationId: string, data: Partial<CreateOrganizationDto>) => Promise<OrganizationResponse>;
  updateOrganizationLocal: (organization: OrganizationResponse) => void;
  deleteOrganization: (organizationId: string) => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  clearError: () => void;
}

export const useOrganizationStore = create<OrganizationState>()((set, get) => ({
  // Initial state
  organizations: [],
  isLoading: false,
  error: null,

  // Fetch organizations owned by the current user
  fetchOrganizations: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await organizationService.getMyOrganizations();
      set({
        organizations: response.organizations,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      set({
        organizations: [],
        isLoading: false,
        error: error.message || 'Failed to fetch organizations',
      });
      throw error;
    }
  },

  // Create a new organization
  createOrganization: async (data: CreateOrganizationDto) => {
    set({ isLoading: true, error: null });
    try {
      const response = await organizationService.createOrganization(data);

      // Update the user in the user store (new active org)
      const { passwordHash, ...userResponse } = response.user;
      useUserStore.getState().setUser(userResponse);

      // Prepend the new org to the list
      set({
        organizations: [response.organization, ...get().organizations],
        isLoading: false,
        error: null,
      });

      return response.organization;
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'Failed to create organization',
      });
      throw error;
    }
  },

  // Update organization
  updateOrganization: async (organizationId: string, data: Partial<CreateOrganizationDto>) => {
    set({ isLoading: true, error: null });
    try {
      const updatedOrg = await organizationService.updateOrganization(organizationId, data);

      // Update the organization in the list
      set({
        organizations: get().organizations.map((org) =>
          org._id === organizationId ? updatedOrg : org
        ),
        isLoading: false,
        error: null,
      });

      return updatedOrg;
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'Failed to update organization',
      });
      throw error;
    }
  },

  // Update organization locally (without API call)
  updateOrganizationLocal: (organization: OrganizationResponse) => {
    set({
      organizations: get().organizations.map((org) =>
        org._id === organization._id ? organization : org
      ),
    });
  },

  // Delete organization
  deleteOrganization: async (organizationId: string) => {
    set({ isLoading: true, error: null });
    try {
      await organizationService.deleteOrganization(organizationId);

      // Remove the organization from the list
      set({
        organizations: get().organizations.filter((org) => org._id !== organizationId),
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'Failed to delete organization',
      });
      throw error;
    }
  },

  // Switch active organization
  switchOrganization: async (organizationId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await organizationService.switchOrganization(organizationId);

      // Update the user in the user store (new active org)
      const { passwordHash, ...userResponse } = response.user;
      useUserStore.getState().setUser(userResponse);

      set({
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'Failed to switch organization',
      });
      throw error;
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));

// Helper hook to get the active organization (derived from user.organizationId)
// NOTE: This is deprecated - use useActiveOrganizationFromPath instead
export const useActiveOrganization = (): OrganizationResponse | null => {
  const organizations = useOrganizationStore((s) => s.organizations);
  const activeOrgId = useUserStore((s) => s.user?.organizationId);

  return organizations.find((org) => org._id === activeOrgId) || null;
};

// Helper hook to get the active organization from URL path
// This should be used instead of useActiveOrganization
export const useActiveOrganizationFromPath = (): OrganizationResponse | null => {
  const organizations = useOrganizationStore((s) => s.organizations);

  // Get organization ID from URL path
  const pathOrgId = window.location.pathname.match(/\/o\/([^\/]+)/)?.[1];

  if (!pathOrgId) return null;

  return organizations.find((org) => org._id === pathOrgId) || null;
};
