import { useEffect, useState } from 'react';
import { Copy, Download, MessageCircle, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIPEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIPEvent; window.dispatchEvent(new Event('rbf-install-ready')); });
  window.addEventListener('appinstalled', () => { deferred = null; window.dispatchEvent(new Event('rbf-install-ready')); });
}
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const APPS = [
  { key: 'warrior', title: 'Warrior App', path: '/warrior', who: 'For gym members', note: 'Gate pass, membership, workouts, rule book, fines.' },
  { key: 'staff', title: 'Staff App', path: '/', who: 'For trainers & reception', note: 'Members, approvals, attendance, billing, fines.' },
  { key: 'admin', title: 'Admin App', path: '/villain', who: 'For the owner only', note: 'Full control: reports, settings, AI agent.' },
  { key: 'kiosk', title: 'Kiosk App', path: '/kiosk', who: 'For the entrance tablet', note: 'Face-scan and QR check-in.' },
] as const;

const TITLES: Record<string, string> = { '/warrior': 'Warrior App', '/': 'Staff App', '/villain': 'Admin App', '/kiosk': 'Kiosk App' };

/** Small bar offering "Install app" on the page the person is using. */
export function InstallBanner({ path }: { path: string }) {
  const [, force] = useState(0);
  const [hidden, setHidden] = useState(() => localStorage.getItem('rbf_install_dismissed_' + path) === '1');
  useEffect(() => { const f = () => force(n => n + 1); window.addEventListener('rbf-install-ready', f); return () => window.removeEventListener('rbf-install-ready', f); }, []);
  useEffect(() => { setHidden(localStorage.getItem('rbf_install_dismissed_' + path) === '1'); }, [path]);
  if (!TITLES[path] || hidden || isStandalone()) return null;
  const canPrompt = !!deferred; const ios = isIOS();
  if (!canPrompt && !ios) return null;
  const dismiss = () => { localStorage.setItem('rbf_install_dismissed_' + path, '1'); setHidden(true); };
  return <div style={{ position: 'fixed', left: 10, right: 10, bottom: 10, zIndex: 60, background: '#101827', border: '1px solid var(--gold)', borderRadius: 14, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 30px #000a' }}>
    <Smartphone size={20} style={{ color: 'var(--gold)', flexShrink: 0 }} />
    <div style={{ flex: 1, fontSize: 13 }}><b>Install {TITLES[path]}</b><div className="muted" style={{ fontSize: 11 }}>{canPrompt ? 'Add it to your home screen — opens like a normal app.' : 'Tap Share, then “Add to Home Screen”.'}</div></div>
    {canPrompt && <button className="button primary" style={{ padding: '6px 12px' }} onClick={async () => { await deferred?.prompt(); deferred = null; force(n => n + 1); }}>Install</button>}
    <button className="button ghost" style={{ padding: '6px 10px' }} onClick={dismiss} aria-label="Dismiss">✕</button>
  </div>;
}

/** /install — one page to share: pick an app, scan the QR or send the link. */
export function InstallHub({ notify }: { notify: (m: string) => void }) {
  const origin = window.location.origin;
  const copy = async (url: string) => { try { await navigator.clipboard.writeText(url); notify('Link copied.'); } catch { notify(url); } };
  return <main style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px 60px' }}>
    <p className="eyebrow">Bhajrang Fitness</p><h1 className="title">Get the apps</h1>
    <p className="sub">Open the link on a phone or tablet and tap <b>Install</b> (Android / Chrome) or <b>Share → Add to Home Screen</b> (iPhone / Safari). Each app gets its own icon.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 16, marginTop: 20 }}>
      {APPS.map(a => { const url = origin + a.path; const msg = `Install the Bhajrang Fitness ${a.title}: ${url}`; return <div key={a.key} className="card" style={{ textAlign: 'center' }}>
        <img src={`/brand/icon-${a.key}-192.png`} alt="" width={84} height={84} style={{ borderRadius: 20 }} />
        <h3 style={{ margin: '10px 0 2px' }}>{a.title}</h3><div style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 600 }}>{a.who}</div>
        <p className="muted" style={{ fontSize: 12, minHeight: 34 }}>{a.note}</p>
        <div style={{ background: '#fff', padding: 8, borderRadius: 10, display: 'inline-block' }}><QRCodeSVG value={url} size={112} /></div>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <a className="button primary" style={{ justifyContent: 'center' }} href={a.path}><Download size={14} /> Open &amp; install</a>
          <a className="button ghost" style={{ justifyContent: 'center' }} href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle size={14} /> Send on WhatsApp</a>
          <button className="button ghost" style={{ justifyContent: 'center' }} onClick={() => void copy(url)}><Copy size={14} /> Copy link</button>
        </div></div>; })}
    </div>
  </main>;
}
