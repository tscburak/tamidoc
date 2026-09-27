import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Template,
  TemplateDocument,
  TemplateVersion,
} from './schemas/template.schema';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(Template.name) private templateModel: Model<TemplateDocument>,
  ) {}

  /**
   * Create a new template for an organization
   */
  async create(
    organizationId: string,
    createTemplateDto: CreateTemplateDto,
    userId: string,
  ): Promise<Template> {
    if (createTemplateDto.allowedRoleIds?.length) {
      throw new BadRequestException('Role-based template access is not implemented');
    }
    // Generate initial version
    const version = `v1.0`;

    const kind = createTemplateDto.kind ?? 'form';
    if (kind === 'form' && !createTemplateDto.canvas) {
      throw new BadRequestException('Form templates require a canvas');
    }
    if (kind === 'document' && !createTemplateDto.documentConfig) {
      throw new BadRequestException(
        'Document templates require a documentConfig',
      );
    }

    const template = new this.templateModel({
      ...createTemplateDto,
      organizationId: new Types.ObjectId(organizationId),
      createdBy: new Types.ObjectId(userId),
      version,
      status: createTemplateDto.status || 'draft',
      fillCount: 0,
    });

    return template.save();
  }

  /**
   * Find all templates for an organization with optional filtering
   */
  async findAll(
    organizationId: string,
    filters: {
      status?: 'draft' | 'published' | 'archived';
      category?: string;
      tag?: string;
      search?: string;
      sortBy?: 'createdAt' | 'updatedAt' | 'name';
      sortOrder?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    } = {},
    allowedTemplateIds?: string[],
  ): Promise<{
    templates: Template[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      status,
      category,
      tag,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 25,
    } = filters;

    // Build query
    const query: any = {
      organizationId: new Types.ObjectId(organizationId),
    };
    // Supplied by the authenticated key, never from query parameters.
    // Apply before pagination/count so restricted keys cannot discover other templates.
    if (allowedTemplateIds !== undefined) {
      query._id = {
        $in: allowedTemplateIds.map((id) => new Types.ObjectId(id)),
      };
    }

    if (status) {
      query.status = status;
    }

    if (category) {
      query.category = category;
    }

    if (tag) {
      query.tags = tag;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Build sort
    const sort: any = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const skip = (page - 1) * limit;

    const [templates, total] = await Promise.all([
      this.templateModel
        .find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .exec(),
      this.templateModel.countDocuments(query),
    ]);

    return {
      templates,
      total,
      page,
      limit,
    };
  }

  /**
   * Find a single template by ID
   */
  async findOne(id: string, organizationId: string): Promise<Template> {
    const template = await this.templateModel
      .findOne({
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      })
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .exec();

    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    return template;
  }

  /**
   * Update a template
   */
  async update(
    id: string,
    organizationId: string,
    updateTemplateDto: UpdateTemplateDto,
    userId: string,
  ): Promise<Template> {
    if (updateTemplateDto.allowedRoleIds?.length) {
      throw new BadRequestException('Role-based template access is not implemented');
    }
    const template = await this.findOne(id, organizationId);

    // Always overwrite the current working copy. Versioning is explicit — use
    // createVersion to cut a snapshot; forms pin their own snapshot at publish,
    // so plain overwrites never break live documents.
    Object.assign(template, updateTemplateDto, {
      updatedBy: new Types.ObjectId(userId),
    });

    return template.save();
  }

  /** Bump `v{major}.{minor}` → `v{major}.{minor+1}`, tolerating malformed
   * version strings (falls back to v1.0). */
  private nextVersion(version: string): string {
    const [major = 1, minor = 0] = version
      .replace(/^v/i, '')
      .split('.')
      .map(Number);
    const m = Number.isFinite(major) ? major : 1;
    const n = Number.isFinite(minor) ? minor : 0;
    return `v${m}.${n + 1}`;
  }

  /**
   * Lean version-history list. Every archived snapshot plus the live working
   * copy (the current version), marked with isCurrent/isDefault.
   */
  async listVersions(
    id: string,
    organizationId: string,
  ): Promise<
    Array<{
      version: string;
      changeDescription?: string;
      isCurrent: boolean;
      isDefault: boolean;
      createdBy: Types.ObjectId | undefined;
      createdAt: Date;
    }>
  > {
    const template = await this.findOne(id, organizationId);

    const archived = template.versions.map((v) => ({
      version: v.version,
      changeDescription: v.changeDescription,
      isCurrent: false,
      isDefault: v.version === template.defaultVersion,
      createdBy: v.createdBy,
      createdAt: v.createdAt,
    }));

    // The live copy is the current version. Its metadata lives on the template
    // itself (versionDescription), since it isn't a snapshot entry.
    archived.push({
      version: template.version,
      changeDescription: template.versionDescription,
      isCurrent: true,
      isDefault: template.version === template.defaultVersion,
      createdBy: template.updatedBy ?? template.createdBy,
      createdAt: template.updatedAt ?? template.createdAt,
    });

    // Newest first (version strings are zero-padded-ish; sort by createdAt
    // falls back for the live copy whose timestamp is the latest).
    return archived.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  /**
   * Full snapshot of a specific version (canvas/groups/fields), for opening in
   * the designer. Works for both the live current version and archived entries.
   */
  async getVersion(id: string, organizationId: string, version: string) {
    const template = await this.findOne(id, organizationId);

    if (version === template.version) {
      return {
        version,
        changeDescription: template.versionDescription,
        canvas: template.canvas,
        groups: template.groups,
        fields: template.fields,
        kind: template.kind,
        format: template.format,
        documentConfig: template.documentConfig,
        blocks: template.blocks,
      };
    }

    const entry = template.versions.find((v) => v.version === version);
    if (!entry) {
      throw new NotFoundException(`Version ${version} not found`);
    }

    return {
      version: entry.version,
      changeDescription: entry.changeDescription,
      canvas: entry.canvas,
      groups: entry.groups,
      fields: entry.fields,
      kind: entry.kind,
      format: entry.format,
      documentConfig: entry.documentConfig,
      blocks: entry.blocks,
    };
  }

  /**
   * Explicitly cut a new version. The current working copy is snapshotted into
   * the history, the version is bumped, and the new version's content starts
   * from the requested source:
   *  - duplicate: copies `fromVersion` (or the current copy when omitted)
   *  - blank/pdf/ai: empty canvas (page size preserved), no groups/fields
   */
  async createVersion(
    id: string,
    organizationId: string,
    dto: {
      source: 'duplicate' | 'blank' | 'pdf' | 'ai';
      fromVersion?: string;
      changeDescription?: string;
    },
    userId: string,
  ): Promise<Template> {
    const template = await this.findOne(id, organizationId);

    // Archive the current working copy (which becomes the previous version).
    const live = template.toObject();
    const versionEntry = {
      version: template.version,
      canvas: live.canvas,
      groups: live.groups,
      fields: live.fields,
      kind: template.kind,
      format: template.format,
      documentConfig: template.documentConfig,
      blocks: template.blocks,
      isDraft: false,
      changeDescription: template.versionDescription,
      createdBy: template.updatedBy ?? template.createdBy,
      createdAt: new Date(),
    };

    const newVersion = this.nextVersion(template.version);

    if (dto.source === 'duplicate') {
      const from =
        dto.fromVersion && dto.fromVersion !== template.version
          ? template.versions.find((v) => v.version === dto.fromVersion)
          : null;
      if (dto.fromVersion && dto.fromVersion !== template.version && !from) {
        throw new NotFoundException(`Version ${dto.fromVersion} not found`);
      }
      if (from) {
        // Rehydrate the archived snapshot into the live working copy.
        const snapshot = from.toObject();
        template.canvas = snapshot.canvas;
        template.groups = snapshot.groups;
        template.fields = snapshot.fields;
        template.format = snapshot.format;
        template.documentConfig = snapshot.documentConfig;
        template.blocks = snapshot.blocks;
      }
      // else: duplicate of the current copy — content is already live.
    } else {
      // blank / pdf / ai — empty canvas, preserve page size.
      template.canvas = {
        ...template.toObject().canvas,
        components: [],
        pageBackgrounds: [],
      };
      template.groups = [];
      template.fields = [];
      if (template.kind === 'document') template.blocks = [];
    }

    template.version = newVersion;
    template.versionDescription = dto.changeDescription;
    template.versions = [
      ...template.versions,
      versionEntry as unknown as TemplateVersion,
    ];
    template.updatedBy = new Types.ObjectId(userId);

    return template.save();
  }

  /**
   * Mark a version as the default (the one new forms/generated docs resolve
   * to). Validates that the version exists in the template's history.
   */
  async setDefaultVersion(
    id: string,
    organizationId: string,
    version: string,
    userId: string,
  ): Promise<Template> {
    const template = await this.findOne(id, organizationId);

    if (
      version !== template.version &&
      !template.versions.some((v) => v.version === version)
    ) {
      throw new NotFoundException(`Version ${version} not found`);
    }

    template.defaultVersion = version;
    template.updatedBy = new Types.ObjectId(userId);

    return template.save();
  }

  /**
   * Delete an archived version from the history. The current (live) version
   * cannot be removed. If the deleted version was the default, the default
   * falls back to the current version.
   */
  async deleteVersion(
    id: string,
    organizationId: string,
    version: string,
    userId: string,
  ): Promise<Template> {
    const template = await this.findOne(id, organizationId);

    if (version === template.version) {
      throw new BadRequestException('Cannot delete the current version');
    }

    const index = template.versions.findIndex((v) => v.version === version);
    if (index === -1) {
      throw new NotFoundException(`Version ${version} not found`);
    }

    template.versions.splice(index, 1);
    if (template.defaultVersion === version) {
      template.defaultVersion = template.version;
    }
    template.updatedBy = new Types.ObjectId(userId);

    return template.save();
  }

  /**
   * Publish a template
   */
  async publish(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<Template> {
    const template = await this.findOne(id, organizationId);

    if (template.status === 'published') {
      throw new BadRequestException('Template is already published');
    }

    template.status = 'published';
    template.publishedAt = new Date();
    // First publish pins the current version as the default; later versions can
    // override via setDefaultVersion.
    if (!template.defaultVersion) {
      template.defaultVersion = template.version;
    }
    template.updatedBy = new Types.ObjectId(userId);

    return template.save();
  }

  /**
   * Archive a template
   */
  async archive(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<Template> {
    const template = await this.findOne(id, organizationId);

    if (template.status === 'archived') {
      throw new BadRequestException('Template is already archived');
    }

    template.status = 'archived';
    template.archivedAt = new Date();
    template.updatedBy = new Types.ObjectId(userId);

    return template.save();
  }

  /**
   * Delete a template
   */
  async remove(id: string, organizationId: string): Promise<void> {
    const result = await this.templateModel.deleteOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }
  }

  /**
   * Increment fill count for a template
   */
  async incrementFillCount(id: string, organizationId: string): Promise<void> {
    await this.templateModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      },
      { $inc: { fillCount: 1 } },
    );
  }

  /**
   * Get categories for an organization
   */
  async getCategories(organizationId: string): Promise<string[]> {
    const categories = await this.templateModel.distinct('category', {
      organizationId: new Types.ObjectId(organizationId),
      status: { $ne: 'archived' },
    });

    return categories.sort();
  }

  /**
   * Get the set of tags currently in use across an organization's templates.
   * (The curated tag palette lives in the tags collection.)
   */
  async getTags(organizationId: string): Promise<string[]> {
    const tags = await this.templateModel.distinct('tags', {
      organizationId: new Types.ObjectId(organizationId),
      status: { $ne: 'archived' },
    });
    return tags.sort();
  }
}
