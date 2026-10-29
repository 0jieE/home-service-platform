import { useEffect, useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { isOnline, subscribeConnectivity } from '@/lib/connectivity';

/** "A new version is available" toast while an updated service worker is waiting. */
export function PwaUpdater() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;
    const id = toast('A new version is available', {
      duration: Infinity,
      action: { label: 'Reload', onClick: () => void updateServiceWorker(true) },
    });
    return () => {
      toast.dismiss(id);
    };
  }, [needRefresh, updateServiceWorker]);

  return null;
}

export function useOnline() {
  return useSyncExternalStore(subscribeConnectivity, isOnline, () => true);
}

/** Small banner above the bottom bar when the device has no connection. No cached or fake data is shown in its place. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl bg-pine-900 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg lg:bottom-6"
    >
      <WifiOff className="size-4 shrink-0 text-sun-400" aria-hidden="true" />
      You’re offline. Bookings and recommendations need internet.
    </div>
  );
}
