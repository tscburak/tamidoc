import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Response,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { StorageService } from '../storage/storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../access-control/permissions.guard';
import { Permissions } from '../access-control/permissions.decorator';
import type { IRequestWithUser } from '../auth/interfaces/request.interface';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private organizationsService: OrganizationsService,
    private storageService: StorageService,
  ) {}

  /**
   * Create a new organization
   * Users can create multiple organizations (tracked via createdBy)
   * Sets the new org as active and refreshes the auth cookies
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new organization' })
  @ApiResponse({
    status: 201,
    description: 'Organization created successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: CreateOrganizationDto })
  @HttpCode(HttpStatus.CREATED)
  async createOrganization(
    @Body() dto: CreateOrganizationDto,
    @Request() req: IRequestWithUser,
    @Response() res: any,
  ) {
    const result = await this.organizationsService.createOrganization(
      dto,
      req.user.userId,
    );

    // Don't expose password hash
    const { passwordHash, ...userResponse } = result.user.toObject();

    // Set httpOnly cookies (mirrors AuthController.login)
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('accessToken', result.tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(HttpStatus.CREATED).json({
      organization: result.organization,
      user: userResponse,
    });
  }

  /**
   * Get organizations owned by the current user
   * IMPORTANT: Must be declared before @Get(':id') so 'mine' isn't captured as an id param
   */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get organizations owned by the current user' })
  @ApiResponse({
    status: 200,
    description: 'Organizations retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyOrganizations(@Request() req: IRequestWithUser) {
    const organizations = await this.organizationsService.getMyOrganizations(
      req.user.userId,
    );
    return { organizations };
  }

  /**
   * Get organization by ID
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('organization:read')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get organization by ID' })
  @ApiResponse({
    status: 200,
    description: 'Organization retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async getOrganization(@Param('id') id: string) {
    const organization =
      await this.organizationsService.getOrganizationById(id);
    return organization;
  }

  /**
   * Get organization by slug
   */
  @Get('slug/:slug')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get organization by slug' })
  @ApiResponse({
    status: 200,
    description: 'Organization retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async getOrganizationBySlug(@Param('slug') slug: string) {
    const organization =
      await this.organizationsService.getOrganizationBySlug(slug);
    return organization;
  }

  /**
   * Update organization
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('organization:update')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update organization' })
  @ApiResponse({
    status: 200,
    description: 'Organization updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async updateOrganization(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @Request() req: IRequestWithUser,
  ) {
    const organization = await this.organizationsService.updateOrganization(
      id,
      req.user.userId,
      dto,
    );
    return organization;
  }

  /**
   * Upload organization logo
   * Only organization creator can upload logo
   */
  @Post(':id/logo')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('organization:update')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload organization logo' })
  @ApiResponse({ status: 201, description: 'Logo uploaded successfully' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid file or size',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @ApiConsumes('multipart/form-data')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 2 * 1024 * 1024, // 2MB
      },
      fileFilter: (req, file, callback) => {
        // Allow only image files
        const allowedMimes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'image/webp',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(
            new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'),
            false,
          );
        }
      },
    }),
  )
  async uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: IRequestWithUser,
  ) {
    const organization = await this.organizationsService.uploadLogo(
      id,
      req.user.userId,
      file,
    );
    return { organization };
  }

  /**
   * Get organization logo
   * Only accessible to organization members
   * Streams the file securely from S3 through our API
   */
  @Get(':id/logo')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get organization logo' })
  @ApiResponse({ status: 200, description: 'Logo served successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a member' })
  @ApiResponse({ status: 404, description: 'Organization or logo not found' })
  async getOrganizationLogo(
    @Param('id') id: string,
    @Request() req: IRequestWithUser,
    @Response() res: any,
  ) {
    console.log('Fetching logo for organization:', id);

    // Get organization to find logo URL
    const organization =
      await this.organizationsService.getOrganizationById(id);
    console.log('Organization:', organization.name);
    console.log('Logo URL:', organization.logo);

    if (!organization.logo) {
      throw new NotFoundException('Organization does not have a logo');
    }

    // Extract the key from the stored URL
    const key = this.storageService.extractKeyFromUrl(organization.logo);
    console.log('Extracted key:', key);

    // Get the file buffer from S3
    const { buffer, contentType } = await this.storageService.download(key);
    console.log('File downloaded, size:', buffer.length, 'type:', contentType);

    // Set headers for proper caching and content type
    res.set({
      'Content-Type': contentType || 'image/jpeg',
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
    });

    // Send the buffer
    res.send(buffer);
  }

  /**
   * Delete organization
   * (Member listing moved to MembersController: GET /organizations/:organizationId/members)
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('organization:delete')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete organization' })
  @ApiResponse({
    status: 200,
    description: 'Organization deleted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - cannot delete only organization',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @HttpCode(HttpStatus.OK)
  async deleteOrganization(
    @Param('id') id: string,
    @Request() req: IRequestWithUser,
  ) {
    await this.organizationsService.deleteOrganization(id, req.user.userId);
    return { message: 'Organization deleted successfully' };
  }
}
