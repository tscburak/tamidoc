import axios, { AxiosError, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';
import type { AxiosInstance } from 'axios';
import { parseError } from '../utils/error-handler';
import { showSuccess } from '../utils/toast-provider';

// API base URL - adjust this to match your backend.
// Exported so asset URLs (e.g. organization logos served through the API)
// can be built from the same single source of truth as apiClient.
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// Extended config type for custom properties
interface ExtendedRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  // Marks a request that must NOT trigger a refresh attempt (e.g. the
  // /auth/refresh-token call itself) to avoid infinite 401 → refresh loops.
  _skipAuthRefresh?: boolean;
  _skipErrorNotification?: boolean;
  _skipSuccessNotification?: boolean;
  /** Prevent secrets returned once (such as newly created API keys) being logged. */
  _sensitive?: boolean;
}

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
  withCredentials: true, // Enable cookies
}) as AxiosInstance;

// Store toast function reference for error notifications
let toastFunction: any = null;

export function setToastFunction(toast: any) {
  toastFunction = toast;
}

// --- Silent access-token refresh (single-flight) ---
// The backend rotates the refresh token on every refresh (old token revoked,
// new one issued). If several requests 401 at the same time (e.g. on page
// load) and each fired its own refresh, only the first would succeed and the
// rest would hit a now-revoked token → forced logout. So we collapse all
// concurrent refresh attempts into a single in-flight promise.
let refreshPromise: Promise<void> | null = null;

function refreshAccessToken(): Promise<void> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = apiClient
    .post(
      '/auth/refresh-token',
      {},
      {
        _skipAuthRefresh: true,
        _skipSuccessNotification: true,
        _skipErrorNotification: true,
      } as ExtendedRequestConfig,
    )
    .then(() => {
      if (import.meta.env.DEV) {
        console.log('[API] Access token refreshed silently');
      }
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

// Called when a refresh fails (refresh token expired/revoked) — the session is
// genuinely over, so fall back to the login page. A no-op on public form pages,
// where the visitor is anonymous by design.
function handleSessionExpired() {
  const onPublicForm = window.location.pathname.startsWith('/f/');
  if (onPublicForm) return;

  if (toastFunction) {
    toastFunction.show({
      title: 'Session Expired',
      message: 'Your session has expired. Please log in again.',
      color: 'orange',
    });
  }

  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login';
  }
}

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Note: With httpOnly cookies, authentication is handled automatically by the browser
    // The server sets cookies and browser sends them with every request
    // We don't need to manually add Authorization header when using cookies

    // Log request in development
    if (import.meta.env.DEV && !(config as ExtendedRequestConfig)._sensitive) {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, config.data);
    }

    return config;
  },
  (error: AxiosError) => {
    if (toastFunction) {
      const appError = parseError(error);
      toastFunction.show({
        title: 'Request Error',
        message: appError.userMessage,
        color: 'red',
      });
    }
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh, success toasts, and errors
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    // Unwrap response data from ResponseInterceptor format { success: true, data: ..., statusCode: ... }
    if (response.data?.data !== undefined && response.data?.success === true) {
      response.data = response.data.data;
    }

    // Log response in development
    if (import.meta.env.DEV && !(response.config as ExtendedRequestConfig)._sensitive) {
      console.log(`[API] Response:`, response.data);
    }

    const method = response.config.method?.toUpperCase();
    const url = response.config.url || '';
    const extendedConfig = response.config as ExtendedRequestConfig;

    // Handle success notifications for auth endpoints
    if (url.includes('/auth/login') && method === 'POST') {
      showSuccess('Welcome back! You have been logged in successfully.');
    } else if (url.includes('/auth/register') && method === 'POST') {
      showSuccess('Account created successfully.');
    } else if (url.includes('/auth/logout') && method === 'POST') {
      showSuccess('You have been logged out successfully.');
    }
    // Handle success notifications for other modifying operations (not GET requests)
    else if (
      (method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH') &&
      !extendedConfig._skipSuccessNotification
    ) {
      let message = 'Operation completed successfully';

      // Customize message based on HTTP method
      if (method === 'POST') {
        message = 'Created successfully';
      } else if (method === 'PUT' || method === 'PATCH') {
        message = 'Updated successfully';
      } else if (method === 'DELETE') {
        message = 'Deleted successfully';
      }

      showSuccess(message);
    }

    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as ExtendedRequestConfig;
    const url = originalRequest.url || '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register');

    // If 401 during login/register (wrong credentials), show error immediately
    if (error.response?.status === 401 && isAuthEndpoint && !originalRequest._retry) {
      if (toastFunction) {
        toastFunction.show({
          title: 'Authentication Failed',
          message: 'Invalid email or password. Please try again.',
          color: 'red',
        });
      }
      return Promise.reject(error);
    }

    // Access token expired → silently refresh once (single-flight), then retry.
    // Skipped for login/register (wrong credentials) and for the refresh call
    // itself (avoid infinite loop). Concurrent 401s share one refresh promise.
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest._skipAuthRefresh &&
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;

      try {
        await refreshAccessToken();
        // A fresh access-token cookie was set automatically; replay the
        // original request so the caller never sees the 401.
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh token is also invalid/expired → the session is really over.
        handleSessionExpired();
        return Promise.reject(refreshError);
      }
    }

    // Show error toast for other errors (unless explicitly skipped)
    const shouldShowErrorToast =
      !originalRequest._skipErrorNotification && toastFunction;

    if (shouldShowErrorToast) {
      const appError = parseError(error);

      // Skip toast for 404s on optional endpoints
      if (error.response?.status !== 404) {
        toastFunction.show({
          title: appError.type === 'timeout' ? 'Request Timeout' : 'Request Failed',
          message: appError.userMessage,
          color: appError.type === 'validation' ? 'yellow' : 'red',
        });
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
