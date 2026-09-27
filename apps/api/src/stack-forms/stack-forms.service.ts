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
import {
  StackForm,
  StackFormDocument,
  StackFormStatus,
} from './schemas/stack-form.schema';
import {
  StackSubmission,
  StackSubmissionDocument,
} from './schemas/stack-submission.schema';
import { CreateStackFormDto, FieldOverride } from './dto/create-stack-form.dto';
import { UpdateStackFormDto } from './dto/update-stack-form.dto';
import { TemplatesService } from '../templates/templates.service';
import { PdfRenderService } from '../pdf-render/pdf-render.service';
import {
  findMissingRequired,
  findMissingGenerateValues,
  askScalarFields,
} from '../pdf-render/lib/validation';
import type {
  RenderTemplate,
  RenderField,
  RenderGroup,
  FillValues,
} from '../pdf-render/lib/types';
import {
  canonical,
  mergeStack,
  buildEntryValues,
  type StackEntryInput,
  type MergeResult,
} from './lib/merge';

@Injectable()
export class StackFormsService {
  constructor(
    @InjectModel(StackForm.name) private stackModel: Model<StackFormDocument>,
    @InjectModel(StackSubmission.name)
    private submissionModel: Model<StackSubmissionDocument>,
    private readonly templatesService: TemplatesService,
    private readonly pdfRenderService: PdfRenderService,
  ) {}

  /* ------------------------- shared snapshot ------------------------- */

  /**
   * Load a template (org-scoped), require it be published, and snapshot the
   * render data of its default version (same version-pick + pinning logic as
   * FormsService.create). Returns a StackEntryInput ready for mergeStack.
   */
  private async snapshotTemplate(
    templateId: string,
    organizationId: string,
    versionOverride?: string,
  ): Promise<StackEntryInput> {
    const template = await this.templatesService.findOne(
      templateId,
      organizationId,
    );
    if (template.status !== 'published') {
      throw new BadRequestException(
        `Template "${template.name}" must be published before stacking`,
      );
    }

    const templateVersion =
      versionOverride ?? template.defaultVersion ?? template.version;
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

    return {
      templateId,
      templateName: template.name,
      templateVersion,
      snapshot: {
        name: template.name,
        canvas: snapshotData.canvas,
        groups: snapshotData.groups,
        fields: snapshotData.fields,
      },
    };
  }

  /** Apply owner overrides from the builder review step. Keys are compound
   *  (`${groupId ?? ''}::${canonicalName}`) so a scalar and a group field with
   *  the same name can be overridden independently. */
  private applyOverrides(
    fields: RenderField[],
    overrides?: Record<string, FieldOverride>,
  ): RenderField[] {
    if (!overrides) return fields;
    return fields.map((f) => {
      const key = `${f.groupId ?? ''}::${canonical(f.name)}`;
      const o = overrides[key];
      if (!o) return f;
      const merged: RenderField = { ...f };
      for (const k of Object.keys(o) as (keyof FieldOverride)[]) {
        const v = o[k];
        if (v !== undefined) (merged as any)[k] = v;
      }
      return merged;
    });
  }

  /* ---------------------------- preview ---------------------------- */

  /** Compute the unified field set for a candidate stack without persisting.
   *  Drives the builder review step — the owner sees exactly what create stores. */
  async preview(
    organizationId: string,
    templateIds: string[],
    versions?: Record<string, string>,
    links?: any,
  ): Promise<{
    entries: { templateId: string; name: string; version: string }[];
    unifiedFields: RenderField[];
    unifiedGroups: RenderGroup[];
    conflicts: MergeResult['conflicts'];
    /** Per-unified-field members, keyed `${groupId ?? ''}::${canonicalName}`. */
    membership: Record<
      string,
      {
        templateId: string;
        templateName: string;
        name: string;
        groupName?: string;
      }[]
    >;
  }> {
    const snaps = await Promise.all(
      templateIds.map((id) =>
        this.snapshotTemplate(id, organizationId, versions?.[id]),
      ),
    );
    const result = mergeStack(snaps, links);
    const membership = this.computeMembership(result);

    return {
      entries: snaps.map((s) => ({
        templateId: s.templateId,
        name: s.templateName,
        version: s.templateVersion,
      })),
      unifiedFields: result.unifiedFields,
      unifiedGroups: result.unifiedGroups,
      conflicts: result.conflicts,
      membership,
    };
  }

