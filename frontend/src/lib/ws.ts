import { useSyncExternalStore } from 'react';
import { env } from './env';

// ---------- Connection status store (drives the polling fallback) ----------
let connected = false;
const statusListeners = new Set<() => void>();

function setConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  statusListeners.forEach((l) => l());
}

export function isSocketConnected() {
  return connected;
}

export function useSocketConnected(): boolean {
  return useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb);
      return () => {
        statusListeners.delete(cb);
      };
    },
    () => connected,
    () => false,
  );
}

// ---------- Reconnecting socket ----------
export const WS_CLOSE_UNAUTHORIZED = 4401;

export interface ReconnectingSocketOptions {
  path: string;
  getToken: () => string | null;
  /** Called on close code 4401; should resolve with a fresh access token (or reject to give up). */
  onUnauthorized: () => Promise<string>;
  onMessage: (data: unknown) => void;
  baseDelayMs?: number;
  maxDelayMs?: number;
  WebSocketImpl?: typeof WebSocket;
}

/** Exponential backoff with jitter: base·2^attempt, capped. */
export function backoffDelay(attempt: number, base = 1000, max = 30_000): number {
  const exp = Math.min(max, base * 2 ** attempt);
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

export class ReconnectingSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private readonly opts: ReconnectingSocketOptions;

  constructor(opts: ReconnectingSocketOptions) {
    this.opts = opts;
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.onopen = null;
      try {
        ws.close(1000, 'client stop');
      } catch {
        /* ignore */
      }
    }
    setConnected(false);
  }

  /** Reconnect immediately, e.g. after the access token was refreshed. */
  restart() {
    if (this.stopped) return;
    this.stop();
    this.stopped = false;
    this.attempt = 0;
    this.connect();
  }

  private connect() {
    if (this.stopped || this.ws) return;
    const token = this.opts.getToken();
    if (!token) {
      this.scheduleReconnect();
      return;
    }
    const Impl = this.opts.WebSocketImpl ?? WebSocket;
    const url = `${env.wsBaseUrl}${this.opts.path}?token=${encodeURIComponent(token)}`;
    let ws: WebSocket;
    try {
      ws = new Impl(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      setConnected(true);
    };
    ws.onmessage = (ev) => {
      try {
        this.opts.onMessage(JSON.parse(String(ev.data)));
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onerror = () => {
      /* onclose follows */
    };
    ws.onclose = (ev) => {
      this.ws = null;
      setConnected(false);
      if (this.stopped) return;
      if (ev.code === WS_CLOSE_UNAUTHORIZED) {
        this.opts
          .onUnauthorized()
          .then(() => {
            this.attempt = 0;
            this.connect();
          })
          .catch(() => this.scheduleReconnect());
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    const delay = backoffDelay(this.attempt, this.opts.baseDelayMs, this.opts.maxDelayMs);
    this.attempt += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }
}
