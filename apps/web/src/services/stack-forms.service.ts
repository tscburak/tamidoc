import apiClient from '../lib/api';
import type { TemplateField } from '../context/TemplateStoreProvider';
import type { ComponentGroup } from '../components/designer';

export type StackFormStatus = 'draft' | 'active' | 'paused' | 'archived';

/** Lightweight identity of one member template (snapshot stays server-side). */
export interface StackEntryView {
  templateId: string;
  name: string;
  version: string;
}

/** Owner-facing stack form record (passwordHash/snapshots never leave backend). */
export interface StackFormRecord {
  id: string;
  name: string;
  organizationId: string;
  status: StackFormStatus;
  token: string;
  requiresPassword: boolean;
  expiresAt: string | null;
  submissionCount: number;
  entries: StackEntryView[];
  unifiedFields: TemplateField[];
  unifiedGroups: ComponentGroup[];
  links?: ManualLink[];
  /** Draft-only extras (recomputed server-side for the review page). */
  conflicts?: ConflictEntry[];
  membership?: Record<string, FieldMember[]>;
  createdBy?: { firstName?: string; lastName?: string; email?: string } | null;
  updatedBy?: { firstName?: string; lastName?: string; email?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface StackSubmissionRecord {
  id: string;
  stackFormId: string;
  /** Canonical FillValues (keyed by unified field/group names). */
  values: Record<string, string | Record<string, string>[]>;
  /** Owner-entered ask-on-generate values keyed by entry index (string) →
   *  original field name → value. Persisted on first download. */
  generateValues?: Record<string, Record<string, string>>;
  metadata?: { ip?: string; userAgent?: string };
  createdAt: string;
}

export interface StackFormsListResponse {
  stacks: StackFormRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface StackSubmissionsListResponse {
  submissions: StackSubmissionRecord[];
  total: number;
  page: number;
  limit: number;
}

/** Per-canonical-field override set in the builder review step. */
export type FieldOverride = {
  type?: string;
  required?: boolean;
  options?: string[];
  defaultValue?: string;
  placeholder?: string;
  info?: string;
  section?: string;
  defaultToday?: boolean;
  disabled?: boolean;
  visible?: boolean;
  askOnGenerate?: boolean;
};

/** Manual field link (review mapping step): force a source field into a target
 *  unified field (canonical name). */
export interface ManualLink {
  templateId: string;
  name: string;
  groupId?: string;
  groupName?: string;
  targetName: string;
}

export interface CreateStackFormDto {
  templateIds: string[];
  name?: string;
  overrides?: Record<string, FieldOverride>;
  versions?: Record<string, string>;
  links?: ManualLink[];
  password?: string;
  expiresAt?: string;
  /** true = create as draft; review page loads it by id, publish via update(). */
  draft?: boolean;
}

export interface UpdateStackFormDto {
  name?: string;
  status?: StackFormStatus;
  links?: ManualLink[];
  overrides?: Record<string, FieldOverride>;
  password?: string | null;
  expiresAt?: string | null;
}

export interface ConflictVariant {
  templateName: string;
  value: unknown;
}

export interface ConflictEntry {
  canonicalName: string;
  kind: 'scalar' | 'group';
  property: 'type' | 'options';
  variants: ConflictVariant[];
}

export interface FieldMember {
  templateId: string;
  templateName: string;
  name: string;
  groupName?: string;
}

export interface PreviewStackFormResult {
  entries: StackEntryView[];
  unifiedFields: TemplateField[];
  unifiedGroups: ComponentGroup[];
  conflicts: ConflictEntry[];
  /** Per-unified-field members, keyed `${groupId ?? ''}::${canonicalName}`. */
  membership: Record<string, FieldMember[]>;
}

export interface SubmissionDocument {
  index: number;
  templateId: string;
  name: string;
  version: string;
  /** This entry's ask-on-generate fields (original, pre-merge names). */
  askFields?: TemplateField[];
}

export interface PublicStackFormMeta {
  name: string;
  requiresPassword: boolean;
  expired: boolean;
  status: StackFormStatus;
}

export interface PublicStackFieldsResponse {
  fields: TemplateField[];
  groups: ComponentGroup[];
}

type FillValues = Record<string, string | Record<string, string>[]>;

/**
 * Stack Forms API client. Authenticated (owner) calls are org-scoped; public
 * (anonymous) calls resolve by an unguessable token and suppress the generic
 * success/error toasts (a 401 here must not trigger "Session Expired").
 */
class StackFormsService {
  private authBase(organizationId: string): string {
    return `/organizations/${organizationId}/stack-forms`;
  }
  private publicBase(token: string): string {
    return `/forms/public/stacks/${token}`;
  }

  /* ---------------------------- Owner (auth) ---------------------------- */

  async preview(
    organizationId: string,
    templateIds: string[],
    versions?: Record<string, string>,
    links?: ManualLink[],
  ): Promise<PreviewStackFormResult> {
    const res = await apiClient.post(`${this.authBase(organizationId)}/preview`, {
      templateIds,
      versions,
      links,
    });
    return res.data;
  }

  async create(organizationId: string, dto: CreateStackFormDto): Promise<StackFormRecord> {
    const res = await apiClient.post(this.authBase(organizationId), dto);
    return res.data;
  }

  async list(
    organizationId: string,
    params: { status?: StackFormStatus; search?: string; page?: number; limit?: number } = {},
  ): Promise<StackFormsListResponse> {
    const qs = new URLSearchParams();
    if (params.status) qs.append('status', params.status);
    if (params.search) qs.append('search', params.search);
    if (params.page) qs.append('page', String(params.page));
    if (params.limit) qs.append('limit', String(params.limit));
    const query = qs.toString() ? `?${qs}` : '';
    const res = await apiClient.get(`${this.authBase(organizationId)}${query}`);
    return res.data;
  }

  async get(organizationId: string, id: string): Promise<StackFormRecord> {
    const res = await apiClient.get(`${this.authBase(organizationId)}/${id}`);
    return res.data;
  }

  async update(organizationId: string, id: string, dto: UpdateStackFormDto): Promise<StackFormRecord> {
    const res = await apiClient.patch(`${this.authBase(organizationId)}/${id}`, dto);
    return res.data;
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await apiClient.delete(`${this.authBase(organizationId)}/${id}`);
  }

  async listSubmissions(
    organizationId: string,
    id: string,
    params: { page?: number; limit?: number } = {},
  ): Promise<StackSubmissionsListResponse> {
    const qs = new URLSearchParams();
    if (params.page) qs.append('page', String(params.page));
    if (params.limit) qs.append('limit', String(params.limit));
    const query = qs.toString() ? `?${qs}` : '';
    const res = await apiClient.get(`${this.authBase(organizationId)}/${id}/submissions${query}`);
    return res.data;
  }

  async listDocuments(
    organizationId: string,
    id: string,
    subId: string,
  ): Promise<{ submissionId: string; createdAt: string; documents: SubmissionDocument[] }> {
    const res = await apiClient.get(
      `${this.authBase(organizationId)}/${id}/submissions/${subId}/documents`,
    );
    return res.data;
  }

  /** Returns one document PDF as a Blob; toasts suppressed (it's a download). */
  async getDocumentPdf(
    organizationId: string,
    id: string,
    subId: string,
    index: number,
  ): Promise<Blob> {
    const res = await apiClient.get(
      `${this.authBase(organizationId)}/${id}/submissions/${subId}/documents/${index}/pdf`,
      {
        responseType: 'blob',
        _skipSuccessNotification: true,
        _skipErrorNotification: true,
      } as never,
    );
    return res.data as Blob;
  }

  /** Renders one document with owner-entered ask-on-generate values (original
   *  field names). Backend persists them under the entry's index. */
  async generateDocumentPdf(
    organizationId: string,
    id: string,
    subId: string,
    index: number,
    generateValues: Record<string, string>,
  ): Promise<Blob> {
    const res = await apiClient.post(
      `${this.authBase(organizationId)}/${id}/submissions/${subId}/documents/${index}/pdf`,
      { generateValues },
      {
        responseType: 'blob',
        timeout: 60000,
        _skipSuccessNotification: true,
        _skipErrorNotification: true,
      } as never,
    );
    return res.data as Blob;
  }

  /* ----------------------------- Public ----------------------------- */

  async getPublicStack(token: string): Promise<PublicStackFormMeta> {
    const res = await apiClient.get(this.publicBase(token), {
      _skipErrorNotification: true,
    } as never);
    return res.data;
  }

  async getPublicFields(token: string, password?: string): Promise<PublicStackFieldsResponse> {
    const res = await apiClient.get(`${this.publicBase(token)}/fields`, {
      headers: password ? { 'x-form-password': password } : undefined,
      _skipErrorNotification: true,
    } as never);
    return res.data;
  }

  async submitPublicStack(
    token: string,
    values: FillValues,
    password?: string,
  ): Promise<{ submissionId: string }> {
    const res = await apiClient.post(`${this.publicBase(token)}/submissions`, { values }, {
      headers: password ? { 'x-form-password': password } : undefined,
      _skipSuccessNotification: true,
      _skipErrorNotification: true,
    } as never);
    return res.data;
  }
}

export const stackFormsService = new StackFormsService();
