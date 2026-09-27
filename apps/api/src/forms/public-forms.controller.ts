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
import { FormsService } from './forms.service';
import { PublicSubmitDto } from './dto/public-submit.dto';

/**
 * Anonymous, public endpoints resolved by an unguessable form `token`. No JWT
 * guard (auth is opt-in per controller), so these are reachable without login.
 * `ThrottlerGuard` is applied here only — existing authenticated routes are
 * unaffected. Password (when set) travels via the `x-form-password` header.
 */
@ApiTags('forms')
@UseGuards(ThrottlerGuard)
@Controller('forms/public')
export class PublicFormsController {
  constructor(private readonly formsService: FormsService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Public form metadata (no fields exposed)' })
  @ApiResponse({ status: 200, description: 'Form metadata' })
  @ApiResponse({ status: 404, description: 'Form not found' })
  getMetadata(@Param('token') token: string) {
    return this.formsService.findFormByToken(token);
  }

  @Get(':token/fields')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Public form fields and groups (password-gated)' })
  @ApiResponse({ status: 200, description: 'Fields and groups' })
  @ApiResponse({ status: 403, description: 'Wrong password or form paused' })
  @ApiResponse({ status: 410, description: 'Form expired' })
  getFields(
    @Param('token') token: string,
    @Headers('x-form-password') password?: string,
  ) {
    return this.formsService.getPublicFields(token, password);
  }

  @Post(':token/submissions')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Submit a public form' })
  @ApiResponse({ status: 200, description: 'Submission accepted' })
  @ApiResponse({ status: 403, description: 'Wrong password or form paused' })
  @ApiResponse({ status: 410, description: 'Form expired' })
  @ApiResponse({ status: 422, description: 'Missing required fields' })
  submit(
    @Param('token') token: string,
    @Body() dto: PublicSubmitDto,
    @Headers('x-form-password') headerPassword: string | undefined,
    @Request() req: ExpressRequest,
  ) {
    return this.formsService.submitPublic(
      token,
      dto.values,
      dto.password ?? headerPassword,
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }
}
