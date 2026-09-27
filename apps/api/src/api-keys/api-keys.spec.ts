import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import { DEFAULT_THEME } from '../pdf-render/lib/flow-layout';
import { ApiKeysModule } from './api-keys.module';
import { ApiKey } from './schemas/api-key.schema';
import { PermissionsModule } from '../access-control/permissions.module';
import { PermissionsService } from '../access-control/permissions.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { AuthService } from '../auth/auth.service';
import { TemplatesController } from '../templates/templates.controller';
import { TemplatesService } from '../templates/templates.service';
import { PdfRenderService } from '../pdf-render/pdf-render.service';
import { FlowRenderService } from '../pdf-render/flow-render.service';
import { Organization } from '../organizations/schemas/organization.schema';
import { Template } from '../templates/schemas/template.schema';
import { Member } from '../members/schemas/member.schema';
import { Role } from '../roles/schemas/role.schema';
import { User } from '../users/schemas/user.schema';
import type { ApiKeySummary } from './api-key.types';
import type { CreateApiKeyDto } from './dto/create-api-key.dto';

jest.mock('../pdf-render/pdf-render.service', () => ({
  PdfRenderService: class {},
}));
jest.mock('../pdf-render/flow-render.service', () => ({
  FlowRenderService: class {},
}));

const org = '111111111111111111111111';
const otherOrg = '222222222222222222222222';
const templateId = '333333333333333333333333';
const otherTemplate = '444444444444444444444444';
const owner = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const admin = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const member = 'cccccccccccccccccccccccc';
const base = `/organizations/${org}`;
type StoredKey = ApiKey & { _id: Types.ObjectId };
type KeyFilter = {
  _id?: Types.ObjectId;
  organizationId?: Types.ObjectId;
  prefix?: string;
  revokedAt?: null;
};
const rows: StoredKey[] = [];
const matches = (row: StoredKey, filter: KeyFilter) =>
  (!filter._id || row._id.equals(filter._id)) &&
  (!filter.organizationId ||
    row.organizationId.equals(filter.organizationId)) &&
  (!filter.prefix || row.prefix === filter.prefix) &&
  (filter.revokedAt !== null || row.revokedAt === null);
interface TestQuery<T> {
  exec: () => Promise<T>;
  select: () => TestQuery<T>;
  sort: () => TestQuery<T>;
  populate: () => TestQuery<T>;
  skip: () => TestQuery<T>;
  limit: () => TestQuery<T>;
}
function query<T>(value: T): TestQuery<T> {
  const result: TestQuery<T> = {
    exec: () => Promise.resolve(value),
    select: () => result,
    sort: () => result,
    populate: () => result,
    skip: () => result,
    limit: () => result,
  };
  return result;
}
const keysModel = {
  create: jest.fn((data: Partial<StoredKey>) => {
    const row = {
      ...data,
      _id: new Types.ObjectId(),
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
      revokedByUserId: null,
    } as StoredKey;
    rows.push(row);
    return Promise.resolve(row);
  }),
  find: jest.fn((filter: KeyFilter) =>
    query(rows.filter((row) => matches(row, filter))),
  ),
  findOne: jest.fn((filter: KeyFilter) =>
    query(rows.find((row) => matches(row, filter)) ?? null),
  ),
  findOneAndUpdate: jest.fn(
    (filter: KeyFilter, update: { $set: Partial<StoredKey> }) => {
      const row = rows.find((item) => matches(item, filter));
      if (row) Object.assign(row, update.$set);
      return query(row ?? null);
    },
  ),
  updateOne: jest.fn(
    (filter: KeyFilter, update: { $max: { lastUsedAt: Date } }) => {
      const row = rows.find((item) => matches(item, filter));
      if (row) row.lastUsedAt = update.$max.lastUsedAt;
      return query({ modifiedCount: row ? 1 : 0 });
    },
  ),
};
const organizationExists = (filter: {
  _id: Types.ObjectId;
  createdBy?: Types.ObjectId;
}): Promise<{ _id: string } | null> =>
  Promise.resolve(
    !filter.createdBy ||
      (filter._id.toString() === org && filter.createdBy.toString() === owner)
      ? { _id: filter._id.toString() }
      : null,
  );
