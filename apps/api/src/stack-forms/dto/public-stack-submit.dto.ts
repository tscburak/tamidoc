import { IsObject, IsOptional, IsString } from 'class-validator';

/** Anonymous stack submission payload. `values` are CANONICAL FillValues
 *  (keyed by unified field/group names). Permissive (@IsObject) so the global
 *  forbidNonWhitelisted pipe doesn't reject unknown nested keys. */
export class PublicStackSubmitDto {
  @IsObject()
  values: Record<string, unknown>;

  /** Optional password; also accepted via the `x-form-password` header. */
  @IsOptional()
  @IsString()
  password?: string;
}
