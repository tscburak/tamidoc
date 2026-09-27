import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { Organization } from '../organizations/schemas/organization.schema';
import { Template } from '../templates/schemas/template.schema';
import { PermissionsService } from '../access-control/permissions.service';
import type { Role } from '../roles/schemas/role.schema';
import { ApiKey, type ApiKeyDocument } from './schemas/api-key.schema';
import type { ApiKeyPrincipal, ApiKeySummary } from './api-key.types';
import type { CreateApiKeyDto } from './dto/create-api-key.dto';

const objectId = (value: string): Types.ObjectId => {
  if (!/^[a-f\d]{24}$/i.test(value))
    throw new BadRequestException('Invalid resource ID');
  return new Types.ObjectId(value);
};
const hashKey = (value: string) => createHash('sha256').update(value).digest();

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectModel(ApiKey.name) private readonly keys: Model<ApiKey>,
    @InjectModel(Organization.name)
    private readonly organizations: Model<Organization>,
    @InjectModel(Template.name) private readonly templates: Model<Template>,
    private readonly permissions: PermissionsService,
  ) {}

  async canManage(userId: string, organizationId: string): Promise<boolean> {
    if (
      await this.organizations.exists({
        _id: objectId(organizationId),
        createdBy: objectId(userId),
      })
    )
      return true;
    const member = await this.permissions.getMember(userId, organizationId);
    return (
      !!member &&
      (member.roleIds as unknown as Role[]).some(
        (role) => role?.systemKey === 'admin' || role?.systemKey === 'owner',
      )
    );
  }

  /** Explicit projection also prevents a newly created document's hash leaking. */
  private summary(key: ApiKeyDocument): ApiKeySummary {
    return {
      id: key._id.toString(),
      organizationId: key.organizationId.toString(),
      name: key.name,
      prefix: key.prefix,
      permissions: [...key.permissions],
      templateIds: key.templateIds?.map((id) => id.toString()),
      createdByUserId: key.createdByUserId.toString(),
      createdAt: key.createdAt,
      expiresAt: key.expiresAt ?? null,
      lastUsedAt: key.lastUsedAt ?? null,
      revokedAt: key.revokedAt ?? null,
      revokedByUserId: key.revokedByUserId?.toString() ?? null,
    };
  }

  async list(organizationId: string): Promise<ApiKeySummary[]> {
    const keys = await this.keys
      .find({ organizationId: objectId(organizationId) })
      .sort({ createdAt: -1 })
      .exec();
    return keys.map((key) => this.summary(key));
  }

  async create(organizationId: string, userId: string, dto: CreateApiKeyDto) {
    const orgId = objectId(organizationId);
    if (!(await this.organizations.exists({ _id: orgId })))
      throw new NotFoundException('Organization not found');
    const expiresAt =
      dto.expiresAt === null
        ? null
        : dto.expiresAt === undefined
          ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
          : new Date(dto.expiresAt);
    if (
      expiresAt &&
      (!Number.isFinite(expiresAt.getTime()) ||
        expiresAt.getTime() <= Date.now())
    ) {
      throw new BadRequestException('Expiration must be in the future');
    }
    const templateIds = dto.templateIds?.map(objectId);
    if (templateIds) {
      const count = await this.templates.countDocuments({
        organizationId: orgId,
        _id: { $in: templateIds },
      });
      if (count !== templateIds.length || !templateIds.length)
        throw new BadRequestException(
          'Every selected template must belong to this organization',
        );
    }
    const prefix = `tdk_${randomBytes(8).toString('hex')}`;
    const secret = `${prefix}_${randomBytes(32).toString('base64url')}`;
    const key = await this.keys.create({
      organizationId: orgId,
      createdByUserId: objectId(userId),
      name: dto.name,
      prefix,
      keyHash: hashKey(secret).toString('hex'),
      permissions: dto.permissions,
      templateIds,
      expiresAt,
    });
    return { key: this.summary(key), secret };
  }

  async revoke(
    organizationId: string,
    id: string,
    userId: string,
  ): Promise<ApiKeySummary> {
    const filter = {
      _id: objectId(id),
      organizationId: objectId(organizationId),
    };
    const key = await this.keys
      .findOneAndUpdate(
        { ...filter, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedByUserId: objectId(userId) } },
        { new: true },
      )
      .exec();
    // Revocation is idempotent and retains the original actor/timestamp.
    const existing = key ?? (await this.keys.findOne(filter).exec());
    if (!existing) throw new NotFoundException('API key not found');
    return this.summary(existing);
  }

  async authenticate(secret: string): Promise<ApiKeyPrincipal> {
    if (!/^tdk_[a-f\d]{16}_[A-Za-z\d_-]{43}$/.test(secret))
      throw new UnauthorizedException('Invalid API key');
    const prefix = secret.slice(0, 20);
    const key = await this.keys
      .findOne({ prefix, revokedAt: null })
      .select('+keyHash')
      .exec();
    if (!key || (key.expiresAt && key.expiresAt.getTime() <= Date.now()))
      throw new UnauthorizedException('Invalid or expired API key');
    const storedHash = Buffer.from(key.keyHash, 'hex');
    const receivedHash = hashKey(secret);
    if (
      storedHash.length !== receivedHash.length ||
      !timingSafeEqual(storedHash, receivedHash)
    )
      throw new UnauthorizedException('Invalid API key');
    if (!(await this.organizations.exists({ _id: key.organizationId })))
      throw new UnauthorizedException('Invalid API key');
    return {
      id: key._id.toString(),
      organizationId: key.organizationId.toString(),
      permissions: [...key.permissions],
      templateIds: key.templateIds?.map((id) => id.toString()),
    };
  }

  async recordUsage(id: string): Promise<void> {
    await this.keys
      .updateOne(
        { _id: objectId(id), revokedAt: null },
        { $max: { lastUsedAt: new Date() } },
      )
      .exec();
  }
}
