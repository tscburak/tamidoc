import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Body for `POST /templates/:id/validate` (document-kind templates).
 *
 * Primary shape: `{ title, blocks }` — the exact payload `generate` accepts,
 * dry-run without rendering. The same single validator runs on both paths,
 * so "validate passes" always implies "generate renders".
 *
 * Legacy shape: `{ contract }` (AI document contract with components) is
 * still accepted and mapped onto blocks internally.
 */
export class ValidateContractDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  headerText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  footerText?: string;

  /** Composed `DocBlock[]` — same shape `generate` renders. */
  @IsOptional()
  @IsArray()
  @Type(() => Object)
  blocks?: any[];

  /** Legacy AI contract shape — mapped to blocks, then validated identically. */
  @IsOptional()
  @IsObject()
  contract?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  allowedComponents?: string[];

  @IsOptional()
  @IsObject()
  compositionRules?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  limits?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  version?: string;
}
