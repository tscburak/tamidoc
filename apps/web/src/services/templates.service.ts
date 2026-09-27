import apiClient from '../lib/api';
import type { TemplateRecord } from '../context/TemplateStoreProvider';

export interface CreateTemplateDto {
  name: string;
  category?: string;
  description?: string;
  color?: string;
  canvas: {
    size: { width: number; height: number };
    components: any[];
    pageBackgrounds?: string[];
  };
  groups?: any[];
  fields?: any[];
  status?: 'draft' | 'published' | 'archived';
  tags?: string[];
  allowedRoleIds?: string[];
  kind?: 'form' | 'document';
  format?: 'document' | 'slides';
  documentConfig?: {
    format: 'document' | 'slides';
    pageSize: 'A4' | 'A3' | 'A5' | 'letter' | 'legal' | 'tabloid' | '16:9';
    orientation?: 'portrait' | 'landscape';
    theme: {
      fontFamily: string;
      baseFontSize: number;
      colors: { primary: string; heading: string; body: string; muted: string };
      spacing: number;
      pagePadding?: number;
      header?: { enabled: boolean; text: string; editable?: boolean };
      footer?: { enabled: boolean; text: string; editable?: boolean };
      pageNumbering?: { enabled: boolean; format?: string };
    };
    allowedBlocks: string[];
    sections?: any[];
    componentDefaults?: Record<string, { styles: { color?: string; background?: string; fontSize?: '' | 'xs' | 'sm' | 'base' | 'lg' | 'xl' } }>;
  };
  blocks?: any[];
}

export interface UpdateTemplateDto extends Partial<CreateTemplateDto> {}

/** Lean version-history entry (no canvas payload). */
export interface TemplateVersionSummary {
  version: string;
  changeDescription?: string;
  isCurrent: boolean;
  isDefault: boolean;
  createdAt: number;
}

/** Full snapshot of a version, for opening in the designer. */
export interface TemplateVersionSnapshot {
  version: string;
  changeDescription?: string;
  kind?: 'form' | 'document';
  format?: 'document' | 'slides';
  canvas: CreateTemplateDto['canvas'];
  groups?: any[];
  fields?: any[];
  documentConfig?: CreateTemplateDto['documentConfig'];
  blocks?: any[];
}

export type VersionSource = 'duplicate' | 'blank' | 'pdf' | 'ai';

