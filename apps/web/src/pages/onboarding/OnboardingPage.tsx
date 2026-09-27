import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { IconBuilding, IconFileText, IconArrowRight, IconArrowLeft } from '@tabler/icons-react';
import { Button, Progress } from '../../components/ui';
import { Checkbox } from '../../components/ui/Checkbox';
import { userService } from '../../services/user.service';
import { OrganizationForm } from '../../components/organization/OrganizationForm';
import type { UpdateOnboardingDto } from '../../types/onboarding';
import { UserType, Occupation, DocumentType, OrganizationSize } from '../../types/onboarding';
import type { OrganizationResponse } from '../../types/organization';

const steps = [
  { title: 'Welcome', description: "How will you use Tamidoc?" },
  { title: 'Documents', description: 'What documents will you work on?' },
  { title: 'Organization', description: 'Tell us about your organization' },
  { title: 'Create Workspace', description: 'Create your first organization' },
];

export function OnboardingPage() {
  const { user, refreshUser, setUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [data, setData] = useState<UpdateOnboardingDto>({
    userType: undefined,
    documentTypes: [],
    organizationSize: undefined,
    occupation: undefined,
  });

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleSkip = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    }
  };

  const handleSkipAll = () => {
    setStep(3); // Jump to org step
  };

  const finish = async (organization: OrganizationResponse) => {
    try {
      await refreshUser();

      // Clean up data before sending - remove empty arrays
      const cleanedData: UpdateOnboardingDto = {};
      if (data.userType) cleanedData.userType = data.userType;
      if (data.documentTypes && data.documentTypes.length > 0) {
        cleanedData.documentTypes = data.documentTypes;
      }
      if (data.organizationSize) cleanedData.organizationSize = data.organizationSize;
      if (data.occupation) cleanedData.occupation = data.occupation;

      // Persist onboarding data and mark as completed
      const { user: updated } = await userService.updateOnboarding(cleanedData);
      setUser(updated);

      // Navigate to org-scoped templates
      if (organization._id) {
        navigate(`/o/${organization._id}/templates`);
      } else {
        // Fallback if no org (shouldn't happen after creating one above)
        navigate('/onboarding');
      }
    } catch (error) {
      // Error handled by API interceptor (toast shown)
    }
  };

  // Option card component
  const OptionCard = ({ selected, onClick, children, className = '' }: {
    selected: boolean;
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
        selected
          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 ring-2 ring-orange-500/30'
          : 'border-stone-300 dark:border-stone-600 hover:border-orange-400'
      } ${className}`}
    >
      {children}
    </button>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-900 px-4">
      <div className="w-full max-w-2xl">
        <div className="bg-white dark:bg-stone-800 rounded-lg shadow-sm border border-stone-200 dark:border-stone-700 p-8">
          {/* Header */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm text-stone-500 dark:text-stone-400">
                Step {step + 1} of {steps.length}
              </div>
              {step < 3 && (
                <button
                  type="button"
                  onClick={handleSkipAll}
                  className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
                >
                  Skip setup
                </button>
              )}
            </div>
            <Progress value={((step + 1) / steps.length) * 100} color="orange" size="sm" />
            <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-100 mt-4">
              {steps[step].title}
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
              {steps[step].description}
            </p>
          </div>

          {/* Step 1: User Type */}
          {step === 0 && (
            <div className="space-y-3">
              {(Object.entries(UserType) as [string, string][]).map(([key, label]) => (
                <OptionCard
                  key={key}
                  selected={data.userType === key}
                  onClick={() => setData({ ...data, userType: key as any })}
                >
                  <span className="font-medium text-stone-800 dark:text-stone-100">{label}</span>
                </OptionCard>
              ))}
            </div>
          )}

          {/* Step 2: Document Types */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.entries(DocumentType) as [string, string][]).map(([key, label]) => (
                  <Checkbox
                    key={key}
                    label={label}
                    checked={data.documentTypes?.includes(key as any)}
                    onChange={(checked) => {
                      if (checked) {
                        setData({
                          ...data,
                          documentTypes: [...(data.documentTypes || []), key as any],
                        });
                      } else {
                        setData({
                          ...data,
                          documentTypes: data.documentTypes?.filter((t) => t !== key),
                        });
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Organization Size + Occupation */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-stone-700 dark:text-stone-200 mb-3">
                  Organization Size
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(Object.entries(OrganizationSize) as [string, string][]).map(([key, label]) => (
                    <OptionCard
                      key={key}
                      selected={data.organizationSize === key}
                      onClick={() => setData({ ...data, organizationSize: key as any })}
                      className="p-3"
                    >
                      <span className="text-sm font-medium text-stone-800 dark:text-stone-100">
                        {label}
                      </span>
                    </OptionCard>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-stone-700 dark:text-stone-200 mb-3">
                  Your Occupation
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(Object.entries(Occupation) as [string, string][]).map(([key, label]) => (
                    <OptionCard
                      key={key}
                      selected={data.occupation === key}
                      onClick={() => setData({ ...data, occupation: key as any })}
                      className="p-3"
                    >
                      <span className="text-sm font-medium text-stone-800 dark:text-stone-100">
                        {label}
                      </span>
                    </OptionCard>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Create Organization */}
          {step === 3 && (
            <div className="space-y-6">
              {!user?.organizationId ? (
                <>
                  <div className="flex flex-col gap-4">
                    <div className="text-sm text-stone-600 dark:text-stone-400">
                      Create your first workspace to start using Tamidoc:
                    </div>

                    <div className="max-h-[500px] overflow-y-auto pr-2">
                      <OrganizationForm
                        mode="create"
                        defaultValues={{
                          industry: data.occupation,
                          size: data.organizationSize,
                          brandColor: '#C65D2E',
                        }}
                        onSuccess={finish}
                        submitLabel="Create Workspace & Continue"
                      />
                    </div>
                  </div>

                  <div className="bg-stone-50 dark:bg-stone-900/50 rounded-md p-4 border border-stone-200 dark:border-stone-700">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <IconFileText className="w-4 h-4 text-stone-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-stone-600 dark:text-stone-400">
                          You can always update this later in Settings.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                // User already has org (rare edge case)
                <div className="text-center py-8">
                  <div className="mb-4">
                    <IconBuilding className="w-12 h-12 text-orange-600 dark:text-orange-400 mx-auto" />
                  </div>
                  <h3 className="text-lg font-medium text-stone-800 dark:text-stone-100 mb-2">
                    You already have a workspace
                  </h3>
                  <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
                    Continue to your templates to get started.
                  </p>
                  <Button
                    onClick={() => {
                      navigate(`/o/${user.organizationId}/templates`);
                    }}
                    size="md"
                  >
                    Continue to Templates
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Footer navigation */}
          <div className="flex justify-between items-center mt-8 pt-6 border-t border-stone-200 dark:border-stone-700">
            {step > 0 ? (
              <Button
                type="button"
                variant="subtle"
                size="sm"
                leftSection={<IconArrowLeft size={16} />}
                onClick={handleBack}
              >
                Back
              </Button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="subtle"
                  size="sm"
                  onClick={handleSkip}
                >
                  Skip
                </Button>
                <Button
                  type="button"
                  size="sm"
                  rightSection={<IconArrowRight size={16} />}
                  onClick={handleNext}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
