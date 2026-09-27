import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  GoneException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Form, FormDocument, FormStatus } from './schemas/form.schema';
import { Submission, SubmissionDocument } from './schemas/submission.schema';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { TemplatesService } from '../templates/templates.service';
import { PdfRenderService } from '../pdf-render/pdf-render.service';
import { StorageService } from '../storage/storage.service';
import {
  findMissingRequired,
  findMissingGenerateValues,
} from '../pdf-render/lib/validation';
import type {
  RenderTemplate,
  RenderField,
  FillValues,
} from '../pdf-render/lib/types';

@Injectable()
export class FormsService {
  constructor(
    @InjectModel(Form.name) private formModel: Model<FormDocument>,
    @InjectModel(Submission.name)
    private submissionModel: Model<SubmissionDocument>,
    private readonly templatesService: TemplatesService,
    private readonly pdfRenderService: PdfRenderService,
    private readonly storageService: StorageService,
  ) {}

  /* --------------------------- Owner CRUD --------------------------- */

  /**
   * Publish a Template as a Form. Snapshots the template's render data so the
   * form is independent of later template edits/deletes (version pinning).
   */
  async create(organizationId: string, dto: CreateFormDto, userId: string) {
    const template = await this.templatesService.findOne(
      dto.templateId,
      organizationId,
    );
    if (template.status !== 'published') {
      throw new BadRequestException(
        'Template must be published before creating a form',
      );
    }

    // Snapshot the render data of the version the author chose (explicit client
    // override wins, then the pinned default, falling back to current/latest).
    const templateVersion =
      dto.version ?? template.defaultVersion ?? template.version;
    let snapshotData: { canvas: any; groups: any; fields: any };
    if (templateVersion !== template.version) {
      const v = await this.templatesService.getVersion(
        template._id.toString(),
        organizationId,
        templateVersion,
      );
      snapshotData = { canvas: v.canvas, groups: v.groups, fields: v.fields };
    } else {
      const obj = template.toObject();
      snapshotData = {
        canvas: obj.canvas,
        groups: obj.groups,
        fields: obj.fields,
      };
    }
    const templateSnapshot: RenderTemplate = {
      name: template.name,
      canvas: snapshotData.canvas,
      groups: snapshotData.groups,
      fields: snapshotData.fields,
    };

    const form = new this.formModel({
      name: (dto.name ?? '').trim() || template.name,
      templateId: new Types.ObjectId(dto.templateId),
      templateVersion,
      templateSnapshot,
      organizationId: new Types.ObjectId(organizationId),
      createdBy: new Types.ObjectId(userId),
      status: 'active',
      token: randomBytes(32).toString('hex'),
      passwordHash: dto.password
        ? await bcrypt.hash(dto.password, 10)
        : undefined,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      submissionCount: 0,
      fieldOverrides: dto.overrides ?? undefined,
    });

    const saved = await form.save();
    return this.toOwnerView(saved);
  }

