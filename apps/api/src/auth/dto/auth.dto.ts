import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'John', description: 'First name of the user' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name of the user' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'User email address',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'SecurePass123',
    description: 'User password (min 8 characters)',
  })
  @IsString()
  @MinLength(8)
  password: string;
}

export class LoginDto {
  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'User email address',
  })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123', description: 'User password' })
  @IsString()
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'Email address for password reset',
  })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    example: 'reset-token-abc123',
    description: 'Password reset token',
  })
  @IsString()
  token: string;

  @ApiProperty({
    example: 'NewSecurePass456',
    description: 'New password (min 8 characters)',
  })
  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional({
    example: 'a1b2c3...',
    description:
      'Refresh token. Optional for browsers, which send it via the httpOnly refresh cookie instead.',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

// Response DTOs
export class TokensResponse {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'JWT refresh token' })
  refreshToken: string;
}

export class UserResponse {
  @ApiProperty({ description: 'User ID' })
  _id: string;

  @ApiProperty({ example: 'john.doe@example.com', description: 'User email' })
  email: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  lastName: string;

  @ApiProperty({ description: 'Organization ID' })
  organizationId: string;

  @ApiProperty({ example: ['admin'], description: 'User roles' })
  roles: string[];

  @ApiProperty({ description: 'Account creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Account update date' })
  updatedAt: Date;
}

export class AuthResponse {
  @ApiProperty({ type: UserResponse, description: 'User information' })
  user: UserResponse;

  @ApiProperty({ type: TokensResponse, description: 'Authentication tokens' })
  tokens: TokensResponse;
}

export class MessageResponse {
  @ApiProperty({
    example: 'Logged out successfully',
    description: 'Response message',
  })
  message: string;
}

export class PermissionsResponse {
  @ApiProperty({ type: [Object], description: 'List of available permissions' })
  permissions: Array<{
    resource: string;
    action: string;
    scope: string;
    description: string;
  }>;
}
