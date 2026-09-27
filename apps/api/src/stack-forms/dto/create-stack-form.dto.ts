import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Owner overrides for a unified field, keyed by canonical field name. Any
 *  property omitted falls back to the auto-merged value. */
export type FieldOverride = {
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

/** Payload to create a Stack Form. Backend re-snapshots the templates, re-runs
 *  the deterministic merge, then applies the owner's per-field `overrides`
 *  (confirmed in the builder review step) before persisting. */
export class CreateStackFormDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  templateIds: string[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  /** Per-canonical-field overrides from the builder review step. Kept permissive
   *  (@IsObject) so the forbidNonWhitelisted pipe doesn't reject unknown keys. */
  @IsOptional()
  @IsObject()
  overrides?: Record<string, FieldOverride>;

  /** Optional per-template version overrides: { templateId: version }. Absent
   *  for a template = its default version. */
  @IsOptional()
  @IsObject()
  versions?: Record<string, string>;

  /** Manual field links from the review mapping step. Array of ManualLink —
   *  @IsArray (not @IsObject, which rejects arrays and 400s the empty `[]`
   *  the review page sends on first load). */
  @IsOptional()
  @IsArray()
  links?: any;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  /** true = create as a draft for the builder review step (short review URL,
   *  survives refresh); publish later via PATCH { status: 'active', ... }. */
  @IsOptional()
  @IsBoolean()
  draft?: boolean;
}
