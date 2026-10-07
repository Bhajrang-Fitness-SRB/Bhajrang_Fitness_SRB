import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ScanFace, X } from 'lucide-react';
import { supabase, type Member } from '../lib/supabase';
import { averageDescriptors, getDescriptor, loadFaceApi } from '../lib/faceApi';

const SAMPLES = 5;

/** Mini round profile picture (member selfie) with initials fallback. */
export function Avatar({ src, name, size = 44 }: { src?: string | null; name?: string | null; size?: number }) {
  const initials = (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';
  const box: React.CSSProperties = { width: size, height: size, borderRadius: '50%', flexShrink: 0, border: '2px solid var(--gold)', boxShadow: '0 0 14px #e9b94933' };
  return src
    ? <img src={src} alt={name || 'Profile'} style={{ ...box, objectFit: 'cover', display: 'block' }} />
    : <div style={{ ...box, display: 'grid', placeItems: 'center', background: '#182131', color: 'var(--gold)', fontWeight: 700, fontSize: size * 0.36 }}>{initials}</div>;
}

type Status = 'loading' | 'off' | 'pending' | 'approved';

/** Member-side face scan setting. The member chooses; reception approves. */
export function MemberFaceScan({ member, passcode, onClose, notify }: { member: Member; passcode: string; onClose: () => void; notify: (m: string) => void }) {
  const [status, setStatus] = useState<Status>('loading');
  const [camOn, setCamOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('member_face_scan_status', { p_member_id: member.member_id, p_passcode: passcode });
    setStatus(error ? 'off' : ((data as Status) ?? 'off'));
  }, [member.member_id, passcode]);
  useEffect(() => { void load(); }, [load]);

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
  }, []);
  useEffect(() => () => stopCam(), [stopCam]);

  const startCam = async () => {
    setMsg('Loading face models…');
    try {
      await loadFaceApi();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCamOn(true); setMsg('Look straight at the camera in good light, then press Capture.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Camera unavailable — allow camera access and try again.'); }
  };

  const capture = async () => {
    const v = videoRef.current; if (!v) return;
    setBusy(true); const got: number[][] = [];
    try {
      for (let tries = 0; got.length < SAMPLES && tries < SAMPLES * 6; tries++) {
        setMsg(`Scanning ${got.length + 1} of ${SAMPLES}… hold still`);
        const d = await getDescriptor(v); if (d) got.push(d);
        await new Promise(r => setTimeout(r, 350));
      }
      if (got.length < SAMPLES) { setMsg('Could not get a clear face. Improve the lighting and try again.'); setBusy(false); return; }
      const { error } = await supabase.rpc('member_request_face_scan', { p_member_id: member.member_id, p_passcode: passcode, p_descriptor: averageDescriptors(got) });
      if (error) { setMsg('Could not send your request. Please try again.'); setBusy(false); return; }
      stopCam(); notify('Face scan request sent to reception for approval.'); setStatus('pending'); setMsg('');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Scan failed.'); }
    setBusy(false);
  };

  const turnOff = async () => {
    if (!confirm('Turn off face scan? Your stored face data will be deleted.')) return;
    setBusy(true);
    const { error } = await supabase.rpc('member_disable_face_scan', { p_member_id: member.member_id, p_passcode: passcode });
    setBusy(false);
    if (error) { notify('Could not turn it off.'); return; }
    notify('Face scan turned off and your face data deleted.'); setStatus('off');
  };

  return <div className="modal-backdrop"><div className="modal" style={{ maxWidth: 480 }}>
    <div className="modal-head"><div><p className="eyebrow">Settings</p><h2 style={{ margin: 0 }}>Face scan check-in</h2>
      <p className="sub">Your choice. Turn it on to check in at the gate kiosk with your face. Reception must approve it first.</p></div>
      <button type="button" className="close" onClick={() => { stopCam(); onClose(); }}><X /></button></div>

    {status === 'loading' && <div className="empty">Checking…</div>}

    {status === 'approved' && <><div className="card" style={{ borderColor: 'var(--green)' }}><b className="success"><Check size={14} /> Face scan is ON</b><p className="sub" style={{ marginTop: 6 }}>You can check in at the kiosk with your face.</p></div>
      <button className="button danger" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} disabled={busy} onClick={() => void turnOff()}>Turn off &amp; delete my face data</button></>}

    {status === 'pending' && <><div className="card" style={{ borderColor: 'var(--gold)' }}><b style={{ color: 'var(--gold)' }}>Waiting for reception approval</b><p className="sub" style={{ marginTop: 6 }}>Face scan will switch on as soon as it is approved.</p></div>
      <button className="button ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} disabled={busy} onClick={() => void turnOff()}>Cancel my request</button></>}

    {status === 'off' && <>
      <p className="sub" style={{ marginTop: 0 }}>We store only a numeric face signature (not a photo) to recognise you at the kiosk. You can turn it off any time and it is deleted.</p>
      <div style={{ margin: '14px 0', borderRadius: 12, overflow: 'hidden', background: '#000', display: camOn ? 'block' : 'none' }}>
        <video ref={videoRef} muted playsInline style={{ width: '100%', transform: 'scaleX(-1)' }} />
      </div>
      {!camOn ? <button className="button cyan" style={{ width: '100%', justifyContent: 'center' }} onClick={() => void startCam()}><ScanFace size={16} /> Enable face scan</button>
        : <div style={{ display: 'flex', gap: 8 }}><button className="button cyan" disabled={busy} onClick={() => void capture()}>{busy ? 'Scanning…' : 'Capture & send for approval'}</button><button className="button ghost" onClick={stopCam}>Cancel</button></div>}
      {msg && <p className="sub" style={{ fontSize: 12, marginTop: 12 }}>{msg}</p>}
    </>}
  </div></div>;
}

type Req = { id: string; member_id: string; name: string | null; profile_pic: string | null; requested_at: string };

/** Reception / owner: approve or decline members' face scan requests. */
export function FaceScanRequestsDesk({ passcode, notify }: { passcode: string; notify: (m: string) => void }) {
  const [reqs, setReqs] = useState<Req[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('admin_list_face_scan_requests', { p_passcode: passcode });
    setReqs((data as Req[]) ?? []);
  }, [passcode]);
  useEffect(() => { void load(); }, [load]);
  const resolve = async (id: string, approve: boolean) => {
    const { error } = await supabase.rpc('admin_resolve_face_scan_request', { p_passcode: passcode, p_request_id: id, p_approve: approve });
    if (error) { notify('Could not process that request.'); return; }
    notify(approve ? 'Face scan approved — member can now check in with their face.' : 'Face scan request declined.'); void load();
  };
  if (!reqs.length) return null;
  return <div className="card" style={{ marginBottom: 20, borderColor: 'var(--cyan)' }}>
    <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}><ScanFace size={15} /> Face scan requests</span><span>{reqs.length} pending</span></div>
    {reqs.map(r => <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 }}>
      <Avatar src={r.profile_pic} name={r.name} size={44} />
      <div style={{ flex: 1 }}><b>{r.name || r.member_id}</b><div className="muted" style={{ fontSize: 11 }}>{r.member_id} · {new Date(r.requested_at).toLocaleString()}</div></div>
      <button className="button primary" style={{ padding: '6px 10px' }} onClick={() => void resolve(r.id, true)}><Check size={13} /></button>
      <button className="button ghost" style={{ padding: '6px 10px' }} onClick={() => void resolve(r.id, false)}><X size={13} /></button>
    </div>)}
  </div>;
}
