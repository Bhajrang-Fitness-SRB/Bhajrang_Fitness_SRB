import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { ArrowLeft, Radio, X, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getDescriptor, loadFaceApi, matchDescriptor, type FaceCandidate } from '../lib/faceApi';

const DEVICE_KEY = 'rbf_kiosk_device_id';
const GOODBYE_LINES = [
  'Great session — see you next time, {name}!',
  'Well done today, {name}. Rest, hydrate, and come back strong.',
  "That's how champions train, {name}. Goodbye for now!",
  'Solid effort, {name}. See you soon!',
];

function speak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* speech not available on this device */ }
}

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); }
  return id;
}

type Mode = 'idle' | 'qr' | 'face';

/**
 * Kiosk with three ways in: typed Warrior ID, QR pass, and face scan.
 * Every check-in goes through kiosk_scan_device, so only staff-approved devices can punch members in or out.
 */
export function Kiosk({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [alertLevel, setAlertLevel] = useState<'ok' | 'warn' | 'danger'>('ok');
  const [logs, setLogs] = useState<{ id: string; name: string; action: string; time: string }[]>([]);
  const [mode, setMode] = useState<Mode>('idle');
  const [camError, setCamError] = useState('');
  const [faceStatus, setFaceStatus] = useState('');
  const [approved, setApproved] = useState<boolean | null>(null);
  const [deviceId] = useState(getDeviceId);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const runRef = useRef(0); // bumped on every stop so stale loops exit
  const lockUntilRef = useRef(0);
  const candidatesRef = useRef<FaceCandidate[]>([]);
  const candidatesAtRef = useRef(0);
  const approvedRef = useRef<boolean | null>(null);
  approvedRef.current = approved;

  // Register this device and keep checking until staff approve it.
  useEffect(() => {
    let alive = true;
    let t: number | undefined;
    const check = async () => {
      const { data, error } = await supabase.rpc('kiosk_register_device', {
        p_device_id: deviceId,
        p_device_name: `Kiosk ${navigator.platform || ''}`.trim().slice(0, 60),
      });
      if (!alive) return;
      const ok = !error && data === true;
      setApproved(ok);
      if (!ok) t = window.setTimeout(check, 15000);
    };
    void check();
    return () => { alive = false; if (t) window.clearTimeout(t); };
  }, [deviceId]);

  const stopAll = useCallback(() => {
    runRef.current += 1;
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setMode('idle');
    setFaceStatus('');
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  const processId = useCallback(async (rawId: string) => {
    const id = rawId.trim().toUpperCase();
    if (!id) return false;
    if (!approvedRef.current) {
      setMessage('THIS DEVICE IS NOT APPROVED YET · ASK STAFF'); setAlertLevel('warn'); setCode('');
      return false;
    }
    const { data, error } = await supabase.rpc('kiosk_scan_device', { p_device_id: deviceId, p_member_id: id });
    if (error) {
      const denied = /not approved/i.test(error.message);
      setMessage(denied ? 'THIS DEVICE IS NOT APPROVED YET · ASK STAFF' : 'SCANNER ERROR · TRY AGAIN');
      setAlertLevel(denied ? 'warn' : 'danger');
      if (denied) setApproved(false);
      setCode('');
      return false;
    }
    if (!data || !data.found) {
      setMessage('ACCESS DENIED · ID NOT FOUND'); setAlertLevel('danger'); notify('Warrior ID not found.'); setCode('');
      return false;
    }
    const name: string = data.name || data.member_id;
    const action = data.action as string;
    const isExpired = !!data.expired;

    if (action === 'ALREADY-SCANNED') {
      setAlertLevel('warn'); setMessage(`ALREADY SCANNED · ${name}`); setCode('');
      return true;
    }
    if (action === 'CHECK-IN') {
      speak(`Welcome to Bhajrang Fitness, ${name}`);
      if (isExpired) setTimeout(() => speak(`Attention. ${name}, your package has expired. Please renew at reception.`), 1600);
    } else {
      speak(GOODBYE_LINES[Math.floor(Math.random() * GOODBYE_LINES.length)].replace('{name}', name));
    }
    setAlertLevel(isExpired ? 'danger' : 'ok');
    setMessage(isExpired ? `${action} · ${name} · PACKAGE EXPIRED` : `${action} · ${name}`);
    setLogs(x => [{ id: data.member_id, name, action, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...x].slice(0, 6));
    setCode('');
    return true;
  }, [deviceId, notify]);

  const openCamera = async (facing: 'environment' | 'user') => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
    streamRef.current = stream;
    const v = videoRef.current;
    if (!v) throw new Error('video element missing');
    v.srcObject = stream;
    await v.play();
  };

  // ===== QR =====
  const startQr = async () => {
    stopAll(); setCamError('');
    const run = runRef.current;
    try {
      await openCamera('environment');
      setMode('qr');
      let last = 0;
      const loop = (t: number) => {
        if (runRef.current !== run) return;
        requestAnimationFrame(loop);
        if (t - last < 220) return;
        last = t;
        const v = videoRef.current, c = canvasRef.current;
        if (!v || !c || v.readyState !== v.HAVE_ENOUGH_DATA) return;
        c.width = v.videoWidth; c.height = v.videoHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true }); if (!ctx) return;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const res = jsQR(img.data, img.width, img.height);
        if (res?.data) { stopAll(); void processId(res.data); }
      };
      requestAnimationFrame(loop);
    } catch {
      stopAll(); setCamError('Camera unavailable — check permissions (HTTPS required), or type the Warrior ID below.');
    }
  };

  // ===== FACE =====
  const refreshCandidates = async () => {
    const { data, error } = await supabase.rpc('kiosk_list_face_descriptors', { p_device_id: deviceId });
    if (error) throw new Error(error.message);
    candidatesRef.current = (data ?? []) as FaceCandidate[];
    candidatesAtRef.current = Date.now();
  };

  const startFace = async () => {
    if (!approvedRef.current) { setCamError('This device is not approved yet — ask staff to approve it.'); return; }
    stopAll(); setCamError(''); setFaceStatus('Loading face models…');
    const run = runRef.current;
    try {
      await loadFaceApi();
      await refreshCandidates();
      if (runRef.current !== run) return;
      await openCamera('user');
      setMode('face');
      if (candidatesRef.current.length === 0) setFaceStatus('No faces enrolled yet — use the staff screen to enrol members.');
      else setFaceStatus('Look at the camera');

      let streakId = ''; let streak = 0;
      const tick = async () => {
        if (runRef.current !== run) return;
        try {
          const v = videoRef.current;
          if (v && v.readyState === v.HAVE_ENOUGH_DATA && Date.now() > lockUntilRef.current) {
            if (Date.now() - candidatesAtRef.current > 5 * 60 * 1000) await refreshCandidates().catch(() => {});
            const desc = await getDescriptor(v);
            if (runRef.current !== run) return;
            if (!desc) { streakId = ''; streak = 0; }
            else {
              const m = matchDescriptor(desc, candidatesRef.current);
              if (!m) { streakId = ''; streak = 0; setFaceStatus('Face not recognised — try the QR or Warrior ID'); }
              else {
                streak = m.memberId === streakId ? streak + 1 : 1; streakId = m.memberId;
                setFaceStatus(`Verifying… ${m.name ?? m.memberId}`);
                if (streak >= 2) { // same person on two consecutive checks
                  lockUntilRef.current = Date.now() + 6000; streak = 0; streakId = '';
                  await processId(m.memberId);
                  setFaceStatus('Look at the camera');
                }
              }
            }
          }
        } catch (e) { console.error('Face tick failed', e); }
        if (runRef.current === run) timerRef.current = window.setTimeout(tick, 600);
      };
      timerRef.current = window.setTimeout(tick, 600);
    } catch (e) {
      stopAll();
      setCamError(e instanceof Error && /face|model|library/i.test(e.message)
        ? e.message
        : 'Face camera unavailable — check permissions (HTTPS required), or use another method.');
    }
  };

  const submit = async (e: FormEvent) => { e.preventDefault(); await processId(code); };
  const cameraOn = mode !== 'idle';

  return <main className="kiosk"><div className="kiosk-inner">
    <div className="kiosk-head"><div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <span className="status-dot"><i className="dot" /> {approved === null ? 'CONNECTING' : approved ? 'SCANNER READY' : 'AWAITING STAFF APPROVAL'}</span>
      <button className="button ghost" onClick={() => { stopAll(); onBack(); }}><ArrowLeft size={15} /> Exit</button>
    </div></div>
    <div className="scan-box">
      <p className="kicker">BHAJRANG AI KIOSK // GATE 01</p>
      <h1 className="title">Scan to enter.</h1>
      <p className="sub">Present your QR pass, use face scan, or type your Warrior ID.</p>
      {approved === false && <p className="kiosk-warn" style={{ fontSize: 12, lineHeight: 1.6 }}>This device must be approved by staff before it can check members in. Device ID: <b>{deviceId.slice(0, 8)}</b></p>}
      <div className="scan-frame" style={{ overflow: 'hidden', position: 'relative' }}>
        <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: cameraOn ? 'block' : 'none', transform: mode === 'face' ? 'scaleX(-1)' : undefined }} />
        {!cameraOn && <><div className="scan-line" /><Radio size={48} strokeWidth={1} /></>}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
      <button type="button" className="button ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: 14 }} onClick={() => mode === 'qr' ? stopAll() : void startQr()}>
        {mode === 'qr' ? <><X size={15} /> Stop camera</> : <><Zap size={15} /> Scan QR with camera</>}
      </button>
      <button type="button" className="button ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: 14, borderColor: 'var(--cyan)', color: 'var(--cyan)' }} onClick={() => mode === 'face' ? stopAll() : void startFace()}>
        {mode === 'face' ? <><X size={15} /> Stop face scan</> : <>Face scan</>}
      </button>
      {faceStatus && <p className="sub" style={{ fontSize: 12, marginTop: -4 }}>{faceStatus}</p>}
      {camError && <p className="error" style={{ fontSize: 12, marginTop: -6, marginBottom: 14 }}>{camError}</p>}
      <form onSubmit={submit}><input autoFocus className="kiosk-input" value={code} onChange={e => setCode(e.target.value)} placeholder="WARRIOR ID" /></form>
      {message && <p className={alertLevel === 'danger' ? 'error' : alertLevel === 'warn' ? 'kiosk-warn' : 'success'} style={{ fontSize: 13, letterSpacing: '.08em', marginTop: 20 }}>{message}</p>}
      <div className="log-list" style={{ textAlign: 'left' }}>
        {logs.length > 0 && <p className="eyebrow" style={{ margin: '18px 0 0' }}>Live action log</p>}
        {logs.map(x => <div className="log" key={x.id + x.time}><span><b>{x.name}</b> · {x.action}</span><span>{x.time}</span></div>)}
      </div>
    </div></div></main>;
}
