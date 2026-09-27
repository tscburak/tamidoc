/**
 * Fill mode for Composable Templates: layer tree on the left (sections behave
 * like groups), live preview in the middle, inspector for the selected block
 * on the right. Generate validates the content and downloads the PDF.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconArrowLeft, IconDownload } from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Panel } from '../../components/ui';
import {
  AddBlockMenu,
  BLOCK_TYPES,
  BlockInspector,
  DEFAULT_PREVIEW_THEME,
  DocCanvas,
  LayerTree,
  duplicateBlock,
  findBlock,
  findBlockPosition,
  makeBlock,
  moveBlock,
  removeBlockAt,
  updateBlockAt,
  type BlockIssue,
  type ComponentDefaults,
  type DocOrientation,
  type DocPageSize,
  type DocFormat,
} from '../../components/composable';
import type { DocTheme } from '../../components/composable/ThemeSettings';
import type {
  DocBlock,
  TemplateRecord,
} from '../../context/TemplateStoreProvider';
import { useToast } from '../../context/toast';
import { templatesService } from '../../services/templates.service';
import { PageInfoFields, type PageInfoValues } from '../../components/composable/PageInfoFields';

export function FillComposablePage({ template }: { template: TemplateRecord }) {
  const { id = '', organizationId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const buildPath = (path: string) => `/o/${organizationId}/${path}`;

  const [templateName, setTemplateName] = useState('');
  const [title, setTitle] = useState('');
  const [allowedBlocks, setAllowedBlocks] = useState<string[]>(() =>
    BLOCK_TYPES.map((b) => b.type),
  );
  const [componentDefaults, setComponentDefaults] = useState<ComponentDefaults>(
    {},
  );
  const [theme, setTheme] = useState<DocTheme>({
    ...DEFAULT_PREVIEW_THEME,
    header: { enabled: false, text: '' },
    footer: { enabled: false, text: '' },
    pageNumbering: { enabled: false },
  });
  const [pageSize, setPageSize] = useState<DocPageSize>('A4');
  const [format, setFormat] = useState<DocFormat>('document');
  const [version, setVersion] = useState('');
  const [orientation, setOrientation] = useState<DocOrientation>('portrait');
  const [blocks, setBlocks] = useState<DocBlock[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [issues, setIssues] = useState<BlockIssue[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfoValues>({});
  const [generating, setGenerating] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const revision = useRef(0);

  // Fresh template load: allowlist, default styles and theme drive the page.
  useEffect(() => {
    if (!organizationId || !id) return;
    let cancelled = false;
    const load = async () => {
      const t = template;
      const resolvedVersion = t.defaultVersion || t.version;
      const source =
        resolvedVersion && resolvedVersion !== t.version
          ? await templatesService.getVersion(
              organizationId,
              id,
              resolvedVersion,
            )
          : t;
      if (cancelled) return;
      if (source.kind !== 'document' || !source.documentConfig) {
        setNotFound(true);
        return;
      }
      setVersion(resolvedVersion ?? '');
      setTemplateName(t.name);
      setTitle(t.name);
      setBlocks(structuredClone(source.blocks ?? []));
      const cfg = source.documentConfig;
      const known = new Set(BLOCK_TYPES.map((b) => b.type));
      if (cfg && Array.isArray(cfg.allowedBlocks)) {
        const filtered = cfg.allowedBlocks.filter((a) => known.has(a));
        setAllowedBlocks(
          cfg.allowedBlocks.length ? filtered : BLOCK_TYPES.map((b) => b.type),
        );
      }
      if (cfg?.componentDefaults && typeof cfg.componentDefaults === 'object') {
        setComponentDefaults(cfg.componentDefaults);
      }
      setPageSize(cfg.pageSize ?? (cfg.format === 'slides' ? '16:9' : 'A4'));
      if (cfg?.orientation === 'landscape' || cfg?.orientation === 'portrait') {
        setOrientation(cfg.orientation);
      }
      setFormat(cfg.format ?? 'document');
      if (cfg?.theme) {
        const ct = cfg.theme;
        setTheme({
          ...DEFAULT_PREVIEW_THEME,
          fontFamily: `${ct.fontFamily ?? 'Lato'}, sans-serif`,
          baseFontSize: ct.baseFontSize ?? 11,
          colors: { ...DEFAULT_PREVIEW_THEME.colors, ...ct.colors },
          spacing: ct.spacing ?? 12,
          pagePadding: ct.pagePadding,
          header: {
            editable: ct.header?.editable === true,
            enabled: ct.header?.enabled ?? false,
            text: typeof ct.header?.text === 'string' ? ct.header.text : '',
          },
          footer: {
            editable: ct.footer?.editable === true,
            enabled: ct.footer?.enabled ?? false,
            text: typeof ct.footer?.text === 'string' ? ct.footer.text : '',
          },
          pageNumbering: {
            enabled: ct.pageNumbering?.enabled ?? false,
            format: ct.pageNumbering?.format,
          },
        });
      }
    };
    load()
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, id, template]);

  /** Allowlist as a set (section is structural — always offered on top). */
  const allowedSet = useMemo(() => new Set(allowedBlocks), [allowedBlocks]);
  const topOptions = useMemo(
    () =>
      BLOCK_TYPES.filter((b) => b.type === 'section' || allowedSet.has(b.type)),
    [allowedSet],
  );

  const touch = useCallback(() => {
    revision.current += 1;
    setIssues([]);
  }, []);

  const handleAddTop = useCallback(
    (type: string) => {
      const fresh = makeBlock(type);
      setBlocks((prev) => [...prev, fresh]);
      setSelectedId(fresh.id);
      touch();
    },
    [touch],
  );

  const handleAddToSection = useCallback(
    (sectionId: string, type: string) => {
      const fresh = makeBlock(type);
      setBlocks((prev) =>
        updateBlockAt(prev, sectionId, (b) => ({
          ...b,
          inputs: {
            ...b.inputs,
            blocks: [
              ...((b.inputs?.blocks as DocBlock[] | undefined) ?? []),
              fresh,
            ],
          },
        })),
      );
      setSelectedId(fresh.id);
      touch();
    },
    [touch],
  );

  const handleAddToColumn = useCallback(
    (columnsId: string, colIndex: number, type: string) => {
      const fresh = makeBlock(type);
      setBlocks((prev) =>
        updateBlockAt(prev, columnsId, (b) => {
          const cols = (
            Array.isArray(b.inputs?.columns)
              ? (b.inputs.columns as DocBlock[][])
              : []
          ).map((c) => (Array.isArray(c) ? c : []));
          return {
            ...b,
            inputs: {
              ...b.inputs,
              columns: cols.map((c, i) => (i === colIndex ? [...c, fresh] : c)),
            },
          };
        }),
      );
      setSelectedId(fresh.id);
      touch();
    },
    [touch],
  );

  const selected = selectedId ? (findBlock(blocks, selectedId) ?? null) : null;
  const selectedTopIndex = selected
    ? blocks.findIndex((b) => b.id === selected.id)
    : -1;
  const isTopLevel = selectedTopIndex >= 0;
  const selectedPosition = selectedId
    ? findBlockPosition(blocks, selectedId)
    : undefined;

  const patchSelected = useCallback(
    (patch: Partial<DocBlock>) => {
      if (!selected) return;
      setBlocks((prev) =>
        updateBlockAt(prev, selected.id, (b) => ({ ...b, ...patch })),
      );
      touch();
    },
    [selected, touch],
  );

  const moveSelected = useCallback(
    (dir: -1 | 1) => {
      if (!selected) return;
      setBlocks((prev) => moveBlock(prev, selected.id, dir));
      touch();
    },
    [selected, touch],
  );

  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    setBlocks((prev) => duplicateBlock(prev, selected.id));
    touch();
  }, [selected, touch]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    setBlocks((prev) => removeBlockAt(prev, selected.id));
    setSelectedId(null);
    touch();
  }, [selected, touch]);

  const issuesById = useMemo(() => {
    const map = new Map<string, BlockIssue[]>();
    for (const issue of issues) {
      if (!issue.instanceId) continue;
      const list = map.get(issue.instanceId) ?? [];
      list.push(issue);
      map.set(issue.instanceId, list);
    }
    return map;
  }, [issues]);
  const issueIds = useMemo(() => new Set(issuesById.keys()), [issuesById]);

  /** Generate uses responseType: 'blob', so a 422 body arrives as a Blob. */
  const extractIssues = async (err: unknown): Promise<BlockIssue[] | null> => {
    const data = (err as { response?: { data?: unknown } })?.response?.data;
    let parsed: { errors?: unknown } | undefined;
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      try {
        parsed = JSON.parse(await data.text()) as { errors?: unknown };
      } catch {
        return null;
      }
    } else {
      parsed = (err as { response?: { data?: { errors?: unknown } } })?.response
        ?.data;
    }
    // Block-catalog failures come as `{ instanceId, message, fix }` objects.
    // ValidationPipe failures (400) come as plain strings — surface those as
    // issues too so the user sees the actual constraint messages.
    if (Array.isArray(parsed?.errors)) {
      return (parsed.errors as (BlockIssue | string)[]).map((e) =>
        typeof e === 'string'
          ? { message: e, fix: '' }
          : (e as BlockIssue),
      );
    }
    return null;
  };

  const handleGenerate = useCallback(
    async () => {
      if (!organizationId || !id) return;
      const generatedRevision = revision.current;
      setGenerating(true);
      try {
        const blob = await templatesService.generateDocument(
          organizationId,
          id,
          {
            title: title.trim() || templateName || 'document',
            blocks,
            version,
            ...(theme.header?.enabled && theme.header.editable === true
              ? { headerText: pageInfo.headerText ?? theme.header.text } : {}),
            ...(theme.footer?.enabled && theme.footer.editable === true
              ? { footerText: pageInfo.footerText ?? theme.footer.text } : {}),
          },
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(title.trim() || templateName || 'document').replace(/[^\w\- ]/g, '').slice(0, 60) || 'document'}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        if (revision.current === generatedRevision) setIssues([]);
      } catch (err) {
        const blockIssues = await extractIssues(err);
        if (revision.current !== generatedRevision) return;
        if (blockIssues) {
          setIssues(blockIssues);
          toast.show({
            title: 'Generate failed',
            message: `${blockIssues.length} issue(s) — see highlighted blocks.`,
            color: 'red',
          });
        } else {
          console.error('Generate failed:', err);
          toast.show({
            title: 'Generate failed',
            message: 'Could not render the PDF. Please try again.',
            color: 'red',
          });
        }
      } finally {
        setGenerating(false);
      }
    },
    [organizationId, id, title, templateName, blocks, version, toast, theme, pageInfo],
  );

  // Paginate like the renderer: a block with `pageBreak` starts a new page.
  const pages = useMemo(() => {
    const out: DocBlock[][] = [];
    let current: DocBlock[] = [];
    for (const b of blocks) {
      if (b.pageBreak && current.length > 0) {
        out.push(current);
        current = [];
      }
      current.push(b);
    }
    if (current.length > 0) out.push(current);
    return out.length > 0 ? out : [[]];
  }, [blocks]);

  if (loading) {
    return (
      <div role="status" className="p-6 text-sm text-stone-500">
        Loading template…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-stone-50 p-6 text-center dark:bg-stone-900">
        <p className="text-lg font-semibold text-stone-800 dark:text-stone-100">
          This template can’t be filled
        </p>
        <p className="max-w-md text-sm text-stone-500 dark:text-stone-400">
          The template is not a Composable Template, or it no longer exists.
        </p>
        <Button
          variant="default"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate(buildPath('templates'))}
        >
          Back to templates
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-stone-50 px-4 py-6 text-stone-800 sm:px-6 lg:px-8 xl:h-screen xl:overflow-hidden dark:bg-stone-900 dark:text-stone-100">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(buildPath('templates'))}
          aria-label="Back to templates"
          className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-100"
        >
          <IconArrowLeft size={20} />
        </button>
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            touch();
          }}
          placeholder="Document title"
          aria-label="Document title"
          className="h-9 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-xl font-bold text-stone-800 placeholder:text-stone-400 hover:border-stone-200 focus:border-orange-400 focus:bg-white focus:outline-none sm:max-w-md dark:text-stone-100 dark:hover:border-stone-700 dark:focus:bg-stone-900"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            leftSection={<IconDownload size={16} />}
            onClick={() => void handleGenerate()}
            disabled={generating || blocks.length === 0}
            className="shrink-0"
          >
            {generating ? 'Rendering…' : 'Generate PDF'}
          </Button>
        </div>
      </div>

      {issues.length > 0 && (
        <div
          role="alert"
          className="max-h-32 shrink-0 overflow-auto rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300"
        >
          {issues.map((issue, index) => (
            <button
              key={index}
              type="button"
              className="block text-left underline-offset-2 hover:underline"
              onClick={() => {
                if (issue.instanceId && findBlock(blocks, issue.instanceId))
                  setSelectedId(issue.instanceId);
              }}
            >
              {issue.message} {issue.fix}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        {/* Left — layer tree (sections act as groups, each with its own +) */}
        <Panel
          title="Layers"
          subtitle={
            blocks.length === 0
              ? 'Empty document'
              : `${blocks.length} top-level block${blocks.length === 1 ? '' : 's'}`
          }
          className="min-h-0"
          actions={
            <AddBlockMenu
              options={topOptions}
              onAdd={handleAddTop}
              title="Add block"
            />
          }
        >
          <div className="flex min-h-40 flex-col xl:h-full">
            <LayerTree
              blocks={blocks}
              selectedId={selectedId}
              allowedTypes={allowedSet}
              issueIds={issueIds}
              onSelect={setSelectedId}
              onAddToSection={handleAddToSection}
              onAddToColumn={handleAddToColumn}
            />
          </div>
        </Panel>

        {/* Middle — live preview (same paged canvas as fixed fill) */}
          <DocCanvas
            panelTitle="Preview"
            title={title.trim() || templateName || 'Untitled document'}
            templateName={templateName}
            pages={pages}
            theme={theme}
            componentDefaults={componentDefaults}
            pageSize={pageSize}
            format={format}
            orientation={orientation}
            header={theme.header && { ...theme.header, text: pageInfo.headerText ?? theme.header.text }}
            footer={theme.footer && { ...theme.footer, text: pageInfo.footerText ?? theme.footer.text }}
            pageNumbers={theme.pageNumbering?.enabled ?? false}
            pageNumberFormat={theme.pageNumbering?.format}
            showTitle={format === 'document'}
            className="min-h-0"
          />

        {/* Right — inspector for the selected block */}
        <Panel
          title="Details"
          subtitle={selected ? 'Selected block' : 'Nothing selected'}
          className="min-h-0"
        >
          <div className="flex min-h-40 flex-col gap-4 xl:h-full">
            <PageInfoFields theme={theme} values={pageInfo} onChange={(values) => { setPageInfo(values); touch(); }} />
            {selected ? (
              <BlockInspector
                block={selected}
                isTopLevel={isTopLevel}
                index={selectedPosition?.index ?? 0}
                total={selectedPosition?.total ?? 0}
                issues={issuesById.get(selected.id) ?? []}
                onPatch={patchSelected}
                onMove={moveSelected}
                onDuplicate={duplicateSelected}
                onDelete={deleteSelected}
                onDeselect={() => setSelectedId(null)}
              />
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 p-6 text-center dark:border-stone-700">
                <p className="text-sm font-medium text-stone-500">
                  No block selected
                </p>
                <p className="max-w-xs text-xs text-stone-400">
                  Pick a layer on the left to edit its content here.
                </p>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
