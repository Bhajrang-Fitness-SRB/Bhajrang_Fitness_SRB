import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { supabase } from './lib/supabase';

// Report browser errors (max 5 per visit) so the nightly agent can spot recurring bugs.
let reported = 0;
const report = (message: string) => {
  if (reported >= 5) return;
  reported++;
  void supabase.rpc('log_client_error', { p_source: 'web', p_message: message, p_context: window.location.pathname }).then(() => undefined, () => undefined);
};
window.addEventListener('error', (e) => report(e.message || 'Unknown error'));
window.addEventListener('unhandledrejection', (e) => report(String((e.reason && (e.reason.message || e.reason)) || 'Unhandled rejection')));

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // If a new service worker takes control (i.e. we just updated), reload once
      // so the page picks up the new app shell instead of staying on the old one.
      let refreshed = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshed) return;
        refreshed = true;
        window.location.reload();
      });
      reg.update();
    });
  });
}
