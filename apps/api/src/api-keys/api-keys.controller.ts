import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { IRequestWithUser } from '../auth/interfaces/request.interface';
import { ApiKeyManagementGuard } from './api-key-management.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('API keys')
@ApiBearerAuth()
@Controller('organizations/:organizationId/api-keys')
@UseGuards(JwtAuthGuard, ApiKeyManagementGuard)
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'List organization API keys (never returns secrets)',
  })
  async list(@Param('organizationId') organizationId: string) {
    return { keys: await this.keys.list(organizationId) };
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Create an organization API key; the secret is returned only once',
  })
  create(
    @Param('organizationId') organizationId: string,
    @Request() request: IRequestWithUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.keys.create(organizationId, request.user.userId, dto);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Permanently revoke an API key' })
  revoke(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Request() request: IRequestWithUser,
  ) {
    return this.keys.revoke(organizationId, id, request.user.userId);
  }
}
