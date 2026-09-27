import { IsString, IsNotEmpty } from 'class-validator';

export class SetDefaultVersionDto {
  /** Version string to mark as the default (e.g. `v1.2`). Must exist — either
   * the current version or a snapshot in the template's history. */
  @IsString()
  @IsNotEmpty()
  version: string;
}
