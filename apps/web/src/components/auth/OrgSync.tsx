import { useEffect, useRef } from 'react';
import { useParams, useNavigate, Outlet } from 'react-router-dom';
import { useOrganizationStore } from '../../stores/organizationStore';

/**
 * OrgSync component - validates organization access and fetches org list
 *
 * - Fetches the user's organizations once on mount (never refetches in a loop)
 * - Validates that the user belongs to the org in the URL
 * - If the org list is empty or the URL org isn't accessible, redirects to the
 *   first accessible org or /onboarding
 * - URL determines the active organization context (no additional API calls)
 */
export function OrgSync() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const { organizations, fetchOrganizations, isLoading } = useOrganizationStore();
  const fetchedRef = useRef(false);

  const ownsOrg = organizations.some((org) => org._id === organizationId);

  useEffect(() => {
    // Already have orgs in the store — nothing to fetch.
    if (organizations.length > 0) return;
    // Fetch at most once per mount to avoid infinite refetch loops when the
    // backend returns an empty list.
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetchOrganizations()
      .then(() => {
        // If the user belongs to no organizations, send them to onboarding.
        if (useOrganizationStore.getState().organizations.length === 0) {
          navigate('/onboarding', { replace: true });
        }
      })
      .catch(() => {
        navigate('/onboarding', { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!organizationId) {
      // No orgId in URL - this shouldn't happen given the route structure
      return;
    }

    // If we don't have the org list yet, wait for it to load
    if (organizations.length === 0) {
      return;
    }

    // Check if the user belongs to this org
    if (!ownsOrg) {
      // User doesn't belong to this org - redirect to first accessible org or onboarding
      if (organizations.length > 0) {
        navigate(`/o/${organizations[0]._id}/templates`, { replace: true });
      } else {
        // No orgs accessible - send to onboarding to create one
        navigate('/onboarding', { replace: true });
      }
      return;
    }

    // User belongs to the org - everything is good, just render the route
    // The URL determines the organization context, no additional API calls needed
  }, [organizationId, organizations, ownsOrg, navigate]);

  // Show loading while fetching orgs
  if (isLoading && organizations.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  // Render the nested route
  return <Outlet />;
}
