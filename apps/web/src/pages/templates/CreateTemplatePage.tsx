import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { IconArrowLeft, IconPencil, IconDeviceFloppy, IconChevronDown, IconChevronRight, IconLoader, IconFileText, IconPlus, IconTrash, IconVersions, IconCheck, IconStar, IconFileImport, IconFilePlus, IconSparkles, IconHistory, IconX } from '@tabler/icons-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Dropdown, DropdownItem, DropdownLabel, DropdownDivider, Panel, Modal, FileInput, Badge, ThemeIcon, ConfirmDialog, Tabs, TabsList, Tab, TabPanel } from '../../components/ui';
import { DropdownContext } from '../../components/ui/Dropdown';
import {
  TemplateDesigner,
  CANVAS_SIZE,
  type CanvasComponent,
  type CanvasSize,
  type ComponentGroup,
  type DesignerField,
} from '../../components/designer';
import { useToast } from '../../context/toast';
import { useTemplateStore, type DocBlock, type TemplateRecord } from '../../context/TemplateStoreProvider';
import { cn } from '../../lib/cn';
import { pdfImportService } from '../../services/pdf-import.service';
import { templatesService, type TemplateVersionSummary, type TemplateVersionSnapshot, type VersionSource } from '../../services/templates.service';
import { tagsService } from '../../services/tags.service';
import { ComponentDetail, DEFAULT_PREVIEW_THEME } from '../../components/composable';
import {
  BLOCK_TYPES,
  BlockPreview,
  DocCanvasSettings,
  HeaderFooterSettings,
  ThemeSettings,
  docPageDims,
  docPagePadding,
  isDocPageSize,
  ensureSectionAllowed,
  ensureSections,
  getBlockDef,
  type ComponentDefaults, type ComponentStyle, type DocOrientation, type DocTheme, type DocPageSize,
} from '../../components/composable';
import type { PdfImportResult } from '../../types/pdf-import';
import { PdfImportHistory } from '../../components/designer/PdfImportHistory';
import type { Tag } from '../../types/access';

const FIELD_TYPES: { value: string; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'longtext', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'email', label: 'Email' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'image', label: 'Image' },
  { value: 'signature', label: 'Signature' },
];

/** Dropdown options editor: a composer input on top (comma adds instantly) and
 * the values rendered as badges below, each editable via its pencil icon. */
function DropdownOptionsEditor({ options, onChange }: { options: string[]; onChange: (options: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const addValues = (values: string[]) => {
    if (values.length > 0) onChange([...options, ...values]);
  };

  // Split on comma immediately: completed segments are added at once, the
  // trailing segment stays in the input so the user can keep typing.
  const handleDraftChange = (v: string) => {
    if (v.includes(',')) {
      const parts = v.split(',');
      const complete = parts.slice(0, -1).map((s) => s.trim()).filter(Boolean);
      const rest = parts[parts.length - 1];
      addValues(complete);
      setDraft(rest);
    } else {
      setDraft(v);
    }
  };

  const commitDraft = () => {
    const values = draft.split(',').map((s) => s.trim()).filter(Boolean);
    addValues(values);
    setDraft('');
  };

  const startEdit = (idx: number, value: string) => {
    setEditingIndex(idx);
    setEditDraft(value);
  };

  const commitEdit = () => {
    if (editingIndex === null) return;
    const next = [...options];
    const v = editDraft.trim();
    if (v) next[editingIndex] = v;
    else next.splice(editingIndex, 1);
    setEditingIndex(null);
    onChange(next);
  };

  const cancelEdit = () => setEditingIndex(null);

  const remove = (idx: number) => onChange(options.filter((_, i) => i !== idx));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitDraft();
            }
          }}
          placeholder="Add options, comma separated"
          className="h-7 flex-1 rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-800 transition-colors placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
        />
        <button
          type="button"
          onClick={commitDraft}
          aria-label="Add options"
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-stone-300 text-stone-500 transition-colors hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 dark:border-stone-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300"
        >
          <IconPlus size={14} />
        </button>
      </div>

      {options.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt, idx) =>
            editingIndex === idx ? (
              <input
                key={idx}
                autoFocus
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitEdit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelEdit();
                  }
                }}
                aria-label="Edit option"
                className="h-6 w-24 rounded-full border border-orange-400 bg-white px-2 text-xs text-stone-800 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/40 dark:border-orange-600 dark:bg-stone-900 dark:text-stone-100"
              />
            ) : (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700 dark:bg-stone-700 dark:text-stone-200"
              >
                {opt}
                <button
                  type="button"
                  onClick={() => startEdit(idx, opt)}
                  aria-label={`Edit ${opt}`}
                  className="flex size-4 items-center justify-center rounded-full text-stone-400 transition-colors hover:text-orange-600 dark:text-stone-400 dark:hover:text-orange-300"
                >
                  <IconPencil size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  aria-label={`Remove ${opt}`}
                  className="flex size-4 items-center justify-center rounded-full text-stone-400 transition-colors hover:text-red-600 dark:text-stone-400 dark:hover:text-red-400"
                >
                  <IconX size={11} />
                </button>
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** A fillable form field. The name comes from the document's {{token}}; the
 * type/required are configured here and used later when filling the document.
 * `groupId` ties the field to a repeating group (array-valued at fill time). */
interface FormFieldConfig {
  name: string;
  type: string;
  required: boolean;
  groupId?: string;
  // Per-field metadata for fill-time UX
  defaultValue?: string;
  placeholder?: string;
  info?: string;
  section?: string;
  options?: string[];
  defaultToday?: boolean;
  disabled?: boolean;
  visible?: boolean;
  askOnGenerate?: boolean;
}

/** Compound identity for a field — names are unique only within a namespace
 * (a group, or the top level), so two groups can both have a `company` field. */
const fieldKeyOf = (groupId: string | undefined, name: string) => `${groupId ?? ''}::${name}`;

/** Click-to-edit heading: shows the value as a title, becomes an input on click. */
function InlineEdit({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    onChange(draft);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            cancel();
          }
        }}
        placeholder={placeholder}
        className="w-64 min-w-0 rounded-md border border-orange-400 bg-white px-2 py-0.5 text-2xl font-bold text-stone-800 outline-none ring-2 ring-orange-500/30 sm:w-96 dark:bg-stone-900 dark:text-stone-100"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title="Click to rename"
      className="group -ml-1 flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-2xl font-bold text-stone-800 transition-colors hover:bg-stone-100 dark:text-stone-100 dark:hover:bg-stone-800"
    >
      <span className="truncate">{value || <span className="text-stone-400">{placeholder}</span>}</span>
      <IconPencil size={15} className="shrink-0 text-stone-400 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

