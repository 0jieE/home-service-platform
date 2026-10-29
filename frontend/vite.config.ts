/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

const PINE = '#143426'; // brand dark green (headers, status bar)
const CANVAS = '#eaf0e8'; // app background

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // The API may live on another origin (Render). Workbox serializes route matchers into sw.js
  // without their closure, so the API origin is baked into a RegExp rather than captured.
  const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const apiOrigin = env.VITE_API_BASE_URL ? new URL(env.VITE_API_BASE_URL).origin : null;
  const networkOnly = [
    /^https?:\/\/[^/]+\/api\//, // any /api/ path, same origin or not
    ...(apiOrigin ? [new RegExp(`^${escape(apiOrigin)}/`)] : []),
  ];

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false, // registered from React (useRegisterSW) so updates can show a toast
        strategies: 'generateSW',
        includeManifestIcons: false, // icons are already matched by globPatterns below
        manifest: {
          name: 'Kidapawan Home Service',
          short_name: 'KHS',
          description: 'Find and book nearby home service technicians in Kidapawan City',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          theme_color: PINE,
          background_color: CANVAS,
          lang: 'en',
          icons: [
            { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            {
              name: 'Find a technician',
              short_name: 'Find',
              url: '/c/find',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'My bookings',
              short_name: 'Bookings',
              url: '/c/bookings',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
        },
        workbox: {
          // App shell only: built JS/CSS/HTML, icons and local SVGs. No API data is ever precached.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'], // the manifest is added by the plugin
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/, /^\/ws/, /^\/django-admin/, /^\/static/],
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          runtimeCaching: [
            // API and auth: always the network, never a cache (also covers a cross-origin API host).
            // Only GET is routed by Workbox; POST/PATCH/DELETE are never intercepted at all.
            ...networkOnly.map((urlPattern) => ({ urlPattern, handler: 'NetworkOnly' as const })),
            // Web fonts (Google Fonts CSS + files) for the shell; versioned URLs, safe to keep.
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // Google Maps (maps.googleapis.com / maps.gstatic.com) deliberately has no route:
            // the service worker ignores it and the browser fetches it normally.
            // WebSockets are never intercepted by service workers.
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5173, strictPort: true },
    preview: { port: 5173, strictPort: true },
    build: {
      chunkSizeWarningLimit: 900,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