  async findAll(
    organizationId: string,
    filters: {
      status?: FormStatus;
      templateId?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    forms: ReturnType<FormsService['toOwnerView']>[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { status, templateId, search, page = 1, limit = 25 } = filters;
    const query: any = { organizationId: new Types.ObjectId(organizationId) };
    if (status) query.status = status;
    if (templateId) query.templateId = new Types.ObjectId(templateId);
    if (search) query.name = { $regex: search, $options: 'i' };

    const skip = (page - 1) * limit;
    const [forms, total] = await Promise.all([
      this.formModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .exec(),
      this.formModel.countDocuments(query),
    ]);

    return { forms: forms.map((f) => this.toOwnerView(f)), total, page, limit };
  }

  async findOne(id: string, organizationId: string) {
    return this.toOwnerView(await this.loadForm(id, organizationId));
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateFormDto,
    userId: string,
  ) {
    const form = await this.loadForm(id, organizationId);

    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (trimmed) form.name = trimmed;
    }
    if (dto.status !== undefined) form.status = dto.status;

    // omit = unchanged; null/'' = clear; string = set
    if (dto.password !== undefined) {
      if (dto.password === null || dto.password === '') {
        form.passwordHash = undefined;
      } else {
        form.passwordHash = await bcrypt.hash(dto.password, 10);
      }
    }
    if (dto.expiresAt !== undefined) {
      form.expiresAt =
        dto.expiresAt === null ? undefined : new Date(dto.expiresAt);
    }

    form.updatedBy = new Types.ObjectId(userId);
    await form.save();
    return this.toOwnerView(form);
  }

  /**
   * Delete a form and cascade: remove its submissions (DB) and best-effort
   * remove the stored PDFs. DB cleanup always wins over S3 cleanup.
   */
  async remove(id: string, organizationId: string): Promise<void> {
    const form = await this.loadForm(id, organizationId);

    const subs = await this.submissionModel
      .find({ formId: form._id })
      .select('pdfStorageKey')
      .exec();
    await this.submissionModel.deleteMany({ formId: form._id }).exec();

    const res = await this.formModel.deleteOne({
      _id: form._id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (res.deletedCount === 0) {
      throw new NotFoundException(`Form with ID ${id} not found`);
    }

    // Only forward non-empty keys to the storage service; new submissions don't
    // store a PDF on S3 so `pdfStorageKey` is often undefined. (Storage.remove
    // already guards against empty/falsy keys but TS doesn't know that.)
    const keys = subs
      .map((s) => s.pdfStorageKey)
      .filter((k): k is string => !!k);
    await Promise.allSettled(keys.map((k) => this.storageService.remove(k)));
  }

  /* ----------------------- Owner: submissions ----------------------- */

  async findSubmissions(
    formId: string,
    organizationId: string,
    page = 1,
    limit = 25,
  ) {
    await this.loadForm(formId, organizationId);
    const query = {
      formId: new Types.ObjectId(formId),
      organizationId: new Types.ObjectId(organizationId),
    };
    const skip = (page - 1) * limit;
    const [submissions, total] = await Promise.all([
      this.submissionModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.submissionModel.countDocuments(query),
    ]);
    return {
      submissions: submissions.map((s) => this.toSubmissionView(s)),
      total,
      page,
      limit,
    };
  }

  /**
   * Render (or fetch) a submission's PDF. When `generateValues` is provided
   * (owner answered the ask-on-generate prompt), they are validated, persisted
   * on the submission (prefilled on the next download) and merged over the
   * filler's values with owner-wins precedence; an archived copy is ignored so
   * the PDF is always fresh. Without them the archived copy wins, otherwise
   * the stored values + previously saved generation values are rendered.
   */
  async getSubmissionPdf(
    formId: string,
    submissionId: string,
    organizationId: string,
    generateValues?: Record<string, unknown>,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const form = await this.loadForm(formId, organizationId);
    const sub = await this.submissionModel
      .findOne({
        _id: new Types.ObjectId(submissionId),
        formId: form._id,
        organizationId: new Types.ObjectId(organizationId),
      })
      .exec();
    if (!sub) {
      throw new NotFoundException(
        `Submission with ID ${submissionId} not found`,
      );
    }

    const snapshot = form.templateSnapshot as RenderTemplate;
    const effectiveFields = this.withOverrides(
      snapshot.fields ?? [],
      form.fieldOverrides,
    );

    let buffer: Buffer;
    if (generateValues) {
      const missing = findMissingGenerateValues(
        effectiveFields,
        generateValues as FillValues,
      );
      if (missing.length) {
        throw new UnprocessableEntityException({
          message: 'Missing required generation fields',
          missing,
        });
      }
      const merged = { ...(sub.generateValues ?? {}), ...generateValues };
      await this.submissionModel
        .updateOne({ _id: sub._id }, { $set: { generateValues: merged } })
        .exec();

      const values = {
        ...(sub.values as FillValues),
        ...(merged as FillValues),
      };
      buffer = await this.pdfRenderService.render(snapshot, values);
    } else if (sub.pdfStorageKey) {
      // Prefer a previously archived PDF (if the submission was created when we
      // still auto-saved, or the owner manually archived it). Otherwise render
      // the PDF from the stored values on demand so we don't need to keep one
      // in object storage per submission.
      ({ buffer } = await this.storageService.download(sub.pdfStorageKey));
    } else {
      const values = {
        ...(sub.values as FillValues),
        ...((sub.generateValues ?? {}) as FillValues),
      };
      buffer = await this.pdfRenderService.render(snapshot, values);
    }

    const base =
      (form.name || 'submission')
        .replace(/[^\w\- ]/g, '')
        .trim()
        .slice(0, 60) || 'submission';
    const date = sub.createdAt?.toISOString().slice(0, 10) ?? 'document';
    return { buffer, filename: `${base}-${date}.pdf` };
  }

  /* -------------------------- Public API -------------------------- */

  /** Metadata only — never returns fields (hides structure behind the gate). */
  async findFormByToken(token: string) {
    const form = await this.loadFormByToken(token);
    return {
      name: form.name,
      requiresPassword: !!form.passwordHash,
      expired: this.isExpired(form),
      status: form.status,
    };
  }

  async getPublicFields(token: string, password?: string) {
    const form = await this.loadFormByToken(token);
    await this.verifyPassword(form, password);
    this.assertNotClosed(form);
    const snap = (form.templateSnapshot ?? {}) as RenderTemplate;
    // Ask-on-generate scalars are never shown to the filler — the form owner
    // supplies them at document generation time.
    const fields = this.withOverrides(
      snap.fields ?? [],
      form.fieldOverrides,
    ).filter((f) => !(f.askOnGenerate && !f.groupId));
    return {
      fields,
      groups: snap.groups ?? [],
    };
  }

  /**
   * Accept an anonymous submission: re-check password/status/expiry immediately
   * before persisting (the GET preconditions may no longer hold), validate
   * required fields, then write — JSON values only. The PDF is **not**
   * rendered/stored on submit; it is generated on demand from the stored
   * values when the owner downloads it. This keeps submissions cheap, avoids
   * bloating S3, and lets us add explicit "save copy to external storage"
   * actions and workflow hooks (Tamidoc → Drive / Google Cloud) later
   * without re-uploading pre-generated PDFs.
   */
  async submitPublic(
    token: string,
    values: Record<string, unknown>,
    password?: string,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const form = await this.loadFormByToken(token);
    await this.verifyPassword(form, password);
    this.assertNotClosed(form);

    const snapshot = form.templateSnapshot as RenderTemplate;
    const fill = values as FillValues;
    // Validate against the override-applied field set the filler actually saw.
    const effective = {
      ...snapshot,
      fields: this.withOverrides(snapshot.fields ?? [], form.fieldOverrides),
    };
    const missing = findMissingRequired(effective, fill);
    if (missing.length) {
      throw new UnprocessableEntityException({
        message: 'Missing required fields',
        missing,
      });
    }

    const submissionId = new Types.ObjectId();
    await this.submissionModel.create({
      _id: submissionId,
      formId: form._id,
      organizationId: form.organizationId,
      values: fill,
      templateVersion: form.templateVersion,
      metadata: { ip: meta?.ip, userAgent: meta?.userAgent },
    });

    await this.formModel
      .updateOne({ _id: form._id }, { $inc: { submissionCount: 1 } })
      .exec();

    return { submissionId: String(submissionId) };
  }

  /* --------------------------- Helpers --------------------------- */

  private async loadForm(
    id: string,
    organizationId: string,
  ): Promise<FormDocument> {
    const form = await this.formModel
      .findOne({
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      })
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .exec();
    if (!form) {
      throw new NotFoundException(`Form with ID ${id} not found`);
    }
    return form;
  }

  private async loadFormByToken(token: string): Promise<FormDocument> {
    const form = await this.formModel.findOne({ token }).exec();
    if (!form) {
      throw new NotFoundException('Form not found');
    }
    return form;
  }

  private async verifyPassword(
    form: FormDocument,
    password?: string,
  ): Promise<void> {
    if (!form.passwordHash) return;
    if (!password || !(await bcrypt.compare(password, form.passwordHash))) {
      throw new ForbiddenException('Incorrect password');
    }
  }

  private assertNotClosed(form: FormDocument): void {
    if (this.isExpired(form)) {
      throw new GoneException('This form has expired');
    }
    if (form.status !== 'active') {
      throw new ForbiddenException('This form is not accepting submissions');
    }
  }

  private isExpired(form: FormDocument): boolean {
    return !!(form.expiresAt && form.expiresAt.getTime() < Date.now());
  }

  /** Merge per-field overrides (keyed `${groupId ?? ''}::${name}`) onto a
   *  snapshot's fields. Returns the fields unchanged when no overrides exist. */
  private withOverrides(fields: RenderField[], overrides?: any): RenderField[] {
    if (!overrides || typeof overrides !== 'object') return fields;
    return fields.map((f) => {
      const key = `${f.groupId ?? ''}::${f.name}`;
      const o = overrides[key];
      if (!o) return f;
      const merged: RenderField = { ...f };
      for (const k of Object.keys(o)) {
        if (o[k] !== undefined) (merged as any)[k] = o[k];
      }
      return merged;
    });
  }

  /** Owner-facing projection: never leaks passwordHash or the heavy snapshot. */
  private toOwnerView(form: FormDocument) {
    const obj = form.toObject();
    return {
      id: String(obj._id),
      name: obj.name,
      templateId: String(obj.templateId),
      templateVersion: obj.templateVersion,
      organizationId: String(obj.organizationId),
      status: obj.status as FormStatus,
      token: obj.token,
      requiresPassword: !!obj.passwordHash,
      expiresAt: obj.expiresAt ?? null,
      submissionCount: obj.submissionCount ?? 0,
      createdBy: obj.createdBy,
      updatedBy: obj.updatedBy ?? null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
      // Project lightweight arrays from the pinned snapshot (avoids extra
      // fetch), with the form's publish-time overrides applied.
      fields: this.withOverrides(
        (obj.templateSnapshot?.fields ?? []) as RenderField[],
        obj.fieldOverrides,
      ) as any[],
      groups: (obj.templateSnapshot?.groups ?? []) as any[],
    };
  }

  /** Submission projection: storage internals are hidden; owner fetches PDFs
   * via the proxied download endpoint. */
  private toSubmissionView(sub: SubmissionDocument) {
    const obj = sub.toObject();
    return {
      id: String(obj._id),
      formId: String(obj.formId),
      values: obj.values,
      generateValues: obj.generateValues ?? {},
      templateVersion: obj.templateVersion,
      metadata: obj.metadata ?? {},
      createdAt: obj.createdAt,
    };
  }
}
