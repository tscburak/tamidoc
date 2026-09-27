import { useEffect, useRef, useState } from 'react';
import { IconCopy, IconKey, IconPlus } from '@tabler/icons-react';
import { Button, Checkbox, Modal, Select, TextInput } from '../ui';
import {
  apiKeysService,
  type ApiKeyPermission,
  type ApiKeySummary,
  type CreatedApiKey,
} from '../../services/api-keys.service';
import { templatesService } from '../../services/templates.service';
import type { TemplateRecord } from '../../context/TemplateStoreProvider';
import { useToast } from '../../context/toast';

const permissionLabel = (permission: ApiKeyPermission) =>
  permission === 'template:read' ? 'Read templates' : 'Generate PDFs';
const dateLabel = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : 'Never';
const getError = (error: unknown, fallback: string) => {
  const data = (
    error as { response?: { data?: { message?: unknown; errors?: unknown } } }
  )?.response?.data;
  if (Array.isArray(data?.errors) && data.errors.length)
    return data.errors
      .filter((item): item is string => typeof item === 'string')
      .join(' ');
  return typeof data?.message === 'string' ? data.message : fallback;
};

export function ApiKeysSection({ organizationId }: { organizationId: string }) {
  // Changing organizations discards the one-time secret and pending UI state.
  return (
    <OrganizationApiKeys key={organizationId} organizationId={organizationId} />
  );
}

