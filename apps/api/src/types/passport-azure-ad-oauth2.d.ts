declare module 'passport-azure-ad-oauth2' {
  import { Strategy } from 'passport';

  export interface IProfile {
    id: string;
    displayName: string;
    name?: {
      familyName: string;
      givenName: string;
    };
    emails?: Array<{ value: string }>;
    userPrincipalName?: string;
    mail?: string;
    picture?: string;
  }

  export interface VerifyCallback {
    (error: any, user?: any, info?: any): void;
  }

  export interface StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope?: string[];
    tenant?: string;
    passReqToCallback?: boolean;
  }

  export interface StrategyOptionsWithRequest extends StrategyOptions {
    passReqToCallback: true;
  }

  export class Strategy extends Strategy {
    constructor(
      options: StrategyOptions | StrategyOptionsWithRequest,
      verify?: (
        req: any,
        accessToken: string,
        refreshToken: string,
        profile: IProfile,
        done: VerifyCallback,
      ) => void,
    );
    constructor(
      options: StrategyOptions,
      verify?: (
        accessToken: string,
        refreshToken: string,
        profile: IProfile,
        done: VerifyCallback,
      ) => void,
    );
  }

  export const Strategy: typeof Strategy;
}
