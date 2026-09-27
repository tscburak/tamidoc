import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../stores/userStore';
import { type AuthState } from '../types/auth';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (firstName: string, lastName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
  setUser: (user: any) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, error, login, register, logout, refreshUser, clearError, setUser } = useUserStore();

  // Initialize auth state on mount by checking if user is authenticated via cookies
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Always try to get current user from /me endpoint
        // This will work if we have valid httpOnly cookies
        await refreshUser();
      } catch (error) {
        // No valid session, clear any stale user data
        setUser(null);
        useUserStore.getState().setLoading(false);
      }
    };

    initAuth();
  }, []);

  // Wrapper functions that include navigation
  const loginWithNavigate = async (email: string, password: string) => {
    await login(email, password);
    // Navigate based on onboarding status and org membership
    const u = useUserStore.getState().user;
    setTimeout(() => {
      if (u?.onboardingCompleted === false) {
        navigate('/onboarding');
      } else if (u?.organizationId) {
        // Has an org - go to org-scoped templates
        navigate(`/o/${u.organizationId}/templates`);
      } else {
        // Legacy user or no org - go to onboarding
        navigate('/onboarding');
      }
    }, 300);
  };

  const registerWithNavigate = async (
    firstName: string,
    lastName: string,
    email: string,
    password: string
  ) => {
    await register(firstName, lastName, email, password);
    // Navigate to onboarding after successful registration (new users always have onboardingCompleted === false)
    setTimeout(() => {
      navigate('/onboarding');
    }, 300);
  };

  const logoutWithNavigate = async () => {
    await logout();
    // Navigate to login after successful logout
    navigate('/login');
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    error,
    login: loginWithNavigate,
    register: registerWithNavigate,
    logout: logoutWithNavigate,
    refreshUser,
    clearError,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