const organizationsModel = { exists: jest.fn(organizationExists) };
const permissions = {
  isOrgOwner: jest.fn((userId: string, organizationId: string) =>
    Promise.resolve(userId === owner && organizationId === org),
  ),
  getMember: jest.fn((userId: string, organizationId: string) =>
    Promise.resolve(
      organizationId === org
        ? { roleIds: [{ systemKey: userId === admin ? 'admin' : 'member' }] }
        : null,
    ),
  ),
  hasAnyPermission: jest.fn((_userId: string, organizationId: string) =>
    Promise.resolve(organizationId === org),
  ),
};
const renderTemplate = {
  name: 'Invoice',
  canvas: { size: { width: 595, height: 842 }, components: [] },
  fields: [],
  groups: [],
};
const templateRows = [templateId, otherTemplate].map((id) => ({
  ...renderTemplate,
  _id: new Types.ObjectId(id),
  organizationId: new Types.ObjectId(org),
  name: 'Invoice',
  kind: 'form',
  version: 'v1.0',
  versions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  canvas: { size: { width: 595, height: 842 }, components: [] },
  fields: [],
  groups: [],
  toObject: () => renderTemplate,
}));
type TemplateFilter = {
  organizationId: Types.ObjectId;
  _id?: Types.ObjectId | { $in: Types.ObjectId[] };
};
const selectTemplates = (filter: TemplateFilter) =>
  templateRows.filter(
    (row) =>
      row.organizationId.equals(filter.organizationId) &&
      (!filter._id ||
        ('\u0024in' in filter._id
          ? filter._id.$in.some((id) => id.equals(row._id))
          : row._id.equals(filter._id))),
  );
const templatesModel = {
  find: jest.fn((filter: TemplateFilter) => query(selectTemplates(filter))),
  findOne: jest.fn((filter: TemplateFilter) =>
    query(selectTemplates(filter)[0] ?? null),
  ),
  countDocuments: jest.fn((filter: TemplateFilter) =>
    Promise.resolve(selectTemplates(filter).length),
  ),
};
const renderer = {
  render: jest.fn(() => Promise.resolve(Buffer.from('%PDF-test'))),
};

