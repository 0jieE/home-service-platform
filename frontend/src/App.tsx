import { lazy, Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/auth/AuthProvider';
import { MapsProvider } from '@/components/map/MapsProvider';
import { env } from '@/lib/env';
import { queryClient } from '@/lib/queryClient';
import { OfflineBanner, PwaUpdater } from '@/pwa/PwaStatus';
import { router } from './router';

const Devtools = env.isDev
  ? lazy(() => import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })))
  : () => null;

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MapsProvider>
          <RouterProvider router={router} />
        </MapsProvider>
      </AuthProvider>
      <Toaster position="top-center" richColors closeButton duration={6000} />
      <OfflineBanner />
      <PwaUpdater />
      <Suspense fallback={null}>
        <Devtools buttonPosition="bottom-left" />
      </Suspense>
    </QueryClientProvider>
  );
}
