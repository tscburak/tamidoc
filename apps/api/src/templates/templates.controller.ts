import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiProduces,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { CreateVersionDto } from './dto/create-version.dto';
import { SetDefaultVersionDto } from './dto/set-default-version.dto';
import { GenerateDocumentDto } from './dto/generate-document.dto';
import { ValidateContractDto } from './dto/validate-contract.dto';
import { TemplateAuthGuard } from '../api-keys/template-auth.guard';
import { AllowApiKey } from '../api-keys/api-key-access.decorator';
import type { ApiKeyRequest } from '../api-keys/api-key.types';
import { Permissions } from '../access-control/permissions.decorator';
import { PdfRenderService } from '../pdf-render/pdf-render.service';
import { FlowRenderService } from '../pdf-render/flow-render.service';
import { GeneratePdfDto } from '../pdf-render/dto/generate-pdf.dto';
import {
  findMissingRequired,
  findMissingGenerateValues,
} from '../pdf-render/lib/validation';
import { validateBlocks } from '../pdf-render/lib/flow-blocks';
import { resolvePageInfo } from '../pdf-render/lib/page-info';
import { validateFixedFillValues } from '../pdf-render/lib/fixed-fill-validation';
import {
  validateContract,
  type CompositionRules,
  type ContractLimits,
} from '../pdf-render/lib/document-contract';
import type { RenderTemplate, FillValues } from '../pdf-render/lib/types';
import type {
  DocBlock,
  DocumentConfig,
  RenderDocument,
} from '../pdf-render/lib/document-types';

interface IRequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
    organizationId?: string;
  };
}

