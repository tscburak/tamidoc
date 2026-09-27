import { useMemo, useState } from 'react';
import { IconLoader, IconTrash, IconClipboardList, IconWorld, IconArchive, IconHistory } from '@tabler/icons-react';
import {
  IconPlus,
  IconSearch,
  IconFilter,
  IconArrowsSort,
  IconLayoutGrid,
  IconList,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconFilePlus,
  IconFileImport,
  IconSparkles,
  IconArrowRight,
  IconFileText,
  IconComponents,
  IconChevronLeft,
} from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  TextInput,
  Dropdown,
  DropdownLabel,
  DropdownItem,
  Modal,
  ThemeIcon,
  ContextMenu,
  ConfirmDialog,
  type Color,
} from '../../components/ui';
import { EmptyState } from '../../components/common';
import { solidFill } from '../../components/ui/colors';
import { useTemplateStore, type TemplateRecord } from '../../context/TemplateStoreProvider';
import { templatesService } from '../../services/templates.service';
import { cn } from '../../lib/cn';

interface DocTemplate {
  id: string;
  name: string;
  category: string;
  tags: string[];
  version: string;
  updated: string;
  /** Higher = more recently updated. Used for sorting (display string isn't sortable). */
  recency: number;
  color: Color;
  /** Has a fillable canvas → clicking opens the filler. */
  fillable?: boolean;
  /** Carries one or more repeating groups. */
  repeating?: boolean;
  /** Lifecycle status — published templates can be published as fillable forms. */
  status: 'draft' | 'published' | 'archived';
  /** Backend kind: 'form' = Fixed-layout Template, 'document' = Composable Template. */
  kind: 'form' | 'document';
}

const STATUS_BADGE: Record<DocTemplate['status'], { label: string; color: Color }> = {
  draft: { label: 'Draft', color: 'gray' },
  published: { label: 'Published', color: 'green' },
  archived: { label: 'Archived', color: 'gray' },
};

type SortKey = 'recent' | 'oldest' | 'name-asc' | 'name-desc';
type ViewMode = 'grid' | 'list';

/** Rough relative-time label for display. */
function formatUpdated(rec: TemplateRecord): string {
  const diff = Date.now() - rec.updatedAt;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Map store records → the page's view model. */
function toViews(records: TemplateRecord[]): DocTemplate[] {
  return records.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category || 'Uncategorized',
    tags: r.tags ?? [],
    version: r.version ?? 'v1.0',
    updated: formatUpdated(r),
    recency: r.updatedAt,
    color: r.color ?? 'orange',
    fillable: r.canvas.components.length > 0,
    repeating: r.groups.length > 0,
    status: r.status ?? 'draft',
    kind: r.kind ?? 'form',
  }));
}

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently updated' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'name-asc', label: 'Name (A–Z)' },
  { key: 'name-desc', label: 'Name (Z–A)' },
];

type TemplateType = 'fixed' | 'composable';

interface CreateOption {
  key: string;
  title: string;
  description: string;
  icon: typeof IconFilePlus;
  color: Color;
  label?: string;
  disabled?: boolean;
}

const TEMPLATE_TYPES: { key: TemplateType; title: string; description: string; icon: typeof IconFilePlus; color: Color }[] = [
  {
    key: 'fixed',
    title: 'Fixed-layout Template',
    description: 'Fields placed on a fixed layout with a visual canvas. Import from PDF or start blank.',
    icon: IconFileText,
    color: 'blue',
  },
  {
    key: 'composable',
    title: 'Composable Template',
    description: 'Compose documents from predefined components — guides, presentations, and more.',
    icon: IconComponents,
    color: 'teal',
  },
];

