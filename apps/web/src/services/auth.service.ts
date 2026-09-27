import apiClient from '../lib/api';
import {
  type RegisterDto,
  type LoginDto,
  type AuthResponse,
  type TokensResponse,
  type MessageResponse,
  type PermissionsResponse,
} from '../types/auth';

class AuthService {
  /**
   * Register new user
   */
  async register(data: RegisterDto): Promise<AuthResponse> {
    const response = await apiClient.post('/auth/register', data);
    const responseData = response.data;

    // Map roleIds to roles for consistency
    if (responseData.user && responseData.user.roleIds) {
      return {
        user: {
          ...responseData.user,
          roles: responseData.user.roleIds,
        },
        tokens: responseData.tokens,
      };
    }

    return responseData;
  }

  /**
   * Login with email/password
   */
  async login(data: LoginDto): Promise<AuthResponse> {
    const response = await apiClient.post('/auth/login', data);
    const responseData = response.data;

    // Map roleIds to roles for consistency
    if (responseData.user && responseData.user.roleIds) {
      return {
        user: {
          ...responseData.user,
          roles: responseData.user.roleIds,
        },
        tokens: responseData.tokens,
      };
    }

    return responseData;
  }

  /**
   * Logout - revoke refresh token
   */
  async logout(): Promise<MessageResponse> {
    const response = await apiClient.post<MessageResponse>('/auth/logout');
    return response.data;
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<TokensResponse> {
    const response = await apiClient.post<TokensResponse>('/auth/refresh-token', { refreshToken });
    return response.data;
  }

  /**
   * Get current user with permissions
   */
  async getCurrentUser(): Promise<{ user: any; permissions: string[] }> {
    const response = await apiClient.get('/auth/me');
    const userData = response.data.user;

    // Map roleIds to roles for consistency
    if (userData && userData.roleIds) {
      return {
        user: {
          ...userData,
          roles: userData.roleIds,
        },
        permissions: userData.permissions || [],
      };
    }

    return {
      user: userData,
      permissions: userData.permissions || [],
    };
  }

  /**
   * Initiate password reset
   */
  async forgotPassword(email: string): Promise<MessageResponse> {
    const response = await apiClient.post<MessageResponse>('/auth/forgot-password', { email });
    return response.data;
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<MessageResponse> {
    const response = await apiClient.post<MessageResponse>('/auth/reset-password', {
      token,
      newPassword,
    });
    return response.data;
  }

  /**
   * Get all available permissions
   */
  async getPermissions(): Promise<PermissionsResponse> {
    const response = await apiClient.get<PermissionsResponse>('/auth/permissions');
    return response.data;
  }
}

export const authService = new AuthService();