@ApiTags('templates')
@ApiBearerAuth()
@Controller('organizations/:organizationId/templates')
@UseGuards(TemplateAuthGuard)
export class TemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly pdfRenderService: PdfRenderService,
    private readonly flowRenderService: FlowRenderService,
  ) {}

  @Post()
  @Permissions('template:create')
  @ApiOperation({ summary: 'Create a new template' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @Param('organizationId') organizationId: string,
    @Body() createTemplateDto: CreateTemplateDto,
    @Request() req: IRequestWithUser,
  ) {
    const template = await this.templatesService.create(
      organizationId,
      createTemplateDto,
      req.user.userId,
    );
    return template;
  }

  @Get()
  @Permissions('template:read')
  @AllowApiKey('template:read')
  @ApiOperation({ summary: 'Get all templates for an organization' })
  @ApiResponse({ status: 200, description: 'Templates retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @Param('organizationId') organizationId: string,
    @Query('status') status?: 'draft' | 'published' | 'archived',
    @Query('category') category?: string,
    @Query('tag') tag?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: 'createdAt' | 'updatedAt' | 'name',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Request() request?: ApiKeyRequest,
  ) {
    const filters = {
      status,
      category,
      tag,
      search,
      sortBy,
      sortOrder,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    };

    return this.templatesService.findAll(
      organizationId,
      filters,
      request?.apiKey?.templateIds,
    );
  }

  @Get('categories')
  @Permissions('template:read')
  @ApiOperation({ summary: 'Get all categories for an organization' })
  @ApiResponse({
    status: 200,
    description: 'Categories retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCategories(@Param('organizationId') organizationId: string) {
    return this.templatesService.getCategories(organizationId);
  }

  @Get('tags')
  @Permissions('template:read')
  @ApiOperation({ summary: 'Get all tags in use for an organization' })
  @ApiResponse({ status: 200, description: 'Tags retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTags(@Param('organizationId') organizationId: string) {
    return this.templatesService.getTags(organizationId);
  }

  @Get(':id')
  @AllowApiKey('template:read')
  @Permissions('template:read')
  @ApiOperation({ summary: 'Get a specific template' })
  @ApiResponse({ status: 200, description: 'Template retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findOne(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.templatesService.findOne(id, organizationId);
  }

  @Put(':id')
  @Permissions('template:design')
  @ApiOperation({ summary: 'Update a template' })
  @ApiResponse({ status: 200, description: 'Template updated successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async update(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
    @Request() req: IRequestWithUser,
  ) {
    return this.templatesService.update(
      id,
      organizationId,
      updateTemplateDto,
      req.user.userId,
    );
  }

  @Get(':id/versions')
  @Permissions('template:read')
  @AllowApiKey('template:read')
  @ApiOperation({ summary: 'List template version history (lean)' })
  @ApiResponse({ status: 200, description: 'Version history retrieved' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listVersions(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.templatesService.listVersions(id, organizationId);
  }

  @Post(':id/versions')
  @Permissions('template:design')
  @ApiOperation({
    summary: 'Create a new version (from duplicate, blank, PDF, or AI)',
  })
  @ApiResponse({ status: 201, description: 'Version created' })
  @ApiResponse({
    status: 404,
    description: 'Template or source version not found',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createVersion(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: CreateVersionDto,
    @Request() req: IRequestWithUser,
  ) {
    return this.templatesService.createVersion(
      id,
      organizationId,
      dto,
      req.user.userId,
    );
  }

  @Get(':id/versions/:version')
  @Permissions('template:read')
  @AllowApiKey('template:read')
  @ApiOperation({ summary: 'Get a specific version snapshot (full canvas)' })
  @ApiResponse({ status: 200, description: 'Version snapshot retrieved' })
  @ApiResponse({ status: 404, description: 'Template or version not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getVersion(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('version') version: string,
  ) {
    return this.templatesService.getVersion(id, organizationId, version);
  }

  @Delete(':id/versions/:version')
  @Permissions('template:design')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an archived version from history' })
  @ApiResponse({ status: 200, description: 'Version deleted' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete the current version',
  })
  @ApiResponse({ status: 404, description: 'Template or version not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteVersion(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('version') version: string,
    @Request() req: IRequestWithUser,
  ) {
    return this.templatesService.deleteVersion(
      id,
      organizationId,
      version,
      req.user.userId,
    );
  }

  @Post(':id/default-version')
  @Permissions('template:design')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the default version for a template' })
  @ApiResponse({ status: 200, description: 'Default version updated' })
  @ApiResponse({ status: 404, description: 'Template or version not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async setDefaultVersion(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: SetDefaultVersionDto,
    @Request() req: IRequestWithUser,
  ) {
    return this.templatesService.setDefaultVersion(
      id,
      organizationId,
      dto.version,
      req.user.userId,
    );
  }

  @Post(':id/publish')
  @Permissions('template:publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a template' })
  @ApiResponse({ status: 200, description: 'Template published successfully' })
  @ApiResponse({ status: 400, description: 'Template already published' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async publish(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Request() req: IRequestWithUser,
  ) {
    return this.templatesService.publish(id, organizationId, req.user.userId);
  }

  @Post(':id/archive')
  @Permissions('template:publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a template' })
  @ApiResponse({ status: 200, description: 'Template archived successfully' })
  @ApiResponse({ status: 400, description: 'Template already archived' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async archive(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Request() req: IRequestWithUser,
  ) {
    return this.templatesService.archive(id, organizationId, req.user.userId);
  }

  @Delete(':id')
  @Permissions('template:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a template' })
  @ApiResponse({ status: 204, description: 'Template deleted successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async remove(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    await this.templatesService.remove(id, organizationId);
  }

  @Post(':id/fill')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Increment template fill count' })
  @ApiResponse({ status: 200, description: 'Fill count incremented' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async incrementFillCount(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    await this.templatesService.incrementFillCount(id, organizationId);
    return { success: true };
  }

  @Post(':id/generate-pdf')
  @Permissions('template:read')
  @AllowApiKey('template:generate')
  @HttpCode(HttpStatus.OK)
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Generate a filled PDF from a fixed template',
    description:
      'Send field values as strings and repeating groups as arrays of objects. Omit version to use the pinned default, or the current version when no default is pinned.',
  })
  @ApiResponse({ status: 200, description: 'Generated PDF file' })
  @ApiResponse({
    status: 400,
    description: 'Template or requested version is not a fixed template',
  })
  @ApiResponse({
    status: 422,
    description: 'Invalid fill values or missing required fields',
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async generatePdf(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: GeneratePdfDto,
    @Res() res: Response,
  ) {
    // findOne is org-scoped and throws NotFoundException for us.
    const template = await this.templatesService.findOne(id, organizationId);
    if (template.kind === 'document') {
      throw new BadRequestException(
        'Use the generate endpoint for document-kind templates',
      );
    }
    let doc: RenderTemplate;
    const version = dto.version || template.defaultVersion || template.version;
    if (version && version !== template.version) {
      const snapshot = await this.templatesService.getVersion(
        id,
        organizationId,
        version,
      );
      if (snapshot.kind === 'document') {
        throw new BadRequestException(
          'Requested version is not a fixed template',
        );
      }
      doc = {
        name: template.name,
        canvas: snapshot.canvas,
        groups: snapshot.groups ?? [],
        fields: snapshot.fields ?? [],
      } as unknown as RenderTemplate;
    } else {
      doc = template.toObject();
    }

    const errors = validateFixedFillValues(doc, dto.values);
    if (errors.length) {
      throw new UnprocessableEntityException({
        message: 'Invalid fill values',
        errors,
      });
    }

    // Defense-in-depth: the client validates first, but re-check required fields.
    const missing = findMissingRequired(doc, dto.values as FillValues);
    if (missing.length) {
      throw new UnprocessableEntityException({
        message: 'Missing required fields',
        missing,
        errors: missing.map((key) => {
          const [groupId, name] = key.split('::');
          const group = doc.groups.find((item) => item.id === groupId);
          return `${group ? `${group.name}[].` : ''}${name} is required.`;
        }),
      });
    }

    // Same for required ask-on-generate fields on the direct-fill path.
    const missingGenerate = findMissingGenerateValues(
      doc.fields,
      dto.values as FillValues,
    );
    if (missingGenerate.length) {
      throw new UnprocessableEntityException({
        message: 'Missing required generation fields',
        missing: missingGenerate,
        errors: missingGenerate.map(
          (name) => `${name} is required at generation.`,
        ),
      });
    }

    const pdf = await this.pdfRenderService.render(
      doc,
      dto.values as FillValues,
    );
    const name =
      (template.name || 'document')
        .replace(/[^\w\- ]/g, '')
        .trim()
        .slice(0, 60) || 'document';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
    // Return undefined so the global ResponseInterceptor no-ops (it would
    // otherwise wrap the buffer in { success, data }).
    res.end(pdf);
  }

  @Post(':id/generate')
  @Permissions('template:read')
  @AllowApiKey('template:generate')
  @HttpCode(HttpStatus.OK)
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Generate a filled PDF from a document-kind template',
  })
  @ApiResponse({ status: 200, description: 'Generated PDF file' })
  @ApiResponse({ status: 400, description: 'Template is not a document' })
  @ApiResponse({
    status: 422,
    description: 'Invalid blocks (unknown/not-allowed/malformed)',
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async generateDocument(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: GenerateDocumentDto,
    @Res() res: Response,
  ) {
    const template = await this.templatesService.findOne(id, organizationId);
    if (template.kind !== 'document') {
      throw new BadRequestException('Template is not a document-kind template');
    }

    let config: DocumentConfig | undefined;
    const version = dto.version ?? template.defaultVersion ?? template.version;
    if (version !== template.version) {
      const v = await this.templatesService.getVersion(
        id,
        organizationId,
        version,
      );
      if (v.kind !== 'document') {
        throw new BadRequestException(
          'Requested version is not a document-kind template',
        );
      }
      config = v.documentConfig;
    } else {
      config = template.documentConfig;
    }

    if (!config) {
      throw new BadRequestException(
        'Document template is missing documentConfig',
      );
    }

    const blocks = (dto.blocks ?? []) as DocBlock[];
    const pageInfo = resolvePageInfo(config.theme, dto);
    const errors = [
      ...validateBlocks(blocks, config.allowedBlocks),
      ...pageInfo.errors,
    ];
    if (errors.length) {
      throw new UnprocessableEntityException({
        message: 'Invalid document blocks',
        errors,
      });
    }

    const doc: RenderDocument = {
      name: template.name,
      title: dto.title,
      format: config.format ?? 'document',
      pageSize: config.pageSize ?? (config.format === 'slides' ? '16:9' : 'A4'),
      orientation: config.orientation ?? 'portrait',
      theme: pageInfo.theme,
      componentDefaults: config.componentDefaults,
      blocks,
    };

    const pdf = await this.flowRenderService.render(doc);
    const name =
      (template.name || 'document')
        .replace(/[^\w\- ]/g, '')
        .trim()
        .slice(0, 60) || 'document';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
    res.end(pdf);
  }

  @Post(':id/validate')
  @Permissions('template:read')
  @AllowApiKey('template:generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate a document contract without rendering (dry-run)',
  })
  @ApiResponse({ status: 200, description: 'Validation result' })
  @ApiResponse({ status: 400, description: 'Template is not a document' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async validateDocument(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: ValidateContractDto,
  ) {
    const template = await this.templatesService.findOne(id, organizationId);
    if (template.kind !== 'document') {
      throw new BadRequestException('Template is not a document-kind template');
    }

    let config: DocumentConfig | undefined;
    const version = dto.version ?? template.defaultVersion ?? template.version;
    if (version !== template.version) {
      const v = await this.templatesService.getVersion(
        id,
        organizationId,
        version,
      );
      if (v.kind !== 'document') {
        throw new BadRequestException(
          'Requested version is not a document-kind template',
        );
      }
      config = v.documentConfig;
    } else {
      config = template.documentConfig;
    }

    if (!config) {
      throw new BadRequestException(
        'Document template is missing documentConfig',
      );
    }

    // Primary path: same `{ title, blocks }` payload `generate` renders,
    // validated by the same single validator — validate passing implies
    // generate renders.
    if (Array.isArray(dto.blocks)) {
      const issues = [
        ...validateBlocks(dto.blocks as DocBlock[], config?.allowedBlocks),
        ...resolvePageInfo(config.theme, dto).errors,
      ];
      if (issues.length) {
        throw new UnprocessableEntityException({
          message: 'Invalid document blocks',
          errors: issues,
        });
      }
      return { ok: true, errors: [] };
    }

    // Legacy AI contract path — mapped onto blocks, validated identically.
    if (!dto.contract) {
      throw new BadRequestException(
        'Provide either "blocks" or a legacy "contract" to validate',
      );
    }

    // Template allowlist applies unless the caller narrows it explicitly.
    const options = {
      compositionRules: dto.compositionRules as CompositionRules | undefined,
      limits: dto.limits as ContractLimits | undefined,
    };
    let result = validateContract(dto.contract, {
      ...options,
      allowedComponents: config.allowedBlocks,
    });
    if (result.ok && dto.allowedComponents) {
      result = validateContract(dto.contract, {
        ...options,
        allowedComponents: dto.allowedComponents,
      });
    }
    if (!result.ok) {
      throw new UnprocessableEntityException({
        message: 'Invalid document contract',
        errors: result.errors,
      });
    }
    return { ok: true, errors: [] };
  }
}
