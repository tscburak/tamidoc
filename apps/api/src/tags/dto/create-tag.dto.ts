import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTagDto {
  @ApiProperty({ example: 'HR' })
  @IsString()
  @MinLength(1, { message: 'Tag name must be at least 1 character' })
  @MaxLength(40, { message: 'Tag name must not exceed 40 characters' })
  name: string;

  @ApiPropertyOptional({ example: '#2563EB' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Color must be a valid hex color' })
  color?: string;
}
