import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiKey, ApiKeySchema } from './schemas/api-key.schema';
import {
  Organization,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import { Template, TemplateSchema } from '../templates/schemas/template.schema';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyManagementGuard } from './api-key-management.guard';
import { TemplateAuthGuard } from './template-auth.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApiKey.name, schema: ApiKeySchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: Template.name, schema: TemplateSchema },
    ]),
  ],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyManagementGuard, TemplateAuthGuard],
  exports: [TemplateAuthGuard, ApiKeysService],
})
export class ApiKeysModule {}
