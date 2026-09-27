import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  IconArrowLeft,
  IconSettings,
  IconTag,
  IconBuilding,
  IconChevronLeft,
  IconPalette,
  IconKey,
} from '@tabler/icons-react';
import { Avatar, Spinner, TextInput, Select, Textarea, ColorPicker, FileInput, Button } from '../../components/ui';
import { settingsNav, SettingsSection } from '@edition';
import { TagsSection } from '../../components/organization/TagsSection';
import { ApiKeysSection } from '../../components/organization/ApiKeysSection';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/toast';
import { organizationService } from '../../services/organization.service';
import { getOrganizationLogoUrl } from '../../lib/assets';
import { Occupation, OrganizationSize } from '../../types/onboarding';
import type { OrganizationResponse } from '../../types/organization';

type Section = string;

const NAV: { key: Section; label: string; icon: typeof IconSettings; description: string }[] = [
  { key: 'general', label: 'General', icon: IconSettings, description: 'Organization details and logo' },
  { key: 'brand', label: 'White Label', icon: IconPalette, description: 'Colors and font for white-labeled documents' },
  ...settingsNav,
  { key: 'tags', label: 'Tags', icon: IconTag, description: 'Template tag palette' },
  { key: 'api-keys', label: 'API Keys', icon: IconKey, description: 'Integration keys and access' },
];

// Editable form shape. Mirrors the shared OrganizationForm, plus the new
// brand-kit fields (accentColor + font).
const organizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(100, 'Organization name must not exceed 100 characters'),
  website: z.string().url('Website must be a valid URL').or(z.literal('')).optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  description: z.string().max(500, 'Description must not exceed 500 characters').optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Brand color must be a valid hex color (e.g., #C65D2E)').optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Accent color must be a valid hex color (e.g., #2D6A4F)').optional(),
  font: z.string().optional(),
  logo: z.any().optional(),
});

type OrganizationFormData = z.infer<typeof organizationSchema>;

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Lora', label: 'Lora' },
  { value: 'Merriweather', label: 'Merriweather' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Source Sans 3', label: 'Source Sans 3' },
];

const FONT_STACKS: Record<string, string> = {
  Inter: "'Inter', system-ui, sans-serif",
  Roboto: "'Roboto', system-ui, sans-serif",
  'Open Sans': "'Open Sans', system-ui, sans-serif",
  Lora: "'Lora', Georgia, serif",
  Merriweather: "'Merriweather', Georgia, serif",
  Poppins: "'Poppins', system-ui, sans-serif",
  'Source Sans 3': "'Source Sans 3', system-ui, sans-serif",
};

const INDUSTRY_OPTIONS = Object.entries(Occupation).map(([value, label]) => ({ value, label }));
const SIZE_OPTIONS = Object.entries(OrganizationSize).map(([value, label]) => ({ value, label }));

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function orgToFormValues(org: OrganizationResponse): OrganizationFormData {
  return {
    name: org.name ?? '',
    website: org.website ?? '',
    industry: org.industry ?? '',
    size: org.size ?? '',
    description: org.description ?? '',
    brandColor: org.settings?.branding?.primaryColor ?? '#C65D2E',
    accentColor: org.settings?.branding?.accentColor ?? '#2D6A4F',
    font: org.settings?.branding?.font ?? 'Inter',
    logo: null,
  };
}

