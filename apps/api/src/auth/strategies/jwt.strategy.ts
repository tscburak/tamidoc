import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';
import { AuthService } from '../auth.service';

// Custom extractor to check both cookies and Authorization header
const cookieExtractor = (req: Request) => {
  // Try to get from Authorization header first
  if (req.headers.authorization !== undefined) {
    // Explicit credentials must never fall back to a browser cookie on failure.
    return req.headers.authorization.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
  }
  const cookie: unknown = (req.cookies as Record<string, unknown> | undefined)
    ?.accessToken;
  return typeof cookie === 'string' ? cookie : null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    });
  }

  async validate(payload: any) {
    // Validate user still exists and is active
    const user = await this.authService.validateUser(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Return user info that will be available in @Request()
    return {
      userId: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
