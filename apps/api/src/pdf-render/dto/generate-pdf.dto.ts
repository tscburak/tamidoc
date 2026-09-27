import { IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body for `POST /templates/:id/generate-pdf`. A single `values` map (scalars
 * keyed by field name, repeating groups keyed by group name → array of entries).
 * Declared as one key so the global `forbidNonWhitelisted` ValidationPipe is
 * satisfied; nested values are checked against the selected template.
 */
export class GeneratePdfDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Field names map to strings; repeating group names map to arrays of objects with string field values. Include required ask-on-generate fields.',
    example: {
      customer: 'Ada',
      items: [{ description: 'Consulting', quantity: '2' }],
    },
  })
  @IsObject()
  values: Record<string, unknown>;

  /** Optional version override. Absent = pinned default, otherwise current. */
  @ApiPropertyOptional({
    description:
      'Template version override; defaults to the pinned default or current version.',
    example: 'v1.0',
  })
  @IsOptional()
  @IsString()
  version?: string;
}