/** A single version row in the history dropdown: open (label) + set-default. */
function VersionRow({ v, currentVersion, openVersion, onOpen, onSetDefault, onDelete }: {
  v: TemplateVersionSummary;
  currentVersion: string;
  openVersion: string | null;
  onOpen: (version: string) => void;
  onSetDefault: (version: string) => void;
  onDelete: (version: string) => void;
}) {
  const { close } = useContext(DropdownContext);
  const isCurrent = v.version === currentVersion;
  const isOpen = v.version === openVersion;
  // A version is "active" (disabled) when it's the one currently shown: either
  // explicitly opened, or the live copy when no archived version is open. The
  // current version stays clickable while another version is open so the user
  // can switch back to it.
  const isActive = isOpen || (isCurrent && openVersion === null);
  return (
    <div className="group flex items-center gap-1 rounded px-2.5 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-700">
      <button
        type="button"
        disabled={isActive}
        onClick={() => { close(); onOpen(v.version); }}
        title={isActive ? 'Currently open' : isCurrent ? 'Switch back to current version' : 'Open this version'}
        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
      >
        <span className={cn('shrink-0 text-sm font-medium', isCurrent ? 'text-stone-800 dark:text-stone-100' : 'text-stone-600 hover:text-stone-800 dark:text-stone-300 dark:hover:text-stone-100')}>
          {v.version}
        </span>
        {v.isDefault && (
          <IconStar size={13} className="shrink-0 text-amber-500" title="Default version" />
        )}
        {isOpen && !isCurrent && (
          <span className="shrink-0 text-[10px] font-medium text-teal-600 dark:text-teal-300">open</span>
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-stone-400 dark:text-stone-500">{v.changeDescription}</span>
      </button>
      {!v.isDefault && (
        <button
          type="button"
          title="Set as default"
          onClick={() => { close(); onSetDefault(v.version); }}
          className="flex size-6 shrink-0 items-center justify-center rounded text-stone-400 transition-colors hover:bg-stone-200 hover:text-amber-500 dark:hover:bg-stone-600"
        >
          <IconStar size={14} />
        </button>
      )}
      {!isCurrent && (
        <button
          type="button"
          title="Delete this version"
          onClick={() => { close(); onDelete(v.version); }}
          className="flex size-6 shrink-0 items-center justify-center rounded text-stone-400 transition-colors hover:bg-stone-200 hover:text-red-500 dark:hover:bg-stone-600"
        >
          <IconTrash size={14} />
        </button>
      )}
    </div>
  );
}

/** Selectable card in the create-version modal. */
function VersionSourceOption({ icon: Icon, title, desc, selected, onSelect, disabled, comingSoon }: {
  icon: typeof IconVersions;
  title: string;
  desc: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={disabled ? undefined : onSelect}
      className={cn(
        'rounded-md border p-3 transition-colors',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        selected
          ? 'border-orange-400 bg-orange-50/40 dark:bg-orange-950/30'
          : 'border-stone-200 hover:border-stone-300 dark:border-stone-700',
      )}
    >
      <div className="flex items-center gap-3">
        <ThemeIcon size={44} radius="lg" color="teal" variant="light">
          <Icon size={22} />
        </ThemeIcon>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold text-stone-800 dark:text-stone-100">
            {title}
            {comingSoon && <Badge color="stone" size="sm" className="text-xs">Coming Soon</Badge>}
          </p>
          <p className="text-sm text-stone-500 dark:text-stone-400">{desc}</p>
        </div>
        {selected && <IconCheck size={18} className="shrink-0 text-orange-600" />}
      </div>
    </div>
  );
}

export function CreateTemplatePage() {
  const { organizationId, id: templateId } = useParams<{ organizationId: string; id?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const store = useTemplateStore();

  // Build org-relative path
  const buildPath = (path: string) => `/o/${organizationId}/${path}`;

  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [orgTags, setOrgTags] = useState<Tag[]>([]);
  const [description, setDescription] = useState('');
  const [components, setComponents] = useState<CanvasComponent[]>([]);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>(CANVAS_SIZE);
  const [groups, setGroups] = useState<ComponentGroup[]>([]);
  const [formFields, setFormFields] = useState<FormFieldConfig[]>([]);
  /** Composable starter blocks (preserved on save; composed in fill mode). */
  const [blocks, setBlocks] = useState<DocBlock[]>([]);
  /** Template-level component allowlist (edit mode checklist). */
  const [allowedBlocks, setAllowedBlocks] = useState<string[]>(() =>
    BLOCK_TYPES.map((b) => b.type),
  );
  /** Template-level per-component default styles. */
  const [componentDefaults, setComponentDefaults] = useState<ComponentDefaults>({});
  /** Which component's detail is open in the middle panel (null = cards). */
  const [customizingKey, setCustomizingKey] = useState<string | null>(null);
  /** Library search in the right panel. */
  const [libQuery, setLibQuery] = useState('');
  /** Right panel tab: component library, canvas, theme, or header/footer. */
  const [rightTab, setRightTab] = useState<'components' | 'canvas' | 'theme' | 'chrome'>('components');
  /** Once saved, track the record id so re-saving updates instead of duplicating. */
  const [savedId, setSavedId] = useState<string | null>(null);
  // Version-history state
  const [versions, setVersions] = useState<TemplateVersionSummary[]>([]);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [versionSource, setVersionSource] = useState<VersionSource>('duplicate');
  const [versionFrom, setVersionFrom] = useState<string>('');
  const [versionDesc, setVersionDesc] = useState('');
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [pendingOpenVersion, setPendingOpenVersion] = useState<string | null>(null);
  const [openVersion, setOpenVersion] = useState<string | null>(null);
  const [pendingPdfImport, setPendingPdfImport] = useState(false);
  const [deleteVersionTarget, setDeleteVersionTarget] = useState<string | null>(null);
  /** Expandable field-card state (mirrors LayersPanel pattern) */
  const [expandedFieldKeys, setExpandedFieldKeys] = useState<Set<string>>(() => new Set());
  const toggleFieldExpanded = (key: string) =>
    setExpandedFieldKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // PDF import state
  const isImportMode = searchParams.get('source') === 'import';
  const [importing, setImporting] = useState(false);
  const [pageBackgrounds, setPageBackgrounds] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(1);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [detectPdfFields, setDetectPdfFields] = useState(true);
  const [pdfDetection, setPdfDetection] = useState<PdfImportResult['detection']>();

  // Composable template mode — `source=blank&type=composable` opens a
  // kind:"document" template (block composer) instead of the fixed-layout canvas.
  const templateTypeParam = searchParams.get('type');
  const [isComposable, setIsComposable] = useState(
    templateTypeParam === 'composable' || templateTypeParam === 'generative',
  );
  /** Default blank document config: every catalog block allowed, A4 theme. */
  const DEFAULT_DOC_CONFIG = useMemo(
    () => ({
      format: 'document' as const,
      pageSize: 'A4' as const,
      orientation: 'portrait' as const,
      theme: {
        fontFamily: 'Lato',
        baseFontSize: 11,
        colors: { primary: '#f97316', heading: '#1c1917', body: '#44403c', muted: '#78716c' },
        spacing: 12,
        pagePadding: 48,
        header: { enabled: true, text: '', editable: false },
        footer: { enabled: false, text: '', editable: false },
        pageNumbering: { enabled: true },
      },
    }),
    [],
  );
  /** Canvas tab working copy: page size + orientation + document format. */
  const [pageSize, setPageSize] = useState<DocPageSize>('A4');
  const [orientation, setOrientation] = useState<DocOrientation>('portrait');
  const [docFormat, setDocFormat] = useState<'document' | 'slides'>('document');
  /** Theme tab working copy. */
  const [docTheme, setDocTheme] = useState<DocTheme>(DEFAULT_DOC_CONFIG.theme);

  // Determine if we're in edit mode
  const isEditMode = templateId !== undefined && templateId !== 'new';

  /** Full documentConfig working copy: canvas + theme + allowlist + defaults. */
  const composableConfig = useMemo(() => ({
    format: docFormat,
    pageSize,
    orientation,
    theme: docTheme,
    allowedBlocks,
    componentDefaults,
  }), [docFormat, pageSize, orientation, docTheme, allowedBlocks, componentDefaults]);

  // Load the workspace's curated tags.
  useEffect(() => {
    if (!organizationId) return;
    tagsService.findAll(organizationId).then(setOrgTags).catch(() => setOrgTags([]));
  }, [organizationId]);

  const toggleTag = (name: string) =>
    setTags((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]));

  /** (De)activate a component for this template. At least one stays active. */
  const toggleAllowed = (type: string) => {
    if (type === 'section') {
      toast.show({
        title: 'Section is structural',
        message: 'Sections hold the layout — they stay active on every template.',
        color: 'amber',
      });
      return;
    }
    if (allowedBlocks.includes(type)) {
      if (allowedBlocks.length <= 1) {
        toast.show({
          title: 'Keep one component',
          message: 'A template needs at least one active component.',
          color: 'amber',
        });
        return;
      }
      setAllowedBlocks(allowedBlocks.filter((t) => t !== type));
      if (customizingKey === type) setCustomizingKey(null);
    } else {
      const order = BLOCK_TYPES.map((b) => b.type);
      setAllowedBlocks([...allowedBlocks, type].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    }
  };

  /** Merge a style patch into the template defaults; empty styles drop the key. */
  const patchComponentStyle = (type: string, patch: Partial<ComponentStyle>) => {
    setComponentDefaults((prev) => {
      const next: ComponentDefaults = { ...prev };
      const merged: ComponentStyle = { ...(next[type]?.styles ?? {}), ...patch };
      if (!merged.color && !merged.background && !merged.fontSize) {
        delete next[type];
      } else {
        next[type] = { styles: merged };
      }
      return next;
    });
  };

  const customizingDef = customizingKey ? BLOCK_TYPES.find((b) => b.type === customizingKey) : undefined;

  /** Preview theme for the component detail sample. */
  const detailTheme = useMemo(() => ({
    ...DEFAULT_PREVIEW_THEME,
    fontFamily: `${composableConfig.theme.fontFamily}, sans-serif`,
    baseFontSize: composableConfig.theme.baseFontSize,
    colors: composableConfig.theme.colors,
    spacing: composableConfig.theme.spacing,
    pagePadding: composableConfig.theme.pagePadding,
  }), [composableConfig]);

  const resetComponentStyle = (type: string) => {
    setComponentDefaults((prev) => {
      const next = { ...prev };
      delete next[type];
      return next;
    });
  };

  const libraryOptions = useMemo(() => {
    const q = libQuery.trim().toLowerCase();
    return BLOCK_TYPES.filter(
      (b) => !q || b.name.toLowerCase().includes(q) || b.description.toLowerCase().includes(q),
    );
  }, [libQuery]);

  /** Hydrate canvas/theme/allowlist/defaults from a documentConfig payload. */
  const applyDocumentConfig = useCallback(
    (cfg: TemplateRecord['documentConfig']) => {
      const known = new Set(BLOCK_TYPES.map((b) => b.type));
      if (cfg && Array.isArray(cfg.allowedBlocks)) {
        const filtered = cfg.allowedBlocks.filter((a) => known.has(a));
        setAllowedBlocks(
          ensureSectionAllowed(filtered.length > 0 ? filtered : BLOCK_TYPES.map((b) => b.type)),
        );
      } else {
        setAllowedBlocks(BLOCK_TYPES.map((b) => b.type));
      }
      setComponentDefaults(
        cfg && cfg.componentDefaults && typeof cfg.componentDefaults === 'object'
          ? (cfg.componentDefaults as ComponentDefaults)
          : {},
      );
      setDocFormat(cfg?.format === 'slides' ? 'slides' : 'document');
      setPageSize(
        isDocPageSize(cfg?.pageSize) ? cfg.pageSize : 'A4',
      );
      setOrientation(cfg?.orientation === 'landscape' ? 'landscape' : 'portrait');
      const base = DEFAULT_DOC_CONFIG.theme;
      if (cfg?.theme && typeof cfg.theme === 'object') {
        const t = cfg.theme;
        setDocTheme({
          pagePadding: docPagePadding(t.pagePadding),
          fontFamily: typeof t.fontFamily === 'string' && t.fontFamily ? t.fontFamily : base.fontFamily,
          baseFontSize:
            typeof t.baseFontSize === 'number' && t.baseFontSize >= 8 && t.baseFontSize <= 16
              ? t.baseFontSize
              : base.baseFontSize,
          colors: {
            primary: t.colors?.primary ?? base.colors.primary,
            heading: t.colors?.heading ?? base.colors.heading,
            body: t.colors?.body ?? base.colors.body,
            muted: t.colors?.muted ?? base.colors.muted,
          },
          spacing:
            typeof t.spacing === 'number' && t.spacing >= 0 && t.spacing <= 48
              ? t.spacing
              : base.spacing,
          header: {
            editable: t.header?.editable === true,
            enabled: t.header?.enabled ?? base.header?.enabled ?? false,
            text: typeof t.header?.text === 'string' ? t.header.text : '',
          },
          footer: {
            editable: t.footer?.editable === true,
            enabled: t.footer?.enabled ?? base.footer?.enabled ?? false,
            text: typeof t.footer?.text === 'string' ? t.footer.text : '',
          },
          pageNumbering: { ...t.pageNumbering, enabled: t.pageNumbering?.enabled ?? true },
        });
      } else {
        setDocTheme(base);
      }
    },
    [DEFAULT_DOC_CONFIG],
  );

  /** Hydrate the designer working state from a template record. */
  const applyTemplate = useCallback((t: TemplateRecord) => {
    setName(t.name);
    setTags(t.tags ?? []);
    setDescription(t.description || '');
    setIsComposable(t.kind === 'document');
    if (t.kind === 'document') {
      setBlocks(ensureSections(Array.isArray(t.blocks) ? t.blocks : []));
      applyDocumentConfig(t.documentConfig);
      setCustomizingKey(null);
      return;
    }
    setComponents(t.canvas.components);
    setCanvasSize(t.canvas.size);
    setGroups(t.groups);
    setPageBackgrounds(t.canvas.pageBackgrounds || []);
    setPageCount(t.canvas.pageBackgrounds?.length || 1);
    setOpenVersion(null);
    setFormFields(t.fields.map(f => ({
      name: f.name,
      type: f.type,
      required: f.required,
      groupId: f.groupId,
      defaultValue: f.defaultValue ?? '',
      placeholder: f.placeholder ?? '',
      info: f.info ?? '',
      section: f.section ?? '',
      options: f.options ?? [],
      defaultToday: f.defaultToday ?? false,
      disabled: f.disabled,
      visible: f.visible,
      askOnGenerate: f.askOnGenerate,
    })));
  }, [applyDocumentConfig]);

  /** Apply a version snapshot to the designer working state. */
  const applyVersionSnapshot = useCallback((snap: TemplateVersionSnapshot, v: string) => {
    if (snap.kind === 'document' || (!snap.canvas && Array.isArray(snap.blocks))) {
      setIsComposable(true);
      setBlocks(ensureSections(Array.isArray(snap.blocks) ? snap.blocks : []));
      applyDocumentConfig(snap.documentConfig);
      setCustomizingKey(null);
      setOpenVersion(v);
      return;
    }
    setComponents(snap.canvas.components);
    setCanvasSize(snap.canvas.size);
    setGroups(snap.groups ?? []);
    setPageBackgrounds(snap.canvas.pageBackgrounds || []);
    setPageCount(snap.canvas.pageBackgrounds?.length || 1);
    setFormFields((snap.fields ?? []).map(f => ({
      name: f.name,
      type: f.type,
      required: f.required,
      groupId: f.groupId,
      defaultValue: f.defaultValue ?? '',
      placeholder: f.placeholder ?? '',
      info: f.info ?? '',
      section: f.section ?? '',
      options: f.options ?? [],
      defaultToday: f.defaultToday ?? false,
      disabled: f.disabled,
      visible: f.visible,
      askOnGenerate: f.askOnGenerate,
    })));
    setOpenVersion(v);
  }, [applyDocumentConfig]);

  // Load existing template data when in edit mode. Guarded by a load key so
  // background store refreshes (e.g. setting a default version, which bumps
  // updatedAt but not the version) don't wipe unsaved designer edits — only a
  // genuinely different version (or the first load) rehydrates the workspace.
  const loadedVersionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isEditMode || !templateId) return;
    const template = store.getTemplate(templateId);
    if (!template) return;
    const key = `${templateId}:${template.version ?? 'v1.0'}`;
    if (loadedVersionRef.current === key) return;
    loadedVersionRef.current = key;
    applyTemplate(template);
    setSavedId(templateId);
    // Don't show error if template not found - it might be loading
    // The error will be handled by user navigation if needed
  }, [isEditMode, templateId, store, applyTemplate]);

  // Load version history when in edit mode. The editor always opens the live
  // (current) version — the default version only affects fill/generation, so
  // auto-switching to it here would silently discard unsaved current edits.
  useEffect(() => {
    if (!isEditMode || !templateId || !organizationId) return;
    let cancelled = false;
    templatesService.listVersions(organizationId, templateId)
      .then((list) => {
        if (!cancelled) setVersions(list);
      })
      .catch((err) => console.error('Failed to load versions:', err));
    return () => { cancelled = true; };
  }, [isEditMode, templateId, organizationId]);

  const templateRecord = templateId ? store.getTemplate(templateId) : undefined;
  const currentVersion = versions.find((v) => v.isCurrent)?.version ?? templateRecord?.version ?? 'v1.0';

  /** Receive the document's fields (text {{token}} + named image slots) and
   * reconcile with the user's per-field type/required config, preserving both.
   * Identity is the compound `groupId::name` so group fields don't collapse.
   * The image kind is intrinsic (needs a file upload), so it always forces
   * type 'image'; text subtypes (email/number/date/…) are user preferences. */
  const handleFieldsChange = useCallback((fields: DesignerField[]) => {
    setFormFields((prev) => {
      const byKey = new Map(prev.map((f) => [fieldKeyOf(f.groupId, f.name), f]));
      return fields.map((f) => {
        const existing = byKey.get(fieldKeyOf(f.groupId, f.name));
        if (existing) {
          const type = f.kind === 'image' ? 'image' : existing.type || 'text';
          return { ...existing, type };
        }
        return {
          name: f.name,
          type: f.kind === 'image' ? 'image' : 'text',
          required: false,
          groupId: f.groupId,
          defaultValue: '',
          placeholder: '',
          info: '',
          section: '',
          options: undefined,
          defaultToday: false,
          askOnGenerate: false,
        };
      });
    });
  }, []);

  const setFieldType = (groupId: string | undefined, n: string, type: string) =>
    setFormFields((prev) => prev.map((f) => (f.groupId === groupId && f.name === n ? { ...f, type } : f)));
  const setFieldRequired = (groupId: string | undefined, n: string, required: boolean) =>
    setFormFields((prev) => prev.map((f) => (f.groupId === groupId && f.name === n ? { ...f, required } : f)));
  const patchField = (groupId: string | undefined, name: string, patch: Partial<FormFieldConfig>) =>
    setFormFields((prev) => prev.map((f) => (f.groupId === groupId && f.name === name ? { ...f, ...patch } : f)));

  /** Group id → display name, for labeling group-scoped fields. */
  const groupNameOf = new Map(groups.map((g) => [g.id, g.name]));

  const handlePdfAnalyze = async () => {
    if (!pdfFile) return;
    setImporting(true);
    try {
      const result: PdfImportResult = await pdfImportService.analyzePdf(pdfFile, detectPdfFields);
      setPdfDetection(result.detection);
      // Alignment is inferred backend-side from the source geometry — center/
      // right-aligned text imports as such.
      setComponents(result.components);
      setCanvasSize(result.canvasSize);
      setPageCount(result.pageCount);
      setPageBackgrounds(result.pages.map((p) => p.background));
      setFormFields(result.fields.map((f) => ({
        name: f.name,
        type: f.type,
        required: f.required,
        groupId: undefined,
        defaultValue: '',
        placeholder: '',
        info: '',
        section: '',
        options: f.options,
        defaultToday: false,
        askOnGenerate: false,
      })));
      if (!name.trim()) {
        setName(pdfFile.name.replace(/\.pdf$/i, ''));
      }
      toast.show({
        title: 'PDF imported',
        message: `Imported ${result.pageCount} page(s) and detected ${result.fields.length} inputs.${result.warnings?.length ? ' ' + result.warnings.join(' ') : ''}`,
        color: 'teal',
      });
    } catch (err) {
      console.error('PDF import failed:', err);
      toast.show({
        title: 'Import failed',
        message: 'Could not analyze this PDF. Please try a different file.',
        color: 'red',
      });
    } finally {
      setImporting(false);
      setPdfFile(null);
    }
  };

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toast.show({ title: 'Name required', message: 'Give your template a name before saving.', color: 'red' });
      return;
    }
    try {
      const saved = await store.saveTemplate({
        id: savedId ?? undefined,
        name,
        tags,
        description,
        canvas: isComposable
          ? { size: CANVAS_SIZE, components: [], pageBackgrounds: [] }
          : { size: canvasSize, components, pageBackgrounds },
        groups: isComposable ? [] : groups,
        fields: isComposable ? [] : formFields,
        ...(isComposable
          ? { kind: 'document' as const, format: composableConfig.format, documentConfig: composableConfig, blocks }
          : {}),
      });
      setSavedId(saved.id);
      // Content now lives on the current version again.
      setOpenVersion(null);

      // If this was the first save (no previous savedId), navigate to edit mode
      if (!savedId) {
        navigate(buildPath(`templates/${saved.id}/edit`));
      } else {
        toast.show({ title: 'Template saved', message: `"<span class="math-inline">${name}</span>" has been saved successfully.`, color: 'teal' });
      }
    } catch (error) {
      console.error('Failed to save template:', error);
      toast.show({
        title: 'Save failed',
        message: 'Could not save the template. Please try again.',
        color: 'red'
      });
    }
  }, [name, tags, description, canvasSize, components, pageBackgrounds, groups, formFields, savedId, isComposable, composableConfig, blocks, store, navigate, buildPath, toast]);

  /** Open a specific version's snapshot in the designer. */
  const loadVersion = useCallback(async (v: string) => {
    if (!organizationId || !templateId) return;
    try {
      const snap = await templatesService.getVersion(organizationId, templateId, v);
      applyVersionSnapshot(snap, v);
      toast.show({ title: 'Version loaded', message: `${v} is now open in the designer.`, color: 'teal' });
    } catch (err) {
      console.error('Failed to load version:', err);
      toast.show({ title: 'Failed to load version', message: 'Could not load this version. Please try again.', color: 'red' });
    }
  }, [organizationId, templateId, applyVersionSnapshot, toast]);

  /** Mark a version as the default (forms/generated docs resolve to it). */
  const handleSetDefault = useCallback(async (v: string) => {
    if (!organizationId || !templateId) return;
    try {
      await templatesService.setDefaultVersion(organizationId, templateId, v);
      setVersions((prev) => prev.map((x) => ({ ...x, isDefault: x.version === v })));
      await store.refreshTemplates();
      toast.show({ title: 'Default version set', message: `${v} is now the default version.`, color: 'teal' });
    } catch (err) {
      console.error('Failed to set default version:', err);
      toast.show({ title: 'Failed to set default', message: 'Could not update the default version.', color: 'red' });
    }
  }, [organizationId, templateId, toast, store]);

  const openVersionModal = () => {
    setVersionSource('duplicate');
    setVersionFrom(currentVersion);
    setVersionDesc('');
    setVersionModalOpen(true);
  };

  /** Delete an archived version from history. */
  const handleDeleteVersion = useCallback(async (v: string) => {
    if (!organizationId || !templateId) return;
    try {
      await templatesService.deleteVersion(organizationId, templateId, v);
      const fresh = await templatesService.listVersions(organizationId, templateId);
      setVersions(fresh);
      await store.refreshTemplates();
      toast.show({ title: 'Version deleted', message: `${v} has been removed.`, color: 'teal' });
    } catch (err) {
      console.error('Failed to delete version:', err);
      toast.show({ title: 'Failed to delete version', message: 'Could not delete this version. Please try again.', color: 'red' });
    }
  }, [organizationId, templateId, toast, store]);

  /** Explicitly cut a new version from the chosen source, then load it. */
  const handleCreateVersion = useCallback(async () => {
    if (!organizationId || !templateId) return;
    setCreatingVersion(true);
    try {
      const saved = await templatesService.createVersion(organizationId, templateId, {
        source: versionSource,
        fromVersion: versionSource === 'duplicate' ? versionFrom : undefined,
        changeDescription: versionDesc.trim() || undefined,
      });
      applyTemplate(saved);
      setSavedId(saved.id);
      setVersionModalOpen(false);
      setVersionDesc('');
      await store.refreshTemplates();
      const fresh = await templatesService.listVersions(organizationId, saved.id);
      setVersions(fresh);
      toast.show({ title: 'New version created', message: `${saved.version} is now the current version.`, color: 'teal' });
      if (versionSource === 'pdf') {
        setPendingPdfImport(true);
      }
    } catch (err) {
      console.error('Failed to create version:', err);
      toast.show({ title: 'Failed to create version', message: 'Could not create the new version. Please try again.', color: 'red' });
    } finally {
      setCreatingVersion(false);
    }
  }, [organizationId, templateId, versionSource, versionFrom, versionDesc, applyTemplate, store, toast]);

  /** Persist the working copy first, then cut a version from it. */
  const handleSaveAsNewVersion = useCallback(async () => {
    if (!name.trim()) {
      toast.show({ title: 'Name required', message: 'Give your template a name before saving.', color: 'red' });
      return;
    }
    if (!organizationId) return;
    try {
      const saved = await store.saveTemplate({
        id: savedId ?? undefined,
        name,
        tags,
        description,
        canvas: isComposable
          ? { size: canvasSize, components: [], pageBackgrounds: [] }
          : { size: canvasSize, components, pageBackgrounds },
        groups: isComposable ? [] : groups,
        fields: isComposable ? [] : formFields,
        ...(isComposable
          ? { kind: 'document' as const, format: composableConfig.format, documentConfig: composableConfig, blocks }
          : {}),
      });
      setSavedId(saved.id);
      const v = await templatesService.createVersion(organizationId, saved.id, { source: 'duplicate' });
      applyTemplate(v);
      await store.refreshTemplates();
      const fresh = await templatesService.listVersions(organizationId, saved.id);
      setVersions(fresh);
      toast.show({ title: 'Saved as new version', message: `${v.version} created from the current design.`, color: 'teal' });
    } catch (err) {
      console.error('Failed to save as new version:', err);
      toast.show({ title: 'Save failed', message: 'Could not save as a new version. Please try again.', color: 'red' });
    }
  }, [name, tags, description, canvasSize, components, pageBackgrounds, groups, formFields, savedId, organizationId, isComposable, blocks, composableConfig, applyTemplate, store, toast]);

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-stone-50 px-4 py-6 text-stone-800 sm:px-6 lg:px-8 xl:h-screen xl:overflow-hidden dark:bg-stone-900 dark:text-stone-100">
      {/* Header: back + editable name + actions */}
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(buildPath('templates'))}
            aria-label="Back to templates"
            title="Back to templates"
            className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-100"
          >
            <IconArrowLeft size={20} />
          </button>
          <InlineEdit value={name} onChange={setName} placeholder="Untitled template" />
        </div>
        <div className="flex items-center gap-2">
          {isEditMode && (
            <Button
              variant="default"
              leftSection={<IconFileText size={16} />}
              onClick={() => navigate(buildPath(`templates/${templateId}/fill`))}
              className="shrink-0"
            >
              Switch to Fill Mode
            </Button>
          )}
          {isEditMode && (
            <Dropdown
              align="end"
              panelClassName="w-80"
              trigger={
                  <Button
                    variant="default"
                    leftSection={<IconVersions size={16} />}
                    rightSection={<IconChevronDown size={16} />}
                    className="shrink-0"
                  >
                    {openVersion ?? currentVersion}
                  </Button>
              }
            >
              <DropdownLabel>Version history</DropdownLabel>
              {versions.length === 0 ? (
                <p className="px-2.5 py-1.5 text-sm text-stone-400 dark:text-stone-500">Loading versions...</p>
              ) : (
                versions.map((v) => (
                  <VersionRow
                    key={v.version}
                    v={v}
                    currentVersion={currentVersion}
                    openVersion={openVersion}
                    onOpen={(version) => setPendingOpenVersion(version)}
                    onSetDefault={handleSetDefault}
                    onDelete={(version) => setDeleteVersionTarget(version)}
                  />
                ))
              )}
              <DropdownDivider />
              <DropdownItem leftSection={<IconPlus size={16} />} onClick={openVersionModal}>
                Create new version
              </DropdownItem>
              <DropdownItem leftSection={<IconHistory size={16} />} onClick={handleSaveAsNewVersion}>
                Save as new version
              </DropdownItem>
            </Dropdown>
          )}
          <Button leftSection={<IconDeviceFloppy size={16} />} onClick={handleSave} className="shrink-0">
            Save
          </Button>
        </div>
      </div>

      {/* Workspace: details | components | library */}
      {isComposable ? (
        <div className="grid grid-cols-1 gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
          {/* Left — template details (composable subset) */}
          <Panel title="Template details" subtitle="Basic information" className="min-h-0">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-stone-700 dark:text-stone-200">Tags</label>
                {orgTags.length === 0 ? (
                  <p className="rounded-md border border-dashed border-stone-300 px-3 py-2 text-xs text-stone-400 dark:border-stone-600">
                    No tags yet. Create some in Organization settings → Tags.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {orgTags.map((tag) => {
                      const selected = tags.includes(tag.name);
                      return (
                        <button
                          key={tag._id}
                          type="button"
                          onClick={() => toggleTag(tag.name)}
                          className={cn(
                            'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                            selected
                              ? 'text-white'
                              : 'border border-stone-300 text-stone-500 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-700',
                          )}
                          style={selected ? { backgroundColor: tag.color || '#6B7280' } : undefined}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>


              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-stone-700 dark:text-stone-200">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="What is this document for?"
                  className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300/40 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                />
              </div>
              <p className="rounded-md bg-stone-100 px-3 py-2 text-xs leading-relaxed text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                Activate components on the right, then open one in the middle to customize its
                default style. Documents are composed from these blocks in fill mode.
              </p>
            </div>
          </Panel>

          {/* Middle — active components as cards, or the open component detail */}
          <Panel
            title={customizingDef ? customizingDef.name : 'Components'}
            subtitle={
              customizingDef
                ? 'Default style + preview'
                : `${allowedBlocks.length} active — open one to customize`
            }
            className="min-h-0"
          >
            {customizingDef ? (
              <ComponentDetail
                type={customizingDef.type}
                style={componentDefaults[customizingDef.type]?.styles ?? {}}
                theme={detailTheme}
                componentDefaults={componentDefaults}
                onBack={() => setCustomizingKey(null)}
                onStyleChange={(patch) => patchComponentStyle(customizingDef.type, patch)}
                onReset={() => resetComponentStyle(customizingDef.type)}
              />
            ) : (
              <div className="flex min-h-0 min-w-0 flex-col">
                {/* Vertical canvas preview: every active component top-to-bottom
                    with the live theme, default styles, and header/footer. */}
                <div
                  className="mx-auto w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm dark:border-stone-700"
                  style={{ maxWidth: docPageDims(pageSize, orientation).width, fontFamily: detailTheme.fontFamily, paddingInline: docPagePadding(docTheme.pagePadding) }}
                >
                  {docTheme.header?.enabled && (
                    <div className="border-b border-stone-200 pb-3 pt-6">
                      <p
                        className="truncate font-bold"
                        style={{ color: detailTheme.colors.heading, fontSize: detailTheme.baseFontSize * 1.1 }}
                      >
                        {docTheme.header.text || '\u00a0'}
                      </p>
                    </div>
                  )}
                  <div className="flex min-w-0 flex-col py-6" style={{ gap: docTheme.spacing }}>
                    {allowedBlocks.map((type) => {
                      const def = getBlockDef(type);
                      if (!def) return null;
                      const customized = componentDefaults[type] !== undefined;
                      return (
                        <div
                          key={type}
                          role="button"
                          tabIndex={0}
                          onClick={() => setCustomizingKey(type)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setCustomizingKey(type);
                            }
                          }}
                          title={`Customize ${def.name}`}
                          className="min-w-0 cursor-pointer rounded-md border border-transparent p-2 transition-colors hover:border-orange-300 hover:bg-orange-50/40 dark:hover:border-orange-800"
                        >
                          <p className="mb-1 flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate">
                              <span className="inline-block rounded bg-stone-100 px-1.5 py-0.5 text-xs font-semibold text-stone-900 ring-1 ring-stone-200">
                                {def.name}
                              </span>
                            </span>
                            {customized && (
                              <span className="size-1.5 shrink-0 rounded-full bg-orange-500" title="Customized" />
                            )}
                            <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:bg-stone-800 dark:text-stone-300">
                              {def.category}
                            </span>
                            <IconChevronRight size={16} className="shrink-0 text-stone-300" />
                          </p>
                          <BlockPreview
                            blocks={[{ id: `sample-${type}`, type, inputs: def.sampleInputs() }]}
                            theme={detailTheme}
                            componentDefaults={componentDefaults}
                            nested
                          />
                        </div>
                      );
                    })}
                  </div>
                  {docTheme.footer?.enabled && (
                    <div className="border-t border-stone-200 pb-6 pt-3">
                      <p
                        className="truncate"
                        style={{ color: detailTheme.colors.muted, fontSize: detailTheme.baseFontSize * 0.85 }}
                      >
                        {docTheme.footer.text || '\u00a0'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Panel>

          {/* Right — tabbed: component library | canvas | theme | header & footer */}
          <Panel
            title="Design"
            subtitle={`${allowedBlocks.length}/${BLOCK_TYPES.length} components active`}
            className="min-h-0 min-w-0"
          >
            <Tabs
              value={rightTab}
              onValueChange={(v) => setRightTab(v as typeof rightTab)}
              className="flex min-h-0 flex-col xl:h-full"
            >
              <TabsList className="grid shrink-0 grid-cols-4 gap-0">
                <Tab value="components" className="min-w-0 justify-center whitespace-nowrap px-1 py-2.5 text-xs">Components</Tab>
                <Tab value="canvas" className="min-w-0 justify-center whitespace-nowrap px-1 py-2.5 text-xs">Canvas</Tab>
                <Tab value="theme" className="min-w-0 justify-center whitespace-nowrap px-1 py-2.5 text-xs">Theme</Tab>
                <Tab value="chrome" className="min-w-0 justify-center whitespace-nowrap px-1 py-2.5 text-xs">Header/footer</Tab>
              </TabsList>
              <TabPanel value="components" className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden pt-3">
                <input
                  type="text"
                  value={libQuery}
                  onChange={(e) => setLibQuery(e.target.value)}
                  placeholder="Search components…"
                  aria-label="Search components"
                  className="h-8 shrink-0 rounded-md border border-stone-300 bg-white px-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:border-orange-500 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                />
                <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto">
                  {libraryOptions.length === 0 && (
                    <p className="px-2 py-3 text-center text-xs text-stone-400">No components match.</p>
                  )}
                  {libraryOptions.map((b) => {
                    const active = allowedBlocks.includes(b.type);
                    return (
                      <label
                        key={b.type}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800"
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleAllowed(b.type)}
                          aria-label={`Activate ${b.name}`}
                          className="size-3.5 shrink-0 rounded accent-orange-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-xs font-medium', active ? 'text-stone-700 dark:text-stone-200' : 'text-stone-400')}>
                            {b.name}
                          </span>
                          <span className="block truncate text-[11px] text-stone-400">{b.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </TabPanel>
              <TabPanel value="canvas" className="min-h-0 flex-1 overflow-auto pt-3">
                <DocCanvasSettings
                  pageSize={pageSize}
                  format={docFormat}
                  orientation={orientation}
                  spacing={docTheme.spacing}
                  padding={docTheme.pagePadding}
                  onPaddingChange={(pagePadding) => setDocTheme({ ...docTheme, pagePadding })}
                  onPageSizeChange={setPageSize}
                  onFormatChange={setDocFormat}
                  onOrientationChange={setOrientation}
                  onSpacingChange={(spacing) => setDocTheme({ ...docTheme, spacing })}
                />
              </TabPanel>
              <TabPanel value="theme" className="min-h-0 flex-1 overflow-auto pt-3">
                <ThemeSettings
                  theme={docTheme}
                  onChange={setDocTheme}
                  onReset={() => setDocTheme(DEFAULT_DOC_CONFIG.theme)}
                />
              </TabPanel>
              <TabPanel value="chrome" className="min-h-0 flex-1 overflow-auto pt-3">
                <HeaderFooterSettings
                  theme={docTheme}
                  onChange={setDocTheme}
                />
              </TabPanel>
            </Tabs>
          </Panel>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-4 xl:min-h-0 xl:flex-1 xl:grid-rows-1 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* Left — template details + form fields */}
        <Panel title="Template details" subtitle="Basic information" className="min-h-0">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-200">Tags</label>
              {orgTags.length === 0 ? (
                <p className="rounded-md border border-dashed border-stone-300 px-3 py-2 text-xs text-stone-400 dark:border-stone-600">
                  No tags yet. Create some in Organization settings → Tags.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {orgTags.map((tag) => {
                    const selected = tags.includes(tag.name);
                    return (
                      <button
                        key={tag._id}
                        type="button"
                        onClick={() => toggleTag(tag.name)}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                          selected
                            ? 'text-white'
                            : 'border border-stone-300 text-stone-500 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-700',
                        )}
                        style={selected ? { backgroundColor: tag.color || '#6B7280' } : undefined}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>


            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-200">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Describe what this template is for..."
                className="w-full resize-none rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 transition-colors placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-stone-700 dark:text-stone-200">Form fields</label>
                <span className="text-xs text-stone-400">{formFields.length}</span>
              </div>
              <p className="text-xs text-stone-400 dark:text-stone-500">
                Auto-extracted from {'{{field}}'} placeholders. Group fields are array-valued.
              </p>
              {formFields.length === 0 ? (
                <p className="rounded-md border border-dashed border-stone-300 p-2 text-center text-xs text-stone-400 dark:border-stone-600 dark:text-stone-500">
                  No fields yet. Add a text component and type {'{{field name}}'}.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {formFields.map((f) => {
                    const groupName = f.groupId ? groupNameOf.get(f.groupId) : undefined;
                    const key = fieldKeyOf(f.groupId, f.name);
                    const isExpanded = expandedFieldKeys.has(key);
                    return (
                      <div
                        key={key}
                        className="rounded-md border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900/40"
                      >
                        {/* Collapsed row (always visible) */}
                        <div className="flex flex-col gap-2 p-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {groupName && (
                              <span className="shrink-0 rounded bg-orange-50 px-1 py-0.5 text-[10px] font-medium text-orange-600 dark:bg-orange-950/50 dark:text-orange-300">
                                ↻ {groupName}
                              </span>
                            )}
                            <span
                              className="truncate text-sm font-medium text-stone-800 dark:text-stone-100"
                              title={groupName ? `${groupName} / ${f.name}` : f.name}
                            >
                              {f.name}
                            </span>
                            {f.section && (
                              <Badge color="blue" size="sm" variant="light" className="shrink-0">
                                {f.section}
                              </Badge>
                            )}
                            {f.askOnGenerate && (
                              <Badge color="orange" size="sm" variant="light" className="shrink-0">
                                ask
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <Dropdown
                              panelClassName="w-40"
                              trigger={
                                <div className="flex h-7 cursor-pointer items-center justify-between gap-1 rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-700 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200">
                                  <span className="truncate">
                                    {FIELD_TYPES.find((t) => t.value === f.type)?.label ?? 'Text'}
                                  </span>
                                  <IconChevronDown size={12} className="shrink-0 text-stone-400" />
                                </div>
                              }
                            >
                              {FIELD_TYPES.map((t) => (
                                <DropdownItem
                                  key={t.value}
                                  className={f.type === t.value ? 'text-orange-700 dark:text-orange-300' : undefined}
                                  onClick={() => setFieldType(f.groupId, f.name, t.value)}
                                >
                                  {t.label}
                                </DropdownItem>
                              ))}
                            </Dropdown>
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                              <input
                                type="checkbox"
                                checked={f.required}
                                onChange={(e) => setFieldRequired(f.groupId, f.name, e.target.checked)}
                                className="size-3.5 rounded accent-orange-600"
                              />
                              Required
                            </label>
                            <button
                              type="button"
                              onClick={() => toggleFieldExpanded(key)}
                              aria-label={isExpanded ? 'Collapse' : 'Expand'}
                              aria-pressed={isExpanded}
                              className="-mr-1 ml-auto flex size-7 shrink-0 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                            >
                              {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                            </button>
                          </div>
                        </div>

                        {/* Expanded panel (when expanded) */}
                        {isExpanded && (
                          <div className="flex flex-col gap-2 border-t border-stone-200 p-2 dark:border-stone-700">
                            {/* Visibility / lock / ask-on-generate toggles */}
                            <div className="flex flex-wrap gap-4">
                              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400">
                                <input
                                  type="checkbox"
                                  checked={f.visible !== false}
                                  onChange={(e) => patchField(f.groupId, f.name, { visible: e.target.checked })}
                                  className="size-3.5 rounded accent-orange-600"
                                />
                                Visible
                              </label>
                              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400">
                                <input
                                  type="checkbox"
                                  checked={!!f.disabled}
                                  onChange={(e) => patchField(f.groupId, f.name, { disabled: e.target.checked })}
                                  className="size-3.5 rounded accent-orange-600"
                                />
                                Disabled (read-only)
                              </label>
                              <label
                                title={f.groupId ? "Group fields can't ask on generate" : 'Hidden from the form; you are prompted for the value when generating the document'}
                                className={
                                  f.groupId
                                    ? 'flex items-center gap-1.5 text-xs text-stone-400 dark:text-stone-500'
                                    : 'flex cursor-pointer items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400'
                                }
                              >
                                <input
                                  type="checkbox"
                                  disabled={!!f.groupId}
                                  checked={!!f.askOnGenerate}
                                  onChange={(e) => patchField(f.groupId, f.name, { askOnGenerate: e.target.checked })}
                                  className="size-3.5 rounded accent-orange-600"
                                />
                                Ask on generate
                              </label>
                            </div>

                            {/* Section */}
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium text-stone-500 dark:text-stone-400">Section</label>
                              <input
                                type="text"
                                value={f.section}
                                onChange={(e) => patchField(f.groupId, f.name, { section: e.target.value })}
                                placeholder="e.g. Personal, Employment, Terms"
                                className="h-7 w-full rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-800 transition-colors placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
                              />
                            </div>

                            {/* Default value */}
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium text-stone-500 dark:text-stone-400">Default value</label>
                              {f.type === 'longtext' ? (
                                <textarea
                                  value={f.defaultValue}
                                  onChange={(e) => patchField(f.groupId, f.name, { defaultValue: e.target.value })}
                                  placeholder="Leave blank for no default"
                                  rows={2}
                                  className="w-full resize-none rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-800 transition-colors placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
                                />
                              ) : f.type === 'date' ? (
                                <>
                                  <input
                                    type="date"
                                    disabled={!!f.defaultToday}
                                    value={f.defaultValue}
                                    onChange={(e) => patchField(f.groupId, f.name, { defaultValue: e.target.value })}
                                    placeholder="Leave blank for no default"
                                    className="h-7 w-full rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-800 transition-colors placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                  />
                                  <label className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400">
                                    <input
                                      type="checkbox"
                                      checked={!!f.defaultToday}
                                      onChange={(e) =>
                                        patchField(f.groupId, f.name, {
                                          defaultToday: e.target.checked,
                                          // Clear explicit default when opting into "today" to avoid ambiguity
                                          ...(e.target.checked ? { defaultValue: '' } : {}),
                                        })
                                      }
                                      className="size-3.5 rounded accent-orange-600"
                                    />
                                    <span>Default to today's date</span>
                                  </label>
                                  <span className="text-[10px] text-stone-400 dark:text-stone-500">Set to the current date when the form is opened.</span>
                                </>
                              ) : (
                                <input
                                  type="text"
                                  value={f.defaultValue}
                                  onChange={(e) => patchField(f.groupId, f.name, { defaultValue: e.target.value })}
                                  placeholder="Leave blank for no default"
                                  className="h-7 w-full rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-800 transition-colors placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
                                />
                              )}
                            </div>

                            {/* Placeholder */}
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium text-stone-500 dark:text-stone-400">Placeholder</label>
                              <input
                                type="text"
                                value={f.placeholder}
                                onChange={(e) => patchField(f.groupId, f.name, { placeholder: e.target.value })}
                                placeholder="Leave blank to use field name"
                                className="h-7 w-full rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-800 transition-colors placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
                              />
                              <span className="text-[10px] text-stone-400 dark:text-stone-500">Leave blank to use the field name.</span>
                            </div>

                            {/* Info / help text */}
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium text-stone-500 dark:text-stone-400">Info / help text</label>
                              <input
                                type="text"
                                value={f.info}
                                onChange={(e) => patchField(f.groupId, f.name, { info: e.target.value })}
                                placeholder="Brief explanation for the user"
                                className="h-7 w-full rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-800 transition-colors placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
                              />
                              <span className="text-[10px] text-stone-400 dark:text-stone-500">Shown as a tooltip next to the label.</span>
                            </div>

                            {/* Dropdown options (only when type === 'dropdown') */}
                            {f.type === 'dropdown' && (
                              <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-medium text-stone-500 dark:text-stone-400">Dropdown options</label>
                                <DropdownOptionsEditor
                                  options={f.options ?? []}
                                  onChange={(options) => patchField(f.groupId, f.name, { options })}
                                />
                                <span className="text-[10px] text-stone-400 dark:text-stone-500">Type values separated by commas — they're added instantly.</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Panel>

        {/* Right — reusable WYSIWYG designer */}
        <TemplateDesigner
          value={components}
          onChange={setComponents}
          groups={groups}
          onGroupsChange={setGroups}
          onFieldsChange={handleFieldsChange}
          canvasSize={canvasSize}
          onCanvasSizeChange={setCanvasSize}
          pageCount={pageCount}
          onPageCountChange={setPageCount}
          pageBackgrounds={pageBackgrounds}
          onSave={handleSave}
        />
      </div>
      )}

      {pdfDetection && (
        <div role="status" className="rounded-md border border-stone-200 p-3 text-sm text-stone-600 dark:border-stone-700 dark:text-stone-400">
          <p className="font-medium">PDF input detection: {pdfDetection.status}</p>
          <p>{pdfDetection.detectedCount} inputs · {pdfDetection.requestCount} requests · {pdfDetection.inputTokens.toLocaleString()} input / {pdfDetection.outputTokens.toLocaleString()} output tokens{!pdfDetection.usageComplete ? ' (partial usage)' : ''} · {(pdfDetection.totalDurationMs / 1000).toFixed(1)}s</p>
          <p>Estimated cost: {pdfDetection.estimatedCostUsd === null ? `unavailable (known: $${pdfDetection.knownCostUsd.toFixed(8)})` : `$${pdfDetection.estimatedCostUsd.toFixed(8)}`} USD</p>
          <p className="text-xs">Saved import run: {pdfDetection.runId}</p>
        </div>
      )}

      {/* PDF import modal (initial create flow, or after creating a "from PDF" version) */}
      {(isImportMode || pendingPdfImport) && pageBackgrounds.length === 0 && !importing && (
        <Modal
          open
          onClose={() => {
            if (pendingPdfImport) {
              setPendingPdfImport(false);
            } else {
              navigate(buildPath('templates'));
            }
          }}
          title="Import from PDF"
          size="md"
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Upload a PDF to extract its text and form fields. The app will analyze each page and create editable
              components that you can arrange and configure.
            </p>
            <FileInput
              accept="application/pdf"
              maxSizeMB={10}
              value={pdfFile}
              onChange={setPdfFile}
              label="PDF file"
            />
            <label className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-400">
              <input type="checkbox" checked={detectPdfFields} onChange={(event) => setDetectPdfFields(event.target.checked)} className="mt-1 accent-orange-600" />
              <span>Detect fillable inputs with Jev. Extracted labels and nearby text are sent to TypeSafe; usage and estimated cost are saved. Scanned PDFs need OCR or manual fields.</span>
            </label>
            <PdfImportHistory />
            <div className="flex justify-end gap-2">
              <Button
                variant="default"
                onClick={() => {
                  if (pendingPdfImport) {
                    setPendingPdfImport(false);
                  } else {
                    navigate(buildPath('templates'));
                  }
                }}
              >
                Cancel
              </Button>
              <Button variant="filled" onClick={handlePdfAnalyze} disabled={!pdfFile || importing}>
                {importing ? (
                  <>
                    <IconLoader size={16} className="animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Analyze PDF'
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create new version modal */}
      <Modal
        open={versionModalOpen}
        onClose={() => setVersionModalOpen(false)}
        title="Create a new version"
        subtitle="How would you like to start?"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="default" onClick={() => setVersionModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateVersion} disabled={creatingVersion}>
              {creatingVersion ? (
                <>
                  <IconLoader size={16} className="animate-spin" />
                  Creating...
                </>
              ) : (
                'Create version'
              )}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {/* Duplicate from a version */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setVersionSource('duplicate')}
            className={cn(
              'rounded-md border p-3 transition-colors cursor-pointer',
              versionSource === 'duplicate'
                ? 'border-orange-400 bg-orange-50/40 dark:bg-orange-950/30'
                : 'border-stone-200 hover:border-stone-300 dark:border-stone-700',
            )}
          >
            <div className="flex items-center gap-3">
              <ThemeIcon size={44} radius="lg" color="blue" variant="light">
                <IconVersions size={22} />
              </ThemeIcon>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-800 dark:text-stone-100">Duplicate from a version</p>
                <p className="text-sm text-stone-500 dark:text-stone-400">Start from an existing version of this template.</p>
              </div>
              {versionSource === 'duplicate' && <IconCheck size={18} className="shrink-0 text-orange-600" />}
            </div>
            {versionSource === 'duplicate' && (
              <select
                value={versionFrom}
                onChange={(e) => setVersionFrom(e.target.value)}
                className="mt-2 h-9 w-full rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-800 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
              >
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {v.version}
                    {v.isDefault ? ' (default)' : ''}
                    {v.version === currentVersion ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <VersionSourceOption
            icon={IconFilePlus}
            title="Blank canvas"
            desc="Start with an empty page and design from scratch."
            selected={versionSource === 'blank'}
            onSelect={() => setVersionSource('blank')}
          />
          <VersionSourceOption
            icon={IconFileImport}
            title="From PDF"
            desc="Upload a PDF and auto-extract its fields."
            selected={versionSource === 'pdf'}
            onSelect={() => setVersionSource('pdf')}
          />
          <VersionSourceOption
            icon={IconSparkles}
            title="Generate with AI"
            desc="Describe it and let AI build the layout."
            selected={versionSource === 'ai'}
            onSelect={() => setVersionSource('ai')}
            disabled
            comingSoon
          />
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          <label className="text-sm font-medium text-stone-700 dark:text-stone-200">Change description</label>
          <input
            type="text"
            value={versionDesc}
            onChange={(e) => setVersionDesc(e.target.value)}
            placeholder="What changed in this version?"
            className="h-9 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-800 transition-colors placeholder:text-stone-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
          />
        </div>
      </Modal>

      {/* Confirm before replacing the designer with an archived version */}
      <ConfirmDialog
        open={!!pendingOpenVersion}
        onClose={() => setPendingOpenVersion(null)}
        onConfirm={() => {
          if (pendingOpenVersion) loadVersion(pendingOpenVersion);
          setPendingOpenVersion(null);
        }}
        title="Open this version?"
        message={`This replaces the current designer content with ${pendingOpenVersion}. Unsaved changes will be lost.`}
        confirmLabel="Open version"
      />

      {/* Confirm before deleting an archived version */}
      <ConfirmDialog
        open={!!deleteVersionTarget}
        onClose={() => setDeleteVersionTarget(null)}
        onConfirm={() => {
          if (deleteVersionTarget) handleDeleteVersion(deleteVersionTarget);
          setDeleteVersionTarget(null);
        }}
        title="Delete this version?"
        message={`Version ${deleteVersionTarget} will be permanently removed from history. This cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