const CREATE_OPTIONS: Record<TemplateType, CreateOption[]> = {
  fixed: [
    {
      key: 'blank',
      title: 'Blank template',
      description: 'Start from scratch with an empty canvas and design every field yourself.',
      disabled: false,
      icon: IconFilePlus,
      color: 'blue',
    },
    {
      key: 'import',
      title: 'Import from PDF',
      description: "Upload an existing document and we'll auto-detect the fields for you.",
      disabled: false,
      icon: IconFileImport,
      color: 'orange',
    },
    {
      key: 'ai',
      title: 'Generate with AI',
      description: 'Describe it in plain language and let AI build the template for you.',
      disabled: true,
      label: 'Coming Soon',
      icon: IconSparkles,
      color: 'teal',
    },
  ],
  composable: [
    {
      key: 'blank',
      title: 'Blank document',
      description: 'Start with an empty composable template.',
      disabled: false,
      icon: IconFilePlus,
      color: 'blue',
    },
    {
      key: 'ai',
      title: 'Generate with AI',
      description: 'Describe it in plain language and let AI build the document for you.',
      disabled: true,
      label: 'Coming Soon',
      icon: IconSparkles,
      color: 'teal',
    },
  ],
};

/** Faux document thumbnail — a styled page preview (no image asset needed). */
function DocumentPreview({ color }: { color: Color }) {
  return (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-stone-100 dark:bg-stone-900/60">
      <div className="flex h-[76%] w-[56%] flex-col gap-1.5 rounded-sm bg-white p-2.5 shadow-sm ring-1 ring-stone-200/80 dark:bg-stone-700 dark:ring-stone-600/60">
        <div className={cn('h-2 w-1/3 rounded-full', solidFill[color])} />
        <div className="mt-1 h-1.5 w-2/3 rounded-full bg-stone-200 dark:bg-stone-500/70" />
        <div className="h-1.5 w-full rounded-full bg-stone-200 dark:bg-stone-500/70" />
        <div className="h-1.5 w-5/6 rounded-full bg-stone-200 dark:bg-stone-500/70" />
        <div className="mt-auto h-1.5 w-1/2 self-end rounded-full bg-stone-200 dark:bg-stone-500/70" />
      </div>
    </div>
  );
}

/** Compact thumbnail variant for the list view. */
function ListThumb({ color }: { color: Color }) {
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-stone-100 dark:bg-stone-900/60">
      <div className="flex h-7 w-6 flex-col gap-[3px] rounded-[2px] bg-white p-1 shadow-sm ring-1 ring-stone-200/80 dark:bg-stone-700 dark:ring-stone-600/60">
        <div className={cn('h-[3px] w-1/2 rounded-full', solidFill[color])} />
        <div className="h-[2px] w-full rounded-full bg-stone-200 dark:bg-stone-500/70" />
        <div className="h-[2px] w-3/4 rounded-full bg-stone-200 dark:bg-stone-500/70" />
        <div className="mt-auto h-[2px] w-2/3 rounded-full bg-stone-200 dark:bg-stone-500/70" />
      </div>
    </div>
  );
}

function TemplateCard({ template, buildPath, onContextMenu }: { template: DocTemplate; buildPath: (path: string) => string; onContextMenu: (e: React.MouseEvent, template: DocTemplate) => void }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(buildPath(template.fillable ? `templates/${template.id}/fill` : `templates/${template.id}/edit`))}
      onContextMenu={(e) => onContextMenu(e, template)}
      className="td-card group flex h-full flex-col overflow-hidden rounded-lg border border-stone-200 bg-white text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-stone-700 dark:bg-stone-800"
    >
      <DocumentPreview color={template.color} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 font-semibold text-stone-800 transition-colors group-hover:text-orange-700 dark:text-stone-100 dark:group-hover:text-orange-300">
          {template.name}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {template.tags.slice(0, 2).map((tg) => (
            <Badge key={tg} color={template.color} size="sm">
              {tg}
            </Badge>
          ))}
          {template.tags.length === 0 && (
            <span className="text-xs text-stone-400">Untagged</span>
          )}
          {template.fillable ? (
            <Badge color="orange" size="sm">
              Fill ↻
            </Badge>
          ) : (
            <span className="text-xs text-stone-400">{template.version}</span>
          )}
          <Badge color={STATUS_BADGE[template.status].color} size="sm" variant="light">
            {STATUS_BADGE[template.status].label}
          </Badge>
        </div>
        <p className="mt-auto text-xs text-stone-500 dark:text-stone-400">Updated {template.updated}</p>
      </div>
    </button>
  );
}

