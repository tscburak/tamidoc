import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PdfImportHistory } from './PdfImportHistory';
import { pdfImportService } from '../../services/pdf-import.service';

vi.mock('../../services/pdf-import.service', () => ({ pdfImportService: { listRuns: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('shows saved small costs accurately and marks incomplete costs unknown', async () => {
  vi.mocked(pdfImportService.listRuns).mockResolvedValue([
    { _id: 'one', status: 'completed', createdAt: '2026-09-20T12:00:00Z', metrics: { status: 'completed', detectedCount: 2, inputTokens: 1000, outputTokens: 50, usageComplete: true, estimatedCostUsd: 0.000042 } },
    { _id: 'two', status: 'completed', createdAt: '2026-09-20T13:00:00Z', metrics: { status: 'partial', detectedCount: 1, inputTokens: 500, outputTokens: 20, usageComplete: false, estimatedCostUsd: null } },
  ] as Awaited<ReturnType<typeof pdfImportService.listRuns>>);
  render(<PdfImportHistory />);
  expect(await screen.findByText('$0.00004200')).toBeTruthy();
  expect(screen.getByText('Unknown')).toBeTruthy();
  expect(screen.getByText('520+')).toBeTruthy();
});

it('handles an unavailable history endpoint', async () => {
  vi.mocked(pdfImportService.listRuns).mockRejectedValue(new Error('unavailable'));
  render(<PdfImportHistory />);
  expect(await screen.findByText('Could not load import history.')).toBeTruthy();
});
