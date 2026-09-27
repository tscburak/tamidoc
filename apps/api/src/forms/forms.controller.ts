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
import { FormsService } from './forms.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { GenerateSubmissionPdfDto } from './dto/generate-submission-pdf.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface IRequestWithUser extends ExpressRequest {
  user: { userId: string; email: string; organizationId?: string };
}

@ApiTags('forms')
@ApiBearerAuth()
@Controller('organizations/:organizationId/forms')
@UseGuards(JwtAuthGuard)
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  @Post()
  @ApiOperation({ summary: 'Publish a template as a shareable form' })
  @ApiResponse({ status: 201, description: 'Form created' })
  @ApiResponse({ status: 400, description: 'Template is not published' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async create(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateFormDto,
    @Request() req: IRequestWithUser,
  ) {
    return this.formsService.create(organizationId, dto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List forms for an organization' })
  @ApiResponse({ status: 200, description: 'Forms retrieved' })
  async findAll(
    @Param('organizationId') organizationId: string,
    @Query('status') status?: 'active' | 'paused' | 'archived',
    @Query('templateId') templateId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.formsService.findAll(organizationId, {
      status,
      templateId,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a form (settings + link)' })
  @ApiResponse({ status: 200, description: 'Form retrieved' })
  @ApiResponse({ status: 404, description: 'Form not found' })
  async findOne(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.formsService.findOne(id, organizationId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a form (name, status, password, expiry)' })
  @ApiResponse({ status: 200, description: 'Form updated' })
  @ApiResponse({ status: 404, description: 'Form not found' })
  async update(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFormDto,
    @Request() req: IRequestWithUser,
  ) {
    return this.formsService.update(id, organizationId, dto, req.user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a form and its submissions' })
  @ApiResponse({ status: 204, description: 'Form deleted' })
  @ApiResponse({ status: 404, description: 'Form not found' })
  async remove(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    await this.formsService.remove(id, organizationId);
  }

  @Get(':id/submissions')
  @ApiOperation({ summary: 'List submissions for a form' })
  @ApiResponse({ status: 200, description: 'Submissions retrieved' })
  async findSubmissions(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.formsService.findSubmissions(
      id,
      organizationId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 25,
    );
  }

  @Get(':id/submissions/:subId/pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Download a submission PDF' })
  @ApiResponse({ status: 200, description: 'Submission PDF' })
  @ApiResponse({ status: 404, description: 'Form or submission not found' })
  async getSubmissionPdf(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('subId') subId: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.formsService.getSubmissionPdf(
      id,
      subId,
      organizationId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // Return undefined so the global ResponseInterceptor no-ops (it would
    // otherwise wrap the buffer in { success, data }).
    res.end(buffer);
  }

  @Post(':id/submissions/:subId/pdf')
  @HttpCode(HttpStatus.OK)
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Generate a submission PDF with ask-on-generate values',
  })
  @ApiResponse({
    status: 200,
    description: 'Submission PDF rendered with owner values',
  })
  @ApiResponse({
    status: 422,
    description: 'Required ask-on-generate value missing',
  })
  async generateSubmissionPdf(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('subId') subId: string,
    @Body() dto: GenerateSubmissionPdfDto,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.formsService.getSubmissionPdf(
      id,
      subId,
      organizationId,
      dto.generateValues,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(buffer);
  }
}
