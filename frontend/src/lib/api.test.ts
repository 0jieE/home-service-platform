import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStorage } from '@/auth/tokenStorage';
import { api, authClient, refreshAccessToken, setAuthFailureHandler } from './api';

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  const response = { data, status, statusText: String(status), headers: {}, config };
  if (status >= 400) {
    return Promise.reject(new AxiosError(`HTTP ${status}`, String(status), config, null, response));
  }
  return Promise.resolve(response);
}

const authHeader = (c: InternalAxiosRequestConfig) => AxiosHeaders.from(c.headers).get('Authorization');

describe('auth refresh interceptor', () => {
  let refreshCalls: number;
  let originalApiAdapter: typeof api.defaults.adapter;
  let originalAuthAdapter: typeof authClient.defaults.adapter;

  beforeEach(() => {
    refreshCalls = 0;
    originalApiAdapter = api.defaults.adapter;
    originalAuthAdapter = authClient.defaults.adapter;
    localStorage.clear();
    tokenStorage.setTokens('expired-access', 'refresh-1');

    // token endpoint: slow, so concurrent 401s overlap
    authClient.defaults.adapter = (async (config) => {
      refreshCalls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return respond(config, 200, { access: 'fresh-access', refresh: 'refresh-2' });
    }) as AxiosAdapter;

    // API: 401 unless the fresh token is used
    api.defaults.adapter = (async (config) =>
      authHeader(config) === 'Bearer fresh-access'
        ? respond(config, 200, { ok: true, url: config.url })
        : respond(config, 401, { detail: 'Token expired' })) as AxiosAdapter;
  });

  afterEach(() => {
    api.defaults.adapter = originalApiAdapter;
    authClient.defaults.adapter = originalAuthAdapter;
    setAuthFailureHandler(null);
    tokenStorage.clear();
  });

  it('refreshes once for many concurrent 401s and retries each request', async () => {
    const results = await Promise.all([api.get('/a/'), api.get('/b/'), api.get('/c/'), api.post('/d/', {})]);
    expect(refreshCalls).toBe(1);
    expect(results.map((r) => r.data.url)).toEqual(['/a/', '/b/', '/c/', '/d/']);
    expect(tokenStorage.getAccess()).toBe('fresh-access');
    expect(tokenStorage.getRefresh()).toBe('refresh-2'); // rotation
  });

  it('shares the in-flight promise between direct callers', async () => {
    const [a, b] = await Promise.all([refreshAccessToken(), refreshAccessToken()]);
    expect(a).toBe('fresh-access');
    expect(b).toBe('fresh-access');
    expect(refreshCalls).toBe(1);
  });

  it('does not retry forever when the refreshed token is also rejected', async () => {
    api.defaults.adapter = ((config) => respond(config, 401, { detail: 'nope' })) as AxiosAdapter;
    await expect(api.get('/x/')).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshCalls).toBe(1);
  });

  it('clears tokens and notifies when refresh fails', async () => {
    const onFail = vi.fn();
    setAuthFailureHandler(onFail);
    authClient.defaults.adapter = ((config) => {
      refreshCalls += 1;
      return respond(config, 401, { detail: 'Token is blacklisted' });
    }) as AxiosAdapter;
    await expect(Promise.all([api.get('/a/'), api.get('/b/')])).rejects.toBeTruthy();
    expect(refreshCalls).toBe(1);
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(tokenStorage.getAccess()).toBeNull();
    expect(tokenStorage.getRefresh()).toBeNull();
  });

  it('attaches the current access token', async () => {
    tokenStorage.setTokens('fresh-access', 'refresh-1');
    const res = await api.get('/me/');
    expect(res.data.ok).toBe(true);
    expect(refreshCalls).toBe(0);
  });
});
