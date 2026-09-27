import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import type { Request as ExpressRequest } from 'express';
import { StackFormsService } from './stack-forms.service';
import { PublicStackSubmitDto } from './dto/public-stack-submit.dto';

/**
 * Anonymous, public endpoints for a Stack Form, resolved by an unguessable
 * `token`. No JWT guard (auth opt-in per controller), ThrottlerGuard applied
 * here only. Password (when set) travels via the `x-form-password` header.
 */
@ApiTags('stack-forms')
@UseGuards(ThrottlerGuard)
@Controller('forms/public/stacks')
export class PublicStackFormsController {
  constructor(private readonly stackFormsService: StackFormsService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Public stack form metadata (no fields exposed)' })
  @ApiResponse({ status: 200, description: 'Stack form metadata' })
  @ApiResponse({ status: 404, description: 'Stack form not found' })
  getMetadata(@Param('token') token: string) {
    return this.stackFormsService.findStackByToken(token);
  }

  @Get(':token/fields')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Public stack form unified fields and groups (password-gated)',
  })
  @ApiResponse({ status: 200, description: 'Unified fields and groups' })
  @ApiResponse({ status: 403, description: 'Wrong password or stack paused' })
  @ApiResponse({ status: 410, description: 'Stack form expired' })
  getFields(
    @Param('token') token: string,
    @Headers('x-form-password') password?: string,
  ) {
    return this.stackFormsService.getPublicFields(token, password);
  }

  @Post(':token/submissions')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Submit a public stack form' })
  @ApiResponse({ status: 200, description: 'Submission accepted' })
  @ApiResponse({ status: 403, description: 'Wrong password or stack paused' })
  @ApiResponse({ status: 410, description: 'Stack form expired' })
  @ApiResponse({ status: 422, description: 'Missing required fields' })
  submit(
    @Param('token') token: string,
    @Body() dto: PublicStackSubmitDto,
    @Headers('x-form-password') headerPassword: string | undefined,
    @Request() req: ExpressRequest,
  ) {
    return this.stackFormsService.submitPublic(
      token,
      dto.values,
      dto.password ?? headerPassword,
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }
}
