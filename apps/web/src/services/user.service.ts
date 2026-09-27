import apiClient from '../lib/api';
import type { UserResponse } from '../types/auth';
import type { UpdateOnboardingDto } from '../types/onboarding';

class UserService {
  /**
   * Update user onboarding information
   */
  async updateOnboarding(data: UpdateOnboardingDto): Promise<{ user: UserResponse }> {
    const response = await apiClient.put('/users/me/onboarding', data);
    return response.data; // Envelope already unwrapped by interceptor
  }
}

export const userService = new UserService();
