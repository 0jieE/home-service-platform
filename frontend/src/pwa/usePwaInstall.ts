import { useSyncExternalStore } from 'react';
import { getSnapshot, isIos, promptInstall, subscribe } from './installStore';

export type InstallMode =
  /** Chrome / Edge / Android: the browser's own install prompt. */
  | 'prompt'
  /** iPhone / iPad: show Share → Add to Home Screen steps. */
  | 'ios'
  /** Already installed, or the browser can't install it: hide the button. */
  | null;

export function usePwaInstall() {
  const { deferred, installed } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const mode: InstallMode = installed ? null : deferred ? 'prompt' : isIos() ? 'ios' : null;
  return { mode, promptInstall };
}
