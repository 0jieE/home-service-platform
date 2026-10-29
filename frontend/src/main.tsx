import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { startInstallCapture } from './pwa/installStore';

// Before React renders, so an early `beforeinstallprompt` is not lost.
startInstallCapture();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
