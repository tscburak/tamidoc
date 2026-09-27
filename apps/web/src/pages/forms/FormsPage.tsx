import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  IconPlus,
  IconLink,
  IconTrash,
  IconArrowRight,
  IconForms,
  IconStack,
  IconDots,
  IconPlayerPause,
  IconPlayerPlay,
  IconCheck,
  IconSearch,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { Button, Badge, Dropdown, DropdownItem, DropdownDivider, Modal, ConfirmDialog, Spinner } from '../../components/ui';
import { fieldInputCls } from '../../components/forms';
import { useTemplateStore } from '../../context/TemplateStoreProvider';
import { useToast } from '../../context/toast';
import { formsService, type FormRecord, type FormStatus } from '../../services/forms.service';
import { stackFormsService, type StackFormRecord, type StackFormStatus } from '../../services/stack-forms.service';
import { templatesService, type TemplateVersionSummary } from '../../services/templates.service';
import { cn } from '../../lib/cn';

type ActiveStatus = FormStatus | StackFormStatus; // stacks can also be 'draft'

/** Unified list item: a regular form (1 template) or a stack form (N templates). */
type ListItem =
  | { kind: 'form'; data: FormRecord }
  | { kind: 'stack'; data: StackFormRecord };

const STATUS_META: Record<ActiveStatus, { label: string; color: 'green' | 'amber' | 'gray' }> = {
  draft: { label: 'Draft', color: 'gray' },
  active: { label: 'Active', color: 'green' },
  paused: { label: 'Paused', color: 'amber' },
  archived: { label: 'Archived', color: 'gray' },
};

