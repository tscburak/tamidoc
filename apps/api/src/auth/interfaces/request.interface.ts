import { Request } from 'express';

export interface IRequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
    organizationId?: string | null;
    roles: string[];
    permissions: string[];
  };
}
