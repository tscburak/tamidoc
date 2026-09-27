import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({
    example: 'Acme Corporation',
    description: 'Organization name',
  })
  @IsString()
  @MinLength(2, { message: 'Organization name must be at least 2 characters' })
  @MaxLength(100, {
    message: 'Organization name must not exceed 100 characters',
  })
  name: string;

  @ApiPropertyOptional({
    example: 'A tech company',
    description: 'Organization description',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description?: string;

  @ApiPropertyOptional({
    example: 'https://www.example.com',
    description: 'Organization website',
  })
  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\/.+/i, {
    message: 'Website must be a valid URL starting with http:// or https://',
  })
  website?: string;

  @ApiPropertyOptional({ example: 'hr', description: 'Organization industry' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: '1-10', description: 'Organization size' })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiPropertyOptional({
    example: '#C65D2E',
    description: 'Brand color (hex format)',
  })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'Brand color must be a valid hex color (e.g., #C65D2E)',
  })
  brandColor?: string;

  @ApiPropertyOptional({
    example: '#2D6A4F',
    description: 'Accent color (hex format)',
  })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'Accent color must be a valid hex color (e.g., #2D6A4F)',
  })
  accentColor?: string;

  @ApiPropertyOptional({ example: 'Inter', description: 'Brand font family' })
  @IsOptional()
  @IsString()
  font?: string;
}
