export type SubscriptionPlan = 'free' | 'pro' | 'enterprise';

export interface OrganizationResponse {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  website?: string;
  industry?: string;
  size?: string;
  logo?: string;
  plan: SubscriptionPlan;
  settings?: {
    branding?: {
      primaryColor?: string;
      accentColor?: string;
      font?: string;
      logo?: string;
      customDomain?: string;
    };
  };
  createdAt: string;
  updatedAt: string;
  // Other fields exist on the backend but aren't needed in the frontend yet
}

export interface CreateOrganizationDto {
  name: string;
  description?: string;
  website?: string;
  industry?: string;
  size?: string;
  brandColor?: string;
  accentColor?: string;
  font?: string;
}

export interface CreateOrganizationResponse {
  organization: OrganizationResponse;
  user: any;
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}
