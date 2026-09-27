import apiClient from '../lib/api';
import type { AxiosRequestConfig } from 'axios';
import type { PdfImportResult, PdfImportRun } from '../types/pdf-import';

class PdfImportService {
  async listRuns(): Promise<PdfImportRun[]> {
    return (await apiClient.get<PdfImportRun[]>('/pdf-import/runs')).data;
  }

  async analyzePdf(file: File, detectFields = true): Promise<PdfImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('detectFields', String(detectFields));

    const res = await apiClient.post<PdfImportResult>('/pdf-import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000, // override the 30s default (lib/api.ts line 22)
      _skipSuccessNotification: true, // we toast manually
    } as AxiosRequestConfig & { _skipSuccessNotification: boolean });

    return res.data;
  }
}

export const pdfImportService = new PdfImportService();
