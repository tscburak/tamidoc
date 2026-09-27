import { afterEach, expect, it, vi } from 'vitest';
import apiClient from '../lib/api';
import { pdfImportService } from './pdf-import.service';

afterEach(() => vi.restoreAllMocks());

it('sends the detection preference with the PDF and returns stored metrics', async () => {
  const result = { fields: [], detection: { runId: 'saved-run', estimatedCostUsd: 0 } };
  const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: result });
  const file = new File(['pdf'], 'form.pdf', { type: 'application/pdf' });
  expect(await pdfImportService.analyzePdf(file, false)).toEqual(result);
  const form = post.mock.calls[0][1] as FormData;
  expect(form.get('file')).toBe(file);
  expect(form.get('detectFields')).toBe('false');
});