export interface TemplatesListResponse {
  templates: TemplateRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface TemplateFilters {
  status?: 'draft' | 'published' | 'archived';
  category?: string;
  tag?: string;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'name';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

class TemplatesService {
  private getBaseUrl(organizationId: string): string {
    return `/organizations/${organizationId}/templates`;
  }

  /**
   * Get all templates for an organization
   */
  async findAll(organizationId: string, filters: TemplateFilters = {}): Promise<TemplatesListResponse> {
    const params = new URLSearchParams();

    if (filters.status) params.append('status', filters.status);
    if (filters.category) params.append('category', filters.category);
    if (filters.tag) params.append('tag', filters.tag);
    if (filters.search) params.append('search', filters.search);
    if (filters.sortBy) params.append('sortBy', filters.sortBy);
    if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());

    const url = this.getBaseUrl(organizationId) + (params.toString() ? `?${params}` : '');
    const response = await apiClient.get(url);

    // Map MongoDB _id to frontend id format
    return {
      ...response.data,
      templates: response.data.templates?.map((template: any) => ({
        ...template,
        id: template._id || template.id,
        // Convert MongoDB dates to timestamps
        createdAt: template.createdAt ? new Date(template.createdAt).getTime() : Date.now(),
        updatedAt: template.updatedAt ? new Date(template.updatedAt).getTime() : Date.now(),
      })) || [],
    };
  }

  /**
   * Get a single template by ID
   */
  async findOne(organizationId: string, id: string): Promise<TemplateRecord> {
    const response = await apiClient.get(`${this.getBaseUrl(organizationId)}/${id}`);

    return {
      ...response.data,
      id: response.data._id || response.data.id,
      createdAt: response.data.createdAt ? new Date(response.data.createdAt).getTime() : Date.now(),
      updatedAt: response.data.updatedAt ? new Date(response.data.updatedAt).getTime() : Date.now(),
    };
  }

  /**
   * Create a new template
   */
  async create(organizationId: string, data: CreateTemplateDto): Promise<TemplateRecord> {
    const response = await apiClient.post(this.getBaseUrl(organizationId), data);

    return {
      ...response.data,
      id: response.data._id || response.data.id,
      createdAt: response.data.createdAt ? new Date(response.data.createdAt).getTime() : Date.now(),
      updatedAt: response.data.updatedAt ? new Date(response.data.updatedAt).getTime() : Date.now(),
    };
  }

  /**
   * Update an existing template
   */
  async update(organizationId: string, id: string, data: UpdateTemplateDto): Promise<TemplateRecord> {
    const response = await apiClient.put(`${this.getBaseUrl(organizationId)}/${id}`, data);

    return {
      ...response.data,
      id: response.data._id || response.data.id,
      createdAt: response.data.createdAt ? new Date(response.data.createdAt).getTime() : Date.now(),
      updatedAt: response.data.updatedAt ? new Date(response.data.updatedAt).getTime() : Date.now(),
    };
  }

  /**
   * Delete a template
   */
  async remove(organizationId: string, id: string): Promise<void> {
    await apiClient.delete(`${this.getBaseUrl(organizationId)}/${id}`);
  }

  /**
   * Publish a template
   */
  async publish(organizationId: string, id: string): Promise<TemplateRecord> {
    const response = await apiClient.post(`${this.getBaseUrl(organizationId)}/${id}/publish`);

    return {
      ...response.data,
      id: response.data._id || response.data.id,
      createdAt: response.data.createdAt ? new Date(response.data.createdAt).getTime() : Date.now(),
      updatedAt: response.data.updatedAt ? new Date(response.data.updatedAt).getTime() : Date.now(),
    };
  }

  /**
   * Archive a template
   */
  async archive(organizationId: string, id: string): Promise<TemplateRecord> {
    const response = await apiClient.post(`${this.getBaseUrl(organizationId)}/${id}/archive`);

    return {
      ...response.data,
      id: response.data._id || response.data.id,
      createdAt: response.data.createdAt ? new Date(response.data.createdAt).getTime() : Date.now(),
      updatedAt: response.data.updatedAt ? new Date(response.data.updatedAt).getTime() : Date.now(),
    };
  }

  /**
   * Get categories for an organization
   */
  async getCategories(organizationId: string): Promise<string[]> {
    const response = await apiClient.get(`${this.getBaseUrl(organizationId)}/categories`);
    return response.data;
  }

  /**
   * Get the tags currently in use across an organization's templates.
   */
  async getTags(organizationId: string): Promise<string[]> {
    const response = await apiClient.get(`${this.getBaseUrl(organizationId)}/tags`);
    return response.data;
  }

  /**
   * Increment fill count for a template
   */
  async incrementFillCount(organizationId: string, id: string): Promise<void> {
    await apiClient.post(`${this.getBaseUrl(organizationId)}/${id}/fill`);
  }

  /**
   * Generate a filled PDF for a template. Returns a Blob (the PDF binary). The
   * response is fetched as a blob so the api client's JSON-unwrapping interceptor
   * leaves it untouched; success/error toasts are suppressed because the page
   * drives its own feedback (a file download, not a CRUD operation).
   */
  async generatePdf(
    organizationId: string,
    id: string,
    values: Record<string, unknown>,
    version?: string,
  ): Promise<Blob> {
    const response = await apiClient.post(
      `${this.getBaseUrl(organizationId)}/${id}/generate-pdf`,
      { values, version },
      {
        responseType: 'blob',
        timeout: 60000, // Puppeteer's first render can exceed the default 30s
        _skipSuccessNotification: true,
        _skipErrorNotification: true,
      } as never,
    );
    return response.data as Blob;
  }

  /**
   * List a template's version history (lean — no canvas payloads). The default
   * version is listed first, then the current one, then the rest newest-first.
   */
  async listVersions(organizationId: string, id: string): Promise<TemplateVersionSummary[]> {
    const response = await apiClient.get(`${this.getBaseUrl(organizationId)}/${id}/versions`);
    const list: TemplateVersionSummary[] = (response.data ?? []).map((v: any) => ({
      ...v,
      createdAt: v.createdAt ? new Date(v.createdAt).getTime() : Date.now(),
    }));
    return [
      ...list.filter((v) => v.isDefault),
      ...list.filter((v) => v.isCurrent && !v.isDefault),
      ...list.filter((v) => !v.isDefault && !v.isCurrent),
    ];
  }

  /**
   * Fetch a specific version's full snapshot (canvas/groups/fields).
   */
  async getVersion(organizationId: string, id: string, version: string): Promise<TemplateVersionSnapshot> {
    const response = await apiClient.get(`${this.getBaseUrl(organizationId)}/${id}/versions/${version}`);
    return response.data;
  }

  /**
   * Explicitly cut a new version. `source` decides the starting content:
   * duplicate (from `fromVersion`, or current when omitted), blank, pdf, ai.
   */
  async createVersion(
    organizationId: string,
    id: string,
    dto: { source: VersionSource; fromVersion?: string; changeDescription?: string },
  ): Promise<TemplateRecord> {
    const response = await apiClient.post(`${this.getBaseUrl(organizationId)}/${id}/versions`, dto);
    return this.mapTemplate(response.data);
  }

  /**
   * Set the default version (the one new forms/generated docs resolve to).
   */
  async setDefaultVersion(organizationId: string, id: string, version: string): Promise<TemplateRecord> {
    const response = await apiClient.post(`${this.getBaseUrl(organizationId)}/${id}/default-version`, { version });
    return this.mapTemplate(response.data);
  }

  /**
   * Delete an archived version from the template's history.
   */
  async deleteVersion(organizationId: string, id: string, version: string): Promise<TemplateRecord> {
    const response = await apiClient.delete(`${this.getBaseUrl(organizationId)}/${id}/versions/${version}`);
    return this.mapTemplate(response.data);
  }

  /**
   * Generate a PDF from a document-kind template's blocks. Returns a Blob.
   * Mirrors generatePdf (blob response, caller-driven feedback).
   */
  async generateDocument(
    organizationId: string,
    id: string,
    payload: { title?: string; blocks: unknown[]; version?: string; headerText?: string; footerText?: string },
  ): Promise<Blob> {
    const response = await apiClient.post(
      `${this.getBaseUrl(organizationId)}/${id}/generate`,
      payload,
      {
        responseType: 'blob',
        timeout: 60000,
        _skipSuccessNotification: true,
        _skipErrorNotification: true,
      } as never,
    );
    return response.data as Blob;
  }

  /**
   * Dry-run the exact `{ title, blocks }` payload `generateDocument` renders
   * (no PDF). Resolves with `{ ok: true }` or rejects with a 422 whose body
   * carries `errors: [{ instanceId, message, fix }]`.
   */
  async validateDocument(
    organizationId: string,
    id: string,
    payload: { title?: string; blocks: unknown[]; version?: string },
  ): Promise<{ ok: boolean; errors: unknown[] }> {
    const response = await apiClient.post(
      `${this.getBaseUrl(organizationId)}/${id}/validate`,
      payload,
      {
        _skipSuccessNotification: true,
        _skipErrorNotification: true,
      } as never,
    );
    return response.data as { ok: boolean; errors: unknown[] };
  }

  /** Normalize a raw backend template payload into a TemplateRecord. */
  private mapTemplate(template: any): TemplateRecord {
    return {
      ...template,
      id: template._id || template.id,
      createdAt: template.createdAt ? new Date(template.createdAt).getTime() : Date.now(),
      updatedAt: template.updatedAt ? new Date(template.updatedAt).getTime() : Date.now(),
    };
  }
}

export const templatesService = new TemplatesService();
