import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TextInput } from '../ui/TextInput';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { ColorPicker } from '../ui/ColorPicker';
import { FileInput } from '../ui/FileInput';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Occupation, OrganizationSize } from '../../types/onboarding';
import { organizationService } from '../../services/organization.service';
import type { CreateOrganizationDto, OrganizationResponse } from '../../types/organization';

// Form validation schema
const organizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(100, 'Organization name must not exceed 100 characters'),
  website: z.string().url('Website must be a valid URL').or(z.literal('')).optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  description: z.string().max(500, 'Description must not exceed 500 characters').optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Brand color must be a valid hex color (e.g., #C65D2E)').optional(),
  logo: z.any().optional(),
});

type OrganizationFormData = z.infer<typeof organizationSchema>;

interface OrganizationFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<OrganizationFormData>;
  onSuccess: (organization: OrganizationResponse) => void;
  submitLabel?: string;
  organizationId?: string; // Required for edit mode
}

/**
 * Reusable organization form with live preview
 * Used in both onboarding (Step 4) and settings page
 */
export function OrganizationForm({
  mode,
  defaultValues,
  onSuccess,
  submitLabel,
  organizationId,
}: OrganizationFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema as any),
    defaultValues: {
      name: '',
      website: '',
      industry: '',
      size: '',
      description: '',
      brandColor: '#C65D2E',
      logo: null,
      ...defaultValues,
    },
  });

  const nameValue = watch('name');
  const brandColorValue = watch('brandColor');
  const logoFile = watch('logo');

  // Get initials from name for avatar
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const onSubmit = async (data: OrganizationFormData) => {
    try {
      console.log('Form data submitted:', data);
      console.log('Logo file:', data.logo);
      console.log('Is File?', data.logo instanceof File);

      let organization: OrganizationResponse;

      if (mode === 'create') {
        // Create organization
        const dto: CreateOrganizationDto = {
          name: data.name,
          description: data.description,
          website: data.website || undefined,
          industry: data.industry,
          size: data.size,
          brandColor: data.brandColor,
        };

        console.log('Creating organization with DTO:', dto);
        const result = await organizationService.createOrganization(dto);
        organization = result.organization;
        console.log('Organization created:', organization);

        // Upload logo if provided
        if (data.logo && data.logo instanceof File) {
          console.log('Uploading logo:', data.logo.name, data.logo.size, data.logo.type);
          try {
            const logoResult = await organizationService.uploadLogo(organization._id, data.logo);
            organization = logoResult.organization;
            console.log('Logo uploaded successfully:', organization);
          } catch (logoError) {
            console.error('Failed to upload logo:', logoError);
            // Continue without logo - organization is already created
          }
        } else {
          console.log('No logo to upload or logo is not a File instance');
        }
      } else {
        // Edit mode
        if (!organizationId) {
          throw new Error('Organization ID is required for edit mode');
        }

        const dto: Partial<CreateOrganizationDto> = {
          name: data.name,
          description: data.description,
          website: data.website || undefined,
          industry: data.industry,
          size: data.size,
          brandColor: data.brandColor,
        };

        organization = await organizationService.updateOrganization(organizationId, dto);

        // Upload new logo if provided
        if (data.logo && data.logo instanceof File) {
          try {
            const logoResult = await organizationService.uploadLogo(organizationId, data.logo);
            organization = logoResult.organization;
          } catch (logoError) {
            console.error('Failed to upload logo:', logoError);
          }
        }
      }

      onSuccess(organization);
    } catch (error) {
      console.error('Failed to save organization:', error);
      // You might want to show a toast notification here
    }
  };

  // Prepare dropdown options
  const industryOptions = Object.entries(Occupation).map(([key, label]) => ({
    value: key,
    label: label,
  }));

  const sizeOptions = Object.entries(OrganizationSize).map(([key, label]) => ({
    value: key,
    label: label,
  }));

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Live Preview */}
      {(nameValue || logoFile) && (
        <div className="mb-6 flex items-center gap-4 rounded-lg bg-stone-50 p-4 dark:bg-stone-800">
          <div className="relative">
            {logoFile && logoFile instanceof File ? (
              <img
                src={URL.createObjectURL(logoFile)}
                alt="Logo preview"
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <Avatar
                size="lg"
                radius="xl"
                style={{
                  backgroundColor: brandColorValue || '#C65D2E',
                  color: 'white',
                }}
              >
                {getInitials(nameValue || 'OR')}
              </Avatar>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
              {nameValue || 'Organization Name'}
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Live Preview
            </p>
          </div>
        </div>
      )}

      {/* Required Fields */}
      <TextInput
        label="Organization Name *"
        placeholder="Acme Corporation"
        error={errors.name?.message}
        {...register('name')}
      />

      <Select
        label="Industry *"
        placeholder="Select your industry"
        options={industryOptions}
        error={errors.industry?.message}
        {...register('industry')}
      />

      <Select
        label="Organization Size *"
        placeholder="Select your organization size"
        options={sizeOptions}
        error={errors.size?.message}
        {...register('size')}
      />

      {/* Optional Fields */}
      <TextInput
        label="Website"
        placeholder="https://www.example.com"
        error={errors.website?.message}
        {...register('website')}
      />

      <Textarea
        label="Description"
        placeholder="Tell us about your organization..."
        rows={3}
        error={errors.description?.message}
        description={`${
          (watch('description') || '').length
        }/500 characters`}
        {...register('description')}
      />

      <Controller
        name="brandColor"
        control={control}
        render={({ field }) => (
          <ColorPicker
            {...field}
            label="Brand Color"
            description="Choose your organization's brand color"
            error={errors.brandColor?.message}
          />
        )}
      />

      <Controller
        name="logo"
        control={control}
        render={({ field }) => (
          <FileInput
            {...field}
            label="Logo"
            description="Upload your organization logo (optional)"
            accept="image/*"
            maxSizeMB={2}
          />
        )}
      />

      <Button
        type="submit"
        variant="filled"
        color="orange"
        size="lg"
        fullWidth
        loading={isSubmitting}
      >
        {submitLabel || (mode === 'create' ? 'Create Organization' : 'Save Changes')}
      </Button>
    </form>
  );
}