import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { ArrowLeft, Camera, KeyRound, QrCode, ScanFace, Smartphone, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { announce, isVoiceOn, lastVoiceInfo, preloadVoices, setVoiceOn, testVoice, voiceCount } from '../lib/kioskVoice';
import { getDescriptor, loadFaceApi, matchDescriptor, type FaceCandidate } from '../lib/faceApi';

const DEVICE_KEY = 'rbf_kiosk_device_id';
const MANUAL_IDLE_MS = 45000; // the manual form clears itself and returns to the QR after 45 s of nobody touching it
const RESUME_MS = 3000; // scanner pauses this long after a scan so the same pass is not read twice
const RESULT_MS = 10000; // how long the last result stays on screen

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); }
  return id;
}

type Mode = 'idle' | 'qr' | 'face';
type Level = 'ok' | 'warn' | 'danger';
type ScanResult = { found?: boolean; ok?: boolean; message?: string; member_id?: string; name?: string; profile_pic?: string | null; action?: string; expired?: boolean; days_left?: number | null; expiring_soon?: boolean; birthday?: boolean; minutes?: number | null; visits_this_month?: number | null };
type GateQr = { state: 'loading' } | { state: 'ready'; img: string; radiusFt: number } | { state: 'not_set_up' } | { state: 'unavailable' };

function Seg<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: string; icon: ReactNode }[] }) {
  return <div className="kseg" role="tablist">
    {items.map(i => <button key={i.key} type="button" role="tab" aria-selected={value === i.key} className={value === i.key ? 'on' : ''} onClick={() => onChange(i.key)}>{i.icon}{i.label}</button>)}
  </div>;
}

/**
 * Kiosk with two screens side by side, so one desk-attached tablet / phone offers every way to give attendance:
 *   LEFT  - the kiosk's own scanner:  QR pass  <->  Face scan
 *   RIGHT - for members' phones:      Gym QR (changes every minute)  <->  type Member ID / mobile + passcode
 * Every check-in goes through the database (kiosk_scan_device / kiosk_manual_checkin), so only staff-approved devices can punch members in or out.
 */
