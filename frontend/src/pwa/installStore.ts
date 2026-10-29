/**
 * Install-prompt state, captured at module load (imported from main.tsx) so the
 * `beforeinstallprompt` event isn't missed while React is still mounting.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface InstallSnapshot {
  /** Deferred Chrome/Edge/Android prompt, if the browser offered one. */
  deferred: BeforeInstallPromptEvent | null;
  /** Running as an installed app, or installed during this session. */
  installed: boolean;
}

const listeners = new Set<() => void>();
let snapshot: InstallSnapshot = { deferred: null, installed: false };

function set(next: Partial<InstallSnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
}

/** iPhone/iPad (incl. iPadOS reporting as Mac): no `beforeinstallprompt`, install via Share → Add to Home Screen. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

let started = false;
export function startInstallCapture() {
  if (started || typeof window === 'undefined') return;
  started = true;
  snapshot = { ...snapshot, installed: isStandalone() };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep the mini-infobar away; our button triggers the prompt
    set({ deferred: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => set({ deferred: null, installed: true }));
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', (e) => {
    if (e.matches) set({ installed: true });
  });
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): InstallSnapshot {
  return snapshot;
}

/** Shows the deferred browser prompt. The event can be used once, so it is cleared either way. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = snapshot.deferred;
  if (!e) return 'unavailable';
  await e.prompt();
  const { outcome } = await e.userChoice;
  set({ deferred: null, installed: outcome === 'accepted' || snapshot.installed });
  return outcome;
}

/** Test helper. */
export function resetInstallStore() {
  snapshot = { deferred: null, installed: false };
  started = false;
  listeners.forEach((l) => l());
}