  /** Derive per-unified-field membership from the per-entry merge maps. */
  private computeMembership(result: MergeResult): Record<
    string,
    {
      templateId: string;
      templateName: string;
      name: string;
      groupName?: string;
    }[]
  > {
    const membership: Record<
      string,
      {
        templateId: string;
        templateName: string;
        name: string;
        groupName?: string;
      }[]
    > = {};
    const push = (
      key: string,
      m: {
        templateId: string;
        templateName: string;
        name: string;
        groupName?: string;
      },
    ) => {
      (membership[key] ??= []).push(m);
    };
    for (const e of result.entries) {
      for (const [orig, canonKey] of Object.entries(e.maps.scalarMap)) {
        push(`::${canonKey}`, {
          templateId: e.templateId,
          templateName: e.templateName,
          name: orig,
        });
      }
      for (const [origGroupName, gm] of Object.entries(e.maps.groupMaps)) {
        for (const [origField, canonField] of Object.entries(gm.fields)) {
          push(`${gm.canonical}::${canonField}`, {
            templateId: e.templateId,
            templateName: e.templateName,
            name: origField,
            groupName: origGroupName,
          });
        }
      }
    }
    return membership;
  }

  /* ----------------------------- create ----------------------------- */

  async create(
    organizationId: string,
    dto: CreateStackFormDto,
    userId: string,
  ) {
    const snaps = await Promise.all(
      dto.templateIds.map((id) =>
        this.snapshotTemplate(id, organizationId, dto.versions?.[id]),
      ),
    );
    const result = mergeStack(snaps, dto.links);
    const unifiedFields = this.applyOverrides(
      result.unifiedFields,
      dto.overrides,
    );
    const entries = this.buildEntries(snaps, result);

    const stack = new this.stackModel({
      name: (dto.name ?? '').trim() || `${snaps.length}-template stack`,
      entries,
      unifiedFields,
      unifiedGroups: result.unifiedGroups,
      organizationId: new Types.ObjectId(organizationId),
      createdBy: new Types.ObjectId(userId),
      status: dto.draft ? 'draft' : 'active',
      links: dto.links,
      token: randomBytes(32).toString('hex'),
      passwordHash: dto.password
        ? await bcrypt.hash(dto.password, 10)
        : undefined,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      submissionCount: 0,
    });

    const saved = await stack.save();
    return this.toOwnerView(saved);
  }

  /** Zip merge entries (carry maps) with snapshots (carry templateSnapshot) by templateId. */
  private buildEntries(
    snaps: StackEntryInput[],
    result: MergeResult,
  ): {
    templateId: Types.ObjectId;
    templateName: string;
    templateVersion: string;
    templateSnapshot: any;
    scalarMap: any;
    groupMaps: any;
  }[] {
    const mapsById = new Map(result.entries.map((e) => [e.templateId, e]));
    return snaps.map((s) => {
      const m = mapsById.get(s.templateId)!;
      return {
        templateId: new Types.ObjectId(s.templateId),
        templateName: s.templateName,
        templateVersion: s.templateVersion,
        templateSnapshot: s.snapshot,
        scalarMap: m.maps.scalarMap,
        groupMaps: m.maps.groupMaps,
      };
    });
  }

  /* --------------------------- Owner CRUD --------------------------- */

