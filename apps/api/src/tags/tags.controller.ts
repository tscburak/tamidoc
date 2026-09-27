import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../access-control/permissions.guard';
import { Permissions } from '../access-control/permissions.decorator';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@ApiTags('Tags')
@ApiBearerAuth()
@Controller('organizations/:organizationId/tags')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TagsController {
  constructor(private tagsService: TagsService) {}

  @Get()
  @Permissions('tag:read')
  @ApiOperation({ summary: 'List tags for an organization' })
  @ApiResponse({ status: 200, description: 'Tags retrieved successfully' })
  async findAll(@Param('organizationId') organizationId: string) {
    const tags = await this.tagsService.findAll(organizationId);
    return { tags };
  }

  @Post()
  @Permissions('tag:manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a tag' })
  @ApiResponse({ status: 201, description: 'Tag created' })
  async create(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateTagDto,
  ) {
    return this.tagsService.create(organizationId, dto);
  }

  @Put(':id')
  @Permissions('tag:manage')
  @ApiOperation({ summary: 'Update a tag' })
  @ApiResponse({ status: 200, description: 'Tag updated' })
  async update(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tagsService.update(organizationId, id, dto);
  }

  @Delete(':id')
  @Permissions('tag:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tag' })
  @ApiResponse({ status: 204, description: 'Tag deleted' })
  async remove(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    await this.tagsService.remove(organizationId, id);
  }
}
