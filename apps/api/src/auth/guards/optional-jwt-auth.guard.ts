import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Like JwtAuthGuard, but anonymous requests pass through with no user
 * attached. Used on public endpoints (e.g. invite preview) that want to
 * personalize the response *when* a session exists, while still serving
 * logged-out visitors.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(err: any, user: any): TUser {
    // Swallow missing/invalid-token errors: no user means anonymous.
    return user;
  }
}
