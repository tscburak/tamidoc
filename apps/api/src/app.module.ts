import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { StorageModule } from './storage/storage.module';
import { PdfImportModule } from './pdf-import/pdf-import.module';
import { TemplatesModule } from './templates/templates.module';
import { FormsModule } from './forms/forms.module';
import { StackFormsModule } from './stack-forms/stack-forms.module';
import { PermissionsModule } from './access-control/permissions.module';
import { TagsModule } from './tags/tags.module';
import { EditionModule } from './edition/edition.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get(
          'MONGODB_URI',
          'mongodb://localhost:27017/tamidoc',
        ),
      }),
    }),
    // Throttler config is registered globally, but the guard is applied
    // per-controller (no APP_GUARD) so existing authenticated routes are
    // unaffected. The public forms controller applies ThrottlerGuard itself.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    HealthModule,
    AuthModule,
    UsersModule,
    PermissionsModule,
    EditionModule,
    OrganizationsModule,
    StorageModule,
    PdfImportModule,
    TemplatesModule,
    FormsModule,
    StackFormsModule,
    TagsModule,
    ...EditionModule.privateModules(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
