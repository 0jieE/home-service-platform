import { afterEach, describe, expect, it, vi } from 'vitest';
import { backoffDelay, isSocketConnected, ReconnectingSocket, WS_CLOSE_UNAUTHORIZED } from './ws';

class FakeSocket {
  static instances: FakeSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }
  close() {}
}

afterEach(() => {
  FakeSocket.instances = [];
  vi.useRealTimers();
});

describe('backoffDelay', () => {
  it('grows exponentially and is capped', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    expect(backoffDelay(0, 1000, 30000)).toBe(1000);
    expect(backoffDelay(3, 1000, 30000)).toBe(8000);
    expect(backoffDelay(10, 1000, 30000)).toBe(30000);
    vi.restoreAllMocks();
  });
});

describe('ReconnectingSocket', () => {
  it('connects with the token, parses messages and reconnects after a drop', () => {
    vi.useFakeTimers();
    const onMessage = vi.fn();
    const s = new ReconnectingSocket({
      path: '/bookings/',
      getToken: () => 'tok',
      onUnauthorized: () => Promise.resolve('tok'),
      onMessage,
      WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    });
    s.start();
    const first = FakeSocket.instances[0]!;
    expect(first.url).toMatch(/\/bookings\/\?token=tok$/);
    first.onopen?.();
    expect(isSocketConnected()).toBe(true);
    first.onmessage?.({ data: JSON.stringify({ type: 'booking.updated', booking_id: 1 }) });
    expect(onMessage).toHaveBeenCalledWith({ type: 'booking.updated', booking_id: 1 });
    first.onclose?.({ code: 1006 });
    expect(isSocketConnected()).toBe(false);
    vi.advanceTimersByTime(31_000);
    expect(FakeSocket.instances).toHaveLength(2);
    s.stop();
  });

  it('refreshes the token on 4401 and reconnects', async () => {
    let token = 'old';
    const s = new ReconnectingSocket({
      path: '/bookings/',
      getToken: () => token,
      onUnauthorized: async () => {
        token = 'new';
        return token;
      },
      onMessage: () => {},
      WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    });
    s.start();
    FakeSocket.instances[0]!.onclose?.({ code: WS_CLOSE_UNAUTHORIZED });
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[1]!.url).toMatch(/token=new$/);
    s.stop();
  });
});
