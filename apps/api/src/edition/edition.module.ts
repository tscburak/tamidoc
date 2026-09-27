import { Module, type DynamicModule, type Type } from '@nestjs/common';
import { EditionController } from './edition.controller';

/**
 * The Community build has no compile-time dependency on private modules.
 * A private Enterprise build supplies this module at the same path. A public
 * source export omits it, so changing an environment variable cannot unlock
 * Enterprise code in the Community distribution.
 */
@Module({ controllers: [EditionController] })
export class EditionModule {
  static privateModules(): Array<DynamicModule | Type<unknown>> {
    if (process.env.TAMIDOC_EDITION !== 'enterprise') return [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { EnterpriseModule } = require('../enterprise/enterprise.module') as {
        EnterpriseModule: Type<unknown>;
      };
      return [EnterpriseModule];
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'MODULE_NOT_FOUND' ||
        !error.message.includes('../enterprise/enterprise.module')
      ) {
        throw error;
      }
      throw new Error(
        'Enterprise edition requested, but the private Enterprise package is not installed',
        { cause: error },
      );
    }
  }
}
