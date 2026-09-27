import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function OnboardingRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Allow access if onboarding is not completed OR if user has no organization
  // (A user who completed onboarding but lost their org should be able to re-create one)
  const needsOnboarding = user?.onboardingCompleted === false || !user?.organizationId;

  if (!needsOnboarding) {
    // Determine the default redirect target
    // If user has an active org, go to org-scoped templates, otherwise go to onboarding
    const targetOrg = user?.organizationId ? `/o/${user.organizationId}/templates` : '/onboarding';
    return <Navigate to={targetOrg} replace />;
  }

  // Render nested routes
  return <Outlet />;
}
