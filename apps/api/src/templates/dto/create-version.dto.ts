import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum VersionSource {
  DUPLICATE = 'duplicate',
  BLANK = 'blank',
  PDF = 'pdf',
  AI = 'ai',
}

export class CreateVersionDto {
  /** Where the new version's content starts from. `duplicate` copies an
   * existing version; `blank`/`pdf`/`ai` start with an empty canvas (the host
   * UI then fills it via PDF import / AI generation and saves). */
  @IsEnum(VersionSource)
  source: VersionSource;

  /** Version string to duplicate (e.g. `v1.2`). Omit to duplicate the current
   * working copy. Ignored unless `source === 'duplicate'`. */
  @IsOptional()
  @IsString()
  fromVersion?: string;

  /** Short note describing the new version (shown in the version list). */
  @IsOptional()
  @IsString()
  changeDescription?: string;
}
