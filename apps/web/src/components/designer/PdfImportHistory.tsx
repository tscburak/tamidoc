import { useEffect, useState } from 'react';
import { pdfImportService } from '../../services/pdf-import.service';
import type { PdfImportRun } from '../../types/pdf-import';

export function PdfImportHistory() {
  const [runs, setRuns] = useState<PdfImportRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    pdfImportService.listRuns()
      .then((data) => { if (active) setRuns(data); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <details className="border-t border-stone-200 pt-3 text-sm text-stone-600 dark:border-stone-700 dark:text-stone-400">
      <summary className="cursor-pointer font-medium">Recent import usage and costs</summary>
      {loading ? <p className="mt-2">Loading import history…</p> : failed ? <p className="mt-2">Could not load import history.</p> : runs.length === 0 ? <p className="mt-2">No previous imports.</p> : (
        <div className="mt-2 max-h-52 overflow-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Your last 50 PDF imports in this organization</caption>
            <thead><tr><th className="py-2">Imported</th><th>Status</th><th>Inputs</th><th>Tokens</th><th>Est. USD</th></tr></thead>
            <tbody>{runs.map((run) => (
              <tr key={run._id} className="border-t border-stone-100 dark:border-stone-800">
                <td className="py-2 pr-2">{new Date(run.createdAt).toLocaleString()}</td>
                <td className="pr-2">{run.status === 'completed' ? run.metrics?.status ?? run.status : run.status}</td>
                <td>{run.metrics?.detectedCount ?? '—'}</td>
                <td>{run.metrics ? `${(run.metrics.inputTokens + run.metrics.outputTokens).toLocaleString()}${run.metrics.usageComplete ? '' : '+'}` : '—'}</td>
                <td>{run.status === 'processing' || run.metrics?.estimatedCostUsd == null ? 'Unknown' : `$${run.metrics.estimatedCostUsd.toFixed(8)}`}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </details>
  );
}
