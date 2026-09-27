import { afterEach, expect, it, vi } from 'vitest';
import apiClient from '../lib/api';
import { apiKeysService } from './api-keys.service';

const originalAdapter = apiClient.defaults.adapter;
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
});

it('does not log one-time API key secrets through the shared development interceptor', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const secret = 'tdk_test-secret-that-must-not-be-logged';
  apiClient.defaults.adapter = (config) =>
    Promise.resolve({
      config,
      status: 201,
      statusText: 'Created',
      headers: {},
      data: { success: true, data: { key: { id: 'key' }, secret } },
    });
  const response = await apiKeysService.create('org', {
    name: 'CRM',
    permissions: ['template:generate'],
  });
  expect(response.secret).toBe(secret);
  expect(log).not.toHaveBeenCalled();
});
