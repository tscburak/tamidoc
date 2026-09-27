import { IsObject } from 'class-validator';

/** Body of the POST submission-pdf endpoint: owner-entered values for the
 *  ask-on-generate fields (scalars keyed by field name). */
export class GenerateSubmissionPdfDto {
  @IsObject()
  generateValues: Record<string, unknown>;
}
