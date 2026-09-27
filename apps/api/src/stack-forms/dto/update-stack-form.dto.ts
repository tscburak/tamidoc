import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { FieldOverride } from './create-stack-form.dto';

export enum StackFormStatusEnum {
  Draft = 'draft',
  Active = 'active',
  Paused = 'paused',
  Archived = 'archived',
}

/** Patch a stack form. For `password` / `expiresAt` the convention is:
 *  - omit the key     → leave unchanged
 *  - `null` (or `''`) → clear it
 *  - a value          → set it
 *  Member templates / unified fields are write-once at create; edit by
 *  recreating the stack. */
export class UpdateStackFormDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(StackFormStatusEnum)
  status?: `${StackFormStatusEnum}`;

  /** Draft-only: manual field links — re-runs the merge from the stored
   *  snapshots. Rejected once the stack has been published. */
  @IsOptional()
  @IsArray()
  links?: any;

  /** Draft-only: per-canonical-field owner overrides, applied post-merge. */
  @IsOptional()
  @IsObject()
  overrides?: Record<string, FieldOverride>;

  @IsOptional()
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
