export const FIELD_CRITERIA = {
  none: 'Not a fillable input: decoration, table rule, prose punctuation, or static text that is not an answer region.',
  text: 'A short free-text answer such as a name, address, identifier or phone number.',
  longtext: 'A multi-line written answer or comments.',
  number:
    'A numeric quantity or amount. Identifiers and phone numbers are text.',
  date: 'A calendar date.',
  email: 'An email address.',
  checkbox: 'An individual yes/no or consent checkbox.',
  dropdown: 'A PDF choice widget with explicitly provided options.',
  signature: 'A place for a signature or signer name.',
} as const;
export type FieldChoice = keyof typeof FIELD_CRITERIA;

export interface FieldDecision {
  candidateId: string;
  choice: FieldChoice;
  confidence: number;
  probabilities: Record<string, number>;
  requiredProbability: number;
  accepted: boolean;
}

export interface DetectionAttempt {
  batch: number;
  candidateCount: number;
  questionCount: number;
  status: 'completed' | 'failed';
  durationMs: number;
  model: string | null;
  requestId: string | null;
  httpStatus: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  errorCode: string | null;
}

export interface DetectionMetrics {
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
  attempts: DetectionAttempt[];
}