  async findAll(
    organizationId: string,
    filters: {
      status?: StackFormStatus;
      search?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { status, search, page = 1, limit = 25 } = filters;
    const query: any = { organizationId: new Types.ObjectId(organizationId) };
    // Drafts only exist inside the builder flow; never list them.
    if (status) query.status = status;
    else query.status = { $ne: 'draft' };
    if (search) query.name = { $regex: search, $options: 'i' };

    const skip = (page - 1) * limit;
    const [stacks, total] = await Promise.all([
      this.stackModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .exec(),
      this.stackModel.countDocuments(query),
    ]);

    return {
      stacks: stacks.map((s) => this.toOwnerView(s)),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string, organizationId: string) {
    const stack = await this.loadStack(id, organizationId);
    const view: any = this.toOwnerView(stack);
    // Draft extras for the review page: re-run the merge to recompute
    // conflicts/membership from the stored snapshots + links.
    if (stack.status === 'draft') {
      const snaps: StackEntryInput[] = stack.entries.map((e) => ({
        templateId: e.templateId.toString(),
        templateName: e.templateName,
        templateVersion: e.templateVersion,
        snapshot: e.templateSnapshot as RenderTemplate,
      }));
      const result = mergeStack(snaps, stack.links);
      view.conflicts = result.conflicts;
      view.membership = this.computeMembership(result);
    }
    return view;
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateStackFormDto,
    userId: string,
  ) {
    const stack = await this.loadStack(id, organizationId);

    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (trimmed) stack.name = trimmed;
    }

    // Draft-only: re-run the merge from the stored snapshots (link changes from
    // the review mapping step) and/or re-apply owner overrides post-merge.
    if (
      (dto.links !== undefined || dto.overrides !== undefined) &&
      stack.status !== 'draft'
    ) {
      throw new BadRequestException(
        'Links and overrides can only be changed while the stack form is a draft',
      );
    }
    if (dto.links !== undefined) {
      stack.links = dto.links;
      const snaps: StackEntryInput[] = stack.entries.map((e) => ({
        templateId: e.templateId.toString(),
        templateName: e.templateName,
        templateVersion: e.templateVersion,
        snapshot: e.templateSnapshot as RenderTemplate,
      }));
      const result = mergeStack(snaps, dto.links);
      stack.unifiedFields = this.applyOverrides(
        result.unifiedFields,
        dto.overrides,
      );
      stack.unifiedGroups = result.unifiedGroups;
      // Rewrite the per-entry remap maps (snapshots themselves are unchanged).
      const mapsById = new Map(result.entries.map((e) => [e.templateId, e]));
      for (const e of stack.entries) {
        const m = mapsById.get(e.templateId.toString())!;
        e.scalarMap = m.maps.scalarMap;
        e.groupMaps = m.maps.groupMaps;
      }
    } else if (dto.overrides !== undefined) {
      stack.unifiedFields = this.applyOverrides(
        stack.unifiedFields as RenderField[],
        dto.overrides,
      );
    }

    if (dto.status !== undefined) stack.status = dto.status;
    if (dto.password !== undefined) {
      if (dto.password === null || dto.password === '') {
        stack.passwordHash = undefined;
      } else {
        stack.passwordHash = await bcrypt.hash(dto.password, 10);
      }
    }
    if (dto.expiresAt !== undefined) {
      stack.expiresAt =
        dto.expiresAt === null ? undefined : new Date(dto.expiresAt);
    }

    stack.updatedBy = new Types.ObjectId(userId);
    await stack.save();
    return this.toOwnerView(stack);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const stack = await this.loadStack(id, organizationId);
    await this.submissionModel.deleteMany({ stackFormId: stack._id }).exec();
    const res = await this.stackModel.deleteOne({
      _id: stack._id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (res.deletedCount === 0) {
      throw new NotFoundException(`Stack form with ID ${id} not found`);
    }
  }

  /* --------------------- Owner: submissions --------------------- */

  async findSubmissions(
    stackId: string,
    organizationId: string,
    page = 1,
    limit = 25,
  ) {
    await this.loadStack(stackId, organizationId);
    const query = {
      stackFormId: new Types.ObjectId(stackId),
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

  /** One document per stack entry (no rendering — just metadata for the list,
   *  plus each entry's ask-on-generate fields for the owner prompt dialog). */
  async listDocuments(
    stackId: string,
    organizationId: string,
    submissionId: string,
  ) {
    const stack = await this.loadStack(stackId, organizationId);
    const sub = await this.loadSubmission(
      stack._id,
      submissionId,
      organizationId,
    );
    return {
      submissionId: String(sub._id),
      createdAt: sub.createdAt,
      documents: stack.entries.map((e, index) => ({
        index,
        templateId: String(e.templateId),
        name: e.templateName,
        version: e.templateVersion,
        // Original (pre-merge) field names — exactly what the renderer expects.
        askFields: askScalarFields(
          (e.templateSnapshot as RenderTemplate)?.fields ?? [],
        ),
      })),
    };
  }

  /**
   * Render ONE entry's document on demand from the stored canonical values.
   * When `generateValues` is provided (owner answered the ask-on-generate
   * prompt for this entry), they are validated against the entry's own ask
   * fields, persisted under `generateValues[String(entryIndex)]` (prefilled on
   * the next download) and merged over the remapped values owner-wins.
   */
  async getSubmissionDocumentPdf(
    stackId: string,
    submissionId: string,
    entryIndex: number,
    organizationId: string,
    generateValues?: Record<string, unknown>,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const stack = await this.loadStack(stackId, organizationId);
    const entry = stack.entries[entryIndex];
    if (!entry) {
      throw new NotFoundException(`Document index ${entryIndex} not found`);
    }
    const sub = await this.loadSubmission(
      stack._id,
      submissionId,
      organizationId,
    );

    const entryFields =
      (entry.templateSnapshot as RenderTemplate)?.fields ?? [];
    const saved = ((sub.generateValues ?? {}) as Record<string, FillValues>)[
      String(entryIndex)
    ];

    let provided: FillValues | undefined;
    if (generateValues) {
      const missing = findMissingGenerateValues(
        entryFields,
        generateValues as FillValues,
      );
      if (missing.length) {
        throw new UnprocessableEntityException({
          message: 'Missing required generation fields',
          missing,
        });
      }
      provided = generateValues as FillValues;
      await this.submissionModel
        .updateOne(
          { _id: sub._id },
          {
            $set: {
              [`generateValues.${entryIndex}`]: {
                ...(saved ?? {}),
                ...provided,
              },
            },
          },
        )
        .exec();
    }

    const entryValues = {
      ...buildEntryValues(
        { scalarMap: entry.scalarMap, groupMaps: entry.groupMaps },
        sub.values as FillValues,
      ),
      ...saved,
      ...(provided ?? {}),
    };
    const buffer = await this.pdfRenderService.render(
      entry.templateSnapshot as RenderTemplate,
      entryValues,
    );

    const base =
      (entry.templateName || 'document')
        .replace(/[^\w\- ]/g, '')
        .trim()
        .slice(0, 60) || 'document';
    const date = sub.createdAt?.toISOString().slice(0, 10) ?? 'document';
    return { buffer, filename: `${base}-${date}.pdf` };
  }

  /* -------------------------- Public API -------------------------- */

  /** Metadata only — never returns fields (hides structure behind the gate). */
  async findStackByToken(token: string) {
    const stack = await this.loadStackByToken(token);
    return {
      name: stack.name,
      requiresPassword: !!stack.passwordHash,
      expired: this.isExpired(stack),
      status: stack.status,
    };
  }

  async getPublicFields(token: string, password?: string) {
    const stack = await this.loadStackByToken(token);
    await this.verifyPassword(stack, password);
    this.assertNotClosed(stack);
    // Ask-on-generate scalars are never shown to the filler — the form owner
    // supplies them per document at generation time.
    const fields = ((stack.unifiedFields ?? []) as RenderField[]).filter(
      (f) => !(f.askOnGenerate && !f.groupId),
    );
    return {
      fields,
      groups: (stack.unifiedGroups ?? []) as RenderGroup[],
    };
  }

  /**
   * Accept an anonymous stack submission: re-check password/status/expiry
   * immediately before persisting, validate the unified required fields, then
   * store the canonical values. PDFs are NOT rendered at submit time — the
   * owner generates them on demand, one per entry, when previewing/downloading.
   */
  async submitPublic(
    token: string,
    values: Record<string, unknown>,
    password?: string,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const stack = await this.loadStackByToken(token);
    await this.verifyPassword(stack, password);
    this.assertNotClosed(stack);

    // Validate against the unified field set via a pseudo-snapshot.
    const pseudo = {
      fields: (stack.unifiedFields ?? []) as RenderField[],
      groups: (stack.unifiedGroups ?? []) as RenderGroup[],
    } as RenderTemplate;
    const fill = values as FillValues;
    const missing = findMissingRequired(pseudo, fill);
    if (missing.length) {
      throw new UnprocessableEntityException({
        message: 'Missing required fields',
        missing,
      });
    }

    const submissionId = new Types.ObjectId();
    await this.submissionModel.create({
      _id: submissionId,
      stackFormId: stack._id,
      organizationId: stack.organizationId,
      values: fill,
      metadata: { ip: meta?.ip, userAgent: meta?.userAgent },
    });

    await this.stackModel
      .updateOne({ _id: stack._id }, { $inc: { submissionCount: 1 } })
      .exec();

    return { submissionId: String(submissionId) };
  }

  /* --------------------------- Helpers --------------------------- */

  private async loadStack(
    id: string,
    organizationId: string,
  ): Promise<StackFormDocument> {
    const stack = await this.stackModel
      .findOne({
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      })
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .exec();
    if (!stack) {
      throw new NotFoundException(`Stack form with ID ${id} not found`);
    }
    return stack;
  }

  private async loadStackByToken(token: string): Promise<StackFormDocument> {
    const stack = await this.stackModel.findOne({ token }).exec();
    if (!stack) {
      throw new NotFoundException('Stack form not found');
    }
    return stack;
  }

  private async loadSubmission(
    stackId: Types.ObjectId,
    submissionId: string,
    organizationId: string,
  ) {
    const sub = await this.submissionModel
      .findOne({
        _id: new Types.ObjectId(submissionId),
        stackFormId: stackId,
        organizationId: new Types.ObjectId(organizationId),
      })
      .exec();
    if (!sub) {
      throw new NotFoundException(
        `Submission with ID ${submissionId} not found`,
      );
    }
    return sub;
  }

  private async verifyPassword(
    stack: StackFormDocument,
    password?: string,
  ): Promise<void> {
    if (!stack.passwordHash) return;
    if (!password || !(await bcrypt.compare(password, stack.passwordHash))) {
      throw new ForbiddenException('Incorrect password');
    }
  }

  private assertNotClosed(stack: StackFormDocument): void {
    if (this.isExpired(stack)) {
      throw new GoneException('This stack form has expired');
    }
    if (stack.status !== 'active') {
      throw new ForbiddenException(
        'This stack form is not accepting submissions',
      );
    }
  }

  private isExpired(stack: StackFormDocument): boolean {
    return !!(stack.expiresAt && stack.expiresAt.getTime() < Date.now());
  }

  /** Owner-facing projection: never leaks passwordHash or the heavy snapshots.
   *  Entries are flattened to lightweight identity (templateName/version). */
  private toOwnerView(stack: StackFormDocument) {
    const obj = stack.toObject();
    return {
      id: String(obj._id),
      name: obj.name,
      organizationId: String(obj.organizationId),
      status: obj.status as StackFormStatus,
      token: obj.token,
      requiresPassword: !!obj.passwordHash,
      expiresAt: obj.expiresAt ?? null,
      submissionCount: obj.submissionCount ?? 0,
      entries: (obj.entries ?? []).map((e: any) => ({
        templateId: String(e.templateId),
        name: e.templateName,
        version: e.templateVersion,
      })),
      unifiedFields: obj.unifiedFields ?? [],
      unifiedGroups: obj.unifiedGroups ?? [],
      links: obj.links ?? [],
      createdBy: obj.createdBy,
      updatedBy: obj.updatedBy ?? null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private toSubmissionView(sub: StackSubmissionDocument) {
    const obj = sub.toObject();
    return {
      id: String(obj._id),
      stackFormId: String(obj.stackFormId),
      values: obj.values,
      // Ask-on-generate values keyed by entry index (string) → field name.
      generateValues: obj.generateValues ?? {},
      metadata: obj.metadata ?? {},
      createdAt: obj.createdAt,
    };
  }
}
