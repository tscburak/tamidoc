import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { User } from '../users/schemas/user.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { RefreshToken } from './schemas/refresh-token.schema';
import { PermissionsService } from '../access-control/permissions.service';

interface RegisterDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

interface LoginDto {
  email: string;
  password: string;
}

interface JwtPayload {
  sub: string; // userId
  email: string;
  organizationId?: string | null;
  roles: string[];
  type: 'access' | 'refresh';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Organization.name)
    private organizationModel: Model<Organization>,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshToken>,
    private jwtService: JwtService,
    private permissionsService: PermissionsService,
  ) {}

  /**
   * Register new user without organization
   * User will need to create or join an organization after registration
   */
  async register(
    dto: RegisterDto,
  ): Promise<{ user: User; tokens: AuthTokens }> {
    // Check if user already exists
    const existingUser = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Create user without organization
    const user = await this.userModel.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email.toLowerCase(),
      passwordHash,
      organizationId: null, // No organization yet
      roleIds: [], // Will be assigned default role later
      isActive: true,
      emailVerified: false,
      onboardingCompleted: false, // New users must complete onboarding
    });

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return { user, tokens };
  }

  /**
   * Login with email/password
   */
  async login(dto: LoginDto): Promise<{ user: User; tokens: AuthTokens }> {
    const user = await this.userModel
      .findOne({ email: dto.email.toLowerCase() })
      .select('+passwordHash');

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    // Check password
    const isValidPassword = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return { user, tokens };
  }

  /**
   * OAuth Login/Register
   * Called by OAuth strategies (Google, Microsoft, etc.)
   */
  async oauthLogin(profile: {
    email: string;
    firstName: string;
    lastName: string;
    provider: 'google' | 'microsoft' | 'github';
    providerAccountId: string;
    avatar?: string;
  }): Promise<{ user: User; tokens: AuthTokens; isNewUser: boolean }> {
    let user = await this.userModel.findOne({
      $or: [
        { email: profile.email.toLowerCase() },
        { 'oauthAccounts.providerAccountId': profile.providerAccountId },
      ],
    });

    if (user) {
      // Link OAuth account if not already linked
      const existingAccount = user.oauthAccounts?.find(
        (acc) =>
          acc.provider === profile.provider &&
          acc.providerAccountId === profile.providerAccountId,
      );

      if (!existingAccount) {
        user.oauthAccounts = user.oauthAccounts || [];
        user.oauthAccounts.push({
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
          linkedAt: new Date(),
        });
        await user.save();
      }

      // Update last login
      user.lastLoginAt = new Date();
      await user.save();

      const tokens = await this.generateTokens(user);
      return { user, tokens, isNewUser: false };
    }

    // Create new user via OAuth without organization
    user = await this.userModel.create({
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email.toLowerCase(),
      organizationId: null, // No organization yet
      avatar: profile.avatar,
      oauthAccounts: [
        {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
          email: profile.email,
          linkedAt: new Date(),
        },
      ],
      roleIds: [],
      isActive: true,
      emailVerified: true, // OAuth emails are pre-verified
      isOAuthOnly: true,
      onboardingCompleted: false, // New users must complete onboarding
    });

    const tokens = await this.generateTokens(user);
    return { user, tokens, isNewUser: true };
  }

  /**
   * Generate access and refresh tokens
   * Handles users with or without organizations
   */
  async generateTokens(user: User): Promise<AuthTokens> {
    // Get organization if user has one
    let organizationId: string | null = null;
    if (user.organizationId) {
      const organization = await this.organizationModel.findById(
        user.organizationId,
      );
      if (!organization) {
        throw new NotFoundException('Organization not found');
      }
      organizationId = organization._id.toString();
    }

    // Resolve from the active workspace on issuance. A cache from a previous
    // edition or workspace must not be advertised in a new token.
    const permissions = organizationId
      ? await this.permissionsService.getEffectivePermissions(
          user._id.toString(),
          organizationId,
        )
      : [];

    // Access Token (short-lived)
    const payload: any = {
      sub: user._id.toString(),
      email: user.email,
      roles: user.roleIds,
      permissions,
      type: 'access',
    };

    // Only include organizationId if user has one
    if (organizationId) {
      payload.organizationId = organizationId;
    }

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    // Refresh Token (long-lived, stored in DB)
    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenDoc = await this.refreshTokenModel.create({
      token: refreshToken,
      userId: user._id.toString(),
      organizationId: organizationId, // Can be null
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    return {
      accessToken,
      refreshToken: refreshTokenDoc.token,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    const tokenDoc = await this.refreshTokenModel.findOne({
      token: refreshToken,
      isRevoked: false,
    });

    if (!tokenDoc || tokenDoc.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userModel.findById(tokenDoc.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Revoke old refresh token
    tokenDoc.isRevoked = true;
    tokenDoc.revokedAt = new Date();
    await tokenDoc.save();

    // Generate new tokens
    return this.generateTokens(user);
  }

  /**
   * Logout - revoke refresh token
   */
  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokenModel.findOneAndUpdate(
      { token: refreshToken },
      { isRevoked: true, revokedAt: new Date() },
    );
  }

  /**
   * Get user by ID (for /me endpoint)
   */
  async getUserById(userId: string): Promise<User | null> {
    return this.userModel.findById(userId).select('-passwordHash');
  }

  async getCurrentPermissions(userId: string, organizationId?: string | null) {
    return organizationId
      ? this.permissionsService.getEffectivePermissions(userId, organizationId)
      : [];
  }

  /**
   * Validate user (for JWT strategy)
   */
  async validateUser(userId: string): Promise<User | null> {
    const user = await this.userModel.findById(userId).select('-passwordHash');
    if (!user || !user.isActive) {
      return null;
    }
    return user;
  }

  /**
   * Initiate password reset
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.userModel.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal if user exists or not
      return;
    }

    // Generate reset token
    const resetToken = randomBytes(32).toString('hex');
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // TODO: Send email with reset link
    // await this.emailService.sendPasswordReset(user.email, resetToken);
  }

  /**
   * Reset password
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.userModel.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
  }

  /**
   * Verify email
   */
  async verifyEmail(token: string): Promise<void> {
    const user = await this.userModel.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();
  }

  /**
   * Switch active organization
   * Validates the org is owned by the user, sets it as active, and re-mints tokens
   */
  async switchOrganization(
    userId: string,
    organizationId: string,
  ): Promise<{ user: User; tokens: AuthTokens }> {
    // Find the organization
    const organization = await this.organizationModel.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Verify the user is a member of this organization (owner or invited/joined).
    const isMember = await this.permissionsService.isOrgMember(
      userId,
      organizationId,
    );
    if (!isMember && organization.createdBy?.toString() !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this organization',
      );
    }

    // Find the user
    const user = await this.userModel.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Set the new active organization
    user.organizationId = organization._id;
    await user.save();

    // Re-mint tokens with the new active org
    const tokens = await this.generateTokens(user);

    return { user, tokens };
  }
}
