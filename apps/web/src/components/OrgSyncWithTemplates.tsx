import { useParams } from 'react-router-dom';
import { TemplateStoreProvider } from '../context/TemplateStoreProvider';
import { OrgSync } from './auth';

/**
 * Wrapper component that provides organizationId to TemplateStoreProvider
 * and wraps the OrgSync component for organization-scoped routes.
 */
export function OrgSyncWithTemplates() {
  const { organizationId } = useParams<{ organizationId: string }>();

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-stone-600 dark:text-stone-400">Invalid organization URL</p>
      </div>
    );
  }

  return (
    <TemplateStoreProvider organizationId={organizationId}>
      <OrgSync />
    </TemplateStoreProvider>
  );
}
