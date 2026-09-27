import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiKeysSection } from './ApiKeysSection';
import {
  apiKeysService,
  type ApiKeySummary,
  type CreatedApiKey,
} from '../../services/api-keys.service';
import { templatesService } from '../../services/templates.service';
import type { TemplateRecord } from '../../context/TemplateStoreProvider';

const { show } = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('../../context/toast', () => ({ useToast: () => ({ show }) }));
vi.mock('../../services/api-keys.service', () => ({
  apiKeysService: { list: vi.fn(), create: vi.fn(), revoke: vi.fn() },
}));
vi.mock('../../services/templates.service', () => ({
  templatesService: { findAll: vi.fn() },
}));

const key: ApiKeySummary = {
  id: 'key',
  organizationId: 'org',
  name: 'Production CRM',
  prefix: 'tdk_0123456789abcdef',
  permissions: ['template:read', 'template:generate'],
  createdByUserId: 'owner',
  createdAt: '2026-01-01T00:00:00Z',
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
  revokedByUserId: null,
};
const secret = 'tdk_0123456789abcdef_test-secret-only';
const templates = ['Invoice', 'Letter'].map((name, index): TemplateRecord => ({
  id: `template-${index}`,
  name,
  description: '',
  createdAt: 0,
  updatedAt: 0,
  canvas: { size: { width: 595, height: 842 }, components: [] },
  groups: [],
  fields: [],
}));
beforeEach(() => {
  vi.mocked(apiKeysService.list).mockResolvedValue([]);
  vi.mocked(apiKeysService.create).mockResolvedValue({ key, secret });
  vi.mocked(apiKeysService.revoke).mockResolvedValue({
    ...key,
    revokedAt: '2026-09-16T00:00:00Z',
    revokedByUserId: 'owner',
  });
  vi.mocked(templatesService.findAll).mockResolvedValue({
    templates,
    total: 2,
    page: 1,
    limit: 100,
  });
});
afterEach(cleanup);

