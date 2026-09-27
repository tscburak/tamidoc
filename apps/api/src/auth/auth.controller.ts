import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Response,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import type { IRequestWithUser } from './interfaces/request.interface';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
  AuthResponse,
  TokensResponse,
  MessageResponse,
  PermissionsResponse,
} from './dto/auth.dto';
import {
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
  COMMUNITY_PERMISSION_GROUPS,
  COMMUNITY_PERMISSIONS,
} from '../access-control/permissions.constants';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Register new user
   * User will need to create or join an organization after registration
   */
  @Post('register')
  @ApiOperation({ summary: 'Register new user' })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: AuthResponse,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiBody({ type: RegisterDto })
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Response() res: any) {
    const result = await this.authService.register(dto);

    // Don't expose password hash
    const { passwordHash, ...userResponse } = result.user.toObject();

    // Set httpOnly cookies
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
      user: userResponse,
      tokens: result.tokens,
    });
  }

  /**
   * Login with email/password
   */
  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in',
    type: AuthResponse,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: LoginDto })
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Response() res: any) {
    const result = await this.authService.login(dto);

    // Don't expose password hash
    const { passwordHash, ...userResponse } = result.user.toObject();

    // Set httpOnly cookies
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

    return res.status(HttpStatus.OK).json({
      user: userResponse,
      tokens: result.tokens,
    });
  }

  /**
   * Logout - revoke refresh token
   */
  @Post('logout')
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Successfully logged out',
    type: MessageResponse,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req: IRequestWithUser, @Response() res: any) {
    // Get refreshToken from cookies or request body
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    return res
      .status(HttpStatus.OK)
      .json({ message: 'Logged out successfully' });
  }

  /**
   * Switch active organization
   * Validates the org is owned by the user, sets it as active, and re-mints auth cookies
   */
  @Post('switch-organization')
  @ApiOperation({ summary: 'Switch active organization' })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Organization switched successfully',
    type: AuthResponse,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - you do not own this organization',
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async switchOrganization(
    @Body() dto: { organizationId: string },
    @Request() req: IRequestWithUser,
    @Response() res: any,
  ) {
    const result = await this.authService.switchOrganization(
      req.user.userId,
      dto.organizationId,
    );

    // Don't expose password hash
    const { passwordHash, ...userResponse } = result.user.toObject();

    // Set httpOnly cookies (mirrors login/register pattern)
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

    return res.status(HttpStatus.OK).json({
      user: userResponse,
      tokens: result.tokens,
    });
  }

  /**
   * Refresh access token
   * Browsers send the refresh token automatically via the httpOnly cookie;
   * non-browser clients may pass it in the body instead.
   */
  @Post('refresh-token')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Token successfully refreshed',
    type: TokensResponse,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  @ApiBody({ type: RefreshTokenDto })
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Request() req: IRequestWithUser,
    @Response() res: any,
  ) {
    // Prefer the httpOnly refresh cookie; fall back to the body for API clients.
    const refreshToken = req.cookies?.refreshToken || dto.refreshToken;
    const tokens = await this.authService.refreshAccessToken(refreshToken);

    // Set httpOnly cookies (path stays at '/' so the cookie is consistent with
    // login/register/switch-organization and reaches this endpoint on retry)
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(HttpStatus.OK).json(tokens);
  }

  /**
   * Get current user with permissions
   */
  @Get('me')
  @ApiOperation({ summary: 'Get current user information and permissions' })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'User information retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Request() req: IRequestWithUser) {
    const user = await this.authService.getUserById(req.user.userId);

    if (!user) {
      return { message: 'User not found' };
    }

    // Don't expose sensitive data
    const { passwordHash, ...userResponse } = user.toObject();

    const permissions = await this.authService.getCurrentPermissions(
      req.user.userId,
      user.organizationId?.toString(),
    );

    return {
      user: {
        ...userResponse,
        permissions,
      },
    };
  }

  /**
   * Initiate password reset
   */
  @Post('forgot-password')
  @ApiOperation({ summary: 'Initiate password reset process' })
  @ApiResponse({
    status: 200,
    description: 'If email exists, password reset link sent',
    type: MessageResponse,
  })
  @ApiBody({ type: ForgotPasswordDto })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    // Always return success to prevent email enumeration
    return {
      message:
        'If an account with this email exists, a password reset link has been sent',
    };
  }

  /**
   * Reset password with token
   */
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using reset token' })
  @ApiResponse({
    status: 200,
    description: 'Password successfully reset',
    type: MessageResponse,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiBody({ type: ResetPasswordDto })
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password reset successfully' };
  }

  /**
   * Get all available permissions (for the role/permission management UI),
   * grouped by resource.
   */
  @Get('permissions')
  @ApiOperation({ summary: 'Get all available permissions' })
  @ApiResponse({
    status: 200,
    description: 'Permissions retrieved successfully',
    type: PermissionsResponse,
  })
  async getPermissions() {
    return process.env.TAMIDOC_EDITION === 'enterprise'
      ? { groups: PERMISSION_GROUPS, permissions: ALL_PERMISSIONS }
      : { groups: COMMUNITY_PERMISSION_GROUPS, permissions: COMMUNITY_PERMISSIONS };
  }
}