function TemplateRow({ template, buildPath, onContextMenu }: { template: DocTemplate; buildPath: (path: string) => string; onContextMenu: (e: React.MouseEvent, template: DocTemplate) => void }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(buildPath(template.fillable ? `templates/${template.id}/fill` : `templates/${template.id}/edit`))}
      onContextMenu={(e) => onContextMenu(e, template)}
      className="group flex w-full items-center gap-4 rounded-lg border border-stone-200 bg-white p-3 text-left transition-colors hover:border-stone-300 hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700/40"
    >
      <ListThumb color={template.color} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold text-stone-800 transition-colors group-hover:text-orange-700 dark:text-stone-100 dark:group-hover:text-orange-300">
          {template.name}
        </h3>
        <p className="truncate text-xs text-stone-500 dark:text-stone-400">Updated {template.updated}</p>
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        {template.tags.slice(0, 2).map((tg) => (
          <Badge key={tg} color={template.color} size="sm">
            {tg}
          </Badge>
        ))}
        {template.fillable && (
          <Badge color="orange" size="sm">
            Fill ↻
          </Badge>
        )}
        <Badge color={STATUS_BADGE[template.status].color} size="sm" variant="light">
          {STATUS_BADGE[template.status].label}
        </Badge>
      </div>
      <IconChevronRight
        size={18}
        className="shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-600"
      />
    </button>
  );
}

function CreateTemplateCard({ onCreate }: { onCreate: () => void }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      className="group flex h-full min-h-[14rem] flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-stone-300 bg-white p-6 text-stone-500 transition-colors hover:border-orange-400 hover:bg-orange-50/50 hover:text-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-400 dark:hover:border-orange-500 dark:hover:bg-orange-950/30 dark:hover:text-orange-300"
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition-colors group-hover:bg-orange-100 group-hover:text-orange-600 dark:bg-stone-700 dark:group-hover:bg-orange-900/50 dark:group-hover:text-orange-300">
        <IconPlus size={24} />
      </div>
      <div className="text-center">
        <p className="font-semibold text-stone-700 transition-colors group-hover:text-orange-700 dark:text-stone-200 dark:group-hover:text-orange-300">
          Create Template
        </p>
        <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">Import a PDF or start blank</p>
      </div>
    </button>
  );
}

function CreateTemplateRow({ onCreate }: { onCreate: () => void }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      className="group flex w-full items-center gap-4 rounded-lg border-2 border-dashed border-stone-300 bg-white p-3 text-left text-stone-500 transition-colors hover:border-orange-400 hover:bg-orange-50/50 hover:text-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-400 dark:hover:border-orange-500 dark:hover:bg-orange-950/30 dark:hover:text-orange-300"
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-500 transition-colors group-hover:bg-orange-100 group-hover:text-orange-600 dark:bg-stone-700 dark:group-hover:bg-orange-900/50 dark:group-hover:text-orange-300">
        <IconPlus size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-stone-700 transition-colors group-hover:text-orange-700 dark:text-stone-200 dark:group-hover:text-orange-300">
          Create Template
        </p>
        <p className="truncate text-xs text-stone-400 dark:text-stone-500">Import a PDF or start blank</p>
      </div>
    </button>
  );
}

