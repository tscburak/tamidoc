import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { FormStatusEnum } from './create-form.dto';

/**
 * Patch a form. For `password` / `expiresAt` the convention is:
 *  - omit the key        → leave unchanged
 *  - `null` (or `''`)    → clear it
 *  - a value             → set it
 */
export class UpdateFormDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(FormStatusEnum)
  status?: `${FormStatusEnum}`;

  @IsOptional()
  // Validate only when a real (non-null, non-empty) value is supplied.
  @ValidateIf((_o, value) => value !== null && value !== '')
  @IsString()
  @MinLength(4)
  @MaxLength(128)
  password?: string | null;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsDateString()
  expiresAt?: string | null;
}
