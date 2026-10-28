import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { env } from './env';
import { tokenStorage } from '@/auth/tokenStorage';

/** Main client: attaches the access token and transparently refreshes on 401. */
export const api = axios.create({
  baseURL: env.apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
  // DRF filters expect repeated keys: ?status=a&status=b
  paramsSerializer: { indexes: null },
});

/** Bare client for token endpoints, so refresh calls never recurse through the interceptor. */
export const authClient = axios.create({
  baseURL: env.apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

let onAuthFailure: (() => void) | null = null;
/** Registered by AuthProvider: called once a refresh definitively fails. */
export function setAuthFailureHandler(handler: (() => void) | null) {
  onAuthFailure = handler;
}

let refreshPromise: Promise<string> | null = null;

/**
 * Single-flight refresh: concurrent callers share one POST /auth/token/refresh/.
 * Rotation is on, so the returned refresh token replaces the old one.
 */
export function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  const refresh = tokenStorage.getRefresh();
  if (!refresh) return Promise.reject(new Error('No refresh token'));
  refreshPromise = authClient
    .post<{ access: string; refresh?: string }>('/auth/token/refresh/', { refresh })
    .then(({ data }) => {
      tokenStorage.setTokens(data.access, data.refresh ?? refresh);
      return data.access;
    })
    .catch((err: unknown) => {
      tokenStorage.clear();
      onAuthFailure?.();
      throw err;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.getAccess();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

type RetriableConfig = AxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    if (error.response?.status === 401 && original && !original._retry && tokenStorage.getRefresh()) {
      original._retry = true;
      try {
        const access = await refreshAccessToken();
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${access}` };
        return api.request(original);
      } catch {
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);
