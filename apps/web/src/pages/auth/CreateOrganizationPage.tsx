import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { IconBuilding, IconWorld, IconFileText } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { TextInput, Button } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useUserStore } from '../../stores/userStore';
import { organizationService } from '../../services/organization.service';

const schema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  description: z.string().optional(),
  website: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
});

type CreateOrganizationForm = z.infer<typeof schema>;

export function CreateOrganizationPage() {
  const { refreshUser } = useAuth();
  const userState = useUserStore();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrganizationForm>({
    resolver: zodResolver(schema as any),
    defaultValues: {
      name: '',
      description: '',
      website: '',
    },
  });

  // If user already has an organization, redirect to its templates page
  if (userState.user?.organizationId) {
    navigate(`/o/${userState.user.organizationId}/templates`);
    return null;
  }

  const onSubmit = async (values: CreateOrganizationForm) => {
    try {
      await organizationService.createOrganization({
        name: values.name,
        description: values.description || undefined,
        website: values.website || undefined,
      });

      // Refresh user data to get updated organizationId
      await refreshUser();

      // Navigate to the new org's templates page
      const refreshedUser = useUserStore.getState().user;
      if (refreshedUser?.organizationId) {
        navigate(`/o/${refreshedUser.organizationId}/templates`);
      } else {
        navigate('/');
      }
    } catch (error) {
      // Error is handled by API interceptor and shown as toast
      // We don't need to do anything here
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-900 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-stone-800 rounded-lg shadow-sm border border-stone-200 dark:border-stone-700 p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2 text-center">
              <div className="flex justify-center">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                  <IconBuilding className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">
                Create your organization
              </h1>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Organizations help you keep documents organized and share with your team.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <TextInput
                label="Organization name"
                placeholder="Acme Corporation"
                leftSection={<IconBuilding size={18} />}
                error={errors.name?.message}
                {...register('name')}
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-stone-700 dark:text-stone-200">
                  Description (optional)
                </label>
                <textarea
                  placeholder="What does your organization do?"
                  className="w-full rounded-md border bg-white px-3 py-2 text-sm text-stone-800 transition-colors placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500 border-stone-300 dark:border-stone-600 min-h-[80px] resize-y"
                  {...register('description')}
                />
                {errors.description?.message && (
                  <p className="text-xs text-red-600 dark:text-red-400">{errors.description.message}</p>
                )}
              </div>

              <TextInput
                label="Website (optional)"
                placeholder="https://www.example.com"
                leftSection={<IconWorld size={18} />}
                error={errors.website?.message}
                {...register('website')}
              />

              <Button
                type="submit"
                fullWidth
                size="md"
                loading={isSubmitting}
              >
                {isSubmitting ? 'Creating organization...' : 'Create organization'}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    const orgId = useUserStore.getState().user?.organizationId;
                    if (orgId) {
                      navigate(`/o/${orgId}/templates`);
                    } else {
                      navigate('/');
                    }
                  }}
                  className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
                >
                  Skip for now
                </button>
              </div>
            </form>

            <div className="bg-stone-50 dark:bg-stone-900/50 rounded-md p-4 border border-stone-200 dark:border-stone-700">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <IconFileText className="w-4 h-4 text-stone-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-stone-600 dark:text-stone-400">
                    <span className="font-medium">Note:</span> You can always update your organization details later from settings.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
