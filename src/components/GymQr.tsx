import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, RefreshCw, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';

type Status = { is_owner: boolean; location_set: boolean; radius_ft: number; max_accuracy_m: number; updated_at: string; scans_today: number; ok_today: number };
type Recent = { at: string; member_id: string | null; name: string | null; ok: boolean; reason: string; distance_m: number | null; accuracy_m: number | null };
type Fix = { lat: number; lng: number; accuracy: number };

const reasonText: Record<string, string> = {
  checked_in: 'Checked in', checked_out: 'Checked out', already_recorded: 'Scanned twice', bad_login: 'Wrong ID or passcode', bad_token: 'Old QR code',
  too_far: 'Too far away', weak_gps: 'Weak GPS', no_location: 'No location shared', not_set_up: 'Not set up',
};

export function GymQr({ passcode, notify }: { passcode: string; notify: (m: string) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [img, setImg] = useState('');
  const [secs, setSecs] = useState(0);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [radius, setRadius] = useState('20');
  const [maxAcc, setMaxAcc] = useState('30');
  const [busy, setBusy] = useState(false);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  const loadStatus = useCallback(async () => {
    setFailed(false);
    const { data, error } = await supabase.rpc('admin_gate_status', { p_passcode: passcode });
    if (error || !data) { setFailed(true); return; }
    const s = data as Status; setStatus(s); setRadius(String(s.radius_ft)); setMaxAcc(String(s.max_accuracy_m));
  }, [passcode]);
  const loadRecent = useCallback(async () => {
    const { data } = await supabase.rpc('admin_gate_recent', { p_passcode: passcode, p_limit: 25 });
    if (Array.isArray(data)) setRecent(data as Recent[]);
  }, [passcode]);
  useEffect(() => { void loadStatus(); void loadRecent(); }, [loadStatus, loadRecent]);

  // The QR changes every minute. Ask for a fresh code every 25 seconds so the screen never shows an old one.
  const loadToken = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_gate_token', { p_passcode: passcode });
    if (error || !data) return;
    const d = data as { token: string; seconds_left: number };
    const url = `${window.location.origin}/warrior?g=${d.token}`;
    setImg(await QRCode.toDataURL(url, { margin: 2, width: 420, errorCorrectionLevel: 'M' }));
    setSecs(d.seconds_left);
  }, [passcode]);
  useEffect(() => {
    if (!status?.location_set) return;
    void loadToken();
    const a = window.setInterval(() => void loadToken(), 25000);
    const b = window.setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    const c = window.setInterval(() => void loadRecent(), 20000);
    return () => { window.clearInterval(a); window.clearInterval(b); window.clearInterval(c); };
  }, [status?.location_set, loadToken, loadRecent]);

  // keep the tablet screen awake while the QR is showing (where the phone supports it)
  useEffect(() => {
    let off = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    void nav.wakeLock?.request('screen').then((l) => { if (off) void l.release(); else wake.current = l; }).catch(() => undefined);
    return () => { off = true; void wake.current?.release().catch(() => undefined); };
  }, []);

  // Take readings for ~10 seconds and keep the most precise one.
  const locate = () => {
    if (!navigator.geolocation) { notify('This phone or browser cannot share its location.'); return; }
    setLocating(true); setFix(null);
    let best: Fix | null = null;
    const id = navigator.geolocation.watchPosition(
      (p) => { const f = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }; if (!best || f.accuracy < best.accuracy) { best = f; setFix(f); } },
      () => { navigator.geolocation.clearWatch(id); setLocating(false); notify('Could not get the location. Allow location access for this site, and turn on precise location.'); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
    window.setTimeout(() => { navigator.geolocation.clearWatch(id); setLocating(false); }, 10000);
  };
  const save = async () => {
    if (!fix) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_gate_set_location', { p_passcode: passcode, p_lat: fix.lat, p_lng: fix.lng, p_radius_ft: Number(radius), p_max_accuracy_m: Number(maxAcc) });
    setBusy(false);
    if (error) { notify(error.message || 'Could not save.'); return; }
    notify('Gym location saved.'); setFix(null); void loadStatus();
  };

  const owner = !!status?.is_owner;
  return <>
    <div className="page-head"><div>
      <p className="eyebrow">Attendance</p><h1 className="title">Gym QR</h1>
      <p className="sub">Show this screen at the entrance. Members scan it with their phone to check in or out. The code changes every minute, so a photo of it is no use later.</p>
    </div><button className="button ghost" onClick={() => { void loadStatus(); void loadRecent(); void loadToken(); }}><RefreshCw size={14} /> Refresh</button></div>

    {failed && <div className="card" style={{ marginBottom: 16 }}><b>Could not load.</b> <span className="muted">Run the Gym QR SQL step in Supabase, then press Refresh.</span></div>}

    {status && status.location_set && <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
      {img ? <img src={img} alt="Gym check-in QR code" style={{ width: 'min(420px, 80vw)', height: 'auto', background: '#fff', borderRadius: 12, padding: 6 }} /> : <div className="empty">Making the code…</div>}
      <p style={{ margin: '10px 0 0', fontSize: 18 }}><QrCode size={16} /> Scan to check in or out</p>
      <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Changes in {secs}s · allowed distance {status.radius_ft} ft · scans today {status.ok_today} OK of {status.scans_today}</p>
    </div>}

    {status && !status.location_set && <div className="card" style={{ marginBottom: 16 }}>
      <b>Set the gym location first.</b> <span className="muted">{owner ? 'Stand where this screen will be, then use the box below.' : 'Only the owner can do this. Ask the owner to open this screen at the gym.'}</span>
    </div>}

    {status && owner && <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title"><MapPin size={15} /> Gym location (owner)</div>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>Stand next to the place where the QR screen will be, outdoors or near a door if you can. Then press the button and wait 10 seconds.</p>
      <button className="button primary" onClick={locate} disabled={locating}>{locating ? 'Reading location…' : 'Use my location now'}</button>
      {fix && <p style={{ margin: '10px 0 0' }}>Found: accuracy about <b>{Math.round(fix.accuracy)} m</b>{fix.accuracy > 20 && <span className="muted"> (weak: move outdoors and try again)</span>}</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        <label className="muted" style={{ fontSize: 12 }}>Allowed distance (feet) <input type="number" value={radius} onChange={(e) => setRadius(e.target.value)} style={{ width: 80 }} /></label>
        <label className="muted" style={{ fontSize: 12 }}>Worst GPS error accepted (metres) <input type="number" value={maxAcc} onChange={(e) => setMaxAcc(e.target.value)} style={{ width: 80 }} /></label>
        <button className="button primary" onClick={() => void save()} disabled={!fix || busy}>Save location</button>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>A phone passes when its position, allowing for its GPS error, touches the allowed distance. Phone GPS is often 5 to 15 metres off (worse indoors), so a very small distance like 20 feet can turn away honest members. If members complain, raise it to 60 to 100 feet. The list below shows how far each scan was.</p>
    </div>}

    <div className="card">
      <div className="card-title">Recent scans</div>
      {recent.length === 0 ? <div className="empty">No scans yet.</div> : recent.map((r, i) =>
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }}>
          <span>{r.name || r.member_id || 'Unknown'} <span className="muted">{new Date(r.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span></span>
          <span style={{ color: r.ok ? 'var(--gold)' : undefined }}>{reasonText[r.reason] ?? r.reason}{r.distance_m != null ? ` · ${Math.round(r.distance_m)} m` : ''}{r.accuracy_m != null && r.accuracy_m < 9999 ? ` · ±${Math.round(r.accuracy_m)} m` : ''}</span>
        </div>)}
    </div>
  </>;
}