/** Separate list pages per template family: `all` | `fixed` (form kind) | `composable` (document kind). */
export function TemplatesPage({ kindFilter = 'all' }: { kindFilter?: 'all' | 'fixed' | 'composable' }) {
  const navigate = useNavigate();
  const { organizationId } = useParams<{ organizationId: string }>();
  const store = useTemplateStore();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [view, setView] = useState<ViewMode>('grid');
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<'type' | 'options'>('type');
  const [templateType, setTemplateType] = useState<TemplateType>('fixed');

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; template: DocTemplate } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DocTemplate | null>(null);

  // Build org-relative path
  const buildPath = (path: string) => `/o/${organizationId}/${path}`;

  // Create modal inherits its type from the hosting page: family pages never
  // show the type step (derived at render so stale state can't leak it back),
  // All Templates shows both options.
  const effectiveStep = kindFilter === 'all' ? createStep : 'options';
  const effectiveTemplateType = kindFilter === 'all' ? templateType : kindFilter;
  const openCreate = () => {
    if (kindFilter === 'all') {
      setCreateStep('type');
    } else {
      setTemplateType(kindFilter);
      setCreateStep('options');
    }
    setCreateOpen(true);
  };

  // View models derived from the store (API-backed templates).
  const templates = useMemo(() => toViews(store.templates), [store.templates]);

  const tags = useMemo(() => Array.from(new Set(templates.flatMap((t) => t.tags))).sort(), [templates]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = templates.filter((t) => {
      const matchesQuery = !q || t.name.toLowerCase().includes(q) || t.tags.some((tg) => tg.toLowerCase().includes(q));
      const matchesTag = tag === 'all' || t.tags.includes(tag);
      const matchesKind =
        kindFilter === 'all' ||
        (kindFilter === 'fixed' ? t.kind === 'form' : t.kind === 'document');
      return matchesQuery && matchesTag && matchesKind;
    });
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'recent':
          return b.recency - a.recency;
        case 'oldest':
          return a.recency - b.recency;
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });
  }, [templates, query, tag, sortKey, kindFilter]);

  const hasFilters = query.trim() !== '' || tag !== 'all';
  const clearFilters = () => {
    setQuery('');
    setTag('all');
  };
  const activeSortLabel = sortOptions.find((o) => o.key === sortKey)?.label ?? 'Sort';
  const filterLabel = tag === 'all' ? 'Filter' : tag;

  const handleDelete = async (template: DocTemplate) => {
    try {
      await store.removeTemplate(template.id);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  // Publish a draft (or restore an archived template) → published. Published
  // templates can be published as fillable forms.
  const handlePublish = async (template: DocTemplate) => {
    if (!organizationId) return;
    try {
      await templatesService.publish(organizationId, template.id);
      await store.refreshTemplates();
    } catch (error) {
      console.error('Failed to publish template:', error);
    } finally {
      setContextMenu(null);
    }
  };

  const handleArchive = async (template: DocTemplate) => {
    if (!organizationId) return;
    try {
      await templatesService.archive(organizationId, template.id);
      await store.refreshTemplates();
    } catch (error) {
      console.error('Failed to archive template:', error);
    } finally {
      setContextMenu(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, template: DocTemplate) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, template });
  };

  // Show loading state
  if (store.loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <IconLoader size={32} className="animate-spin text-orange-600" />
          <p className="text-stone-600 dark:text-stone-400">Loading templates...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (store.error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-2">Failed to load templates</p>
          <p className="text-stone-600 dark:text-stone-400 mb-4">{store.error}</p>
          <button
            onClick={() => store.refreshTemplates()}
            className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-100">
          {kindFilter === 'fixed' ? 'Fixed-layout Templates' : kindFilter === 'composable' ? 'Composable Templates' : 'Templates'}
        </h2>
        <p className="text-stone-500 dark:text-stone-400">
          {kindFilter === 'fixed'
            ? 'Fixed-layout templates in this organization'
            : kindFilter === 'composable'
              ? 'Composable templates in this organization'
              : 'Document templates created in this organization'}
        </p>
      </div>

      {/* Toolbar: search + filter + sort + view toggle */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex-1">
          <TextInput
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates..."
            leftSection={<IconSearch size={16} />}
            aria-label="Search templates"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filter */}
          <Dropdown
            panelClassName="w-52"
            trigger={
              <Button
                variant="default"
                size="md"
                leftSection={<IconFilter size={16} />}
                rightSection={<IconChevronDown size={16} />}
              >
                {filterLabel}
              </Button>
            }
          >
            <DropdownLabel>Tag</DropdownLabel>
            <DropdownItem
              leftSection={tag === 'all' ? <IconCheck size={16} /> : null}
              className={tag === 'all' ? 'text-orange-700 dark:text-orange-300' : undefined}
              onClick={() => setTag('all')}
            >
              All tags
            </DropdownItem>
            {tags.map((c) => (
              <DropdownItem
                key={c}
                leftSection={tag === c ? <IconCheck size={16} /> : null}
                className={tag === c ? 'text-orange-700 dark:text-orange-300' : undefined}
                onClick={() => setTag(c)}
              >
                {c}
              </DropdownItem>
            ))}
          </Dropdown>

          {/* Sort */}
          <Dropdown
            panelClassName="w-52"
            trigger={
              <Button
                variant="default"
                size="md"
                leftSection={<IconArrowsSort size={16} />}
                rightSection={<IconChevronDown size={16} />}
              >
                {activeSortLabel}
              </Button>
            }
          >
            <DropdownLabel>Sort by</DropdownLabel>
            {sortOptions.map((opt) => (
              <DropdownItem
                key={opt.key}
                leftSection={sortKey === opt.key ? <IconCheck size={16} /> : null}
                className={sortKey === opt.key ? 'text-orange-700 dark:text-orange-300' : undefined}
                onClick={() => setSortKey(opt.key)}
              >
                {opt.label}
              </DropdownItem>
            ))}
          </Dropdown>

          {/* View toggle */}
          <div
            role="group"
            aria-label="View mode"
            className="flex items-center rounded-md border border-stone-300 bg-white p-0.5 dark:border-stone-600 dark:bg-stone-800"
          >
            <button
              type="button"
              onClick={() => setView('grid')}
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded transition-colors',
                view === 'grid'
                  ? 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
                  : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100',
              )}
            >
              <IconLayoutGrid size={18} />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              aria-label="List view"
              aria-pressed={view === 'list'}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded transition-colors',
                view === 'list'
                  ? 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
                  : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100',
              )}
            >
              <IconList size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Result count + clear */}
      <div className="-mt-2 flex items-center justify-between">
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {visible.length} {visible.length === 1 ? 'template' : 'templates'}
          {tag !== 'all' && <span className="ml-1">in {tag}</span>}
        </p>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-200"
          >
            Clear
          </button>
        )}
      </div>

      {/* Views */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <EmptyState
            title="No templates yet"
            description={hasFilters ? "Try adjusting your search or filters to find what you're looking for." : "Create your first template to get started with document management."}
            actionLabel={hasFilters ? 'Clear filters' : 'Create Template'}
            onAction={hasFilters ? clearFilters : openCreate}
          />
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <CreateTemplateCard onCreate={openCreate} />
          {visible.map((template) => (
            <TemplateCard key={template.id} template={template} buildPath={buildPath} onContextMenu={handleContextMenu} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <CreateTemplateRow onCreate={openCreate} />
          {visible.map((template) => (
            <TemplateRow key={template.id} template={template} buildPath={buildPath} onContextMenu={handleContextMenu} />
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={effectiveStep === 'type' ? 'Create a new template' : 'How would you like to start?'}
        subtitle={
          effectiveStep === 'type'
            ? 'Choose a template type.'
            : `New ${effectiveTemplateType === 'fixed' ? 'Fixed-layout' : 'Composable'} Template`
        }
        size="lg"
      >
        {effectiveStep === 'type' ? (
          <div className="flex flex-col gap-3">
            {TEMPLATE_TYPES.map((t) => (
              <Button
                key={t.key}
                variant="default"
                size="md"
                fullWidth
                onClick={() => {
                  setTemplateType(t.key);
                  setCreateStep('options');
                }}
                className="!h-auto !gap-4 !px-4 !py-4 text-left hover:border-orange-300 hover:bg-orange-50/40 hover:shadow-sm dark:bg-stone-900/40 dark:hover:border-orange-700 dark:hover:bg-orange-950/30"
                leftSection={
                  <ThemeIcon size={44} radius="lg" color={t.color} variant="light">
                    <t.icon size={22} />
                  </ThemeIcon>
                }
                rightSection={
                  <IconArrowRight
                    size={18}
                    className="shrink-0 text-stone-400 transition-colors group-hover:translate-x-0.5 group-hover:text-orange-600"
                  />
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-stone-800 dark:text-stone-100">{t.title}</p>
                  <p className="text-sm text-stone-500 dark:text-stone-400">{t.description}</p>
                </div>
              </Button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {kindFilter === 'all' && (
              <button
                type="button"
                onClick={() => setCreateStep('type')}
                className="-ml-1 flex items-center gap-1 self-start rounded-md px-1.5 py-1 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:hover:bg-stone-700 dark:hover:text-stone-100"
              >
                <IconChevronLeft size={16} />
                Change template type
              </button>
            )}
            {CREATE_OPTIONS[effectiveTemplateType].map((opt) => (
              <Button
                key={opt.key}
                variant="default"
                size="md"
                fullWidth
                disabled={opt.disabled}
                onClick={() => {
                  setCreateOpen(false);
                  setCreateStep('type');
                  navigate(
                    buildPath(
                      `templates/new?source=${opt.key}&type=${effectiveTemplateType}`,
                    ),
                  );
                }}
                className="!h-auto !gap-4 !px-4 !py-4 text-left hover:border-orange-300 hover:bg-orange-50/40 hover:shadow-sm disabled:border-stone-200 disabled:bg-stone-50 disabled:opacity-70 dark:bg-stone-900/40 dark:hover:border-orange-700 dark:hover:bg-orange-950/30 dark:disabled:border-stone-800 dark:disabled:bg-stone-900/20"
                leftSection={
                  <ThemeIcon size={44} radius="lg" color={opt.color} variant="light" className="disabled:grayscale dark:disabled:grayscale">
                    <opt.icon size={22} />
                  </ThemeIcon>
                }
                rightSection={
                  <div className="flex items-center gap-2">
                    {opt.label && (
                      <Badge color="stone" size="sm" className="text-xs">
                        {opt.label}
                      </Badge>
                    )}
                    <IconArrowRight
                      size={18}
                      className="shrink-0 text-stone-400 transition-colors group-hover:translate-x-0.5 group-hover:text-orange-600 disabled:opacity-40"
                    />
                  </div>
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-stone-800 dark:text-stone-100 disabled:text-stone-500 dark:disabled:text-stone-500">{opt.title}</p>
                  <p className="text-sm text-stone-500 dark:text-stone-400 disabled:text-stone-400 dark:disabled:text-stone-500">{opt.description}</p>
                </div>
              </Button>
            ))}
          </div>
        )}
      </Modal>

      {/* Context Menu for right-click actions */}
      <ContextMenu
        open={!!contextMenu}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        onClose={() => setContextMenu(null)}
      >
        {contextMenu?.template.status === 'draft' && (
          <DropdownItem
            leftSection={<IconWorld size={16} />}
            onClick={() => contextMenu && handlePublish(contextMenu.template)}
          >
            Publish
          </DropdownItem>
        )}
        {contextMenu?.template.status === 'archived' && (
          <DropdownItem
            leftSection={<IconHistory size={16} />}
            onClick={() => contextMenu && handlePublish(contextMenu.template)}
          >
            Restore
          </DropdownItem>
        )}
        {contextMenu?.template.status === 'published' && (
          <>
            <DropdownItem
              leftSection={<IconArchive size={16} />}
              onClick={() => contextMenu && handleArchive(contextMenu.template)}
            >
              Archive
            </DropdownItem>
            <DropdownItem
              leftSection={<IconClipboardList size={16} />}
              onClick={() => {
                if (contextMenu) {
                  navigate(buildPath(`forms?templateId=${contextMenu.template.id}`));
                  setContextMenu(null);
                }
              }}
            >
              Create form
            </DropdownItem>
          </>
        )}
        <DropdownItem
          leftSection={<IconTrash size={16} />}
          onClick={() => {
            if (contextMenu) {
              setDeleteConfirm(contextMenu.template);
              setContextMenu(null);
            }
          }}
          className="text-red-600 dark:text-red-400"
        >
          Delete template
        </DropdownItem>
      </ContextMenu>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        title="Delete template?"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