describe('organization API key management', () => {
  it('creates a key, copies its secret once, and clears the secret after dismissal', async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, 'writeText');
    render(<ApiKeysSection organizationId="org" />);
    await user.click(
      await screen.findByRole('button', { name: 'Create API key' }),
    );
    await user.type(screen.getByLabelText('Key name'), ' Production CRM ');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    expect(apiKeysService.create).toHaveBeenCalledWith('org', {
      name: 'Production CRM',
      permissions: ['template:read', 'template:generate'],
      expiresAt: expect.any(String),
    });
    const expiresAt = vi.mocked(apiKeysService.create).mock.calls[0][1]
      .expiresAt!;
    expect(new Date(expiresAt).getTime() - Date.now()).toBeGreaterThan(
      89 * 86400000,
    );
    expect(
      ((await screen.findByLabelText('API key')) as HTMLInputElement).value,
    ).toBe(secret);
    await user.click(screen.getByRole('button', { name: 'Copy API key' }));
    expect(copy).toHaveBeenCalledWith(secret);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByLabelText('API key')).toBeNull();
    expect(document.body.textContent).not.toContain(secret);
    expect(
      screen.getByRole('heading', { name: 'Production CRM' }),
    ).toBeTruthy();
  });

  it('creates a key restricted to selected templates and one permission', async () => {
    const user = userEvent.setup();
    render(<ApiKeysSection organizationId="org" />);
    await user.click(
      await screen.findByRole('button', { name: 'Create API key' }),
    );
    fireEvent.change(screen.getByLabelText('Key name'), {
      target: { value: 'Read integration' },
    });
    await user.click(screen.getByLabelText('Generate PDFs'));
    await user.selectOptions(screen.getByLabelText('Expiration'), 'never');
    await user.selectOptions(
      screen.getByLabelText('Template access'),
      'selected',
    );
    await user.click(await screen.findByLabelText('Invoice'));
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    expect(apiKeysService.create).toHaveBeenCalledWith('org', {
      name: 'Read integration',
      permissions: ['template:read'],
      templateIds: ['template-0'],
      expiresAt: null,
    });
  });

  it('validates names, permissions, and empty template selections before creation', async () => {
    const user = userEvent.setup();
    render(<ApiKeysSection organizationId="org" />);
    await user.click(
      await screen.findByRole('button', { name: 'Create API key' }),
    );
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    expect(screen.getByRole('alert').textContent).toContain('name');
    fireEvent.change(screen.getByLabelText('Key name'), {
      target: { value: 'Integration' },
    });
    await user.click(screen.getByLabelText('Generate PDFs'));
    await user.click(screen.getByLabelText('Read templates'));
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    expect(screen.getByRole('alert').textContent).toContain('permission');
    await user.click(screen.getByLabelText('Read templates'));
    await user.selectOptions(
      screen.getByLabelText('Template access'),
      'selected',
    );
    await screen.findByLabelText('Invoice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    expect(screen.getByRole('alert').textContent).toContain('template');
    expect(apiKeysService.create).not.toHaveBeenCalled();
  });

  it('loads all template pages instead of silently excluding later templates', async () => {
    vi.mocked(templatesService.findAll)
      .mockResolvedValueOnce({
        templates: [templates[0]],
        total: 2,
        page: 1,
        limit: 100,
      })
      .mockResolvedValueOnce({
        templates: [templates[1]],
        total: 2,
        page: 2,
        limit: 100,
      });
    const user = userEvent.setup();
    render(<ApiKeysSection organizationId="org" />);
    await user.click(
      await screen.findByRole('button', { name: 'Create API key' }),
    );
    await user.selectOptions(
      screen.getByLabelText('Template access'),
      'selected',
    );
    await screen.findByLabelText('Letter');
    expect(templatesService.findAll).toHaveBeenCalledWith(
      'org',
      expect.objectContaining({ page: 2 }),
    );
  });

  it('shows access denial without offering key creation', async () => {
    vi.mocked(apiKeysService.list).mockRejectedValue({
      response: { status: 403 },
    });
    render(<ApiKeysSection organizationId="org" />);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'owners and admins',
    );
    expect(screen.queryByRole('button', { name: 'Create API key' })).toBeNull();
  });

  it('shows revoke failures and retries without pretending the key was revoked', async () => {
    vi.mocked(apiKeysService.list).mockResolvedValue([key]);
    vi.mocked(apiKeysService.revoke).mockRejectedValueOnce({
      response: { data: { message: 'Try later' } },
    });
    const user = userEvent.setup();
    render(<ApiKeysSection organizationId="org" />);
    await user.click(
      await screen.findByRole('button', { name: 'Revoke Production CRM' }),
    );
    await user.click(screen.getByRole('button', { name: 'Revoke key' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Try later',
    );
    expect(screen.getByText('Active')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Revoke key' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      within(screen.getByRole('article')).getAllByText('Revoked'),
    ).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'Revoke Production CRM' }),
    ).toBeNull();
    expect(apiKeysService.revoke).toHaveBeenCalledWith('org', 'key');
  });

  it('prevents duplicate creation while waiting and preserves entered settings on failure', async () => {
    let reject!: (error: unknown) => void;
    vi.mocked(apiKeysService.create).mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    const user = userEvent.setup();
    render(<ApiKeysSection organizationId="org" />);
    await user.click(
      await screen.findByRole('button', { name: 'Create API key' }),
    );
    fireEvent.change(screen.getByLabelText('Key name'), {
      target: { value: 'CRM' },
    });
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    expect(
      (screen.getByRole('button', { name: 'Create key' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(async () =>
      reject({ response: { data: { message: 'Could not create' } } }),
    );
    expect(screen.getByRole('alert').textContent).toContain('Could not create');
    expect((screen.getByLabelText('Key name') as HTMLInputElement).value).toBe(
      'CRM',
    );
    expect(apiKeysService.create).toHaveBeenCalledTimes(1);
  });

  it('discards a pending creation response after switching organizations', async () => {
    let resolve!: (result: CreatedApiKey) => void;
    vi.mocked(apiKeysService.create).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const user = userEvent.setup();
    const view = render(<ApiKeysSection organizationId="org" />);
    await user.click(
      await screen.findByRole('button', { name: 'Create API key' }),
    );
    fireEvent.change(screen.getByLabelText('Key name'), {
      target: { value: 'CRM' },
    });
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    view.rerender(<ApiKeysSection organizationId="other" />);
    await act(async () => resolve({ key, secret }));
    await screen.findByText('No API keys yet');
    expect(screen.queryByLabelText('API key')).toBeNull();
    expect(screen.queryByText('Production CRM')).toBeNull();
    expect(apiKeysService.list).toHaveBeenCalledWith('other');
  });
});
