import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetInstallStore, startInstallCapture } from './installStore';
import { usePwaInstall } from './usePwaInstall';

const CHROME_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

function setUserAgent(ua: string) {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ua);
}

function setStandalone(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed') {
  const e = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string; platform: string }>;
  };
  e.prompt = vi.fn().mockResolvedValue(undefined);
  e.userChoice = Promise.resolve({ outcome, platform: 'web' });
  act(() => {
    window.dispatchEvent(e);
  });
  return e;
}

describe('usePwaInstall', () => {
  beforeEach(() => {
    resetInstallStore();
    setStandalone(false);
  });
  afterEach(() => vi.restoreAllMocks());

  it('is hidden on browsers that cannot install', () => {
    setUserAgent(CHROME_UA);
    startInstallCapture();
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.mode).toBeNull();
  });

  it('offers the real prompt after beforeinstallprompt, then hides once accepted', async () => {
    setUserAgent(CHROME_UA);
    startInstallCapture();
    const { result } = renderHook(() => usePwaInstall());
    const e = fireBeforeInstallPrompt('accepted');
    expect(result.current.mode).toBe('prompt');

    await act(async () => {
      expect(await result.current.promptInstall()).toBe('accepted');
    });
    expect(e.prompt).toHaveBeenCalledOnce();
    expect(result.current.mode).toBeNull();
  });

  it('hides after the appinstalled event', () => {
    setUserAgent(CHROME_UA);
    startInstallCapture();
    const { result } = renderHook(() => usePwaInstall());
    fireBeforeInstallPrompt('dismissed');
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current.mode).toBeNull();
  });

  it('shows Add to Home Screen steps on iPhone Safari', () => {
    setUserAgent(IPHONE_UA);
    startInstallCapture();
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.mode).toBe('ios');
  });

  it('is hidden when already running standalone', () => {
    setUserAgent(IPHONE_UA);
    setStandalone(true);
    startInstallCapture();
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.mode).toBeNull();
  });
});
