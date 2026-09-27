import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { TemplateRecord } from '../../context/TemplateStoreProvider';
import {
  templatesService,
  type TemplateVersionSnapshot,
} from '../../services/templates.service';
import { FillTemplatePage } from './FillTemplatePage';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../context/toast', () => ({
  useToast: () => ({ show: showToast }),
}));
vi.mock('../../services/templates.service', () => ({
  templatesService: {
    findOne: vi.fn(),
    listVersions: vi.fn(),
    getVersion: vi.fn(),
    generatePdf: vi.fn(),
  },
}));

const template: TemplateRecord = {
  id: 'template',
  name: 'Invoice',
  description: '',
  kind: 'form',
  version: 'v2.0',
  createdAt: 0,
  updatedAt: 0,
  canvas: {
    size: { width: 595, height: 842 },
    components: [
      {
        id: 'text',
        kind: 'text',
        page: 0,
        x: 20,
        y: 20,
        width: 200,
        height: 30,
        rotation: 0,
        content: 'Customer: {{customer}}',
        fontSize: 12,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        color: '#000000',
        align: 'left',
        lineHeight: 1.2,
      },
    ],
  },
  fields: [
    { name: 'customer', type: 'text', required: true, defaultValue: 'Ada' },
    {
      name: 'quantity',
      type: 'number',
      required: true,
      groupId: 'items',
      defaultValue: '1',
    },
  ],
  groups: [
    {
      id: 'items',
      name: 'Items',
      memberIds: [],
      repeating: true,
      direction: 'column',
    },
  ],
};
const snapshot: TemplateVersionSnapshot = {
  ...template,
  kind: 'form',
  version: 'v1.0',
  fields: [
    {
      name: 'archived',
      type: 'text',
      required: true,
      defaultValue: 'Saved default',
    },
  ],
  groups: [],
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
  vi.mocked(templatesService.listVersions).mockResolvedValue([
    { version: 'v2.0', isDefault: false, isCurrent: true, createdAt: 0 },
    { version: 'v1.0', isDefault: true, isCurrent: false, createdAt: 0 },
  ]);
  vi.mocked(templatesService.getVersion).mockResolvedValue(
    structuredClone(snapshot),
  );
  vi.mocked(templatesService.generatePdf).mockResolvedValue(new Blob(['pdf']));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn().mockReturnValue('blob:pdf');
      static revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('fixed template fill modes', () => {
  it('renders checked inputs as X marks and leaves unchecked boxes empty', async () => {
    vi.mocked(templatesService.findOne).mockResolvedValue({
      ...template,
      canvas: { ...template.canvas, components: [{ ...template.canvas.components[0], content: '{{consent}}' }] },
      fields: [{ name: 'consent', type: 'checkbox', required: false }],
      groups: [],
    } as TemplateRecord);
    mount();
    const checkbox = await screen.findByLabelText('consent');
    expect(screen.queryByText('{{consent}}')).toBeNull();
    await userEvent.click(checkbox);
    expect(screen.getByText('X')).toBeTruthy();
    expect(screen.queryByText('true')).toBeNull();
    await userEvent.click(checkbox);
    expect(screen.queryByText('X')).toBeNull();
  });

  it('synchronizes form edits and JSON, renders valid edits, and submits repeating entries', async () => {
    mount();
    fireEvent.change(await screen.findByLabelText('customer'), {
      target: { value: 'Grace' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    expect(
      JSON.parse(
        (screen.getByLabelText('JSON fill values') as HTMLTextAreaElement)
          .value,
      ),
    ).toEqual({ customer: 'Grace', Items: [{ quantity: '1' }] });
    const values = {
      customer: 'Katherine',
      Items: [{ quantity: '2' }, { quantity: '3' }],
    };
    fireEvent.change(screen.getByLabelText('JSON fill values'), {
      target: { value: JSON.stringify(values) },
    });
    expect(screen.getByText('Katherine')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Form' }));
    expect((screen.getByLabelText('customer') as HTMLInputElement).value).toBe(
      'Katherine',
    );
    expect(screen.getAllByLabelText('quantity')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(templatesService.generatePdf).toHaveBeenCalledWith(
      'org',
      'template',
      values,
      'v2.0',
    );
  });

  it('retains invalid JSON across tabs and blocks stale downloads until restored', async () => {
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'JSON' }));
    fireEvent.change(screen.getByLabelText('JSON fill values'), {
      target: { value: '{' },
    });
    expect(screen.getByRole('alert').textContent).toContain('Fix the JSON');
    expect(
      (
        screen.getByRole('button', {
          name: 'Download PDF',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'API' }));
    expect(
      (
        screen.getByRole('button', {
          name: 'Send request & download PDF',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Review JSON' }));
    expect(
      (screen.getByLabelText('JSON fill values') as HTMLTextAreaElement).value,
    ).toBe('{');
    await userEvent.click(
      screen.getByRole('button', { name: 'Restore last valid JSON' }),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(templatesService.generatePdf).not.toHaveBeenCalled();
  });

  it.each([
    ['null', 'JSON object'],
    ['[]', 'JSON object'],
    ['{"customer":42}', 'customer must be a string'],
    ['{"Items":{}}', 'Items must be an array'],
    ['{"Items":[null]}', 'Items[0] must be an object'],
    ['{"Items":[{"quantity":2}]}', 'Items[0].quantity must be a string'],
    ['{"typo":"Ada"}', 'Unknown field or group'],
  ])('rejects incompatible JSON: %s', async (json, message) => {
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'JSON' }));
    fireEvent.change(screen.getByLabelText('JSON fill values'), {
      target: { value: json },
    });
    expect(screen.getByRole('alert').textContent).toContain(message);
    expect(
      (
        screen.getByRole('button', {
          name: 'Download PDF',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('reports missing fields for valid JSON before submitting', async () => {
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'JSON' }));
    fireEvent.change(screen.getByLabelText('JSON fill values'), {
      target: { value: '{}' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Items[].quantity'),
      }),
    );
    expect(templatesService.generatePdf).not.toHaveBeenCalled();
  });

  it('copies a versioned API payload and sends a test request using the current session', async () => {
    const user = userEvent.setup();
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText');
    mount();
    await user.click(await screen.findByRole('button', { name: 'API' }));
    await user.click(screen.getByRole('button', { name: 'Copy Request body' }));
    expect(JSON.parse(clipboard.mock.calls[0][0])).toEqual({
      values: { customer: 'Ada', Items: [{ quantity: '1' }] },
      version: 'v2.0',
    });
    await user.click(
      screen.getByRole('button', { name: 'Copy POST endpoint' }),
    );
    expect(clipboard.mock.calls[1][0]).toMatch(
      /\/organizations\/org\/templates\/template\/generate-pdf$/,
    );
    await user.click(
      screen.getByRole('button', { name: 'Send request & download PDF' }),
    );
    expect(templatesService.generatePdf).toHaveBeenCalledWith(
      'org',
      'template',
      { customer: 'Ada', Items: [{ quantity: '1' }] },
      'v2.0',
    );
  });

  it('waits for an archived default and initializes all modes from that snapshot', async () => {
    let resolve!: (value: TemplateVersionSnapshot) => void;
    vi.mocked(templatesService.findOne).mockResolvedValue({
      ...template,
      defaultVersion: 'v1.0',
    });
    vi.mocked(templatesService.getVersion).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    mount();
    await screen.findByText('Loading version v1.0…');
    expect(
      (
        screen.getByRole('button', {
          name: 'Download PDF',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await act(async () => resolve(snapshot));
    expect(
      ((await screen.findByLabelText('archived')) as HTMLInputElement).value,
    ).toBe('Saved default');
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(templatesService.generatePdf).toHaveBeenCalledWith(
      'org',
      'template',
      { archived: 'Saved default' },
      'v1.0',
    );
  });

  it('discards a pending snapshot after switching back to current', async () => {
    let resolve!: (value: TemplateVersionSnapshot) => void;
    vi.mocked(templatesService.getVersion).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    mount();
    await screen.findByLabelText('customer');
    await userEvent.click(screen.getByTitle('Fill from a specific version'));
    await userEvent.click(screen.getByRole('button', { name: /v1.0/ }));
    await screen.findByText('Loading version v1.0…');
    await userEvent.click(screen.getByTitle('Fill from a specific version'));
    await userEvent.click(
      screen.getByRole('button', { name: /v2.0.*current/ }),
    );
    await act(async () => resolve(snapshot));
    await screen.findByLabelText('customer');
    expect(screen.queryByLabelText('archived')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(templatesService.generatePdf).toHaveBeenCalledWith(
      'org',
      'template',
      expect.objectContaining({ customer: 'Ada' }),
      'v2.0',
    );
  });

  it('keeps failed snapshot requests blocked until the user chooses current', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(templatesService.findOne).mockResolvedValue({
      ...template,
      defaultVersion: 'v1.0',
    });
    vi.mocked(templatesService.getVersion).mockRejectedValue(
      new Error('unavailable'),
    );
    mount();
    await screen.findByRole('alert');
    expect(
      (
        screen.getByRole('button', {
          name: 'Download PDF',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await userEvent.click(
      screen.getByRole('button', { name: 'Use current version' }),
    );
    await screen.findByLabelText('customer');
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(templatesService.generatePdf).toHaveBeenCalledWith(
      'org',
      'template',
      expect.anything(),
      'v2.0',
    );
  });

  it('shows backend validation details returned as a blob', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const blob = new Blob();
    blob.text = async () =>
      JSON.stringify({ errors: ['customer is required.'] });
    vi.mocked(templatesService.generatePdf).mockRejectedValue({
      response: { data: blob },
    });
    mount();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Download PDF' }),
    );
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'customer is required.' }),
      ),
    );
  });

  it('imports JSON and does not overwrite later edits with a pending file read', async () => {
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'JSON' }));
    const file = new File([''], 'values.json', { type: 'application/json' });
    file.text = async () =>
      JSON.stringify({ customer: 'Imported', Items: [{ quantity: '4' }] });
    fireEvent.change(screen.getByLabelText('Import JSON'), {
      target: { files: [file] },
    });
    await screen.findByText('Imported');
    let resolve!: (text: string) => void;
    file.text = () =>
      new Promise((done) => {
        resolve = done;
      });
    fireEvent.change(screen.getByLabelText('Import JSON'), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText('JSON fill values'), {
      target: { value: '{"customer":"New edit"}' },
    });
    await act(async () => resolve('{"customer":"Stale import"}'));
    expect(screen.getByText('New edit')).toBeTruthy();
    expect(screen.queryByText('Stale import')).toBeNull();
  });

  it('prefills generation prompts from JSON and keeps confirmed values in the API payload', async () => {
    vi.mocked(templatesService.findOne).mockResolvedValue({
      ...template,
      fields: [
        ...template.fields,
        {
          name: 'reference',
          type: 'text',
          required: true,
          askOnGenerate: true,
        },
      ],
    });
    const user = userEvent.setup();
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText');
    mount();
    await user.click(await screen.findByRole('button', { name: 'JSON' }));
    fireEvent.change(screen.getByLabelText('JSON fill values'), {
      target: {
        value: JSON.stringify({
          customer: 'Ada',
          Items: [{ quantity: '1' }],
          reference: 'REF-10',
        }),
      },
    });
    await user.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(
      ((await screen.findByLabelText('reference')) as HTMLInputElement).value,
    ).toBe('REF-10');
    fireEvent.change(screen.getByLabelText('reference'), {
      target: { value: 'REF-11' },
    });
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(templatesService.generatePdf).toHaveBeenCalledWith(
      'org',
      'template',
      expect.objectContaining({ reference: 'REF-11' }),
      'v2.0',
    );
    await user.click(screen.getByRole('button', { name: 'API' }));
    await user.click(screen.getByRole('button', { name: 'Copy Request body' }));
    expect(JSON.parse(clipboard.mock.calls[0][0]).values.reference).toBe(
      'REF-11',
    );
  });
});
