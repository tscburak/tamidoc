import { IsObject, IsOptional, IsString } from 'class-validator';

/** Anonymous submission payload. `values` mirrors the renderer's FillValues
 * (scalars keyed by field name; repeating groups keyed by group name → array).
 * Kept permissive (single @IsObject) so the global forbidNonWhitelisted pipe
 * doesn't reject unknown nested keys — same approach as GeneratePdfDto. */
export class PublicSubmitDto {
  @IsObject()
  values: Record<string, unknown>;

  /** Optional password; also accepted via the `x-form-password` header. */
  @IsOptional()
  @IsString()
  password?: string;
}
