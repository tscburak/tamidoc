import type { CanvasComponent, CanvasSize } from '../components/designer';

export interface PdfImportPage {
  width: number;
  height: number;
  background: string;
}

export interface PdfImportField {
  name: string;
  type: string;
  required: boolean;
  componentId?: string;
  options?: string[];
}

export interface PdfDetectionMetrics {
  runId: string;
  provider: 'typesafe';
  requestedModel: string;
  status: 'completed' | 'partial' | 'failed' | 'skipped';
  reason?: string;
  candidateCount: number;
  evaluatedCount: number;
  detectedCount: number;
  uncertainCount: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  usageComplete: boolean;
  estimatedCostUsd: number | null;
  knownCostUsd: number;
  costComplete: boolean;
  currency: 'USD';
  detectionDurationMs: number;
  totalDurationMs: number;
}

export interface PdfImportRun {
  _id: string;
  status: 'processing' | 'completed' | 'failed';
  createdAt: string;
  pageCount?: number;
  metrics?: PdfDetectionMetrics;
}

export interface PdfImportResult {
  detection?: PdfDetectionMetrics;
  warnings?: string[];
  canvasSize: CanvasSize;
  pageCount: number;
  pages: PdfImportPage[];
  components: CanvasComponent[];
  fields: PdfImportField[];
}
