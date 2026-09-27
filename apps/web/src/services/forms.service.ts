import apiClient from '../lib/api';
import type { TemplateField } from '../context/TemplateStoreProvider';
import type { ComponentGroup } from '../components/designer';

export type FormStatus = 'active' | 'paused' | 'archived';

/** Owner-facing form record (passwordHash/snapshot never leave the backend). */
export interface FormRecord {
  id: string;
  name: string;
  templateId: string;
  templateVersion: string;
  organizationId: string;
  status: FormStatus;
  token: string;
  requiresPassword: boolean;
  expiresAt: string | null;
  submissionCount: number;
  createdBy?: { firstName?: string; lastName?: string; email?: string } | null;
  updatedBy?: { firstName?: string; lastName?: string; email?: string } | null;
  createdAt: string;
  updatedAt: string;
  /** Pinned field definitions from the publish-time snapshot (for section grouping in submissions) */
  fields?: TemplateField[];
  /** Pinned group definitions from the publish-time snapshot */
  groups?: ComponentGroup[];
}

export interface SubmissionRecord {
  id: string;
  formId: string;
  /** FillValues: scalars keyed by field name; repeating groups keyed by group
   * name → array of { field: value } objects. */
  values: Record<string, string | Record<string, string>[]>;
  /** Owner-entered ask-on-generate values (field name → value), persisted on
   *  first download and prefilled on the next. */
  generateValues?: Record<string, string>;
  templateVersion: string;
  metadata?: { ip?: string; userAgent?: string };
  createdAt: string;
}

export interface FormsListResponse {
  forms: FormRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface SubmissionsListResponse {
  submissions: SubmissionRecord[];
  total: number;
  page: number;
  limit: number;
}

/** Per-field override (review step), keyed `${groupId ?? ''}::${fieldName}`. */
export type FormFieldOverride = {
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

export interface CreateFormDto {
  templateId: string;
  name?: string;
  password?: string;
  expiresAt?: string; // ISO 8601
  /** Optional template version to snapshot. Absent = default version. */
  version?: string;
  /** Per-field overrides from the review step. */
  overrides?: Record<string, FormFieldOverride>;
}

export interface UpdateFormDto {
  name?: string;
  status?: FormStatus;
  /** null/'' clears; a string sets; omit leaves unchanged. */
  password?: string | null;
  expiresAt?: string | null;
}

export interface PublicFormMeta {
  name: string;
  requiresPassword: boolean;
  expired: boolean;
  status: FormStatus;
}

export interface PublicFieldsResponse {
  fields: TemplateField[];
  groups: ComponentGroup[];
}

type FillValues = Record<string, string | Record<string, string>[]>;

/**
 * Forms API client. Authenticated (owner) calls are org-scoped; public
 * (anonymous) calls resolve by an unguessable form token and suppress the
 * generic success/error toasts (the public page drives its own feedback, and a
 * 401 here would otherwise trigger the "Session Expired" redirect).
 */
class FormsService {
  private authBase(organizationId: string): string {
    return `/organizations/${organizationId}/forms`;
  }
  private publicBase(token: string): string {
    return `/forms/public/${token}`;
  }

  /* ---------------------------- Owner (auth) ---------------------------- */

  async list(
    organizationId: string,
    params: { status?: FormStatus; templateId?: string; search?: string; page?: number; limit?: number } = {},
  ): Promise<FormsListResponse> {
    const qs = new URLSearchParams();
    if (params.status) qs.append('status', params.status);
    if (params.templateId) qs.append('templateId', params.templateId);
    if (params.search) qs.append('search', params.search);
    if (params.page) qs.append('page', String(params.page));
    if (params.limit) qs.append('limit', String(params.limit));
    const query = qs.toString() ? `?${qs}` : '';
    const res = await apiClient.get(`${this.authBase(organizationId)}${query}`);
    return res.data;
  }

  async create(organizationId: string, dto: CreateFormDto): Promise<FormRecord> {
    const res = await apiClient.post(this.authBase(organizationId), dto);
    return res.data;
  }

  async get(organizationId: string, id: string): Promise<FormRecord> {
    const res = await apiClient.get(`${this.authBase(organizationId)}/${id}`);
    return res.data;
  }

  async update(organizationId: string, id: string, dto: UpdateFormDto): Promise<FormRecord> {
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
  ): Promise<SubmissionsListResponse> {
    const qs = new URLSearchParams();
    if (params.page) qs.append('page', String(params.page));
    if (params.limit) qs.append('limit', String(params.limit));
    const query = qs.toString() ? `?${qs}` : '';
    const res = await apiClient.get(`${this.authBase(organizationId)}/${id}/submissions${query}`);
    return res.data;
  }

  /** Returns the submission PDF as a Blob; toasts suppressed (it's a download). */
  async getSubmissionPdf(organizationId: string, id: string, subId: string): Promise<Blob> {
    const res = await apiClient.get(
      `${this.authBase(organizationId)}/${id}/submissions/${subId}/pdf`,
      {
        responseType: 'blob',
        _skipSuccessNotification: true,
        _skipErrorNotification: true,
      } as never,
    );
    return res.data as Blob;
  }

  /** Renders the submission PDF with owner-entered ask-on-generate values.
   *  Backend persists them on the submission (prefilled next download). */
  async generateSubmissionPdf(
    organizationId: string,
    id: string,
    subId: string,
    generateValues: Record<string, string>,
  ): Promise<Blob> {
    const res = await apiClient.post(
      `${this.authBase(organizationId)}/${id}/submissions/${subId}/pdf`,
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

  async getPublicForm(token: string): Promise<PublicFormMeta> {
    const res = await apiClient.get(this.publicBase(token), {
      _skipErrorNotification: true,
    } as never);
    return res.data;
  }

  async getPublicFields(token: string, password?: string): Promise<PublicFieldsResponse> {
    const res = await apiClient.get(`${this.publicBase(token)}/fields`, {
      headers: password ? { 'x-form-password': password } : undefined,
      _skipErrorNotification: true,
    } as never);
    return res.data;
  }

  async submitPublicForm(
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

export const formsService = new FormsService();
