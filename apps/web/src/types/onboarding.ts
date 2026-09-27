// Enums for onboarding options (mirrors backend)

export const UserType = {
  business_owner: 'Business Owner',
  manager: 'Manager',
  team_member: 'Team Member',
  consultant: 'Consultant',
  freelancer: 'Freelancer',
  student: 'Student',
  other: 'Other',
} as const;

export const Occupation = {
  hr: 'Human Resources',
  legal: 'Legal',
  accounting_finance: 'Accounting & Finance',
  insurance: 'Insurance',
  real_estate: 'Real Estate',
  consulting: 'Consulting',
  operations: 'Operations',
  it: 'IT / Technology',
  marketing_sales: 'Marketing & Sales',
  education: 'Education',
  other: 'Other',
} as const;

export const DocumentType = {
  employee_onboarding: 'Employee Onboarding',
  offer_letter: 'Offer Letter',
  leave_request: 'Leave Request',
  performance_review: 'Performance Review',
  contract: 'Contract',
  nda: 'NDA',
  invoice: 'Invoice',
  quote: 'Quote',
  lease_agreement: 'Lease Agreement',
  delivery_receipt: 'Delivery Receipt',
  application_form: 'Application Form',
  report: 'Report',
  other: 'Other',
} as const;

export const OrganizationSize = {
  just_me: 'Just me',
  '2_10': '2-10 people',
  '11_50': '11-50 people',
  '51_200': '51-200 people',
  '201_500': '201-500 people',
  '500_plus': '500+ people',
} as const;

// Type exports
export type UserTypeValue = keyof typeof UserType;
export type OccupationValue = keyof typeof Occupation;
export type DocumentTypeValue = keyof typeof DocumentType;
export type OrganizationSizeValue = keyof typeof OrganizationSize;

// DTO for onboarding update
export interface UpdateOnboardingDto {
  userType?: UserTypeValue;
  documentTypes?: DocumentTypeValue[];
  organizationSize?: OrganizationSizeValue;
  occupation?: OccupationValue;
}
