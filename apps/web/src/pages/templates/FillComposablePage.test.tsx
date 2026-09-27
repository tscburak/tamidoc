import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { TemplateRecord } from '../../context/TemplateStoreProvider';
import { DEFAULT_PREVIEW_THEME } from '../../components/composable/blockCatalog';
import { templatesService } from '../../services/templates.service';
import { FillTemplatePage } from './FillTemplatePage';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../context/toast', () => ({
  useToast: () => ({ show: showToast }),
}));
vi.mock('../../services/templates.service', () => ({
  templatesService: {
    findOne: vi.fn(),
    getVersion: vi.fn(),
    generateDocument: vi.fn(),
  },
}));

const template: TemplateRecord = {
  id: 'template',
  name: 'Guide',
  description: '',
  kind: 'document',
  version: 'v2.0',
  defaultVersion: 'v1.0',
  createdAt: 0,
  updatedAt: 0,
  canvas: { size: { width: 595, height: 842 }, components: [] },
  fields: [],
  groups: [],
  documentConfig: {
    format: 'document',
    pageSize: 'A4',
    theme: DEFAULT_PREVIEW_THEME,
    allowedBlocks: ['code'],
  },
  blocks: [],
};
const snapshot = {
  version: 'v1.0',
  kind: 'document' as const,
  canvas: template.canvas,
  documentConfig: { ...template.documentConfig!, allowedBlocks: ['paragraph'] },
  blocks: [
    {
      id: 'section',
      type: 'section',
      inputs: {
        blocks: [
          { id: 'one', type: 'paragraph', inputs: { text: 'Saved paragraph' } },
          {
            id: 'two',
            type: 'paragraph',
            inputs: { text: 'Second paragraph' },
          },
        ],
      },
    },
  ],
};

function mount() {
  return render(
    <MemoryRouter initialEntries={['/o/org/templates/template/fill']}>
      <Routes>
        <Route
          path="/o/:organizationId/templates/:id/fill"
          element={<FillTemplatePage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(templatesService.findOne).mockResolvedValue(
    structuredClone(template),
  );
  vi.mocked(templatesService.getVersion).mockResolvedValue(
    structuredClone(snapshot),
  );
  vi.mocked(templatesService.generateDocument).mockResolvedValue(new Blob(['pdf']));
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn().mockReturnValue('blob:document');
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('composable fill workflow', () => {
  it('loads a direct URL, hydrates the default snapshot, and uses its allowlist and version', async () => {
    mount();
    await screen.findByRole('button', { name: /Saved paragraph/ });
    expect(templatesService.findOne).toHaveBeenCalledWith('org', 'template');
    expect(templatesService.getVersion).toHaveBeenCalledWith(
      'org',
      'template',
      'v1.0',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add block' }));
    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Paragraph'),
        expect.stringContaining('Section'),
      ]),
    );
    expect(screen.queryByRole('menuitem', { name: /Code/ })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Generate PDF' }));
    expect(templatesService.generateDocument).toHaveBeenCalledWith(
      'org',
      'template',
      { title: 'Guide', blocks: snapshot.blocks, version: 'v1.0' },
    );
  });

  it('reorders and duplicates nested blocks through the inspector', async () => {
    mount();
    await userEvent.click(
      await screen.findByRole('button', { name: /Second paragraph/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Move up' }));
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await userEvent.click(screen.getByRole('button', { name: 'Generate PDF' }));
    const payload = vi.mocked(templatesService.generateDocument).mock
      .calls[0][2];
    const kids = (payload.blocks as typeof snapshot.blocks)[0].inputs.blocks;
    expect(kids.map((b) => b.inputs.text)).toEqual([
      'Second paragraph',
      'Second paragraph',
      'Saved paragraph',
    ]);
    expect(new Set(kids.map((b) => b.id)).size).toBe(3);
  });

  it('discards generation errors after the content changes', async () => {
    let rejectValidation!: (error: unknown) => void;
    vi.mocked(templatesService.generateDocument).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectValidation = reject;
        }),
    );
    mount();
    await userEvent.click(
      await screen.findByRole('button', { name: /Saved paragraph/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Generate PDF' }));
    await userEvent.type(screen.getByLabelText(/Text/), ' edited');
    await act(async () =>
      rejectValidation({
        response: {
          data: {
            errors: [
              { instanceId: 'one', message: 'Stale issue', fix: 'Fix it' },
            ],
          },
        },
      }),
    );
    await waitFor(() => expect(screen.queryByText('Validating…')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('keeps owner text locked and lets fillers change, reset, and clear editable defaults', async () => {
    vi.mocked(templatesService.getVersion).mockResolvedValue({
      ...snapshot, documentConfig: { ...snapshot.documentConfig, theme: {
        ...DEFAULT_PREVIEW_THEME,
        header: { enabled: true, text: 'Company name', editable: false },
        footer: { enabled: true, text: 'Default contact', editable: true },
      } },
    });
    mount();
    const header = await screen.findByLabelText('Header text') as HTMLInputElement;
    const footer = screen.getByLabelText('Footer text') as HTMLInputElement;
    expect(header.readOnly).toBe(true);
    expect(header.value).toBe('Company name');
    expect(footer.value).toBe('Default contact');
    expect(screen.queryByRole('button', { name: 'Validate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'PDF preview' })).toBeNull();
    await userEvent.clear(footer);
    await userEvent.type(footer, 'New contact');
    await userEvent.click(screen.getByRole('button', { name: 'Reset footer to default' }));
    expect(footer.value).toBe('Default contact');
    await userEvent.clear(footer);
    await userEvent.click(screen.getByRole('button', { name: 'Generate PDF' }));
    expect(templatesService.generateDocument).toHaveBeenCalledWith('org', 'template', {
      title: 'Guide', blocks: snapshot.blocks, version: 'v1.0', footerText: '',
    });
  });
});
