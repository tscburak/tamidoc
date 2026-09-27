import { PartialType } from '@nestjs/mapped-types';
import { CreateOrganizationDto } from './create-organization.dto';

/**
 * DTO for updating an organization
 * All fields are optional via PartialType
 */
export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}
