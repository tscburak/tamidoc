import {
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Lifecycle values for a published form. */
export enum FormStatusEnum {
  Active = 'active',
  Paused = 'paused',
  Archived = 'archived',
}

/** Owner overrides for a field, keyed `${groupId ?? ''}::${fieldName}`. Any
 *  property omitted falls back to the template field's value. */
export type FormFieldOverride = {
  type?: string;
  required?: boolean;
  options?: string[];
  defaultValue?: string;
  placeholder?: string;
  info?: string;
  section?: string;
  defaultToday?: boolean;
  disabled?: boolean;
  visible?: boolean;
  askOnGenerate?: boolean;
};

/** Payload to publish a Template as a shareable Form. */
export class CreateFormDto {
  @IsMongoId()
  templateId: string;

  /** Defaults to the template's name when omitted. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  /** Optional filler password. Absent = no password. */
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(128)
  password?: string;

  /** Optional expiry (ISO 8601). Absent = never expires. */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  /** Optional template version to snapshot. Absent = default version. */
  @IsOptional()
  @IsString()
  version?: string;

  /** Per-field overrides from the review step. @IsObject so the forbid-
   *  nonWhitelisted pipe doesn't reject unknown nested keys. */
  @IsOptional()
  @IsObject()
  overrides?: Record<string, FormFieldOverride>;
}
