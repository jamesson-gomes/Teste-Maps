import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Tier 1: Global Google Maps JS auth & tile quota listeners (must register before React mount)
(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  window.dispatchEvent(new CustomEvent('gmp-auth-failure'));
};

const origError = console.error;
console.error = (...args: unknown[]) => {
  origError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
  if (msg.includes('ApiProjectMapError') || msg.includes('RefererNotAllowedMapError') || msg.includes('InvalidKeyMapError')) {
    window.dispatchEvent(new CustomEvent('gmp-map-error', { detail: { message: msg } }));
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
