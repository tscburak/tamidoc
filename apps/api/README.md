# Tamidoc API

The Tamidoc backend uses NestJS and MongoDB. The Community entry point is `src/app.module.ts`. `TAMIDOC_EDITION=enterprise` loads Enterprise modules only in the private development repository; those modules are absent from the Community source export.

```bash
cp .env.example .env
# Set the MongoDB, JWT, and S3 settings
npm ci
npm run start:dev
```

By default, the API runs at `http://localhost:3001/api/v1`. In development, Swagger is available at `http://localhost:3001/api/docs`. `GET /api/v1/edition` lists the active capabilities.

Build with `npm run build`, start the production build with `npm run start:prod`, and run tests with `npm test`.

The Community distribution is licensed under Apache-2.0. Enterprise implementations remain proprietary.
