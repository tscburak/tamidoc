import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  // bodyParser: false → we register our own json/urlencoded parsers below with a
  // raised limit (templates embed images as base64 data URLs, which exceed the
  // default 100kb). Disabling the built-in parser avoids a double-parse.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);

  // Enable cookie parser
  app.use(cookieParser());

  // Raised body-parser limit: templates embed images as base64 data URLs
  // (logos, signatures, page backgrounds), which easily exceed the default
  // 100kb. 10mb comfortably fits a multi-image document while staying sane.
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));

  // Global prefix
  app.setGlobalPrefix(configService.get('API_PREFIX', 'api'));

  // Enable versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(new ResponseInterceptor());

  // CORS
  app.enableCors({
    origin: configService.get('FRONTEND_URL', 'http://localhost:5173'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Swagger documentation
  if (configService.get('NODE_ENV') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Tamidoc API')
      .setDescription('Document Infrastructure Platform API')
      .setVersion('1.0')
      .addTag('health', 'Health check endpoints')
      .addTag('templates', 'Template management endpoints')
      .addTag('documents', 'Document management endpoints')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    console.log(
      `📚 API Documentation: http://localhost:${configService.get('PORT', 3000)}/api/docs`,
    );
  }

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  console.log(
    `🚀 Backend server running on: http://localhost:${port}/${configService.get('API_PREFIX', 'api')}`,
  );
  console.log(
    `🏥 Health check: http://localhost:${port}/${configService.get('API_PREFIX', 'api')}/health`,
  );
}
bootstrap();
