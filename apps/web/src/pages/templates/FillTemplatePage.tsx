import { useEffect, useMemo, useState } from 'react';
import { IconArrowLeft, IconZoomIn, IconZoomOut, IconPencil, IconDownload, IconLoader, IconVersions, IconChevronDown, IconStar } from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Panel, Dropdown, DropdownItem, DropdownLabel } from '../../components/ui';
import { ComponentBody } from '../../components/designer/ComponentBody';
import { layoutStacked } from '../../components/designer/layout';
import type { CanvasComponent } from '../../components/designer/types';
import { type TemplateRecord } from '../../context/TemplateStoreProvider';
import { useToast } from '../../context/toast';
import { templatesService, type TemplateVersionSummary, type TemplateVersionSnapshot } from '../../services/templates.service';
import { findMissingFields, type FillValues } from '../../components/forms/DynamicFormFields';
import { FixedFillDataPanel, type FixedFillMode } from '../../components/forms/FixedFillDataPanel';
import { initialFixedFillValues, parseFixedFillJson } from '../../components/forms/fixedFillData';
import { AskOnGenerateDialog, type AskDoc } from '../../components/forms';
import { FillComposablePage } from './FillComposablePage';


/* ----------------------------- Live preview -------------------------------- */

function DocumentPreview({ template, values }: { template: TemplateRecord; values: FillValues }) {
  const [zoom, setZoom] = useState(0.8);
  const { size, components } = template.canvas;

  const byId = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);
  const groupById = useMemo(() => new Map(template.groups.map((g) => [g.id, g])), [template.groups]);

  // Instance count per group = number of entries the user has added (min 1).
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of template.groups) {
      const arr = values[g.name];
      const count = Array.isArray(arr) ? Math.max(1, arr.length) : 1;
      c[g.id] = count;
    }
    return c;
  }, [template.groups, values]);

  const items = useMemo(
    () => layoutStacked({ components, groups: template.groups, counts, canvasSize: size }),
    [components, template.groups, counts, size],
  );

  // Total laid-out extent across all pages (wrap/overflow can exceed one page).
  const bounds = useMemo(() => {
    let w = size.width;
    let h = size.height;
    for (const it of items) {
      const comp = byId.get(it.id);
      if (comp) {
        const newW = it.x + comp.width;
        const newH = it.y + comp.height;
        w = Math.max(w, newW);
        h = Math.max(h, newH);
      }
    }
    return { w, h };
  }, [items, byId, size.width, size.height]);

  const pagesW = Math.max(1, Math.ceil(bounds.w / size.width));
  const pagesH = Math.max(1, Math.ceil(bounds.h / size.height));
  const pageCount = pagesW * pagesH;

  const resolve = (_comp: CanvasComponent, itemGroupId: string | undefined, instanceIndex: number | undefined) => {
    return (token: string) => {
      const field = template.fields.find((f) => f.name === token && (f.groupId || undefined) === itemGroupId);
      const display = (value: string) => field?.type === 'checkbox' ? (value === 'true' ? 'X' : '\u00a0') : value;
      if (itemGroupId && instanceIndex != null) {
        const g = groupById.get(itemGroupId);
        const arr = g ? (values[g.name] as Record<string, string>[] | undefined) : undefined;
        return display(arr?.[instanceIndex]?.[token] ?? '');
      }
      return display((values[token] as string) ?? '');
    };
  };

  /** Does this item's box intersect page tile (px, py)? */
  const inPage = (it: (typeof items)[number], comp: CanvasComponent, px: number, py: number) => {
    const pageLeft = px * size.width;
    const pageRight = (px + 1) * size.width;
    const pageTop = py * size.height;
    const pageBottom = (py + 1) * size.height;

    return (
      it.x < pageRight &&
      it.x + comp.width > pageLeft &&
      it.y < pageBottom &&
      it.y + comp.height > pageTop
    );
  };

  return (
    <Panel
      title="Preview"
      subtitle={pageCount > 1 ? `Live · ${pageCount} pages` : 'Live — adds entries as stacked blocks'}
      bodyClassName="overflow-hidden p-0"
      className="min-h-0"
      actions={
        <>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.3, Number((z - 0.1).toFixed(2))))}
            className="flex size-7 items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
            aria-label="Zoom out"
          >
            <IconZoomOut size={16} />
          </button>
          <span className="min-w-[3rem] text-center text-xs font-medium text-stone-600 dark:text-stone-300">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
            className="flex size-7 items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
            aria-label="Zoom in"
          >
            <IconZoomIn size={16} />
          </button>
        </>
      }
    >
      <div className="h-full w-full overflow-auto bg-stone-100 p-6 dark:bg-stone-900/60">
        <div className="mx-auto flex flex-col items-center gap-4">
          {Array.from({ length: pagesH }).map((_, py) => (
            <div key={py} className="flex justify-center gap-4">
              {Array.from({ length: pagesW }).map((_, px) => {
                console.log(`[FillTemplatePage] Creating page div for coordinates (${px}, ${py})`);
                return (
                <div
                  key={px}
                  className="relative shrink-0 overflow-hidden bg-white shadow-lg ring-1 ring-stone-300 dark:bg-stone-100 dark:ring-stone-700"
                  style={{ width: size.width * zoom, height: size.height * zoom }}
                >
                  <div
                    className="absolute left-0 top-0 origin-top-left"
                    style={{ width: size.width, height: size.height, transform: `scale(${zoom})` }}
                  >
                    {(() => {
                      console.log(`[FillTemplatePage] ========== Starting render for page (${px},${py}) ==========`);
                      const pageItems = items.flatMap((it) => {
                        const comp = byId.get(it.id);
                        if (!comp) {
                          console.warn(`[FillTemplatePage] Component not found for item:`, it.id);
                          return [];
                        }
                        if (!inPage(it, comp, px, py)) {
                          console.log(`[FillTemplatePage] Item not in page (${px}, ${py}):`, {
                            itemId: it.id,
                            itemPos: { x: it.x, y: it.y },
                            compSize: { width: comp.width, height: comp.height },
                            pageSize: { width: size.width, height: size.height }
                          });
                          return [];
                        }
                        const key = it.groupId ? `${it.id}__${it.instanceIndex}__${px}_${py}` : `${it.id}__${px}_${py}`;

                        const finalLeft = it.x - px * size.width;
                        const finalTop = it.y - py * size.height;

                        console.log(`[FillTemplatePage] Item ${it.id} positioning for page (${px},${py}):`, {
                          originalPos: { x: it.x, y: it.y },
                          pageOffset: { x: px * size.width, y: py * size.height },
                          finalPos: { left: finalLeft, top: finalTop },
                          size: { width: comp.width, height: comp.height },
                          checks: {
                            isOnPage: finalLeft >= 0 && finalTop >= 0,
                            fitsInPage: finalLeft + comp.width <= size.width && finalTop + comp.height <= size.height
                          }
                        });

                        return (
                          <div
                            key={key}
                            style={{
                              position: 'absolute',
                              left: finalLeft,
                              top: finalTop,
                              width: comp.width,
                              height: comp.height,
                            }}
                          >
                            <ComponentBody component={comp} resolve={resolve(comp, it.groupId, it.instanceIndex)} />
                          </div>
                        );
                      });
                      console.log(`[FillTemplatePage] Rendering page (${px}, ${py}):`, {
                        totalItems: items.length,
                        pageItemsCount: pageItems.length,
                        pageSize: { width: size.width, height: size.height }
                      });
                      if (pageItems.length === 0 && items.length > 0) {
                        console.error(`[FillTemplatePage] No items rendered for page (${px}, ${py}) despite having ${items.length} items available!`);
                      }
                      return pageItems;
                    })()}
                  </div>
                  {pageCount > 1 && (
                    <span className="pointer-events-none absolute bottom-1 right-2 rounded bg-stone-800/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      Page {py * pagesW + px + 1} / {pageCount}
                    </span>
                  )}
                </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/* -------------------------------- Page ------------------------------------- */

export function FillTemplatePage() {
  const { id = '', organizationId = '' } = useParams();
  return <FillTemplateLoader key={`${organizationId}:${id}`} organizationId={organizationId} id={id} />;
}

function FillTemplateLoader({ organizationId, id }: { organizationId: string; id: string }) {
  const [template, setTemplate] = useState<TemplateRecord | null>(null);
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    templatesService.findOne(organizationId, id)
      .then((record) => { if (!cancelled) setTemplate(record); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [organizationId, id]);

  if (failed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6">
        <p>This template could not be loaded.</p>
        <Button variant="default" onClick={() => navigate(`/o/${organizationId}/templates`)}>Back to templates</Button>
      </div>
    );
  }
  if (!template) return <div role="status" className="p-6 text-sm text-stone-500">Loading template…</div>;
  return template.kind === 'document'
    ? <FillComposablePage template={template} />
    : <FillFixedTemplatePage template={template} />;
}

function FillFixedTemplatePage({ template }: { template: TemplateRecord }) {
  const { id = '', organizationId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [values, setValues] = useState<FillValues>(() => initialFixedFillValues(template.fields, template.groups));
  const [json, setJson] = useState(() => JSON.stringify(values, null, 2));
  const [mode, setMode] = useState<FixedFillMode>('form');
  const [missingFields, setMissingFields] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [versions, setVersions] = useState<TemplateVersionSummary[]>([]);
  const [version, setVersion] = useState(template.defaultVersion || template.version || '');
  const [snapshot, setSnapshot] = useState<TemplateVersionSnapshot | null>(null);
  const [versionError, setVersionError] = useState(false);
  const [initializedVersion, setInitializedVersion] = useState<string | null>(
    template.defaultVersion && template.defaultVersion !== template.version ? null : template.version || '',
  );

  // Build org-relative path
  const buildPath = (path: string) => `/o/${organizationId}/${path}`;

  // Merge the selected version's snapshot (canvas/groups/fields) over the base
  // template record so the form, preview and export all render that version.
  const activeTemplate = useMemo<TemplateRecord>(() => {
    if (!snapshot || snapshot.version !== version || version === template.version) return template;
    return {
      ...template,
      canvas: snapshot.canvas,
      groups: snapshot.groups ?? [],
      fields: snapshot.fields ?? [],
    };
  }, [template, snapshot, version]);

  const versionReady = (!version || version === template.version || snapshot?.version === version)
    && initializedVersion === version;
  const loadingVersion = !versionReady && !versionError;
  const parsedJson = useMemo(() => parseFixedFillJson(json, activeTemplate.fields, activeTemplate.groups), [json, activeTemplate]);
  const changeValues = (next: FillValues) => {
    setValues(next);
    setJson(JSON.stringify(next, null, 2));
    setMissingFields(new Set());
  };
  const changeJson = (text: string) => {
    setJson(text);
    const result = parseFixedFillJson(text, activeTemplate.fields, activeTemplate.groups);
    if (result.values) setValues(result.values);
    setMissingFields(new Set());
  };
  const selectVersion = (nextVersion: string) => {
    if (generating || nextVersion === version) return;
    setVersion(nextVersion);
    setVersionError(false);
    setMissingFields(new Set());
    setAskOpen(false);
    setSnapshot(null);
    setInitializedVersion(null);
    if (!nextVersion || nextVersion === template.version) {
      changeValues(initialFixedFillValues(template.fields, template.groups));
      setInitializedVersion(nextVersion);
    }
  };

  // The record supplies the default version; history populates the selector.
  useEffect(() => {
    if (!organizationId || !id) return;
    let cancelled = false;
    templatesService
      .listVersions(organizationId, id)
      .then((list) => {
        if (cancelled) return;
        setVersions(list);
      })
      .catch((err) => console.error('Failed to load versions:', err));
    return () => {
      cancelled = true;
    };
  }, [organizationId, id]);

  // Fetch the snapshot for the selected version (current version = live data).
  useEffect(() => {
    if (!organizationId || !id || !version || version === template.version) return;
    let cancelled = false;
    templatesService
      .getVersion(organizationId, id, version)
      .then((s) => {
        if (cancelled) return;
        if (s.kind === 'document') throw new Error('This version is not a fixed template');
        setSnapshot(s);
        const next = initialFixedFillValues(s.fields ?? [], s.groups ?? []);
        setValues(next);
        setJson(JSON.stringify(next, null, 2));
        setInitializedVersion(version);
      })
      .catch((err) => {
        console.error('Failed to load version:', err);
        if (!cancelled) {
          setSnapshot(null);
          setVersionError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, id, version, template]);

  if (versionReady && activeTemplate.canvas.components.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-stone-50 p-6 text-center dark:bg-stone-900">
        <p className="text-lg font-semibold text-stone-800 dark:text-stone-100">This template can’t be filled</p>
        <p className="max-w-md text-sm text-stone-500 dark:text-stone-400">
          Sample templates don’t have a fillable canvas yet, or the template no longer exists in this session.
        </p>
        <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate(buildPath('templates'))}>
          Back to templates
        </Button>
      </div>
    );
  }


  /** Ask-on-generate scalars — hidden from the fill form, prompted on download. */
  const askFields = (activeTemplate?.fields ?? []).filter((f) => f.askOnGenerate && !f.groupId);
  const askDocs: AskDoc[] =
    activeTemplate && askFields.length > 0
      ? [{ key: '0', name: activeTemplate.name, fields: askFields }]
      : [];
  /** Prefill from the seeded filler values (defaults land there via initialValuesFor). */
  const askPrefill = () => {
    const out: Record<string, string> = {};
    for (const f of askFields) {
      const v = values[f.name];
      out[f.name] = typeof v === 'string' ? v : '';
    }
    return { '0': out };
  };

  const runGenerate = async (fillValues: FillValues) => {
    if (!organizationId || !versionReady) return;
    setGenerating(true);
    try {
      const blob = await templatesService.generatePdf(organizationId, id, fillValues, version || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeTemplate.name || 'document'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF generation failed:', err);
      let message = 'Something went wrong while rendering the PDF. Please try again.';
      const data = (err as { response?: { data?: unknown } })?.response?.data;
      try {
        const detail = data instanceof Blob ? JSON.parse(await data.text()) : data;
        if (detail && typeof detail === 'object') {
          const body = detail as { message?: unknown; errors?: unknown };
          if (Array.isArray(body.errors) && body.errors.length) message = body.errors.filter((item): item is string => typeof item === 'string').join('\n');
          else if (typeof body.message === 'string') message = body.message;
        }
      } catch { /* Keep the fallback when the response is not JSON. */ }
      toast.show({
        title: 'Could not generate PDF',
        message,
        color: 'red',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!versionReady || generating || parsedJson.error) return;
    const missing = findMissingFields(activeTemplate.fields, activeTemplate.groups, values);
    if (missing.length) {
      setMissingFields(new Set(missing));
      toast.show({
        title: 'Required fields missing',
        message: `Fill the required fields before downloading: ${missing.map((key) => {
          const [groupId, name] = key.split('::');
          const group = activeTemplate.groups.find((item) => item.id === groupId);
          return group ? `${group.name}[].${name}` : name;
        }).join(', ')}.`,
        color: 'red',
      });
      return;
    }
    // Ask-on-generate fields are answered by the owner right before generating.
    if (askDocs.length > 0) {
      setAskOpen(true);
      return;
    }
    runGenerate(values);
  };


  return (
    <div className="flex min-h-screen flex-col gap-4 bg-stone-50 px-4 py-6 text-stone-800 sm:px-6 lg:px-8 xl:h-screen xl:overflow-hidden dark:bg-stone-900 dark:text-stone-100">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(buildPath('templates'))}
            aria-label="Back to templates"
            className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-100"
          >
            <IconArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-stone-800 dark:text-stone-100">{activeTemplate.name}</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">Fill with a form, JSON, or the API.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {versions.length > 1 && (
            <Dropdown
              align="end"
              panelClassName="w-72"
              trigger={
                <Button
                  variant="default"
                  leftSection={loadingVersion ? <IconLoader size={16} className="animate-spin" /> : <IconVersions size={16} />}
                  rightSection={<IconChevronDown size={16} />}
                  className="shrink-0"
                  title="Fill from a specific version"
                  disabled={generating}
                >
                  {version || 'Version'}
                </Button>
              }
            >
              <DropdownLabel>Fill from version</DropdownLabel>
              {versions.map((v) => {
                const isCurrent = v.isCurrent;
                const selected = v.version === version;
                return (
                  <DropdownItem
                    key={v.version}
                    onClick={() => selectVersion(v.version)}
                    leftSection={
                      <span className="flex w-4 shrink-0 justify-center">
                        {selected ? <IconVersions size={14} className="text-orange-600 dark:text-orange-300" /> : null}
                      </span>
                    }
                    className={selected ? 'bg-stone-100 dark:bg-stone-700' : undefined}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">{v.version}</span>
                        {v.isDefault && <IconStar size={13} className="shrink-0 text-amber-500" title="Default version" />}
                        {isCurrent && <span className="shrink-0 text-[10px] font-medium text-orange-600 dark:text-orange-300">current</span>}
                      </span>
                      {v.changeDescription && (
                        <span className="block truncate text-xs text-stone-400 dark:text-stone-500">{v.changeDescription}</span>
                      )}
                    </span>
                  </DropdownItem>
                );
              })}
            </Dropdown>
          )}
          <Button
            variant="default"
            leftSection={
              generating ? <IconLoader size={16} className="animate-spin" /> : <IconDownload size={16} />
            }
            onClick={handleDownloadPdf}
            disabled={generating || !versionReady || !!parsedJson.error}
            className="shrink-0"
          >
            {generating ? 'Generating…' : 'Download PDF'}
          </Button>
          <Button
            variant="default"
            leftSection={<IconPencil size={16} />}
            onClick={() => navigate(buildPath(`templates/${id}/edit`))}
            className="shrink-0"
          >
            Switch to Design Mode
          </Button>
        </div>
      </div>

      {/* Workspace: form | preview */}
      {!versionReady ? (
        <div role={versionError ? 'alert' : 'status'} className="flex flex-col items-start gap-3 p-6 text-sm text-stone-500">
          {versionError ? `Could not load version ${version}. Select another version to continue.` : `Loading version ${version}…`}
          {versionError && <Button variant="default" onClick={() => selectVersion(template.version || '')}>Use current version</Button>}
        </div>
      ) : <div className={`grid grid-cols-1 gap-4 xl:min-h-0 xl:flex-1 ${mode === 'form' ? 'xl:grid-cols-[380px_minmax(0,1fr)]' : 'xl:grid-cols-[minmax(380px,1fr)_minmax(0,1fr)]'}`}>
        <Panel title="Fill" subtitle={version ? `Version ${version}` : 'Enter values'} className="min-h-0 xl:overflow-y-auto">
          <FixedFillDataPanel
            template={activeTemplate}
            organizationId={organizationId || ''}
            version={version}
            mode={mode}
            onModeChange={setMode}
            values={values}
            onValuesChange={changeValues}
            json={json}
            onJsonChange={changeJson}
            jsonError={parsedJson.error}
            missingFields={missingFields}
            generating={generating}
            onGenerate={handleDownloadPdf}
          />
        </Panel>

        {/* Preview */}
        <DocumentPreview template={activeTemplate} values={values} />
      </div>}

      {/* Owner prompt for ask-on-generate fields (download gate) */}
      <AskOnGenerateDialog
        open={askOpen}
        onClose={() => setAskOpen(false)}
        title={`Generate ${activeTemplate.name}`}
        docs={askDocs}
        prefill={askPrefill()}
        busy={generating}
        onConfirm={(perDoc) => {
          setAskOpen(false);
          const next = { ...values, ...perDoc['0'] };
          changeValues(next);
          runGenerate(next);
        }}
      />
    </div>
  );
}
