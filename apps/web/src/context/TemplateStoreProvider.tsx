import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Color } from '../components/ui';
import type { CanvasComponent, ComponentGroup } from '../components/designer';
import type { CanvasSize } from '../components/designer';
import { templatesService } from '../services/templates.service';

/** A fillable form field. Name comes from a {{token}} (or image slot); type and
 * required are configured by the author. `groupId` ties the field to a
 * repeating group (array-valued). */
export interface TemplateField {
  name: string;
  type: string;
  required: boolean;
  groupId?: string;
  // Per-field metadata for fill-time UX
  defaultValue?: string;
  placeholder?: string;
  info?: string;
  section?: string;
  options?: string[];
  defaultToday?: boolean;
  /** Read-only at fill time (prefilled with defaultValue, not editable). */
  disabled?: boolean;
  /** Hidden from the filler; PDF still carries it filled with defaultValue. */
  visible?: boolean;
  /** Hidden from the filler; the form owner is prompted for the value when
   *  generating/downloading the document (scalar fields only). */
  askOnGenerate?: boolean;
}

export interface TemplateCanvas {
  size: CanvasSize;
  components: CanvasComponent[];
  pageBackgrounds?: string[]; // data URLs per page (PDF import). Bloats the in-memory store.
}

export interface TemplateRecord {
  id: string;
  name: string;
  category?: string;
  description: string;
  canvas: TemplateCanvas;
  groups: ComponentGroup[];
  fields: TemplateField[];
  /** epoch ms — drives sort order & "updated" labels. */
  createdAt: number;
  updatedAt: number;
  /** Display-only accent / version. */
  color?: Color;
  version?: string;
  /** Version new forms/generated docs resolve to. */
  defaultVersion?: string;
  /** Human description of the current version. */
  versionDescription?: string;
  /** Published/archived/draft status */
  status?: 'draft' | 'published' | 'archived';
  /** Org tags attached to this template. */
  tags?: string[];
  /** Optional role whitelist controlling template access. */
  allowedRoleIds?: string[];
  /** Template kind: 'form' (Fixed-layout Template, default) or 'document' (Composable Template, flow blocks). */
  kind?: 'form' | 'document';
  /** Document-kind only: 'document' (flow) or 'slides' (deck). */
  format?: 'document' | 'slides';
  /** Document-kind only: allowed blocks + theme (author-defined schema). */
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
    sections?: Array<{ id: string; name: string; description?: string; blocks: DocBlock[] }>;
    /**
     * Template-level per-component default styles:
     * `{ [componentKey]: { styles: { color?, background?, fontSize? } } }`.
     */
    componentDefaults?: Record<string, { styles: { color?: string; background?: string; fontSize?: '' | 'xs' | 'sm' | 'base' | 'lg' | 'xl' } }>;
  };
  /** Document-kind only: the author's composed starting document. */
  blocks?: DocBlock[];
}

/** A composable document block: discriminated type + type-specific inputs. */
export interface DocBlock {
  id: string;
  type: string;
  inputs: Record<string, unknown>;
  children?: DocBlock[];
  pageBreak?: boolean;
}

export interface TemplateStoreApi {
  templates: TemplateRecord[];
  loading: boolean;
  error: string | null;
  refreshTemplates: () => Promise<void>;
  /** Upsert: if `id` matches an existing record it is updated, otherwise a new
   * one is created. Returns the saved record (with its final id). */
  saveTemplate: (rec: Partial<TemplateRecord> & { name: string; canvas: TemplateCanvas }) => Promise<TemplateRecord>;
  getTemplate: (id: string) => TemplateRecord | undefined;
  removeTemplate: (id: string) => Promise<void>;
}

const TemplateStoreContext = createContext<TemplateStoreApi | null>(null);

/**
 * Client-side template store with API integration. Fetches templates from the
 * backend and provides CRUD operations. Mirrors the Toast provider pattern.
 */
export function TemplateStoreProvider({
  children,
  organizationId,
}: {
  children: ReactNode;
  organizationId: string;
}) {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch templates from API
  const refreshTemplates = useCallback(async () => {
    if (!organizationId) return;

    try {
      setLoading(true);
      setError(null);
      const response = await templatesService.findAll(organizationId, {
        status: undefined, // Get all templates (draft, published, archived)
      });
      setTemplates(response.templates);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
      setError('Failed to load templates. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  // Initial fetch
  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates]);

  const saveTemplate = useCallback<TemplateStoreApi['saveTemplate']>(async (rec) => {
    if (!organizationId) throw new Error('Organization ID is required');

    try {
      // Remove id from the request data (backend generates it)
      const { id, category, ...restData } = rec;
      const requestData = {
        ...restData,
        category: category || 'general' // Provide default category
      };

      if (rec.id) {
        // Update existing template
        const updated = await templatesService.update(organizationId, rec.id, requestData);
        setTemplates((prev) =>
          prev.map((t) => (t.id === updated.id ? updated : t))
        );
        return updated;
      } else {
        // Create new template
        const created = await templatesService.create(organizationId, requestData);
        setTemplates((prev) => [created, ...prev]);
        return created;
      }
    } catch (err) {
      console.error('Failed to save template:', err);
      throw err;
    }
  }, [organizationId]);

  const getTemplate = useCallback((id: string) => {
    return templates.find((t) => t.id === id);
  }, [templates]);

  const removeTemplate = useCallback(async (id: string) => {
    if (!organizationId) throw new Error('Organization ID is required');

    try {
      await templatesService.remove(organizationId, id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error('Failed to delete template:', err);
      throw err;
    }
  }, [organizationId]);

  return (
    <TemplateStoreContext.Provider value={{
      templates,
      loading,
      error,
      refreshTemplates,
      saveTemplate,
      getTemplate,
      removeTemplate,
    }}>
      {children}
    </TemplateStoreContext.Provider>
  );
}

export function useTemplateStore(): TemplateStoreApi {
  const ctx = useContext(TemplateStoreContext);
  if (!ctx) throw new Error('useTemplateStore must be used within a TemplateStoreProvider');
  return ctx;
}
