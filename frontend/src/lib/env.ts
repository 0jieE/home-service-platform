const trimSlash = (s: string) => s.replace(/\/+$/, '');

/** Browsers block ws:// from an https:// page, so upgrade a misconfigured production URL to wss://. */
const secureWs = (url: string) =>
  typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('ws://')
    ? `wss://${url.slice('ws://'.length)}`
    : url;

export const env = {
  apiBaseUrl: trimSlash(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'),
  wsBaseUrl: secureWs(trimSlash(import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8000/ws')),
  googleMapsApiKey: (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim(),
  googleMapsMapId: (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID').trim(),
  isDev: import.meta.env.DEV,
} as const;

export const TIMEZONE = 'Asia/Manila';
/** Fallbacks used until `/config/` loads (values from docs/API_CONTRACT.md). */
export const DEFAULT_CITY_CENTER = { lat: 7.0083, lng: 125.0894 };
export const DEFAULT_BLOCK_MINUTES = 120;
export const DEFAULT_STEP_MINUTES = 30;