export function Kiosk({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const [message, setMessage] = useState('');
  const [alertLevel, setAlertLevel] = useState<Level>('ok');
  const [who, setWho] = useState<{ name: string; pic: string | null } | null>(null);
  const [activity, setActivity] = useState<{ present_now: number; today_visits: number; rows: { id: string; name: string; action: string; at: string }[] }>({ present_now: 0, today_visits: 0, rows: [] });
  const [voiceOn, setVoiceOnState] = useState(isVoiceOn());
  const [voiceNote, setVoiceNote] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const [scanKind, setScanKind] = useState<'qr' | 'face'>('qr');
  const [rightView, setRightView] = useState<'qr' | 'manual'>('qr');
  const [camError, setCamError] = useState('');
  const [faceStatus, setFaceStatus] = useState('');
  const [approved, setApproved] = useState<boolean | null>(null);
  const [deviceId] = useState(getDeviceId);
  const [gate, setGate] = useState<GateQr>({ state: 'loading' });
  const [secs, setSecs] = useState(0);
  const [ident, setIdent] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const runRef = useRef(0); // bumped on every stop so stale loops exit
  const lockUntilRef = useRef(0);
  const pauseUntilRef = useRef(0);
  const candidatesRef = useRef<FaceCandidate[]>([]);
  const candidatesAtRef = useRef(0);
  const approvedRef = useRef<boolean | null>(null);
  const autoStarted = useRef(false);
  const resultTimer = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const syncActivityRef = useRef<() => Promise<void>>(async () => undefined);
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

  // Keep the screen awake while the kiosk is open (where the browser allows it).
  useEffect(() => {
    let off = false;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const ask = () => { void nav.wakeLock?.request('screen').then(l => { if (off) void l.release(); else lock = l; }).catch(() => undefined); };
    ask();
    const vis = () => { if (document.visibilityState === 'visible') ask(); };
    document.addEventListener('visibilitychange', vis);
    return () => { off = true; document.removeEventListener('visibilitychange', vis); void lock?.release().catch(() => undefined); };
  }, []);

  // Gym QR for members' phones: ask for a fresh code every 25 s (it changes every minute).
  useEffect(() => {
    if (!approved) return;
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase.rpc('kiosk_gate_token', { p_device_id: deviceId });
      if (!alive) return;
      if (error || !data) { setGate({ state: 'unavailable' }); return; }
      const d = data as { token: string; seconds_left: number; location_set: boolean; radius_ft: number };
      if (!d.location_set) { setGate({ state: 'not_set_up' }); return; }
      const img = await QRCode.toDataURL(`${window.location.origin}/warrior?g=${d.token}`, { margin: 2, width: 420, errorCorrectionLevel: 'M' });
      if (!alive) return;
      setGate({ state: 'ready', img, radiusFt: d.radius_ft });
      setSecs(d.seconds_left);
    };
    void load();
    const a = window.setInterval(() => void load(), 25000);
    const b = window.setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => { alive = false; window.clearInterval(a); window.clearInterval(b); };
  }, [approved, deviceId]);

  const stopAll = useCallback(() => {
    runRef.current += 1;
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setMode('idle');
    setFaceStatus('');
  }, []);

  useEffect(() => () => {
    stopAll();
    if (resultTimer.current) window.clearTimeout(resultTimer.current);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
  }, [stopAll]);

  // Live list straight from the database: the same on every kiosk, survives a page refresh.
  const syncActivity = useCallback(async () => {
    if (!approvedRef.current) return;
    const { data, error } = await supabase.rpc('kiosk_recent_activity', { p_device_id: deviceId, p_limit: 12 });
    if (!error && data) setActivity(data as typeof activity);
  }, [deviceId]);
  syncActivityRef.current = syncActivity;
  useEffect(() => {
    if (!approved) return;
    void syncActivity();
    const t = window.setInterval(() => void syncActivity(), 8000);
    return () => window.clearInterval(t);
  }, [approved, syncActivity]);
  useEffect(() => { void preloadVoices(); }, []);

  // ---- result banner ----
  const show = useCallback((text: string, level: Level, person: { name: string; pic: string | null } | null = null) => {
    setMessage(text); setAlertLevel(level); setWho(person);
    if (resultTimer.current) window.clearTimeout(resultTimer.current);
    resultTimer.current = window.setTimeout(() => { setMessage(''); setWho(null); }, RESULT_MS);
  }, []);

  /** Shared by QR, face and manual entry: turns the database answer into the banner, voice and log. */
  const applyResult = useCallback((data: ScanResult): boolean => {
    if (!data.found) { show('ACCESS DENIED · ID NOT FOUND', 'danger'); notify('Warrior ID not found.'); return false; }
    const name: string = data.name || data.member_id || 'Member';
    const action = data.action as string;
    const isExpired = !!data.expired;
    const pic = data.profile_pic && /^(https?:|data:image)/.test(data.profile_pic) ? data.profile_pic : null;
    if (action === 'ALREADY-SCANNED') { show(`ALREADY SCANNED · ${name}`, 'warn', { name, pic }); return true; }
    announce({ action: action === 'CHECK-IN' ? 'CHECK-IN' : 'CHECK-OUT', name, expired: isExpired, days_left: data.days_left, expiring_soon: data.expiring_soon, birthday: data.birthday, minutes: data.minutes, visits_this_month: data.visits_this_month });
    show(isExpired ? `${action} · ${name} · PACKAGE EXPIRED — PLEASE RENEW` : `${action} · ${name}`, isExpired ? 'danger' : 'ok', { name, pic });
    void syncActivityRef.current();
    return true;
  }, [notify, show]);

  const notApproved = useCallback(() => { show('THIS DEVICE IS NOT APPROVED YET · ASK STAFF', 'warn'); setApproved(false); }, [show]);

  // QR pass / face scan: the member is identified by the pass or the face.
  const processId = useCallback(async (rawId: string) => {
    const id = rawId.trim().toUpperCase();
    if (!id) return false;
    if (!approvedRef.current) { show('THIS DEVICE IS NOT APPROVED YET · ASK STAFF', 'warn'); return false; }
    const { data, error } = await supabase.rpc('kiosk_scan_device', { p_device_id: deviceId, p_member_id: id });
    if (error) {
      if (/not approved/i.test(error.message)) notApproved(); else show('SCANNER ERROR · TRY AGAIN', 'danger');
      return false;
    }
    return applyResult((data ?? { found: false }) as ScanResult);
  }, [deviceId, applyResult, notApproved, show]);

  // ---- LEFT: the kiosk camera ----
  const openCamera = async (facing: 'environment' | 'user') => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
    streamRef.current = stream;
    const v = videoRef.current;
    if (!v) throw new Error('video element missing');
    v.srcObject = stream;
    await v.play();
  };

  const startQr = useCallback(async () => {
    stopAll(); setCamError(''); setScanKind('qr');
    const run = runRef.current;
    try {
      await openCamera('environment');
      setMode('qr');
      let last = 0;
      const loop = (t: number) => {
        if (runRef.current !== run) return;
        requestAnimationFrame(loop);
        if (t - last < 220 || Date.now() < pauseUntilRef.current) return;
        last = t;
        const v = videoRef.current, c = canvasRef.current;
        if (!v || !c || v.readyState !== v.HAVE_ENOUGH_DATA) return;
        c.width = v.videoWidth; c.height = v.videoHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true }); if (!ctx) return;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const res = jsQR(img.data, img.width, img.height);
        if (!res?.data) return;
        pauseUntilRef.current = Date.now() + RESUME_MS; // keep scanning afterwards, but never read the same pass twice in a row
        if (/^https?:\/\//i.test(res.data)) { show('That is the gym QR — scan it with your phone, or show your own pass here.', 'warn'); return; }
        void processId(res.data);
      };
      requestAnimationFrame(loop);
    } catch {
      stopAll(); setCamError('Camera unavailable — check permissions (HTTPS required), or use the phone QR / ID entry on the right.');
    }
  }, [stopAll, processId, show]);

  const refreshCandidates = async () => {
    const { data, error } = await supabase.rpc('kiosk_list_face_descriptors', { p_device_id: deviceId });
    if (error) throw new Error(error.message);
    candidatesRef.current = (data ?? []) as FaceCandidate[];
    candidatesAtRef.current = Date.now();
  };

  const startFace = useCallback(async () => {
    if (!approvedRef.current) { setCamError('This device is not approved yet — ask staff to approve it.'); return; }
    stopAll(); setCamError(''); setScanKind('face'); setFaceStatus('Loading face models…');
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
              if (!m) { streakId = ''; streak = 0; setFaceStatus('Face not recognised — try the QR or your ID and passcode'); }
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
  }, [stopAll, processId]);

  // A kiosk should simply work when opened: start the QR scanner as soon as the device is approved.
  useEffect(() => {
    if (approved && !autoStarted.current) { autoStarted.current = true; void startQr(); }
  }, [approved, startQr]);

  const pickScanKind = (k: 'qr' | 'face') => { if (k === 'qr') void startQr(); else void startFace(); };

  // ---- RIGHT: manual entry ----
  const clearManual = useCallback(() => { setIdent(''); setPass(''); }, []);
  const touchManual = useCallback(() => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => { clearManual(); setRightView('qr'); }, MANUAL_IDLE_MS);
  }, [clearManual]);
  const pickRight = (v: 'qr' | 'manual') => {
    setRightView(v); clearManual();
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    if (v === 'manual') touchManual();
  };

  const submitManual = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!approvedRef.current) { show('THIS DEVICE IS NOT APPROVED YET · ASK STAFF', 'warn'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('kiosk_manual_checkin', { p_device_id: deviceId, p_identifier: ident, p_passcode: pass });
    setBusy(false);
    setPass('');
    if (error) {
      if (/not approved/i.test(error.message)) notApproved();
      else show('ENTRY NOT AVAILABLE · ASK STAFF (the kiosk update may not be installed yet)', 'danger');
      return;
    }
    const r = (data ?? {}) as ScanResult;
    if (r.ok === false) { show((r.message ?? 'Not recorded.').toUpperCase(), 'danger'); touchManual(); return; }
    if (applyResult(r)) { clearManual(); setRightView('qr'); if (idleTimer.current) window.clearTimeout(idleTimer.current); }
  };

  const cameraOn = mode !== 'idle';
  const statusText = approved === null ? 'CONNECTING' : approved ? 'KIOSK READY' : 'AWAITING STAFF APPROVAL';

  return <main className="kiosk"><div className="kiosk-inner kwide">
    <div className="kiosk-head">
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <span className="status-dot"><i className="dot" /> {statusText}</span>
        <button className="button ghost" onClick={() => { stopAll(); onBack(); }}><ArrowLeft size={15} /> Exit</button>
      </div>
      <p className="kicker" style={{ margin: 0 }}>BHAJRANG AI KIOSK // GATE 01</p>
    </div>

    {approved === false && <p className="kiosk-warn" style={{ fontSize: 13, lineHeight: 1.6, textAlign: 'center', margin: '0 0 18px' }}>This device must be approved by staff before it can check members in. Device ID: <b>{deviceId.slice(0, 8)}</b></p>}

    <div className="kdual">
      {/* ========== LEFT: scanner ========== */}
      <section className="kpanel" aria-label="Kiosk scanner">
        <p className="kicker">Scan here</p>
        <h2 className="ktitle">Show your pass or face</h2>
        <Seg value={scanKind} onChange={pickScanKind} items={[
          { key: 'qr', label: 'QR pass', icon: <QrCode size={17} /> },
          { key: 'face', label: 'Face scan', icon: <ScanFace size={17} /> },
        ]} />
        <div className="kframe">
          <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: cameraOn ? 'block' : 'none', transform: mode === 'face' ? 'scaleX(-1)' : undefined }} />
          {!cameraOn && <div className="kframe-idle"><div className="kscan-line" /><Camera size={44} strokeWidth={1} /><span>Camera is off</span></div>}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
        <p className="ksub">{scanKind === 'qr' ? 'Hold the QR from your Warrior app up to the camera.' : 'Look straight at the camera. Face scan works only if you turned it on in your Warrior app.'}</p>
        {faceStatus && <p className="ksub" style={{ color: 'var(--cyan)' }}>{faceStatus}</p>}
        {camError && <p className="error" style={{ fontSize: 13, margin: '0 0 10px' }}>{camError}</p>}
        <button type="button" className="button ghost kbtn" onClick={() => cameraOn ? stopAll() : pickScanKind(scanKind)} disabled={!approved && !cameraOn}>
          {cameraOn ? <><X size={16} /> Stop camera</> : <><Camera size={16} /> Start camera</>}
        </button>
      </section>

      {/* ========== RIGHT: phone QR / manual entry ========== */}
      <section className="kpanel" aria-label="Phone check-in">
        <p className="kicker">Use your phone</p>
        <h2 className="ktitle">{rightView === 'qr' ? 'Scan this with your phone' : 'Type your ID and passcode'}</h2>
        <Seg value={rightView} onChange={pickRight} items={[
          { key: 'qr', label: 'Gym QR', icon: <Smartphone size={17} /> },
          { key: 'manual', label: 'ID / Mobile + passcode', icon: <KeyRound size={17} /> },
        ]} />

        {rightView === 'qr' && <div className="kqr">
          {approved === false && <div className="kqr-note">Waiting for staff to approve this device.</div>}
          {approved && gate.state === 'loading' && <div className="kqr-note">Making the code…</div>}
          {gate.state === 'not_set_up' && <div className="kqr-note">Phone QR is not set up yet. The owner must save the gym location in Admin → Gym QR.</div>}
          {gate.state === 'unavailable' && <div className="kqr-note">Phone QR is not available yet. Ask the owner to run the kiosk update (SQL) step.</div>}
          {gate.state === 'ready' && <>
            <img src={gate.img} alt="Gym check-in QR code" className="kqr-img" />
            <p className="ksub" style={{ margin: '12px 0 0' }}>Open your phone camera (or Warrior app → Scan gym QR) and point it here. Sign in, allow location, done. Your next scan checks you out.</p>
            <p className="ksub" style={{ margin: '4px 0 0', fontSize: 12 }}>Changes in {secs}s · you must be within {gate.radiusFt} ft of the gym</p>
          </>}
        </div>}

        {rightView === 'manual' && <form className="kform" onSubmit={e => void submitManual(e)} onInput={touchManual} autoComplete="off">
          <label>Member ID or mobile number
            <input className="kiosk-input" value={ident} onChange={e => setIdent(e.target.value)} placeholder="MEMBER ID / MOBILE" autoFocus autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text" />
          </label>
          <label>Passcode
            <input className="kiosk-input" type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••" inputMode="numeric" autoComplete="new-password" />
          </label>
          <button type="submit" className="button primary kbtn" disabled={busy || !ident.trim() || !pass.trim()}><KeyRound size={16} /> {busy ? 'Checking…' : 'Check in / out'}</button>
          <p className="ksub" style={{ margin: 0, fontSize: 12 }}>10 wrong tries block that member for 10 minutes. This form clears itself if left alone.</p>
        </form>}
      </section>
    </div>

    {message && <div className={`kresult ${alertLevel}`} role="status" aria-live="polite">
      {who?.pic && <img src={who.pic} alt="" />}
      <span>{message}</span>
    </div>}

    <div style={{ textAlign: 'center', margin: '16px 0 0' }}>
      <button type="button" className="button ghost kbtn" style={{ display: 'inline-flex', width: 'auto' }}
        onClick={() => { const next = !voiceOn; setVoiceOn(next); setVoiceOnState(next); if (next) { testVoice(); window.setTimeout(() => { const v = lastVoiceInfo(); setVoiceNote(v ? `${v.gender === 'female' ? 'Female' : 'Male'} voice: ${v.voice}` : ''); }, 300); } else setVoiceNote(''); }}>
        {voiceOn ? '🔊 Voice on · tap to test / turn off' : '🔇 Voice off · tap to turn on'}
      </button>
      {voiceOn && <p className="ksub" style={{ margin: '6px 0 0', fontSize: 12 }}>{voiceNote || `${voiceCount()} voice${voiceCount() === 1 ? '' : 's'} found on this device — they rotate male / female on every scan.`}</p>}
    </div>

    {approved && <div className="log-list" style={{ textAlign: 'left', maxWidth: 560, margin: '24px auto 0' }}>
      <p className="eyebrow" style={{ margin: '0' }}>Live attendance · inside now {activity.present_now} · today {activity.today_visits}</p>
      {activity.rows.length === 0 && <div className="log"><span>No check-ins yet today.</span></div>}
      {activity.rows.map(x => <div className="log" key={x.id + x.at + x.action}><span><b>{x.name}</b> · {x.action}</span><span>{new Date(x.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span></div>)}
    </div>}
  </div></main>;
}
