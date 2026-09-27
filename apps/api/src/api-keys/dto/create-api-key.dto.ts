import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsISO8601,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { API_KEY_PERMISSIONS, type ApiKeyPermission } from '../api-key.types';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Production CRM' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiProperty({ enum: API_KEY_PERMISSIONS, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsIn(API_KEY_PERMISSIONS, { each: true })
  permissions: ApiKeyPermission[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'Omit for all templates in the organization. Otherwise provide at least one template ID.',
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsMongoId({ each: true })
  templateIds?: string[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Future ISO timestamp. Defaults to 90 days; null means no expiration.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string | null;
}
