import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'node:crypto';
import { PdfImportService } from './pdf-import.service';
import { JevFieldDetectionService } from './jev-field-detection.service';
import { PdfImportRun } from './schemas/pdf-import-run.schema';
import { inputName } from './lib/field-candidates';
import type { DetectionMetrics, FieldDecision } from './lib/detection-types';
import type { PdfImportResponseDto } from './dto/pdf-import-response.dto';

export interface ImportActor {
  userId: string;
  organizationId?: string | null;
}

@Injectable()
export class PdfImportWorkflowService {
  constructor(
    private readonly importer: PdfImportService,
    private readonly jev: JevFieldDetectionService,
    @InjectModel(PdfImportRun.name) private readonly runs: Model<PdfImportRun>,
  ) {}

  private scope(actor: ImportActor) {
    return {
      userId: new Types.ObjectId(actor.userId),
      organizationId: actor.organizationId
        ? new Types.ObjectId(actor.organizationId)
        : null,
    };
  }

  list(actor: ImportActor) {
    return this.runs
      .find(this.scope(actor))
      .sort({ createdAt: -1 })
      .limit(50)
      .select('-decisions')
      .lean()
      .exec();
  }

  async get(id: string, actor: ImportActor) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Import run not found');
    const run = await this.runs
      .findOne({ _id: id, ...this.scope(actor) })
      .lean()
      .exec();
    if (!run) throw new NotFoundException('Import run not found');
    return run;
  }

  async importPdf(
    buffer: Buffer,
    actor: ImportActor,
    detectFields = true,
  ): Promise<PdfImportResponseDto> {
    const started = Date.now();
    // Reserve a durable run before calling the paid provider.
    const run = await this.runs.create({
      ...this.scope(actor),
      fileSha256: createHash('sha256').update(buffer).digest('hex'),
      fileBytes: buffer.length,
      detectionRequested: detectFields,
      status: 'processing',
      confidenceThreshold: this.jev.threshold,
    });
    const metrics: DetectionMetrics = {
      runId: run._id.toString(),
      provider: 'typesafe',
      requestedModel: this.jev.model,
      status: 'skipped',
      candidateCount: 0,
      evaluatedCount: 0,
      detectedCount: 0,
      uncertainCount: 0,
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      usageComplete: true,
      estimatedCostUsd: 0,
      knownCostUsd: 0,
      costComplete: true,
      currency: 'USD',
      detectionDurationMs: 0,
      totalDurationMs: 0,
      attempts: [],
    };
    const decisions: FieldDecision[] = [];
    const persist = async () => {
      metrics.totalDurationMs = Date.now() - started;
      run.metrics = { ...metrics };
      run.decisions = [...decisions];
      run.markModified('metrics');
      run.markModified('decisions');
      await run.save();
    };
    try {
      const { result, candidates, textlessPages } =
        await this.importer.extractPdf(buffer, detectFields);
      run.pageCount = result.pageCount;
      metrics.candidateCount = candidates.length;
      const detectionStarted = Date.now();
      if (!detectFields) metrics.reason = 'disabled';
      else if (!this.jev.configured) {
        metrics.reason = 'missing_api_key';
        result.warnings.push(
          'Automatic field detection is unavailable: configure TYPESAFE_API_KEY on the server.',
        );
      } else if (!candidates.length) metrics.reason = 'no_candidates';
      else {
        const selected = candidates.slice(0, 120);
        if (candidates.length > selected.length)
          result.warnings.push(
            'Field detection evaluated the first 120 candidate inputs. Review the remaining inputs manually.',
          );
        // Bounded batches share state and ask independent type/required questions together.
        for (let offset = 0; offset < selected.length; offset += 12) {
          const remaining = 60_000 - (Date.now() - detectionStarted);
          if (remaining <= 0) break;
          const batch = selected.slice(offset, offset + 12);
          const evaluation = await this.jev.evaluate(
            batch,
            metrics.attempts.length,
            Math.min(12_000, remaining),
          );
          metrics.attempts.push(evaluation.attempt);
          decisions.push(...evaluation.decisions);
          metrics.requestCount++;
          metrics.evaluatedCount += evaluation.decisions.length;
          metrics.inputTokens += evaluation.attempt.inputTokens ?? 0;
          metrics.outputTokens += evaluation.attempt.outputTokens ?? 0;
          metrics.usageComplete &&=
            evaluation.attempt.inputTokens !== null &&
            evaluation.attempt.outputTokens !== null;
          metrics.costComplete &&= evaluation.attempt.estimatedCostUsd !== null;
          metrics.knownCostUsd += evaluation.attempt.estimatedCostUsd ?? 0;
          metrics.estimatedCostUsd = metrics.costComplete
            ? metrics.knownCostUsd
            : null;
          metrics.detectionDurationMs = Date.now() - detectionStarted;
          await persist();
          // No automatic retries: avoid duplicate billing and stop on provider failure.
          if (evaluation.attempt.status === 'failed') break;
        }
        metrics.status =
          metrics.evaluatedCount === candidates.length
            ? 'completed'
            : metrics.evaluatedCount
              ? 'partial'
              : 'failed';
        if (metrics.status !== 'completed')
          result.warnings.push(
            'Field detection was incomplete. Existing document artwork was imported; review the fields manually.',
          );
        const fieldsByName = new Map<string, (typeof result.fields)[number]>();
        for (const decision of decisions) {
          if (!decision.accepted) {
            if (
              decision.choice !== 'none' ||
              decision.confidence < this.jev.threshold
            )
              metrics.uncertainCount++;
            continue;
          }
          const candidate = candidates.find(
            (c) => c.id === decision.candidateId,
          )!;
          const name = inputName(candidate.label, result.fields.length);
          const required =
            candidate.required || decision.requiredProbability >= 0.9;
          const componentId = `jev_${candidate.id}`;
          result.components.push({
            id: componentId,
            kind: 'text',
            page: candidate.page,
            x: candidate.x,
            y: candidate.y,
            width: candidate.width,
            height: candidate.height,
            rotation: 0,
            content: `{{${name}}}`,
            fontSize: Math.max(6, candidate.fontSize),
            fontFamily: 'Lato',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textDecoration: 'none',
            color: '#000000',
            align: decision.choice === 'checkbox' ? 'center' : 'left',
            lineHeight: 1,
          });
          // Repeated labels share one field: every occurrence renders the
          // same value (first-seen type wins, required sticks if any
          // occurrence is required).
          const existing = fieldsByName.get(name);
          if (existing) {
            existing.required = existing.required || required;
            continue;
          }
          const field = {
            name,
            type: decision.choice,
            required,
            componentId,
            options:
              decision.choice === 'dropdown' ? candidate.options : undefined,
          };
          result.fields.push(field);
          fieldsByName.set(name, field);
        }
        metrics.detectedCount = result.fields.length;
        if (metrics.uncertainCount)
          result.warnings.push(
            `${metrics.uncertainCount} uncertain input candidate(s) were left for manual review.`,
          );
      }
      if (detectFields && textlessPages.length)
        result.warnings.push(
          `Pages ${textlessPages.map((p) => p + 1).join(', ')} have no extractable text. Scanned inputs need OCR or manual field placement.`,
        );
      metrics.detectionDurationMs = Date.now() - detectionStarted;
      run.status = 'completed';
      await persist();
      result.detection = metrics;
      return result;
    } catch (error) {
      run.status = 'failed';
      run.errorCode = 'import_failed';
      metrics.status = 'failed';
      // Preserve any paid usage already reported, even if subsequent work fails.
      await persist();
      throw error;
    }
  }
}
