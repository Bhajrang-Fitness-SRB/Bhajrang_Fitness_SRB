import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, MapPin, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { pickToken } from '../lib/gateToken';

type Member = { member_id: string; name: string | null };
type Result =
  | { ok: true; action: 'checked_in' | 'checked_out' | 'already_recorded'; at: string; distance_m: number; member: { member_id: string; name: string | null; package: string | null; expiry_date: string | null; days_left: number | null; expired: boolean; due: number; visits_this_month: number } }
  | { ok: false; reason: string; message: string };

const when = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export function GateScan({ member, passcode, notify }: { member: Member; passcode: string; notify: (m: string) => void }) {
  const [step, setStep] = useState<'idle' | 'scanning' | 'locating' | 'sending' | 'done'>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const started = useRef(false);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  // Ask the phone for its position (up to 12 s, keeping the most precise reading), then let the database decide.
  const submit = useCallback(async (token: string) => {
    setStep('locating'); setResult(null);
    if (!navigator.geolocation) { setResult({ ok: false, reason: 'no_location', message: 'This phone or browser cannot share its location.' }); setStep('done'); return; }
    const pos = await new Promise<GeolocationPosition | GeolocationPositionError>((resolve) => {
      let best: GeolocationPosition | null = null;
      const finish = (v: GeolocationPosition | GeolocationPositionError) => { navigator.geolocation.clearWatch(id); window.clearTimeout(timer); resolve(v); };
      const id = navigator.geolocation.watchPosition(
        (p) => { if (!best || p.coords.accuracy < best.coords.accuracy) best = p; if (p.coords.accuracy <= 12) finish(p); },
        (e) => { if (best) finish(best); else finish(e); },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
      );
      const timer = window.setTimeout(() => { if (best) finish(best); }, 7000);
    });
    if (!('coords' in pos)) {
      setResult({ ok: false, reason: 'no_location', message: pos.code === 1 ? 'Location is blocked. Allow location for this site in your browser settings, then scan again.' : 'Could not get your location. Go near the entrance, turn on precise location and try again.' });
      setStep('done'); return;
    }
    setStep('sending');
    const { data, error } = await supabase.rpc('member_gate_scan', { p_member_id: member.member_id, p_passcode: passcode, p_token: token, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude, p_accuracy_m: pos.coords.accuracy });
    if (error || !data) { setResult({ ok: false, reason: 'error', message: 'Could not reach the gym system. Check your internet and try again.' }); setStep('done'); return; }
    setResult(data as Result); setStep('done');
    if ((data as Result).ok) notify('Attendance recorded.');
  }, [member.member_id, passcode, notify]);

  // Opened from the phone's camera app: the link carries ?g=CODE. Run once, then clean the address bar.
  useEffect(() => {
    if (started.current) return;
    const g = new URLSearchParams(window.location.search).get('g');
    const token = g ? pickToken(`?g=${g}`) : null;
    if (!token) return;
    started.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    void submit(token);
  }, [submit]);

  const startScan = async () => {
    setResult(null);
    if (!navigator.mediaDevices?.getUserMedia) { notify('Camera is not available here. Use your phone camera app to scan the QR instead.'); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      stream.current = s; setStep('scanning');
      await new Promise((r) => setTimeout(r, 50));
      const v = video.current; if (!v) { stopCamera(); return; }
      v.srcObject = s; await v.play();
      const { default: jsQR } = await import('jsqr');
      const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let last = 0;
      const tick = (t: number) => {
        if (!stream.current) return;
        if (t - last > 120 && v.videoWidth && ctx) {
          last = t; const scale = Math.min(1, 480 / v.videoWidth); canvas.width = Math.round(v.videoWidth * scale); canvas.height = Math.round(v.videoHeight * scale);
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
          const token = code ? pickToken(code.data) : null;
          if (token) { stopCamera(); void submit(token); return; }
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    } catch {
      stopCamera(); setStep('idle');
      notify('Could not open the camera. Allow camera access, or scan the QR with your phone camera app.');
    }
  };

  const busy = step === 'locating' || step === 'sending';
  const good = result?.ok === true;
  return <div className="card" style={{ marginBottom: 18 }}>
    <div className="card-title"><MapPin size={15} color="var(--gold)" /> Gym attendance</div>
    {step === 'idle' && <>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>At the gym, scan the QR on the entrance screen to check in or out. You must be at the gym, with location switched on.</p>
      <button className="button primary" onClick={() => void startScan()}><Camera size={14} /> Scan gym QR</button>
    </>}
    {step === 'scanning' && <>
      <video ref={video} playsInline muted style={{ width: '100%', maxHeight: 320, borderRadius: 12, background: '#000', objectFit: 'cover' }} />
      <p className="muted" style={{ fontSize: 12, margin: '8px 0' }}>Point the camera at the QR code on the gym screen.</p>
      <button className="button ghost" onClick={() => { stopCamera(); setStep('idle'); }}>Cancel</button>
    </>}
    {busy && <p style={{ margin: 0 }}>{step === 'locating' ? 'Finding your location… stay near the entrance.' : 'Recording your attendance…'}</p>}
    {step === 'done' && result && <>
      {result.ok ? <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={34} color="var(--gold)" />
          <div><div style={{ fontSize: 20, fontWeight: 700 }}>{result.action === 'checked_out' ? 'Checked out' : result.action === 'already_recorded' ? 'Already recorded' : 'Checked in'} · {when(result.at)}</div>
            <div className="muted" style={{ fontSize: 13 }}>{result.member.name ?? result.member.member_id} · {result.member.member_id}</div></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginTop: 12, fontSize: 13 }}>
          <div><span className="muted">Package</span><br /><b>{result.member.package ?? '-'}</b></div>
          <div><span className="muted">Valid till</span><br /><b style={{ color: result.member.expired ? '#ff6b6b' : undefined }}>{result.member.expiry_date ?? '-'}</b>
            {result.member.days_left != null && <span className="muted"> ({result.member.expired ? `${Math.abs(result.member.days_left)} days ago` : `${result.member.days_left} days left`})</span>}</div>
          <div><span className="muted">Gym days this month</span><br /><b>{result.member.visits_this_month}</b></div>
          <div><span className="muted">Payment due</span><br /><b style={{ color: result.member.due > 0 ? '#ff6b6b' : undefined }}>₹{result.member.due.toLocaleString('en-IN')}</b></div>
        </div>
        {result.member.expired && <p style={{ color: '#ff6b6b', margin: '10px 0 0', fontSize: 13 }}>Your membership has expired. Please renew at the desk.</p>}
      </> : <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <XCircle size={30} color="#ff6b6b" style={{ flex: 'none' }} /><div><b>Not recorded</b><div style={{ fontSize: 14, marginTop: 4 }}>{result.message}</div></div>
      </div>}
      <button className="button ghost" style={{ marginTop: 12 }} onClick={() => { setResult(null); setStep('idle'); }}>{good ? 'Done' : 'Try again'}</button>
    </>}
  </div>;
}