export function FormsPage() {
  const { organizationId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const store = useTemplateStore();
  const [searchParams] = useSearchParams();

  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTplIds, setSelectedTplIds] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [versionByTpl, setVersionByTpl] = useState<Record<string, string>>({});
  const [versionsListByTpl, setVersionsListByTpl] = useState<Record<string, TemplateVersionSummary[]>>({});

  // Delete confirm state
  const [toDelete, setToDelete] = useState<ListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const buildPath = (path: string) => `/o/${organizationId}/${path}`;
  const publishedTemplates = store.templates.filter((t) => t.status === 'published');
  const filtered = publishedTemplates.filter((t) =>
    !search.trim() ? true : t.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      setError(null);
      const [f, s] = await Promise.all([
        formsService.list(organizationId),
        stackFormsService.list(organizationId),
      ]);
      const merged: ListItem[] = [
        ...f.forms.map((d) => ({ kind: 'form' as const, data: d })),
        ...s.stacks.map((d) => ({ kind: 'stack' as const, data: d })),
      ];
      merged.sort((a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime());
      setItems(merged);
    } catch {
      setError('Failed to load forms.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  // Pre-open the create modal when navigated with ?templateId= (from TemplatesPage)
  useEffect(() => {
    const preset = searchParams.get('templateId');
    if (preset) {
      setSelectedTplIds(new Set([preset]));
      setCreateOpen(true);
    }
  }, [searchParams]);

  const ensureVersions = useCallback(
    (id: string) => {
      if (!organizationId || versionsListByTpl[id]) return;
      templatesService
        .listVersions(organizationId, id)
        .then((list) => {
          setVersionsListByTpl((prev) => ({ ...prev, [id]: list }));
          const initial =
            list.find((v) => v.isDefault)?.version ??
            list.find((v) => v.isCurrent)?.version ??
            list[0]?.version ??
            '';
          setVersionByTpl((prev) => ({ ...prev, [id]: initial }));
        })
        .catch((err) => console.error('Failed to load template versions:', err));
    },
    [organizationId, versionsListByTpl],
  );

  const resetCreate = () => {
    setSelectedTplIds(new Set());
    setSearch('');
    setVersionByTpl({});
    setVersionsListByTpl({});
  };

  const toggleTpl = (id: string) => {
    setSelectedTplIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        ensureVersions(id);
      }
      return next;
    });
  };

  // Continue to the shared review step (single + stack).
  const continueToReview = async () => {
    if (!organizationId || selectedTplIds.size === 0) return;
    const ids = Array.from(selectedTplIds);
    const mode = ids.length >= 2 ? 'stack' : 'single';
    try {
      if (mode === 'single') {
        navigate(
          buildPath(
            `forms/review?mode=single&templateId=${ids[0]}${versionByTpl[ids[0]] ? `&version=${versionByTpl[ids[0]]}` : ''}`,
          ),
        );
      } else {
        // Create a draft stack server-side — the review URL carries only its id
        // (template id lists made URLs unboundedly long). Name is set later, in
        // the review page's publish step.
        const versions: Record<string, string> = {};
        ids.forEach((id) => {
          if (versionByTpl[id]) versions[id] = versionByTpl[id];
        });
        const draft = await stackFormsService.create(organizationId, {
          templateIds: ids,
          versions: Object.keys(versions).length ? versions : undefined,
          draft: true,
        });
        navigate(buildPath(`forms/review?mode=stack&draft=${draft.id}`));
      }
      resetCreate();
      setCreateOpen(false);
    } catch {
      /* axios surfaces toast */
    }
  };

  const copyLink = async (item: ListItem) => {
    const link = `${window.location.origin}/${item.kind === 'stack' ? 'fs' : 'f'}/${item.data.token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.show({ title: 'Link copied', message: 'Shareable form link copied to clipboard.', color: 'teal' });
    } catch {
      toast.show({ title: 'Copy failed', message: link, color: 'orange' });
    }
  };

  const toggleStatus = async (item: ListItem) => {
    if (!organizationId) return;
    const next: ActiveStatus = item.data.status === 'active' ? 'paused' : 'active';
    try {
      if (item.kind === 'form') {
        const updated = await formsService.update(organizationId, item.data.id, { status: next });
        setItems((prev) => prev.map((x) => (x.kind === 'form' && x.data.id === updated.id ? { kind: 'form', data: updated } : x)));
      } else {
        const updated = await stackFormsService.update(organizationId, item.data.id, { status: next });
        setItems((prev) => prev.map((x) => (x.kind === 'stack' && x.data.id === updated.id ? { kind: 'stack', data: updated } : x)));
      }
    } catch {
      /* toast handled by axios layer */
    }
  };

  const confirmDelete = async () => {
    if (!organizationId || !toDelete) return;
    setDeleting(true);
    try {
      if (toDelete.kind === 'form') {
        await formsService.remove(organizationId, toDelete.data.id);
      } else {
        await stackFormsService.remove(organizationId, toDelete.data.id);
      }
      setItems((prev) => prev.filter((x) => x.data.id !== toDelete.data.id));
    } catch {
      /* toast handled by axios layer */
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  const isStack = selectedTplIds.size >= 2;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100">Forms</h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Publish a template as a shareable form. Pick more than one template to build a stack form — shared fields unify, each submission produces a document per template.
          </p>
        </div>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => {
            resetCreate();
            setCreateOpen(true);
          }}
        >
          New form
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <Button variant="default" onClick={load}>Retry</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-stone-300 py-16 text-center dark:border-stone-700">
          <IconForms size={32} className="text-stone-400" />
          <p className="text-sm font-medium text-stone-700 dark:text-stone-200">No forms yet</p>
          <p className="max-w-sm text-xs text-stone-500 dark:text-stone-400">
            Publish a template to get a shareable link. Select multiple templates to create a stack form.
          </p>
          <Button leftSection={<IconPlus size={16} />} onClick={() => { resetCreate(); setCreateOpen(true); }}>
            Create your first form
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const meta = STATUS_META[item.data.status];
            const expired = item.data.expiresAt ? new Date(item.data.expiresAt).getTime() < Date.now() : false;
            const tplName = item.kind === 'form' ? store.getTemplate(item.data.templateId)?.name : undefined;
            const entryNames = item.kind === 'stack' ? item.data.entries.map((e) => e.name) : [];
            return (
              <div
                key={`${item.kind}-${item.data.id}`}
                className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-stone-700 dark:bg-stone-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {item.kind === 'stack' && <IconStack size={14} className="shrink-0 text-orange-500" />}
                      <h3 className="truncate font-semibold text-stone-800 dark:text-stone-100">{item.data.name}</h3>
                    </div>
                    <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                      {item.kind === 'form'
                        ? tplName ? `From: ${tplName}` : `Template · ${item.data.templateVersion}`
                        : `${entryNames.length} template${entryNames.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <Dropdown
                    align="end"
                    trigger={
                      <Button variant="subtle" size="sm" aria-label="More actions" className="-mr-2 -mt-1 shrink-0">
                        <IconDots size={16} />
                      </Button>
                    }
                  >
                    <DropdownItem
                      leftSection={item.data.status === 'active' ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
                      onClick={() => toggleStatus(item)}
                    >
                      {item.data.status === 'active' ? 'Pause' : 'Resume'}
                    </DropdownItem>
                    <DropdownDivider />
                    <DropdownItem color="red" leftSection={<IconTrash size={14} />} onClick={() => setToDelete(item)}>
                      Delete
                    </DropdownItem>
                  </Dropdown>
                </div>

                {item.kind === 'stack' && (
                  <div className="flex flex-wrap gap-1">
                    {entryNames.slice(0, 3).map((n, i) => (
                      <span key={i} className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600 dark:bg-stone-700 dark:text-stone-300">
                        {n}
                      </span>
                    ))}
                    {entryNames.length > 3 && (
                      <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500 dark:bg-stone-700 dark:text-stone-400">
                        +{entryNames.length - 3}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                  <Badge color={expired ? 'red' : meta.color} variant="light" size="sm">
                    {expired ? 'Expired' : meta.label}
                  </Badge>
                  {item.kind === 'stack' && <Badge color="orange" variant="light" size="sm">stack</Badge>}
                  <span>{item.data.submissionCount} submission{item.data.submissionCount === 1 ? '' : 's'}</span>
                  {item.data.requiresPassword && <span className="text-stone-400">· password-protected</span>}
                  {item.data.expiresAt && <span>· expires {dayjs(item.data.expiresAt).format('DD MMM YYYY')}</span>}
                </div>

                <div className="mt-auto flex items-center gap-2 pt-1">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => navigate(buildPath(item.kind === 'stack' ? `stack-forms/${item.data.id}` : `forms/${item.data.id}`))}
                  >
                    Submissions <IconArrowRight size={14} />
                  </Button>
                  <Button variant="subtle" size="sm" onClick={() => copyLink(item)} aria-label="Copy link">
                    <IconLink size={14} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal — pick templates + per-template version, then review */}
      <Modal
        open={createOpen}
        onClose={() => { setCreateOpen(false); resetCreate(); }}
        title={isStack ? 'Create a stack form' : 'Create a form'}
        subtitle={isStack ? 'Shared fields unify across the selected templates.' : 'Pick one or more templates, then review the fields.'}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="subtle" onClick={() => { setCreateOpen(false); resetCreate(); }}>Cancel</Button>
            <Button onClick={continueToReview} disabled={selectedTplIds.size === 0}>
              Continue to review
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-stone-600 dark:text-stone-300">
              Templates {isStack && <span className="text-orange-600">· stack form (shared fields unify)</span>}
            </label>
            <div className="relative">
              <IconSearch size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates…"
                className={cn(fieldInputCls, 'pl-8')}
              />
            </div>
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-stone-200 p-1 dark:border-stone-700">
              {publishedTemplates.length === 0 ? (
                <span className="p-2 text-xs text-amber-600">No published templates yet. Publish a template first.</span>
              ) : filtered.length === 0 ? (
                <span className="p-2 text-xs text-stone-400">No templates match “{search}”.</span>
              ) : (
                filtered.map((t) => {
                  const on = selectedTplIds.has(t.id);
                  const versions = versionsListByTpl[t.id];
                  return (
                    <div key={t.id} className={cn('rounded transition-colors', on ? 'bg-orange-50 dark:bg-orange-950/40' : '')}>
                      <button
                        type="button"
                        onClick={() => toggleTpl(t.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                          on ? 'text-stone-800 dark:text-stone-100' : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700',
                        )}
                      >
                        <span className={cn('flex size-4 shrink-0 items-center justify-center rounded border', on ? 'border-orange-500 bg-orange-500 text-white' : 'border-stone-300 text-transparent dark:border-stone-600')}>
                          <IconCheck size={12} />
                        </span>
                        <span className="flex-1 truncate">{t.name}</span>
                      </button>
                      {on && versions && versions.length > 1 && (
                        <div className="flex items-center gap-2 px-2 pb-1.5 pl-8">
                          <span className="text-[11px] text-stone-400">version</span>
                          <select
                            value={versionByTpl[t.id] ?? ''}
                            onChange={(e) => setVersionByTpl((prev) => ({ ...prev, [t.id]: e.target.value }))}
                            className={cn(fieldInputCls, 'h-7 flex-1 py-0 text-xs')}
                          >
                            {versions.map((v) => (
                              <option key={v.version} value={v.version}>
                                {v.version}
                                {v.isDefault ? ' (default)' : ''}
                                {v.isCurrent ? ' (current)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <span className="text-xs text-stone-400">
              {selectedTplIds.size === 0
                ? 'Select one template for a form, or multiple for a stack form.'
                : isStack
                  ? `${selectedTplIds.size} templates selected — shared fields will be filled once.`
                  : '1 template selected.'}
            </span>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title={toDelete?.kind === 'stack' ? 'Delete this stack form?' : 'Delete this form?'}
        message={`“${toDelete?.data.name}” and all its submissions (${toDelete?.data.submissionCount ?? 0}) will be permanently deleted. This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        variant="danger"
      />
    </div>
  );
}
