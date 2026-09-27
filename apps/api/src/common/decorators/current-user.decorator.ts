import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserData {
  id: string;
  email: string;
  role?: string;
}

export const CurrentUser = createParamDecorator(
  (
    data: keyof CurrentUserData | undefined,
    ctx: ExecutionContext,
  ): CurrentUserData | string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserData | undefined;

    if (!user) {
      throw new Error('User not found in request');
    }

    if (data) {
      return user[data] as string;
    }

    return user;
  },
);
