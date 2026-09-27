import { IsOptional, IsEnum, IsArray, ArrayNotEmpty } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Enums for onboarding options
export const UserType = {
  business_owner: 'business_owner',
  manager: 'manager',
  team_member: 'team_member',
  consultant: 'consultant',
  freelancer: 'freelancer',
  student: 'student',
  other: 'other',
} as const;

export const Occupation = {
  hr: 'hr',
  legal: 'legal',
  accounting_finance: 'accounting_finance',
  insurance: 'insurance',
  real_estate: 'real_estate',
  consulting: 'consulting',
  operations: 'operations',
  it: 'it',
  marketing_sales: 'marketing_sales',
  education: 'education',
  other: 'other',
} as const;

export const DocumentType = {
  employee_onboarding: 'employee_onboarding',
  offer_letter: 'offer_letter',
  leave_request: 'leave_request',
  performance_review: 'performance_review',
  contract: 'contract',
  nda: 'nda',
  invoice: 'invoice',
  quote: 'quote',
  lease_agreement: 'lease_agreement',
  delivery_receipt: 'delivery_receipt',
  application_form: 'application_form',
  report: 'report',
  other: 'other',
} as const;

export const OrganizationSize = {
  just_me: 'just_me',
  '2_10': '2_10',
  '11_50': '11_50',
  '51_200': '51_200',
  '201_500': '201_500',
  '500_plus': '500_plus',
} as const;

export type UserTypeValue = (typeof UserType)[keyof typeof UserType];
export type OccupationValue = (typeof Occupation)[keyof typeof Occupation];
export type DocumentTypeValue =
  (typeof DocumentType)[keyof typeof DocumentType];
export type OrganizationSizeValue =
  (typeof OrganizationSize)[keyof typeof OrganizationSize];

export class UpdateOnboardingDto {
  @ApiPropertyOptional({
    enum: Object.values(UserType),
    description: 'How the user will use Tamidoc',
    example: 'freelancer',
  })
  @IsOptional()
  @IsEnum(Object.values(UserType))
  userType?: UserTypeValue;

  @ApiPropertyOptional({
    enum: Object.values(DocumentType),
    isArray: true,
    description: 'What documents the user will work on',
    example: ['contract', 'invoice'],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({
    message: 'Document types array cannot be empty if provided',
  })
  @IsEnum(Object.values(DocumentType), { each: true })
  documentTypes?: DocumentTypeValue[];

  @ApiPropertyOptional({
    enum: Object.values(OrganizationSize),
    description: 'Size of the user organization',
    example: '11_50',
  })
  @IsOptional()
  @IsEnum(Object.values(OrganizationSize))
  organizationSize?: OrganizationSizeValue;

  @ApiPropertyOptional({
    enum: Object.values(Occupation),
    description: 'User occupation/industry',
    example: 'legal',
  })
  @IsOptional()
  @IsEnum(Object.values(Occupation))
  occupation?: OccupationValue;
}
