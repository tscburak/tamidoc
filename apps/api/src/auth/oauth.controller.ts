import {
  Controller,
  Get,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { OAuthService } from './oauth.service';

@ApiTags('OAuth')
@Controller('auth')
export class OAuthController {
  constructor(private oAuthService: OAuthService) {}

  /**
   * Google OAuth
   * Initiates Google OAuth flow
   */
  @Get('google')
  @ApiOperation({ summary: 'Initiate Google OAuth flow' })
  @ApiResponse({ status: 302, description: 'Redirect to Google' })
  @UseGuards(AuthGuard('google'))
  async googleLogin() {
    // Guard redirects to Google
  }

  /**
   * Google OAuth Callback
   * Handles Google OAuth callback
   */
  @Get('google/callback')
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with tokens' })
  @ApiResponse({ status: 401, description: 'OAuth failed' })
  @UseGuards(AuthGuard('google'))
  @HttpCode(HttpStatus.OK)
  async googleCallback(@Req() req: any, @Res() res: Response) {
    const { user, tokens, isNewUser } = req.user;

    // Redirect to frontend with tokens
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}&isNewUser=${isNewUser}`;

    return res.redirect(redirectUrl);
  }

  /**
   * Microsoft OAuth
   * Initiates Microsoft OAuth flow
   */
  @Get('microsoft')
  @ApiOperation({ summary: 'Initiate Microsoft OAuth flow' })
  @ApiResponse({ status: 302, description: 'Redirect to Microsoft' })
  @UseGuards(AuthGuard('microsoft'))
  async microsoftLogin() {
    // Guard redirects to Microsoft
  }

  /**
   * Microsoft OAuth Callback
   * Handles Microsoft OAuth callback
   */
  @Get('microsoft/callback')
  @ApiOperation({ summary: 'Handle Microsoft OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with tokens' })
  @ApiResponse({ status: 401, description: 'OAuth failed' })
  @UseGuards(AuthGuard('microsoft'))
  @HttpCode(HttpStatus.OK)
  async microsoftCallback(@Req() req: any, @Res() res: Response) {
    const { user, tokens, isNewUser } = req.user;

    // Redirect to frontend with tokens
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}&isNewUser=${isNewUser}`;

    return res.redirect(redirectUrl);
  }

  /**
   * GitHub OAuth (Optional)
   * Initiates GitHub OAuth flow
   */
  @Get('github')
  @ApiOperation({ summary: 'Initiate GitHub OAuth flow' })
  @ApiResponse({ status: 302, description: 'Redirect to GitHub' })
  @UseGuards(AuthGuard('github'))
  async githubLogin() {
    // Guard redirects to GitHub
  }

  /**
   * GitHub OAuth Callback (Optional)
   * Handles GitHub OAuth callback
   */
  @Get('github/callback')
  @ApiOperation({ summary: 'Handle GitHub OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with tokens' })
  @ApiResponse({ status: 401, description: 'OAuth failed' })
  @UseGuards(AuthGuard('github'))
  @HttpCode(HttpStatus.OK)
  async githubCallback(@Req() req: any, @Res() res: Response) {
    const { user, tokens, isNewUser } = req.user;

    // Redirect to frontend with tokens
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}&isNewUser=${isNewUser}`;

    return res.redirect(redirectUrl);
  }
}
