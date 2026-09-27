import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  IconArrowLeft,
  IconDownload,
  IconEye,
  IconFileText,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { Button, Spinner, Badge } from '../../components/ui';
import { useToast } from '../../context/toast';
import { formsService, type SubmissionRecord, type FormRecord } from '../../services/forms.service';
import { AskOnGenerateDialog, type AskDoc } from '../../components/forms';

/** True for image fields whose values are large data URLs (we don't want to
 * dump those into the summary text). */
function isImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/');
}

/** Short human summary of the scalar values in a submission. Image fields are
 * hidden so the row stays scannable — the thumbnail is shown when expanded. */
function summarize(values: Record<string, unknown>): string {
  const scalars = Object.entries(values).filter(
    ([, v]) => typeof v === 'string' && !isImageDataUrl(v),
  ) as [string, string][];
  if (scalars.length === 0) return '—';
  return (
    scalars
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${v.length > 24 ? v.slice(0, 24) + '…' : v}`)
      .join(' · ') + (scalars.length > 3 ? ` (+${scalars.length - 3} more)` : '')
  );
}

export function FormSubmissionsPage() {
  const { organizationId, id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState<FormRecord | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  /** Ask-on-generate prompt: which submission + mode is waiting on owner input. */
  const [pendingAsk, setPendingAsk] = useState<{
    sub: SubmissionRecord;
    mode: 'download' | 'preview';
  } | null>(null);
  /** Expandable submission detail rows (keyed by submission id) */
  const [expandedSubmissionIds, setExpandedSubmissionIds] = useState<Set<string>>(() => new Set());
  const toggleSubmissionExpanded = (id: string) =>
    setExpandedSubmissionIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const buildPath = (p: string) => `/o/${organizationId}/${p}`;

  const load = useCallback(async () => {
    if (!organizationId || !id) return;
    try {
      setLoading(true);
      const [f, s] = await Promise.all([
        formsService.get(organizationId, id),
        formsService.listSubmissions(organizationId, id),
      ]);
      setForm(f);
      setSubmissions(s.submissions);
    } catch {
      /* axios layer surfaces the error toast */
    } finally {
      setLoading(false);
    }
  }, [organizationId, id]);

  useEffect(() => {
    load();
  }, [load]);

  /** Ask-on-generate scalar fields pinned at publish time (owner-answered). */
  const askFields = (form?.fields ?? []).filter((f) => f.askOnGenerate && !f.groupId);
  const askDocs: AskDoc[] =
    form && askFields.length > 0 ? [{ key: '0', name: form.name, fields: askFields }] : [];

  /** Prefill chain per field: saved generation values → filler value →
   *  defaultValue → today (for defaultToday date fields). */
  const prefillFor = (sub: SubmissionRecord): Record<string, Record<string, string>> => {
    const saved = sub.generateValues ?? {};
    const out: Record<string, string> = {};
    for (const f of askFields) {
      const filler = sub.values[f.name];
      const seeded = typeof filler === 'string' && filler ? filler : '';
      out[f.name] =
        saved[f.name] ?? seeded ?? f.defaultValue ?? (f.defaultToday ? dayjs().format('YYYY-MM-DD') : '');
    }
    return { '0': out };
  };

  const fetchPdfBlob = useCallback(
    async (sub: SubmissionRecord, generateValues?: Record<string, string>): Promise<Blob> => {
      if (!organizationId || !id) throw new Error('Missing routing context');
      return generateValues
        ? formsService.generateSubmissionPdf(organizationId, id, sub.id, generateValues)
        : formsService.getSubmissionPdf(organizationId, id, sub.id);
    },
    [organizationId, id],
  );

  const runDownload = async (sub: SubmissionRecord, generateValues?: Record<string, string>) => {
    setDownloadingId(sub.id);
    try {
      const blob = await fetchPdfBlob(sub, generateValues);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form?.name || 'submission'}-${dayjs(sub.createdAt).format('YYYY-MM-DD')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.show({
        title: 'Download failed',
        message: 'Could not download the PDF. Please try again.',
        color: 'red',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const runPreview = async (sub: SubmissionRecord, generateValues?: Record<string, string>) => {
    setPreviewingId(sub.id);
    try {
      const blob = await fetchPdfBlob(sub, generateValues);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      // Revoke after the tab has had time to load the blob. *createObjectURL
      // tabs navigate via the blob URL — deferring the revoke avoids races on
      // some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.show({
        title: 'Preview failed',
        message: 'Could not open the PDF. Please try again.',
        color: 'red',
      });
    } finally {
      setPreviewingId(null);
    }
  };

  const handleDownload = (sub: SubmissionRecord) =>
    askDocs.length > 0 ? setPendingAsk({ sub, mode: 'download' }) : runDownload(sub);

  const handlePreview = (sub: SubmissionRecord) =>
    askDocs.length > 0 ? setPendingAsk({ sub, mode: 'preview' }) : runPreview(sub);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(buildPath('forms'))}
            aria-label="Back to forms"
            className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
          >
            <IconArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold text-stone-800 dark:text-stone-100">
              {form?.name ?? 'Form'} submissions
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {submissions.length} submission{submissions.length === 1 ? '' : 's'} · template{' '}
              {form?.templateVersion}
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      {submissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-stone-300 py-16 text-center dark:border-stone-700">
          <IconFileText size={32} className="text-stone-400" />
          <p className="text-sm font-medium text-stone-700 dark:text-stone-200">No submissions yet</p>
          <p className="max-w-sm text-xs text-stone-500 dark:text-stone-400">
            Share the form link to start collecting responses. Submitted PDFs will appear here.
          </p>
          {form && (
            <Button
              variant="default"
              leftSection={<IconDownload size={16} />}
              onClick={() =>
                navigator.clipboard?.writeText(`${window.location.origin}/f/${form.token}`)
              }
            >
              Copy form link
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[180px]" />
              <col />
              <col className="w-[200px]" />
            </colgroup>
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-400">
              <tr>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Summary</th>
                <th className="px-4 py-3 text-right font-medium">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700/60">
              {submissions.map((sub) => {
                const isExpanded = expandedSubmissionIds.has(sub.id);
                const fields = form?.fields ?? [];
                const groups = form?.groups ?? [];
                const scalarFields = fields.filter((f) => !f.groupId);
                const imageFields = scalarFields.filter((f) => f.type === 'image');

                return (
                  <Fragment key={sub.id}>
                    {/* Summary row */}
                    <tr className="hover:bg-stone-50 dark:hover:bg-stone-900/30">
                      <td className="whitespace-nowrap px-4 py-3 align-top text-stone-600 dark:text-stone-300">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleSubmissionExpanded(sub.id)}
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                            aria-pressed={isExpanded}
                            className="flex size-5 shrink-0 items-center justify-center rounded text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-600 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                          >
                            {isExpanded ? (
                              <IconChevronDown size={14} />
                            ) : (
                              <IconChevronRight size={14} />
                            )}
                          </button>
                          <span>{dayjs(sub.createdAt).format('DD MMM YYYY, HH:mm')}</span>
                        </div>
                      </td>
                      <td className="break-words px-4 py-3 align-top text-stone-600 dark:text-stone-300">
                        {summarize(sub.values)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="subtle"
                            loading={previewingId === sub.id}
                            disabled={downloadingId === sub.id}
                            leftSection={<IconEye size={14} />}
                            onClick={() => handlePreview(sub)}
                            aria-label="Preview PDF"
                            title="Preview PDF"
                          >
                            Preview
                          </Button>
                          <Button
                            size="sm"
                            variant="subtle"
                            loading={downloadingId === sub.id}
                            disabled={previewingId === sub.id}
                            leftSection={<IconDownload size={14} />}
                            onClick={() => handleDownload(sub)}
                            aria-label="Download PDF"
                            title="Download PDF"
                          >
                            Download
                          </Button>
                        </div>
                      </td>
                    </tr>

                    {/* Detail row (when expanded) */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={3} className="px-4 pb-4 pt-1 align-top">
                          <div className="flex flex-col gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900/40">
                            {/* Image fields — small thumbnails (skip in summary). */}
                            {imageFields.length > 0 && (() => {
                              const withImages = imageFields.filter((f) =>
                                isImageDataUrl(sub.values[f.name]),
                              );
                              if (withImages.length === 0) return null;
                              return (
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center gap-2">
                                    <Badge color="orange" size="sm" variant="light">
                                      Images
                                    </Badge>
                                    <span className="h-px flex-1 bg-stone-300 dark:bg-stone-600" />
                                  </div>
                                  <div className="flex flex-wrap gap-4">
                                    {withImages.map((f) => {
                                      const src = sub.values[f.name] as string;
                                      return (
                                        <div
                                          key={f.name}
                                          className="flex flex-col gap-1"
                                        >
                                          <span className="text-xs font-medium text-stone-600 dark:text-stone-300">
                                            {f.name}
                                          </span>
                                          <a
                                            href={src}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block rounded-md border border-stone-200 bg-white p-1 transition-opacity hover:opacity-90 dark:border-stone-700 dark:bg-stone-800"
                                            title={`Open ${f.name} in a new tab`}
                                          >
                                            <img
                                              src={src}
                                              alt={f.name}
                                              className="h-20 w-20 rounded object-cover"
                                            />
                                          </a>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Section-grouped scalars (skip image fields; shown above). */}
                            {scalarFields.length > 0 && (() => {
                              const sections = Array.from(
                                new Set(scalarFields.map((f) => f.section ?? '')),
                              );
                              return (
                                <div className="flex flex-col gap-3">
                                  {sections.map((section) => {
                                    const sectionFields = scalarFields.filter(
                                      (f) => (f.section ?? '') === section && f.type !== 'image',
                                    );
                                    if (sectionFields.length === 0) return null;
                                    return (
                                      <div key={section} className="flex flex-col gap-2">
                                        {section && (
                                          <div className="flex items-center gap-2">
                                            <Badge color="orange" size="sm" variant="light">
                                              {section}
                                            </Badge>
                                            <span className="h-px flex-1 bg-stone-300 dark:bg-stone-600" />
                                          </div>
                                        )}
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                          {sectionFields.map((f) => (
                                            <div
                                              key={f.name}
                                              className="flex items-baseline justify-between gap-2"
                                            >
                                              <span className="font-medium text-stone-700 dark:text-stone-300">
                                                {f.name}:
                                              </span>
                                              <span className="truncate text-stone-600 dark:text-stone-400">
                                                {String(sub.values[f.name] || '') || (
                                                  <span className="text-stone-400 dark:text-stone-500">
                                                    —
                                                  </span>
                                                )}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}

                            {/* Repeating groups */}
                            {groups.length > 0 && (
                              <div className="flex flex-col gap-3">
                                {groups.map((g) => {
                                  const gFields = fields.filter((f) => f.groupId === g.id);
                                  if (gFields.length === 0) return null;
                                  const arr = (sub.values[g.name] as Record<string, string>[]) ?? [];
                                  return (
                                    <div key={g.id} className="flex flex-col gap-2">
                                      <div className="flex items-center gap-2">
                                        <Badge color="orange" size="sm" variant="light">
                                          ↻ {g.name}
                                        </Badge>
                                        <span className="text-xs text-stone-400">
                                          {arr.length} {arr.length === 1 ? 'entry' : 'entries'}
                                        </span>
                                      </div>
                                      {arr.length > 0 ? (
                                        <div className="overflow-hidden rounded-lg border border-stone-200 dark:border-stone-700">
                                          <table className="w-full text-xs">
                                            <thead className="border-b border-stone-200 bg-stone-100 dark:border-stone-700 dark:bg-stone-800">
                                              <tr>
                                                <th className="px-2 py-1 text-left font-medium text-stone-600 dark:text-stone-400">
                                                  #
                                                </th>
                                                {gFields.map((gf) => (
                                                  <th
                                                    key={gf.name}
                                                    className="px-2 py-1 text-left font-medium text-stone-600 dark:text-stone-400"
                                                  >
                                                    {gf.name}
                                                  </th>
                                                ))}
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-stone-100 dark:divide-stone-700/50">
                                              {arr.map((entry, idx) => (
                                                <tr
                                                  key={idx}
                                                  className="hover:bg-stone-50 dark:hover:bg-stone-900/20"
                                                >
                                                  <td className="whitespace-nowrap px-2 py-1 text-stone-500">
                                                    {idx + 1}
                                                  </td>
                                                  {gFields.map((gf) => (
                                                    <td
                                                      key={gf.name}
                                                      className="px-2 py-1 text-stone-600 dark:text-stone-400"
                                                    >
                                                      {entry[gf.name] || (
                                                        <span className="text-stone-400 dark:text-stone-500">
                                                          —
                                                        </span>
                                                      )}
                                                    </td>
                                                  ))}
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <p className="text-xs italic text-stone-400 dark:text-stone-500">
                                          No entries
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Owner prompt for ask-on-generate fields (download/preview gate) */}
      <AskOnGenerateDialog
        open={!!pendingAsk}
        onClose={() => setPendingAsk(null)}
        title={`Generate ${pendingAsk ? form?.name ?? 'document' : ''}`}
        docs={pendingAsk ? askDocs : []}
        prefill={pendingAsk ? prefillFor(pendingAsk.sub) : {}}
        busy={downloadingId !== null || previewingId !== null}
        confirmLabel={pendingAsk?.mode === 'preview' ? 'Preview' : 'Download'}
        onConfirm={(perDoc) => {
          const target = pendingAsk;
          setPendingAsk(null);
          if (!target) return;
          if (target.mode === 'preview') runPreview(target.sub, perDoc['0']);
          else runDownload(target.sub, perDoc['0']);
        }}
      />
    </div>
  );
}
