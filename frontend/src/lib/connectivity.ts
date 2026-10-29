/**
 * Connectivity as the app experiences it: the browser's online flag, plus "the last API request got
 * no response at all". navigator.onLine alone stays true on dead Wi-Fi or captive portals.
 */
const listeners = new Set<() => void>();
let apiUnreachable = false;

function emit() {
  listeners.forEach((l) => l());
}

export function reportApiReachable(reachable: boolean) {
  if (apiUnreachable === !reachable) return;
  apiUnreachable = !reachable;
  emit();
}

export function subscribeConnectivity(cb: () => void) {
  listeners.add(cb);
  const onChange = () => {
    if (navigator.onLine) apiUnreachable = false; // give the network another chance
    cb();
  };
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function isOnline(): boolean {
  return navigator.onLine && !apiUnreachable;
}