export function OrganizationSettingsPage() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { show } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = NAV.find((item) => item.key === searchParams.get('section'))?.key ?? 'general';
  const setSection = (next: Section) => setSearchParams((params) => { params.set('section', next); return params; });
  const [organization, setOrganization] = useState<OrganizationResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema as any),
    defaultValues: {
      name: '',
      website: '',
      industry: '',
      size: '',
      description: '',
      brandColor: '#C65D2E',
      accentColor: '#2D6A4F',
      font: 'Inter',
      logo: null,
    },
  });

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    organizationService
      .getOrganizationById(organizationId)
      .then((org) => {
        setOrganization(org);
        reset(orgToFormValues(org));
      })
      .catch(() => {
        show({ title: 'Error', message: 'Failed to load organization', color: 'red' });
      })
      .finally(() => setLoading(false));
  }, [organizationId, show, reset]);

  const onSave = async (data: OrganizationFormData) => {
    if (!organizationId) return;
    try {
      const dto = {
        name: data.name,
        description: data.description,
        website: data.website || undefined,
        industry: data.industry,
        size: data.size,
        brandColor: data.brandColor,
        accentColor: data.accentColor,
        font: data.font,
      };

      let updated = await organizationService.updateOrganization(organizationId, dto);

      // Logo uses a dedicated upload endpoint, separate from the update DTO.
      if (data.logo && data.logo instanceof File) {
        try {
          const logoResult = await organizationService.uploadLogo(organizationId, data.logo);
          updated = logoResult.organization;
        } catch (logoError) {
          console.error('Failed to upload logo:', logoError);
        }
      }

      show({ title: 'Saved', message: 'Organization updated', color: 'teal' });
      setOrganization(updated);
      reset(orgToFormValues(updated));
      await refreshUser();
    } catch (error) {
      console.error('Failed to save organization:', error);
      show({ title: 'Error', message: 'Failed to save organization', color: 'red' });
    }
  };

  const active = NAV.find((n) => n.key === section)!;
  const brandColorWatch = watch('brandColor');
  const accentColorWatch = watch('accentColor');
  const fontWatch = watch('font');
  const nameWatch = watch('name');
  const logoFile = watch('logo');

  // Manage the pending-upload object URL lifecycle to avoid leaking one per render.
  const [pendingLogoSrc, setPendingLogoSrc] = useState<string | null>(null);
  useEffect(() => {
    if (logoFile && logoFile instanceof File) {
      const url = URL.createObjectURL(logoFile);
      setPendingLogoSrc(url);
      return () => URL.revokeObjectURL(url);
    }
    setPendingLogoSrc(null);
  }, [logoFile]);

  // Brand preview source: pending upload takes priority, else the saved logo
  // served through the API proxy (cache-busted with updatedAt so a fresh
  // upload isn't masked by the 24h response cache).
  const brandPreviewSrc =
    pendingLogoSrc ||
    (organization?.logo && organizationId ? getOrganizationLogoUrl(organizationId, organization.updatedAt) : undefined);
  const fontFamily = FONT_STACKS[fontWatch || 'Inter'] || FONT_STACKS.Inter;
  const hasEditableSection = section === 'general' || section === 'brand';

  return (
    <div className="flex h-screen overflow-hidden bg-stone-50 text-stone-800 dark:bg-stone-900 dark:text-stone-100">
      {/* Admin sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800">
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3 dark:border-stone-700">
          <button
            onClick={() => navigate(`/o/${organizationId}/templates`)}
            className="flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-orange-600 dark:text-stone-400"
          >
            <IconArrowLeft size={16} />
            Back to app
          </button>
        </div>

        {/* Org header */}
        <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-4 dark:border-stone-700">
          <Avatar
            size="md"
            radius="xl"
            src={organization?.logo && organizationId ? getOrganizationLogoUrl(organizationId, organization.updatedAt) : undefined}
            style={{ backgroundColor: brandColorWatch || '#C65D2E', color: 'white' }}
          >
            {organization ? getInitials(organization.name) : '…'}
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{organization?.name ?? 'Loading…'}</p>
            <p className="flex items-center gap-1 text-xs text-stone-400">
              <IconBuilding size={12} /> Admin panel
            </p>
          </div>
        </div>

        {/* Section nav */}
        <nav className="flex flex-col gap-0.5 p-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = section === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
                    : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-stone-200 px-8 py-5 dark:border-stone-700">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{active.label}</h1>
            <p className="truncate text-sm text-stone-500 dark:text-stone-400">{active.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasEditableSection && (
              <Button
                type="button"
                onClick={handleSubmit(onSave)}
                variant="filled"
                color="orange"
                loading={isSubmitting}
                disabled={!isDirty || isSubmitting}
              >
                Save Changes
              </Button>
            )}
            <Button
            variant='subtle'
              onClick={() => navigate(`/o/${organizationId}/templates`)}
              className="hidden items-center gap-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-600 transition-colors hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700 sm:flex"
            >
              <IconChevronLeft size={16} />
              Exit
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : !organizationId || !organization ? (
            <p className="py-16 text-center text-stone-500">Organization not found.</p>
          ) : (
            <div className="mx-auto max-w-3xl">
              {section === 'general' && (
                <div className="max-w-xl space-y-4">
                  <TextInput
                    label="Organization Name *"
                    placeholder="Acme Corporation"
                    error={errors.name?.message}
                    {...register('name')}
                  />

                  <Select
                    label="Industry *"
                    placeholder="Select your industry"
                    options={INDUSTRY_OPTIONS}
                    error={errors.industry?.message}
                    {...register('industry')}
                  />

                  <Select
                    label="Organization Size *"
                    placeholder="Select your organization size"
                    options={SIZE_OPTIONS}
                    error={errors.size?.message}
                    {...register('size')}
                  />

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
                    description={`${(watch('description') || '').length}/500 characters`}
                    {...register('description')}
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
                </div>
              )}

              {section === 'brand' && (
                <div className="max-w-xl space-y-6">
                  {/* Live brand preview — single source of truth for templates */}
                  <div
                    className="rounded-lg border border-stone-200 p-5 dark:border-stone-700"
                    style={{ fontFamily }}
                  >
                    <div className="flex items-center gap-4">
                      {brandPreviewSrc ? (
                        <img
                          src={brandPreviewSrc}
                          alt="Logo preview"
                          className="h-16 w-16 rounded-full object-cover"
                        />
                      ) : (
                        <Avatar
                          size="lg"
                          radius="xl"
                          style={{ backgroundColor: brandColorWatch || '#C65D2E', color: 'white' }}
                        >
                          {getInitials(nameWatch || organization.name || 'OR')}
                        </Avatar>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold text-stone-900 dark:text-stone-100">
                          {nameWatch || organization.name}
                        </p>
                        <p className="text-xs text-stone-500 dark:text-stone-400">Preview</p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-white"
                        style={{ backgroundColor: brandColorWatch || '#C65D2E' }}
                      >
                        Primary
                      </span>
                      <span
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-white"
                        style={{ backgroundColor: accentColorWatch || '#2D6A4F' }}
                      >
                        Accent
                      </span>
                      <span className="text-xs text-stone-500 dark:text-stone-400">
                        {fontWatch || 'Inter'}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-stone-600 dark:text-stone-300">
                      The quick brown fox jumps over the lazy dog.
                    </p>
                  </div>

                  <Controller
                    name="brandColor"
                    control={control}
                    render={({ field }) => (
                      <ColorPicker
                        {...field}
                        label="Brand Color"
                        description="Primary brand color applied across templates"
                        error={errors.brandColor?.message}
                      />
                    )}
                  />

                  <Controller
                    name="accentColor"
                    control={control}
                    render={({ field }) => (
                      <ColorPicker
                        {...field}
                        label="Accent Color"
                        description="Secondary color for highlights and accents"
                        error={errors.accentColor?.message}
                      />
                    )}
                  />

                  <Select
                    label="Font"
                    description="Default font for generated documents"
                    options={FONT_OPTIONS}
                    {...register('font')}
                  />
                </div>
              )}

              {organizationId && <SettingsSection section={section} organizationId={organizationId} />}
              {section === 'tags' && <TagsSection organizationId={organizationId} />}
              {section === 'api-keys' && <ApiKeysSection organizationId={organizationId} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
