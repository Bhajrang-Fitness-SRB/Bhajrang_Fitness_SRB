import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, type Member } from '../lib/supabase';
import { averageDescriptors, getDescriptor, loadFaceApi } from '../lib/faceApi';

type Device = { device_id: string; device_name: string | null; approved: boolean; last_seen: string | null; created_at: string | null };
const SAMPLES = 5;

/** Staff screen: approve kiosk devices and enrol / remove member faces. */
export function FaceAdmin({ passcode, members, notify }: { passcode: string; members: Member[]; notify: (m: string) => void }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());
  const [memberId, setMemberId] = useState('');
  const [camOn, setCamOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const load = useCallback(async () => {
    const [d, f] = await Promise.all([
      supabase.rpc('admin_list_kiosk_devices', { p_passcode: passcode }),
      supabase.rpc('admin_list_enrolled_faces', { p_passcode: passcode }),
    ]);
    setDevices((d.data as Device[]) ?? []);
    setEnrolled(new Set(((f.data as { member_id: string }[]) ?? []).map(r => r.member_id)));
  }, [passcode]);
  useEffect(() => { void load(); }, [load]);

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
  }, []);
  useEffect(() => () => stopCam(), [stopCam]);

  const setDevice = async (d: Device, approved: boolean, name?: string) => {
    const { error } = await supabase.rpc('admin_set_kiosk_device', {
      p_passcode: passcode, p_device_id: d.device_id, p_approved: approved, p_device_name: name ?? d.device_name ?? 'Kiosk',
    });
    if (error) { notify('Could not update the device.'); return; }
    notify(approved ? 'Device approved.' : 'Device blocked.'); void load();
  };
  const rename = async (d: Device) => {
    const name = prompt('Device name (e.g. Front gate tablet)', d.device_name ?? '');
    if (name && name.trim()) await setDevice(d, d.approved, name.trim().slice(0, 60));
  };
  const removeDevice = async (d: Device) => {
    if (!confirm('Remove this device? It will have to register and be approved again.')) return;
    const { error } = await supabase.rpc('admin_delete_kiosk_device', { p_passcode: passcode, p_device_id: d.device_id });
    if (error) { notify('Could not remove the device.'); return; }
    void load();
  };

  const startCam = async () => {
    setStatus('Loading face models…');
    try {
      await loadFaceApi();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCamOn(true); setStatus('Camera ready. Ask the member to face the camera, then press Capture.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Camera unavailable — check permissions (HTTPS required).');
    }
  };

  const capture = async () => {
    if (!memberId) { notify('Select a member first.'); return; }
    const v = videoRef.current; if (!v) return;
    setBusy(true);
    const got: number[][] = [];
    try {
      for (let tries = 0; got.length < SAMPLES && tries < SAMPLES * 6; tries++) {
        setStatus(`Capturing ${got.length + 1} of ${SAMPLES}… hold still, one face only`);
        const d = await getDescriptor(v);
        if (d) got.push(d);
        await new Promise(r => setTimeout(r, 350));
      }
      if (got.length < SAMPLES) { setStatus('Could not get a clear face. Improve the lighting and try again.'); setBusy(false); return; }
      const { error } = await supabase.rpc('admin_save_face_descriptor', {
        p_passcode: passcode, p_member_id: memberId, p_descriptor: averageDescriptors(got),
      });
      if (error) { setStatus(error.message); notify('Could not save the face.'); }
      else { setStatus('Face enrolled.'); notify('Face enrolled.'); setMemberId(''); void load(); }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Capture failed.');
    }
    setBusy(false);
  };

  const removeFace = async (id: string) => {
    if (!confirm(`Remove the enrolled face for ${id}?`)) return;
    const { error } = await supabase.rpc('admin_delete_face_descriptor', { p_passcode: passcode, p_member_id: id });
    if (error) { notify('Could not remove the face.'); return; }
    void load();
  };

  const nameOf = (id: string) => members.find(m => m.member_id === id)?.name || id;

  return <>
    <div className="page-head"><div><p className="eyebrow">Gate control</p><h1 className="title">Kiosk &amp; face scan</h1><p className="sub">Approve kiosk devices and enrol member faces.</p></div></div>
    <div className="grid layout-2">
      <div className="card">
        <div className="card-title">Kiosk devices <span>{devices.length}</span></div>
        {devices.length === 0 ? <div className="empty">Open /kiosk on the gate tablet once. It will appear here.</div> :
          <div className="activity">{devices.map(d => <div className="activity-item" key={d.device_id}>
            <div className="activity-copy"><b>{d.device_name || 'Kiosk'}</b> · {d.device_id.slice(0, 8)}<br /><span className="muted">{d.approved ? 'Approved' : 'Waiting for approval'}{d.last_seen ? ` · last seen ${new Date(d.last_seen).toLocaleString()}` : ''}</span></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="button primary" onClick={() => void setDevice(d, !d.approved)}>{d.approved ? 'Block' : 'Approve'}</button>
              <button className="button ghost" onClick={() => void rename(d)}>Rename</button>
              <button className="button ghost" onClick={() => void removeDevice(d)}>Remove</button>
            </div></div>)}</div>}
      </div>
      <div className="card">
        <div className="card-title">Enrol a face <span>{enrolled.size} enrolled</span></div>
        <div className="field"><label>Member</label>
          <select value={memberId} onChange={e => setMemberId(e.target.value)}>
            <option value="">Select a member</option>
            {members.map(m => <option key={m.member_id} value={m.member_id}>{m.name || m.member_id} · {m.member_id}{enrolled.has(m.member_id) ? ' ✓' : ''}</option>)}
          </select></div>
        <div style={{ margin: '14px 0', borderRadius: 12, overflow: 'hidden', background: '#000', display: camOn ? 'block' : 'none' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', transform: 'scaleX(-1)' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!camOn ? <button className="button cyan" onClick={() => void startCam()}>Start camera</button> : <>
            <button className="button cyan" disabled={busy || !memberId} onClick={() => void capture()}>{busy ? 'Capturing…' : 'Capture & save'}</button>
            <button className="button ghost" onClick={stopCam}>Stop camera</button></>}
        </div>
        {status && <p className="sub" style={{ fontSize: 12, marginTop: 12 }}>{status}</p>}
        {enrolled.size > 0 && <><p className="eyebrow" style={{ margin: '18px 0 6px' }}>Enrolled faces</p>
          <div className="activity">{[...enrolled].map(id => <div className="activity-item" key={id}>
            <div className="activity-copy">{nameOf(id)} · {id}</div>
            <button className="button ghost" onClick={() => void removeFace(id)}>Remove</button></div>)}</div></>}
      </div>
    </div>
  </>;
}