function OrganizationApiKeys({ organizationId }: { organizationId: string }) {
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [loadState, setLoadState] = useState<
    'loading' | 'ready' | 'forbidden' | 'error'
  >('loading');
  const [reload, setReload] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKeySummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [revokeError, setRevokeError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiKeysService
      .list(organizationId)
      .then((items) => {
        if (cancelled) return;
        setKeys(items);
        setLoadState('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadState(
          (error as { response?: { status?: number } })?.response?.status ===
            403
            ? 'forbidden'
            : 'error',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, reload]);

  const revoke = async () => {
    if (!revoking || busy) return;
    setBusy(true);
    setRevokeError('');
    try {
      const key = await apiKeysService.revoke(organizationId, revoking.id);
      if (!mounted.current) return;
      setKeys((items) =>
        items.map((item) => (item.id === key.id ? key : item)),
      );
      setRevoking(null);
      toast.show({ title: 'API key revoked', color: 'teal' });
    } catch (error) {
      if (mounted.current)
        setRevokeError(
          getError(error, 'Could not revoke this API key. Try again.'),
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">API keys</h3>
          <p className="mt-1 max-w-xl text-sm text-stone-500 dark:text-stone-400">
            Connect your applications to this organization's templates. Each
            integration has its own key and permissions.
          </p>
        </div>
        {loadState === 'ready' && (
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setCreateOpen(true)}
          >
            Create API key
          </Button>
        )}
      </div>
      {loadState === 'loading' && (
        <p role="status" className="text-sm text-stone-500">
          Loading API keys…
        </p>
      )}
      {loadState === 'forbidden' && (
        <p
          role="alert"
          className="rounded-lg border border-stone-200 p-4 text-sm dark:border-stone-700"
        >
          Only organization owners and admins can manage API keys.
        </p>
      )}
      {loadState === 'error' && (
        <div role="alert" className="space-y-2 text-sm text-red-600">
          <p>Could not load API keys.</p>
          <Button
            variant="default"
            onClick={() => {
              setLoadState('loading');
              setReload((value) => value + 1);
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {loadState === 'ready' &&
        (keys.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-stone-300 px-5 py-10 text-center dark:border-stone-600">
            <IconKey size={28} className="text-stone-400" />
            <p className="font-medium">No API keys yet</p>
            <p className="text-sm text-stone-500">
              Create a key for your first integration.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => {
              const status = key.revokedAt
                ? 'Revoked'
                : key.expiresAt &&
                    new Date(key.expiresAt).getTime() <= now
                  ? 'Expired'
                  : 'Active';
              return (
                <article
                  key={key.id}
                  className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="break-words font-semibold">
                          {key.name}
                        </h4>
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${status === 'Active' ? 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300' : 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-300'}`}
                        >
                          {status}
                        </span>
                      </div>
                      <code className="mt-1 block text-xs text-stone-500">
                        {key.prefix}_••••
                      </code>
                    </div>
                    {!key.revokedAt && (
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        aria-label={`Revoke ${key.name}`}
                        onClick={() => {
                          setRevokeError('');
                          setRevoking(key);
                        }}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                  <p className="mt-3 text-sm">
                    {key.permissions.map(permissionLabel).join(' · ')}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {key.templateIds
                      ? `${key.templateIds.length} selected template${key.templateIds.length === 1 ? '' : 's'}`
                      : 'All templates, including future templates'}
                  </p>
                  {key.templateIds && (
                    <details className="mt-1 text-xs text-stone-500">
                      <summary className="cursor-pointer">Template IDs</summary>
                      <ul className="mt-1 space-y-1">
                        {key.templateIds.map((id) => (
                          <li key={id}>
                            <code>{id}</code>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                    <div>
                      <dt className="text-stone-500">Created</dt>
                      <dd>{dateLabel(key.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-stone-500">Last used</dt>
                      <dd>
                        {key.lastUsedAt
                          ? new Date(key.lastUsedAt).toLocaleString()
                          : 'Never used'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-stone-500">
                        {key.revokedAt ? 'Revoked' : 'Expires'}
                      </dt>
                      <dd>{dateLabel(key.revokedAt || key.expiresAt)}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        ))}
      {loadState === 'ready' && (
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Keys belong to the organization and remain active until they expire or
          are revoked. Their creator's membership does not control integration
          access.
        </p>
      )}
      {createOpen && (
        <CreateApiKeyModal
          organizationId={organizationId}
          onClose={() => setCreateOpen(false)}
          onCreated={(result) => {
            if (!mounted.current) return;
            setKeys((items) => [result.key, ...items]);
            setCreateOpen(false);
            setCreated(result);
          }}
        />
      )}
      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        title="Save your API key"
        subtitle="Copy this key now. You won't be able to see it again."
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setCreated(null)}>Done</Button>
          </div>
        }
      >
        {created && (
          <div className="space-y-4">
            <TextInput
              label="API key"
              value={created.secret}
              readOnly
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
              onFocus={(event) => event.target.select()}
            />
            <Button
              variant="default"
              leftSection={<IconCopy size={16} />}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(created.secret);
                  toast.show({ title: 'API key copied', color: 'teal' });
                } catch {
                  toast.show({
                    title: 'Could not copy',
                    message: 'Select the key and copy it manually.',
                    color: 'red',
                  });
                }
              }}
            >
              Copy API key
            </Button>
            <p className="text-sm text-stone-500">
              Store it in your server's environment or secret manager. Send it
              as <code>Authorization: Bearer YOUR_API_KEY</code> when calling
              the template API.
            </p>
          </div>
        )}
      </Modal>
      <Modal
        open={!!revoking}
        onClose={() => {
          if (!busy) setRevoking(null);
        }}
        title="Revoke API key?"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="default"
              disabled={busy}
              onClick={() => setRevoking(null)}
            >
              Cancel
            </Button>
            <Button color="red" loading={busy} onClick={() => void revoke()}>
              Revoke key
            </Button>
          </div>
        }
      >
        <p className="text-sm">
          Requests using <strong>{revoking?.name}</strong> will stop working.
          Revocation is permanent.
        </p>
        {revokeError && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {revokeError}
          </p>
        )}
      </Modal>
    </div>
  );
}

function CreateApiKeyModal({
  organizationId,
  onClose,
  onCreated,
}: {
  organizationId: string;
  onClose: () => void;
  onCreated: (result: CreatedApiKey) => void;
}) {
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<ApiKeyPermission[]>([
    'template:read',
    'template:generate',
  ]);
  const [expiration, setExpiration] = useState('90');
  const [access, setAccess] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[] | null>(null);
  const [templatesError, setTemplatesError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (access !== 'selected') return;
    let cancelled = false;
    const load = async () => {
      const items: TemplateRecord[] = [];
      for (let page = 1; ; page += 1) {
        const result = await templatesService.findAll(organizationId, {
          page,
          limit: 100,
          sortBy: 'name',
          sortOrder: 'asc',
        });
        if (cancelled) return;
        items.push(...result.templates);
        if (items.length >= result.total || result.templates.length === 0)
          break;
      }
      setTemplates([...new Map(items.map((item) => [item.id, item])).values()]);
    };
    void load().catch(() => {
      if (!cancelled) setTemplatesError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [access, organizationId, retry]);

  const create = async () => {
    if (busy) return;
    if (!name.trim()) {
      setError('Give this key a name.');
      return;
    }
    if (!permissions.length) {
      setError('Select at least one permission.');
      return;
    }
    if (
      access === 'selected' &&
      (!selected.length || templatesError || !templates)
    ) {
      setError('Select at least one available template.');
      return;
    }
    if (selected.length > 100 && access === 'selected') {
      setError('Select up to 100 templates per key.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await apiKeysService.create(organizationId, {
        name: name.trim(),
        permissions,
        ...(access === 'selected' ? { templateIds: selected } : {}),
        expiresAt:
          expiration === 'never'
            ? null
            : new Date(
                Date.now() + Number(expiration) * 86400000,
              ).toISOString(),
      });
      if (mounted.current) onCreated(result);
    } catch (failure) {
      if (mounted.current)
        setError(getError(failure, 'Could not create an API key. Try again.'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Create API key"
      subtitle="Choose what this integration can access."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="default" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void create()}>
            Create key
          </Button>
        </div>
      }
    >
      <fieldset disabled={busy} className="space-y-5">
        <TextInput
          label="Key name"
          placeholder="e.g. Production CRM"
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Permissions</legend>
          {(['template:read', 'template:generate'] as ApiKeyPermission[]).map(
            (permission) => (
              <Checkbox
                key={permission}
                label={permissionLabel(permission)}
                description={
                  permission === 'template:read'
                    ? 'Read template definitions and version history.'
                    : 'Validate content and generate PDFs from fixed and composable templates.'
                }
                checked={permissions.includes(permission)}
                onChange={(event) =>
                  setPermissions((items) =>
                    event.target.checked
                      ? [...items, permission]
                      : items.filter((item) => item !== permission),
                  )
                }
              />
            ),
          )}
        </fieldset>
        <Select
          label="Expiration"
          value={expiration}
          onChange={(event) => setExpiration(event.target.value)}
          options={[
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
            { value: '365', label: '1 year' },
            { value: 'never', label: 'No expiration' },
          ]}
        />
        <Select
          label="Template access"
          value={access}
          onChange={(event) => {
            setAccess(event.target.value);
            setTemplatesError(false);
          }}
          options={[
            { value: 'all', label: 'All templates in this organization' },
            { value: 'selected', label: 'Selected templates only' },
          ]}
        />
        {access === 'selected' && (
          <div className="space-y-2">
            {templatesError ? (
              <div role="alert" className="space-y-2 text-sm text-red-600">
                <p>Could not load templates.</p>
                <Button
                  variant="default"
                  size="xs"
                  onClick={() => {
                    setTemplatesError(false);
                    setTemplates(null);
                    setRetry((value) => value + 1);
                  }}
                >
                  Retry templates
                </Button>
              </div>
            ) : !templates ? (
              <p role="status" className="text-sm text-stone-500">
                Loading templates…
              </p>
            ) : (
              <>
                <TextInput
                  label="Search templates"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <p className="text-xs text-stone-500">
                  {selected.length} selected · Up to 100 templates
                </p>
                <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border border-stone-200 p-3 dark:border-stone-700">
                  {templates
                    .filter((template) =>
                      template.name
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((template) => (
                      <Checkbox
                        key={template.id}
                        label={template.name}
                        checked={selected.includes(template.id)}
                        onChange={(event) =>
                          setSelected((items) =>
                            event.target.checked
                              ? [...items, template.id]
                              : items.filter((id) => id !== template.id),
                          )
                        }
                      />
                    ))}
                  {templates.length === 0 && (
                    <p className="text-sm text-stone-500">
                      No templates are available.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </fieldset>
    </Modal>
  );
}
