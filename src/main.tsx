import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { isConfigured, supabase } from './lib/supabase';

// Report browser errors (max 5 per visit) so the nightly agent can spot recurring bugs.
let reported = 0;
const report = (message: string) => {
  if (reported >= 5) return;
  reported++;
  void supabase.rpc('log_client_error', { p_source: 'web', p_message: message, p_context: window.location.pathname }).then(() => undefined, () => undefined);
};
const where = (f?: string, l?: number) => (f ? ` @ ${f.replace(window.location.origin, '').slice(0, 60)}${l ? ':' + l : ''}` : '');
window.addEventListener('error', (e) => {
  if (e.message === 'Script error.' && !e.filename) return; // cross-site script (no details available); nothing to act on
  report((e.message || 'Unknown error') + where(e.filename, e.lineno));
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason as { message?: string; name?: string; stack?: string } | string | undefined;
  const text = typeof r === 'string' ? r : r?.message || r?.name || '';
  if (!text) return; // empty rejection with no information (e.g. a cancelled camera prompt)
  report(`${text}${typeof r === 'object' && r?.stack ? ' | ' + r.stack.split('\n')[1]?.trim().slice(0, 80) : ''}`);
});

const box: React.CSSProperties = { minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#080b12', color: '#f4f1e8', fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' };

function SetupNeeded() {
  return <div style={box}><div style={{ maxWidth: 460 }}>
    <h1 style={{ color: '#f5c451' }}>Almost ready</h1>
    <p>This copy of the app is not connected to a database yet.</p>
    <p style={{ opacity: .8 }}>Set <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_ANON_KEY</b> in your hosting settings (or in the <b>.env</b> file), then build again. Step-by-step: <b>INSTALL.md</b>.</p>
  </div></div>;
}

/** One broken screen must never freeze the whole app: show a Reload button instead of a blank page. */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: Error, info: ErrorInfo) { report(`${e.message} @ ${(info.componentStack || '').split('\n')[1]?.trim() || ''}`); }
  render() {
    return this.state.failed
      ? <div style={box}><div><h2>Something went wrong</h2><p style={{ opacity: .8 }}>Your data is safe. Reload to continue.</p>
          <button style={{ padding: '10px 22px', borderRadius: 10, border: 0, background: '#f5c451', fontWeight: 700 }} onClick={() => location.reload()}>Reload</button></div></div>
      : this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(<StrictMode>{isConfigured ? <Guard><App /></Guard> : <SetupNeeded />}</StrictMode>);

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
