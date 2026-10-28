/**
 * Access token lives in memory only; the refresh token persists in localStorage
 * so a reload can silently restore the session.
 */
const REFRESH_KEY = 'sp.refresh';

let accessToken: string | null = null;
type Listener = (access: string | null) => void;
const listeners = new Set<Listener>();

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const tokenStorage = {
  getAccess: () => accessToken,
  getRefresh: () => storage()?.getItem(REFRESH_KEY) ?? null,
  setTokens(access: string, refresh?: string | null) {
    accessToken = access;
    if (refresh) storage()?.setItem(REFRESH_KEY, refresh);
    listeners.forEach((l) => l(accessToken));
  },
  clear() {
    accessToken = null;
    storage()?.removeItem(REFRESH_KEY);
    listeners.forEach((l) => l(null));
  },
  /** Notified whenever the access token changes (login, refresh, logout). */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
