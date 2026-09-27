import { IsObject } from 'class-validator';

/** Body of the POST document-pdf endpoint: owner-entered values for the
 *  entry's ask-on-generate fields (scalars keyed by original field name). */
export class GenerateDocumentPdfDto {
  @IsObject()
  generateValues: Record<string, unknown>;
}