describe('organization API keys over HTTP', () => {
  let app: INestApplication<Server>;
  const jwt = new JwtService({
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  });
  const bearer = (userId = owner) =>
    `Bearer ${jwt.sign({ sub: userId, email: 'test@example.com' })}`;
  const input: CreateApiKeyDto = {
    name: 'CRM',
    permissions: ['template:read', 'template:generate'],
  };
  const authService = {
    validateUser: jest.fn(() => Promise.resolve({ isActive: true })),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule, PermissionsModule, ApiKeysModule],
      controllers: [TemplatesController],
      providers: [
        TemplatesService,
        JwtStrategy,
        { provide: getModelToken(Template.name), useValue: templatesModel },
        { provide: AuthService, useValue: authService },
        { provide: PdfRenderService, useValue: renderer },
        { provide: FlowRenderService, useValue: renderer },
      ],
    })
      .overrideProvider(getModelToken(ApiKey.name))
      .useValue(keysModel)
      .overrideProvider(getModelToken(Organization.name))
      .useValue(organizationsModel)
      .overrideProvider(getModelToken(Template.name))
      .useValue(templatesModel)
      .overrideProvider(getModelToken(User.name))
      .useValue({})
      .overrideProvider(getModelToken(Member.name))
      .useValue({})
      .overrideProvider(getModelToken(Role.name))
      .useValue({})
      .overrideProvider(PermissionsService)
      .useValue(permissions)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });
  beforeEach(() => {
    rows.length = 0;
    jest.clearAllMocks();
    organizationsModel.exists.mockImplementation(organizationExists);
    permissions.getMember.mockImplementation((userId, organizationId) =>
      Promise.resolve(
        organizationId === org
          ? { roleIds: [{ systemKey: userId === admin ? 'admin' : 'member' }] }
          : null,
      ),
    );
  });
  afterAll(async () => {
    await app?.close();
  });
  const create = async (
    overrides: Partial<CreateApiKeyDto> = {},
    userId = owner,
  ) => {
    const response = await request(app.getHttpServer())
      .post(`${base}/api-keys`)
      .set('Authorization', bearer(userId))
      .send({ ...input, ...overrides })
      .expect(201);
    return response.body as { key: ApiKeySummary; secret: string };
  };

  it('creates for an owner, returns the secret once, and persists only its hash', async () => {
    const response = await request(app.getHttpServer())
      .post(`${base}/api-keys`)
      .set('Authorization', bearer())
      .send(input)
      .expect(201);
    const result = response.body as { key: ApiKeySummary; secret: string };
    expect(response.headers['cache-control']).toBe('no-store');
    expect(result.secret).toMatch(/^tdk_[a-f\d]{16}_[A-Za-z\d_-]{43}$/);
    expect(rows[0].keyHash).toBe(
      createHash('sha256').update(result.secret).digest('hex'),
    );
    expect(JSON.stringify(rows)).not.toContain(result.secret);
    expect(result.key.createdByUserId).toBe(owner);
    expect(
      new Date(result.key.expiresAt!).getTime() - Date.now(),
    ).toBeGreaterThan(89 * 86400000);
    const list = await request(app.getHttpServer())
      .get(`${base}/api-keys`)
      .set('Authorization', bearer())
      .expect(200);
    expect(JSON.stringify(list.body)).not.toContain(result.secret);
    expect(JSON.stringify(list.body)).not.toContain('keyHash');
    expect((list.body as { keys: ApiKeySummary[] }).keys).toHaveLength(1);
  });

  it('lets an active admin create keys but denies members, outsiders, and anonymous callers', async () => {
    await create({}, admin);
    for (const method of ['get', 'post'] as const) {
      await request(app.getHttpServer())
        [method](`${base}/api-keys`)
        .set('Authorization', bearer(member))
        .send(method === 'post' ? input : undefined)
        .expect(403);
      await request(app.getHttpServer())
        [method](`${base}/api-keys`)
        .expect(401);
    }
    await request(app.getHttpServer())
      .post(`/organizations/${otherOrg}/api-keys`)
      .set('Authorization', bearer(admin))
      .send(input)
      .expect(403);
    permissions.getMember.mockResolvedValue(null);
    await request(app.getHttpServer())
      .post(`${base}/api-keys`)
      .set('Authorization', bearer(admin))
      .send(input)
      .expect(403);
  });

  it('authenticates without a user session and keeps the key independent of its creator', async () => {
    const result = await create({}, admin);
    permissions.getMember.mockResolvedValue(null);
    const pdf = await request(app.getHttpServer())
      .post(`${base}/templates/${templateId}/generate-pdf`)
      .set('Authorization', `Bearer ${result.secret}`)
      .send({ values: {} })
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(renderer.render).toHaveBeenCalled();
    expect(rows[0].lastUsedAt).toBeInstanceOf(Date);
    expect(authService.validateUser).toHaveBeenCalledTimes(1); // Creation only.
  });

  it('enforces permissions, template restrictions, and organization boundaries on every route', async () => {
    const { secret } = await create({
      permissions: ['template:read'],
      templateIds: [templateId],
      expiresAt: null,
    });
    const auth = `Bearer ${secret}`;
    await request(app.getHttpServer())
      .get(`${base}/templates/${templateId}`)
      .set('Authorization', auth)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/templates/${templateId}/versions`)
      .set('Authorization', auth)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/templates/${templateId}/versions/v1.0`)
      .set('Authorization', auth)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/templates/${otherTemplate}`)
      .set('Authorization', auth)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${base}/templates/${templateId}/generate-pdf`)
      .set('Authorization', auth)
      .send({ values: {} })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/organizations/${otherOrg}/templates/${templateId}`)
      .set('Authorization', auth)
      .expect(403);
    for (const path of ['categories', 'tags'])
      await request(app.getHttpServer())
        .get(`${base}/templates/${path}`)
        .set('Authorization', auth)
        .expect(403);
    await request(app.getHttpServer())
      .put(`${base}/templates/${templateId}`)
      .set('Authorization', auth)
      .send({ name: 'Injected' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`${base}/templates/${templateId}`)
      .set('Authorization', auth)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${base}/templates`)
      .set('Authorization', auth)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`${base}/templates/${templateId}/fill`)
      .set('Authorization', auth)
      .expect(403);
    expect(rows[0].expiresAt).toBeNull();
  });

  it('filters template lists and counts before pagination, ignoring caller-supplied template IDs', async () => {
    const { secret } = await create({ templateIds: [templateId] });
    const response = await request(app.getHttpServer())
      .get(`${base}/templates?templateIds=${otherTemplate}`)
      .set('Authorization', `Bearer ${secret}`)
      .expect(200);
    const body = response.body as {
      templates: { _id: string }[];
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.templates.map((item) => item._id)).toEqual([templateId]);
    expect(templatesModel.countDocuments).toHaveBeenLastCalledWith({
      organizationId: new Types.ObjectId(org),
      _id: { $in: [new Types.ObjectId(templateId)] },
    });
  });

  it('allows generation-only keys without granting template reads', async () => {
    const { secret } = await create({ permissions: ['template:generate'] });
    await request(app.getHttpServer())
      .post(`${base}/templates/${templateId}/generate-pdf`)
      .set('Authorization', `Bearer ${secret}`)
      .send({ values: {} })
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/templates/${templateId}`)
      .set('Authorization', `Bearer ${secret}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${base}/templates`)
      .set('Authorization', `Bearer ${secret}`)
      .expect(403);
  });

  it('supports composable generation and validation with the same scoped key', async () => {
    Object.assign(templateRows[1], {
      kind: 'document',
      documentConfig: {
        format: 'document',
        pageSize: 'A4',
        theme: DEFAULT_THEME,
        allowedBlocks: ['paragraph'],
      },
    });
    const { secret } = await create({
      permissions: ['template:generate'],
      templateIds: [otherTemplate],
    });
    const blocks = [
      { id: 'text', type: 'paragraph', inputs: { text: 'Hello from the API' } },
    ];
    await request(app.getHttpServer())
      .post(`${base}/templates/${otherTemplate}/validate`)
      .set('Authorization', `Bearer ${secret}`)
      .send({ blocks })
      .expect((response) => {
        expect(response.body).toEqual({ ok: true, errors: [] });
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`${base}/templates/${otherTemplate}/generate`)
      .set('Authorization', `Bearer ${secret}`)
      .send({ blocks })
      .expect(200);
    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({ blocks }),
    );
  });

  it("revokes immediately and cannot revoke another organization's key", async () => {
    const { key, secret } = await create();
    const revokeUrl = `${base}/api-keys/${key.id}/revoke`;
    await request(app.getHttpServer())
      .post(revokeUrl)
      .set('Authorization', bearer(member))
      .expect(403);
    await request(app.getHttpServer())
      .post(`${base}/api-keys/${new Types.ObjectId().toString()}/revoke`)
      .set('Authorization', bearer())
      .expect(404);
    const revoked = await request(app.getHttpServer())
      .post(revokeUrl)
      .set('Authorization', bearer())
      .expect(200);
    const repeated = await request(app.getHttpServer())
      .post(revokeUrl)
      .set('Authorization', bearer(admin))
      .expect(200);
    expect((repeated.body as ApiKeySummary).revokedByUserId).toBe(owner);
    expect((repeated.body as ApiKeySummary).revokedAt).toBe(
      (revoked.body as ApiKeySummary).revokedAt,
    );
    await request(app.getHttpServer())
      .get(`${base}/templates`)
      .set('Authorization', `Bearer ${secret}`)
      .expect(401);
    const otherKey = await create();
    rows[1].organizationId = new Types.ObjectId(otherOrg);
    await request(app.getHttpServer())
      .post(`${base}/api-keys/${otherKey.key.id}/revoke`)
      .set('Authorization', bearer())
      .expect(404);
  });

  it('rejects expired, invalid, and deleted-organization keys without falling back to cookies', async () => {
    const { secret } = await create();
    const cookie = `accessToken=${jwt.sign({ sub: owner })}`;
    const tokens = [
      'tdk_invalid',
      `${secret}extra`,
      `${secret.slice(0, -1)}${secret.endsWith('A') ? 'B' : 'A'}`,
    ];
    for (const token of tokens)
      await request(app.getHttpServer())
        .get(`${base}/templates`)
        .set('Authorization', `bearer ${token}`)
        .set('Cookie', cookie)
        .expect(401);
    rows[0].expiresAt = new Date(Date.now() - 1);
    await request(app.getHttpServer())
      .get(`${base}/templates`)
      .set('Authorization', `Bearer ${secret}`)
      .expect(401);
    rows[0].expiresAt = null;
    organizationsModel.exists.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get(`${base}/templates`)
      .set('Authorization', `Bearer ${secret}`)
      .expect(401);
  });

  it('never lets API keys manage keys, even with a valid session cookie', async () => {
    const { key, secret } = await create();
    const cookie = `accessToken=${jwt.sign({ sub: owner })}`;
    for (const auth of [
      `Bearer ${secret}`,
      `bearer ${secret}`,
      'invalid credentials',
    ]) {
      await request(app.getHttpServer())
        .get(`${base}/api-keys`)
        .set('Authorization', auth)
        .set('Cookie', cookie)
        .expect(401);
      await request(app.getHttpServer())
        .post(`${base}/api-keys`)
        .set('Authorization', auth)
        .set('Cookie', cookie)
        .send(input)
        .expect(401);
      await request(app.getHttpServer())
        .post(`${base}/api-keys/${key.id}/revoke`)
        .set('Authorization', auth)
        .set('Cookie', cookie)
        .expect(401);
    }
    await request(app.getHttpServer())
      .get(`${base}/api-keys`)
      .set('Cookie', cookie)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/templates/${templateId}`)
      .set('Cookie', cookie)
      .expect(200);
  });

  it.each([
    { name: '   ' },
    { permissions: [] },
    { permissions: ['organization:delete'] },
    { permissions: ['template:read', 'template:read'] },
    { templateIds: [] },
    { templateIds: null },
    { templateIds: [otherOrg] },
    { templateIds: ['bad-id'] },
    { expiresAt: 'invalid' },
    { expiresAt: '2020-01-01T00:00:00.000Z' },
    { organizationId: otherOrg },
    { createdByUserId: admin },
  ])(
    'rejects malformed or unauthorized creation fields: %j',
    async (override) => {
      await request(app.getHttpServer())
        .post(`${base}/api-keys`)
        .set('Authorization', bearer())
        .send({ ...input, ...override })
        .expect(400);
      expect(rows).toHaveLength(0);
    },
  );
});
