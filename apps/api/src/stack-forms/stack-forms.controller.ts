import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiProduces,
} from '@nestjs/swagger';
import type { Request as ExpressRequest, Response } from 'express';
import { StackFormsService } from './stack-forms.service';
import { PreviewStackFormDto } from './dto/preview-stack-form.dto';
import { CreateStackFormDto } from './dto/create-stack-form.dto';
import { UpdateStackFormDto } from './dto/update-stack-form.dto';
import { GenerateDocumentPdfDto } from './dto/generate-document-pdf.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface IRequestWithUser extends ExpressRequest {
  user: { userId: string; email: string; organizationId?: string };
}

@ApiTags('stack-forms')
@ApiBearerAuth()
@Controller('organizations/:organizationId/stack-forms')
@UseGuards(JwtAuthGuard)
export class StackFormsController {
  constructor(private readonly stackFormsService: StackFormsService) {}

  @Post('preview')
  @ApiOperation({
    summary: 'Preview the unified field set for a candidate stack (no persist)',
  })
  @ApiResponse({ status: 200, description: 'Merge preview' })
  async preview(
    @Param('organizationId') organizationId: string,
    @Body() dto: PreviewStackFormDto,
  ) {
    return this.stackFormsService.preview(
      organizationId,
      dto.templateIds,
      dto.versions,
      dto.links,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a stack form from multiple templates' })
  @ApiResponse({ status: 201, description: 'Stack form created' })
  @ApiResponse({ status: 400, description: 'A template is not published' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async create(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateStackFormDto,
    @Request() req: IRequestWithUser,
  ) {
    return this.stackFormsService.create(organizationId, dto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List stack forms for an organization' })
  async findAll(
    @Param('organizationId') organizationId: string,
    @Query('status') status?: 'active' | 'paused' | 'archived',
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stackFormsService.findAll(organizationId, {
      status,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a stack form' })
  async findOne(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.stackFormsService.findOne(id, organizationId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a stack form (name, status, password, expiry)',
  })
  async update(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStackFormDto,
    @Request() req: IRequestWithUser,
  ) {
    return this.stackFormsService.update(
      id,
      organizationId,
      dto,
      req.user.userId,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a stack form and its submissions' })
  async remove(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    await this.stackFormsService.remove(id, organizationId);
  }

  @Get(':id/submissions')
  @ApiOperation({ summary: 'List submissions for a stack form' })
  async findSubmissions(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stackFormsService.findSubmissions(
      id,
      organizationId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 25,
    );
  }

  @Get(':id/submissions/:subId/documents')
  @ApiOperation({
    summary: 'List the documents (one per template) for a stack submission',
  })
  async listDocuments(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('subId') subId: string,
  ) {
    return this.stackFormsService.listDocuments(id, organizationId, subId);
  }

  @Get(':id/submissions/:subId/documents/:index/pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Download one document of a stack submission' })
  @ApiResponse({ status: 200, description: 'Document PDF' })
  @ApiResponse({
    status: 404,
    description: 'Stack, submission or document index not found',
  })
  async getDocumentPdf(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('subId') subId: string,
    @Param('index') index: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } =
      await this.stackFormsService.getSubmissionDocumentPdf(
        id,
        subId,
        parseInt(index, 10),
        organizationId,
      );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(buffer); // bypass the global ResponseInterceptor wrapper
  }

  @Post(':id/submissions/:subId/documents/:index/pdf')
  @HttpCode(HttpStatus.OK)
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Generate one document with ask-on-generate values',
  })
  @ApiResponse({
    status: 200,
    description: 'Document PDF rendered with owner values',
  })
  @ApiResponse({
    status: 422,
    description: 'Required ask-on-generate value missing',
  })
  async generateDocumentPdf(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('subId') subId: string,
    @Param('index') index: string,
    @Body() dto: GenerateDocumentPdfDto,
    @Res() res: Response,
  ) {
    const { buffer, filename } =
      await this.stackFormsService.getSubmissionDocumentPdf(
        id,
        subId,
        parseInt(index, 10),
        organizationId,
        dto.generateValues,
      );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(buffer); // bypass the global ResponseInterceptor wrapper
  }
}
