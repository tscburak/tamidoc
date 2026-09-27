# Tamidoc Community

Tamidoc Community is the open-source, self-hosted core for creating PDF documents from templates and forms. It is licensed under Apache-2.0. Enterprise modules are not included in this repository.

## Features

- Template designer, `{{token}}` support, JSON document schema, form creation, and filling
- PDF generation and basic template versioning
- REST API, API keys, and basic public form links
- PDF import and optional AI field detection
- Accounts, basic workspaces, and fixed Owner/Admin/Member roles

The SDK, general-purpose import/export, plugin API, and backup tools are not yet complete features. The Enterprise edition has separate private modules for custom role and member management, with enterprise SSO, workflows, audit, and governance planned. Community is the shared core used by Enterprise.

The API is in `apps/api`, and the React web app is in `apps/web`.

## Local development

For development without Docker, you need Node.js 22+, npm, MongoDB, and an S3-compatible object store for file uploads. The Docker setup below starts both storage services.

```bash
cp apps/api/.env.example apps/api/.env
# Set MONGODB_URI, JWT_SECRET, and the S3 settings in apps/api/.env
cd apps/api && npm ci && npm run start:dev
```

In another terminal:

```bash
cd apps/web && npm ci && npm run dev
```

The API is under `/api/v1`. In development, Swagger is available at `/api/docs`. `GET /api/v1/edition` lists active Community capabilities.

## Run with Docker

This file becomes the root `README.md` in the Community export. The exported repository also has `docker-compose.yml` at its root. Compose starts MongoDB and RustFS and automatically creates the `tamidoc` bucket. You do not need to install a separate S3 service.

```bash
cp .env.example .env
# Replace JWT_SECRET and S3_SECRET_ACCESS_KEY in .env
docker compose up -d --build
```

The default app URL is `http://localhost:8080`. Docker volumes persist MongoDB and RustFS data. RustFS is accessible only on the Compose network.

## License and contributions

The source code is distributed under [Apache-2.0](LICENSE). Third-party fonts and other assets retain their own licenses. See [CONTRIBUTING.md](CONTRIBUTING.md) to contribute. Code accepted into Community may also be included in Enterprise, which uses the same open core.
# tamidoc
