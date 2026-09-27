import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Body for `POST /templates/:id/generate` (document-kind templates). `blocks`
 * is the composed `DocBlock[]` — the exact shape a human builds in the block
 * picker and an AI agent emits as JSON. Declared permissively; per-block shape
 * is validated against the block catalog at render time (see
 * `pdf-render/lib/flow-blocks.ts`).
 */
export class GenerateDocumentDto {
  /** Optional document title rendered at the top of the first page. */
  @IsOptional()
  @IsString()
  title?: string;

  /** Per-document text overrides, only accepted for owner-enabled editable fields. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  headerText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  footerText?: string;

  @IsArray()
  // Keep raw block objects intact when global implicit conversion is enabled.
  @Type(() => Object)
  blocks: any[];

  /** Optional version override. Absent = template default, else current. */
  @IsOptional()
  @IsString()
  version?: string;
}
