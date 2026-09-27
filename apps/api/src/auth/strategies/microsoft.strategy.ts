import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-azure-ad-oauth2';
import { ConfigService } from '@nestjs/config';
import { OAuthService } from '../oauth.service';

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  constructor(
    private configService: ConfigService,
    private oAuthService: OAuthService,
  ) {
    super({
      clientID: configService.get('MICROSOFT_CLIENT_ID') || '',
      clientSecret: configService.get('MICROSOFT_CLIENT_SECRET') || '',
      callbackURL: `${configService.get('API_URL', 'http://localhost:3001')}/api/auth/microsoft/callback`,
      tenant: 'common',
      scope: ['User.Read'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      const { user, tokens, isNewUser } = await this.oAuthService.handleOAuth(
        'microsoft',
        profile,
      );
      return done(null, { user, tokens, isNewUser });
    } catch (error) {
      return done(error, undefined);
    }
  }
}
