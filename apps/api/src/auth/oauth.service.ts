import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import type { AuthTokens } from './auth.service';

@Injectable()
export class OAuthService {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {}

  /**
   * Get Google OAuth configuration
   */
  getGoogleConfig() {
    return {
      clientId: this.configService.get('GOOGLE_CLIENT_ID'),
      clientSecret: this.configService.get('GOOGLE_CLIENT_SECRET'),
      callbackURL: `${this.configService.get('API_URL')}/api/auth/google/callback`,
      scope: ['email', 'profile'],
    };
  }

  /**
   * Get Microsoft OAuth configuration
   */
  getMicrosoftConfig() {
    return {
      clientId: this.configService.get('MICROSOFT_CLIENT_ID'),
      clientSecret: this.configService.get('MICROSOFT_CLIENT_SECRET'),
      callbackURL: `${this.configService.get('API_URL')}/api/auth/microsoft/callback`,
      scope: ['User.Read'],
      tenant: 'common',
    };
  }

  /**
   * Get GitHub OAuth configuration (optional)
   */
  getGitHubConfig() {
    return {
      clientId: this.configService.get('GITHUB_CLIENT_ID'),
      clientSecret: this.configService.get('GITHUB_CLIENT_SECRET'),
      callbackURL: `${this.configService.get('API_URL')}/api/auth/github/callback`,
      scope: ['user:email'],
    };
  }

  /**
   * Normalize OAuth profile to standard format
   */
  normalizeProfile(provider: 'google' | 'microsoft' | 'github', profile: any) {
    switch (provider) {
      case 'google':
        return {
          email: profile.emails?.[0]?.value || profile.email,
          firstName: profile.given_name || profile.name?.givenName || '',
          lastName: profile.family_name || profile.name?.familyName || '',
          avatar: profile.picture || profile.image?.url,
          provider: 'google' as const,
          providerAccountId: profile.sub || profile.id,
        };
      case 'microsoft':
        return {
          email: profile.userPrincipalName || profile.mail || profile.email,
          firstName:
            profile.givenName || profile.displayName?.split(' ')[0] || '',
          lastName:
            profile.surname ||
            profile.displayName?.split(' ').slice(-1)[0] ||
            '',
          avatar: profile.picture || profile.avatarUrl,
          provider: 'microsoft' as const,
          providerAccountId: profile.id,
        };
      case 'github':
        return {
          email: profile.emails?.[0]?.value || profile.email,
          firstName: profile.name?.split(' ')[0] || profile.login || '',
          lastName: profile.name?.split(' ').slice(-1)[0] || '',
          avatar: profile.avatar_url || profile.avatar,
          provider: 'github' as const,
          providerAccountId: profile.id.toString(),
        };
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Handle OAuth login/register
   */
  async handleOAuth(provider: 'google' | 'microsoft' | 'github', profile: any) {
    const normalizedProfile = this.normalizeProfile(provider, profile);
    return this.authService.oauthLogin(normalizedProfile);
  }
}
