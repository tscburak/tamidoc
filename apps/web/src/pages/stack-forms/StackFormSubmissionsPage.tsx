import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  IconArrowLeft,
  IconDownload,
  IconEye,
  IconFileText,
  IconChevronDown,
  IconChevronRight,
  IconFiles,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { zipSync } from 'fflate';
import { Button, Spinner, Badge } from '../../components/ui';
import { useToast } from '../../context/toast';
import { AskOnGenerateDialog, type AskDoc } from '../../components/forms';
import {
  stackFormsService,
  type StackSubmissionRecord,
  type StackFormRecord,
  type SubmissionDocument,
} from '../../services/stack-forms.service';

/** Short human summary of the canonical scalar values in a submission. */
function summarize(values: Record<string, unknown>): string {
  const scalars = Object.entries(values).filter(([, v]) => typeof v === 'string') as [string, string][];
  if (scalars.length === 0) return '—';
  return (
    scalars
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${v.length > 24 ? v.slice(0, 24) + '…' : v}`)
      .join(' · ') + (scalars.length > 3 ? ` (+${scalars.length - 3} more)` : '')
  );
}

export function StackFormSubmissionsPage() {
  const { organizationId, id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [stack, setStack] = useState<StackFormRecord | null>(null);
  const [submissions, setSubmissions] = useState<StackSubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [docsBySub, setDocsBySub] = useState<Record<string, SubmissionDocument[]>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null); // `${subId}:d:${index}` | `${subId}:all` in-flight
  /** Ask-on-generate prompt target: one doc, or the whole stack (`mode: 'all'`). */
  const [pendingAsk, setPendingAsk] = useState<{
    sub: StackSubmissionRecord;
    docs: SubmissionDocument[];
    mode: 'download' | 'preview' | 'all';
  } | null>(null);

  const toggle = (subId: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(subId) ? next.delete(subId) : next.add(subId);
      return next;
    });

  const buildPath = (p: string) => `/o/${organizationId}/${p}`;

  const load = useCallback(async () => {
    if (!organizationId || !id) return;
    try {
      setLoading(true);
      const [s, subs] = await Promise.all([
        stackFormsService.get(organizationId, id),
        stackFormsService.listSubmissions(organizationId, id),
      ]);
      setStack(s);
      setSubmissions(subs.submissions);
    } catch {
      /* axios surfaces the error toast */
    } finally {
      setLoading(false);
    }
  }, [organizationId, id]);

  useEffect(() => {
    load();
  }, [load]);

  // Lazy-load the document list the first time a submission is expanded.
  useEffect(() => {
    if (!organizationId || !id) return;
    for (const subId of expandedIds) {
      if (docsBySub[subId]) continue;
      stackFormsService
        .listDocuments(organizationId, id, subId)
        .then((res) => setDocsBySub((prev) => ({ ...prev, [subId]: res.documents })))
        .catch(() => {
          /* axios surfaces toast */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedIds, organizationId, id]);

  const fetchDoc = useCallback(
    async (subId: string, index: number, generateValues?: Record<string, string>): Promise<Blob> => {
      if (!organizationId || !id) throw new Error('Missing routing context');
      return generateValues
        ? stackFormsService.generateDocumentPdf(organizationId, id, subId, index, generateValues)
        : stackFormsService.getDocumentPdf(organizationId, id, subId, index);
    },
    [organizationId, id],
  );

  /** Ask docs (one per document with ask-on-generate fields), original names. */
  const askDocsOf = (docs: SubmissionDocument[]): AskDoc[] =>
    docs
      .filter((d) => (d.askFields?.length ?? 0) > 0)
      .map((d) => ({ key: String(d.index), name: d.name, fields: d.askFields ?? [] }));

  /** Prefill per doc key: saved generation values → defaultValue → today. */
  const prefillFor = (sub: StackSubmissionRecord, docs: AskDoc[]) => {
    const saved = sub.generateValues ?? {};
    const out: Record<string, Record<string, string>> = {};
    for (const d of docs) {
      const docSaved = saved[d.key] ?? {};
      const vals: Record<string, string> = {};
      for (const f of d.fields) {
        vals[f.name] =
          docSaved[f.name] || f.defaultValue || (f.defaultToday ? dayjs().format('YYYY-MM-DD') : '');
      }
      out[d.key] = vals;
    }
    return out;
  };

  const handleDownload = (sub: StackSubmissionRecord, doc: SubmissionDocument) => {
    if ((doc.askFields?.length ?? 0) > 0) {
      setPendingAsk({ sub, docs: [doc], mode: 'download' });
      return;
    }
    runDownload(sub, doc);
  };

  const handlePreview = (sub: StackSubmissionRecord, doc: SubmissionDocument) => {
    if ((doc.askFields?.length ?? 0) > 0) {
      setPendingAsk({ sub, docs: [doc], mode: 'preview' });
      return;
    }
    runPreview(sub, doc);
  };

  /** Whole-stack download: one prompt for every doc with ask fields (if any),
   *  then all documents rendered and zipped client-side. */
  const handleDownloadAll = (sub: StackSubmissionRecord, docs: SubmissionDocument[]) => {
    const askDocs = askDocsOf(docs);
    if (askDocs.length > 0) {
      setPendingAsk({ sub, docs, mode: 'all' });
      return;
    }
    runDownloadAll(sub, docs, {});
  };

  const runDownload = async (sub: StackSubmissionRecord, doc: SubmissionDocument, generateValues?: Record<string, string>) => {
    const key = `${sub.id}:d:${doc.index}`;
    setBusyKey(key);
    try {
      const blob = await fetchDoc(sub.id, doc.index, generateValues);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.name}-${dayjs(sub.createdAt).format('YYYY-MM-DD')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.show({ title: 'Download failed', message: 'Could not download the PDF.', color: 'red' });
    } finally {
      setBusyKey(null);
    }
  };

  const runPreview = async (sub: StackSubmissionRecord, doc: SubmissionDocument, generateValues?: Record<string, string>) => {
    const key = `${sub.id}:d:${doc.index}`;
    setBusyKey(key);
    try {
      const blob = await fetchDoc(sub.id, doc.index, generateValues);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.show({ title: 'Preview failed', message: 'Could not open the PDF.', color: 'red' });
    } finally {
      setBusyKey(null);
    }
  };

  const runDownloadAll = async (
    sub: StackSubmissionRecord,
    docs: SubmissionDocument[],
    perDoc: Record<string, Record<string, string>>,
  ) => {
    const key = `${sub.id}:all`;
    setBusyKey(key);
    try {
      const date = dayjs(sub.createdAt).format('YYYY-MM-DD');
      const used = new Set<string>();
      const files: Record<string, Uint8Array> = {};
      for (const doc of docs) {
        const blob = await fetchDoc(
          sub.id,
          doc.index,
          (doc.askFields?.length ?? 0) > 0 ? perDoc[String(doc.index)] : undefined,
        );
        // Dedupe identical sanitized names ("Doc-2026-08-24.pdf", "Doc-2026-08-24 (2).pdf", …).
        const stem = `${doc.name.replace(/[^\w\- ]/g, '').trim() || 'document'}-${date}`;
        let name = `${stem}.pdf`;
        for (let n = 2; used.has(name); n++) name = `${stem} (${n}).pdf`;
        used.add(name);
        files[name] = new Uint8Array(await blob.arrayBuffer());
      }
      const zipped = zipSync(files);
      const url = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${stack?.name || 'stack'}-${date}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.show({ title: 'Download failed', message: 'Could not build the zip file.', color: 'red' });
    } finally {
      setBusyKey(null);
    }
  };

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
              {stack?.name ?? 'Stack form'} submissions
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {submissions.length} submission{submissions.length === 1 ? '' : 's'} · {stack?.entries.length ?? 0} document
              {stack?.entries.length === 1 ? '' : 's'} each
            </p>
          </div>
        </div>
        {stack && (
          <Button
            variant="default"
            leftSection={<IconFiles size={16} />}
            onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/fs/${stack.token}`)}
          >
            Copy form link
          </Button>
        )}
      </div>

      {/* Table */}
      {submissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-stone-300 py-16 text-center dark:border-stone-700">
          <IconFileText size={32} className="text-stone-400" />
          <p className="text-sm font-medium text-stone-700 dark:text-stone-200">No submissions yet</p>
          <p className="max-w-sm text-xs text-stone-500 dark:text-stone-400">
            Share the stack form link to start collecting responses. Each submission generates one document per template.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[180px]" />
              <col />
              <col className="w-[150px]" />
            </colgroup>
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-400">
              <tr>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Summary</th>
                <th className="px-4 py-3 text-right font-medium">Documents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700/60">
              {submissions.map((sub) => {
                const isExpanded = expandedIds.has(sub.id);
                const docs = docsBySub[sub.id];
                return (
                  <Fragment key={sub.id}>
                    <tr className="hover:bg-stone-50 dark:hover:bg-stone-900/30">
                      <td className="whitespace-nowrap px-4 py-3 align-top text-stone-600 dark:text-stone-300">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggle(sub.id)}
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                            aria-pressed={isExpanded}
                            className="flex size-5 shrink-0 items-center justify-center rounded text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-600 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                          >
                            {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                          </button>
                          <span>{dayjs(sub.createdAt).format('DD MMM YYYY, HH:mm')}</span>
                        </div>
                      </td>
                      <td className="break-words px-4 py-3 align-top text-stone-600 dark:text-stone-300">
                        {summarize(sub.values)}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <Badge color="blue" size="sm" variant="light">
                          {stack?.entries.length ?? 0} doc{(stack?.entries.length ?? 0) === 1 ? '' : 's'}
                        </Badge>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={3} className="px-4 pb-4 pt-1 align-top">
                          <div className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900/40">
                            <div className="flex items-center gap-2">
                              <Badge color="orange" size="sm" variant="light">Documents</Badge>
                              <span className="text-xs text-stone-400">
                                One per template — preview or download each.
                              </span>
                              {docs && docs.length > 1 && (
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  className="ml-auto"
                                  loading={busyKey === `${sub.id}:all`}
                                  leftSection={<IconFiles size={14} />}
                                  onClick={() => handleDownloadAll(sub, docs)}
                                >
                                  Download all (zip)
                                </Button>
                              )}
                            </div>
                            {!docs ? (
                              <div className="flex justify-center py-4">
                                <Spinner size="sm" />
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                {docs.map((doc) => {
                                  const key = `${sub.id}:d:${doc.index}`;
                                  return (
                                    <div
                                      key={doc.index}
                                      className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-800"
                                    >
                                      <div className="flex min-w-0 items-center gap-2">
                                        <IconFileText size={16} className="shrink-0 text-stone-400" />
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                                            {doc.name}
                                          </p>
                                          <p className="text-xs text-stone-400">{doc.version}</p>
                                        </div>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-2">
                                        <Button
                                          size="sm"
                                          variant="subtle"
                                          loading={busyKey === key}
                                          disabled={busyKey === key}
                                          leftSection={<IconEye size={14} />}
                                          onClick={() => handlePreview(sub, doc)}
                                        >
                                          Preview
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="subtle"
                                          loading={busyKey === key}
                                          disabled={busyKey === key}
                                          leftSection={<IconDownload size={14} />}
                                          onClick={() => handleDownload(sub, doc)}
                                        >
                                          Download
                                        </Button>
                                      </div>
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

      {/* Owner prompt for ask-on-generate fields (per-doc or whole stack) */}
      <AskOnGenerateDialog
        open={!!pendingAsk}
        onClose={() => setPendingAsk(null)}
        title={
          pendingAsk?.mode === 'all'
            ? `Generate all documents — ${stack?.name ?? 'stack'}`
            : `Generate ${pendingAsk?.docs[0]?.name ?? 'document'}`
        }
        docs={pendingAsk ? askDocsOf(pendingAsk.docs) : []}
        prefill={pendingAsk ? prefillFor(pendingAsk.sub, askDocsOf(pendingAsk.docs)) : {}}
        busy={busyKey !== null}
        confirmLabel={pendingAsk?.mode === 'preview' ? 'Preview' : pendingAsk?.mode === 'all' ? 'Download all' : 'Download'}
        onConfirm={(perDoc) => {
          const target = pendingAsk;
          setPendingAsk(null);
          if (!target) return;
          if (target.mode === 'all') runDownloadAll(target.sub, target.docs, perDoc);
          else if (target.mode === 'preview') runPreview(target.sub, target.docs[0], perDoc[String(target.docs[0].index)]);
          else runDownload(target.sub, target.docs[0], perDoc[String(target.docs[0].index)]);
        }}
      />
    </div>
  );
}
