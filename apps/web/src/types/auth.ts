// Authentication types matching backend DTOs

export interface RegisterDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

export interface TokensResponse {
  accessToken: string;
  refreshToken: string;
}

export interface UserResponse {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  organizationId?: string | null;
  roles: string[];
  emailVerified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Onboarding fields
  userType?: string;
  documentTypes?: string[];
  organizationSize?: string;
  occupation?: string;
  onboardingCompleted?: boolean;
  onboardingCompletedAt?: string;
}

export interface AuthResponse {
  user: UserResponse;
  tokens: TokensResponse;
}

export interface MessageResponse {
  message: string;
}

export interface AuthState {
  user: UserResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface Permission {
  resource: string;
  action: string;
  scope: string;
  description: string;
}

export interface PermissionsResponse {
  permissions: Permission[];
}
