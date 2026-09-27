import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsObject,
  IsMongoId,
  IsOptional,
} from 'class-validator';

/** Payload to preview the unified field set for a candidate stack (no persist).
 *  Requires at least two templates — a single template is just a regular Form. */
export class PreviewStackFormDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  templateIds: string[];

  /** Optional per-template version: { templateId: version }. */
  @IsOptional()
  @IsObject()
  versions?: Record<string, string>;

  /** Manual field links from the review mapping step. Array of ManualLink —
   *  @IsArray (not @IsObject, which rejects arrays and 400s the empty `[]`
   *  the review page sends on first load). */
  @IsOptional()
  @IsArray()
  links?: any;
}
