import { useCallback, useEffect, useState } from 'react';
import { Bot, Check, Play, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Finding = { severity?: string; title?: string; detail?: string };
type Run = { id: string; ran_at: string; trigger: string; status: string; summary: string | null; findings: Finding[]; fixes_applied: { action?: string; affected?: number; error?: string }[]; error: string | null };
type Suggestion = { id: string; created_at: string; kind: string; priority: string; title: string; detail: string; status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'DONE' };
type Data = { has_key: boolean; has_workspace: boolean; runs: Run[]; suggestions: Suggestion[] };

const FIX_LABEL: Record<string, string> = {
  decline_stale_face_requests: 'Closed old face-scan requests',
  delete_orphan_face_descriptors: 'Removed face data with no member',
  remove_stale_unapproved_kiosks: 'Removed unused kiosk registrations',
  purge_old_error_log: 'Trimmed old error log',
};
const sevColor = (s?: string) => (s === 'critical' ? 'var(--red, #ff5d5d)' : s === 'warning' ? 'var(--gold)' : 'var(--green)');

/** Owner only: nightly AI agent report, suggestions to approve, credentials. */
export function AgentDesk({ passcode, notify }: { passcode: string; notify: (m: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState('');
  const [ws, setWs] = useState('');

  const load = useCallback(async () => {
    const { data: d, error } = await supabase.rpc('admin_list_agent', { p_passcode: passcode });
    if (error) { notify('Could not load the agent report.'); return; }
    setData(d as Data);
  }, [passcode, notify]);
  useEffect(() => { void load(); }, [load]);

  const saveCreds = async () => {
    if (!key.trim() && !ws.trim()) { notify('Enter the API key and/or workspace ID.'); return; }
    const { error } = await supabase.rpc('admin_set_agent_credentials', { p_passcode: passcode, p_api_key: key, p_workspace_id: ws });
    if (error) { notify('Could not save. Only the owner can do this.'); return; }
    setKey(''); setWs(''); notify('Saved securely. The key is never shown again.'); void load();
  };

  const runNow = async () => {
    setBusy(true);
    const { data: res, error } = await supabase.functions.invoke('nightly-agent', { body: { passcode } });
    setBusy(false);
    if (error) { notify('The agent could not run. Check the API key and workspace ID.'); void load(); return; }
    notify((res as { status?: string })?.status === 'needs_key' ? 'Add the API key first.' : 'Analysis complete.'); void load();
  };

  const decide = async (id: string, action: 'APPROVED' | 'DECLINED' | 'DONE') => {
    const { error } = await supabase.rpc('admin_resolve_agent_suggestion', { p_passcode: passcode, p_id: id, p_action: action });
    if (error) { notify('Could not update that suggestion.'); return; }
    notify(action === 'APPROVED' ? 'Approved — queued to be built.' : action === 'DECLINED' ? 'Declined.' : 'Marked as done.'); void load();
  };

  if (!data) return <div className="empty">Loading…</div>;
  const last = data.runs[0];
  const pending = data.suggestions.filter(s => s.status === 'PENDING');
  const approved = data.suggestions.filter(s => s.status === 'APPROVED');
  const recent = data.suggestions.filter(s => s.status === 'DECLINED' || s.status === 'DONE').slice(0, 8);

  return <>
    <div className="page-head"><div><p className="eyebrow">Runs every night at 2:00 AM</p><h1 className="title">AI Night Agent</h1>
      <p className="sub">Claude checks the gym app's health every night, tidies up safe things by itself, and suggests improvements. Nothing is added to the app until you approve it.</p></div>
      <button className="button cyan" disabled={busy || !data.has_key} onClick={() => void runNow()}><Play size={15} /> {busy ? 'Analysing…' : 'Run now'}</button></div>

    <div className="card" style={{ marginBottom: 20, borderColor: data.has_key ? 'var(--line)' : 'var(--gold)' }}>
      <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}><Bot size={15} /> Claude connection</span>
        <span className={data.has_key ? 'success' : ''} style={data.has_key ? undefined : { color: 'var(--gold)' }}>{data.has_key ? 'API key saved' : 'API key needed'}{data.has_workspace ? ' · workspace set' : ''}</span></div>
      <div className="form-grid">
        <div className="field"><label>Claude API key</label><input type="password" autoComplete="off" placeholder={data.has_key ? '•••••• saved — paste a new one to replace' : 'sk-ant-…'} value={key} onChange={e => setKey(e.target.value)} /></div>
        <div className="field"><label>Workspace ID (if your key needs one)</label><input autoComplete="off" placeholder={data.has_workspace ? 'saved — paste to replace' : 'wrkspc_…'} value={ws} onChange={e => setWs(e.target.value)} /></div>
      </div>
      <button className="button primary" style={{ marginTop: 12 }} onClick={() => void saveCreds()}>Save securely</button>
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Stored encrypted in Supabase Vault. The agent only ever sees anonymous counts — never names, phone numbers or photos.</p>
    </div>

    {last && <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Last report</span><span>{new Date(last.ran_at).toLocaleString()} · {last.trigger}</span></div>
      {last.status !== 'ok' && <p style={{ color: 'var(--gold)' }}>{last.summary}{last.error ? ` (${last.error})` : ''}</p>}
      {last.status === 'ok' && <>
        <p style={{ marginTop: 0 }}>{last.summary}</p>
        {last.findings.map((f, i) => <div key={i} style={{ borderLeft: `3px solid ${sevColor(f.severity)}`, paddingLeft: 10, margin: '10px 0' }}><b>{f.title}</b><div className="muted" style={{ fontSize: 12 }}>{f.detail}</div></div>)}
        {last.fixes_applied.length > 0 && <div style={{ marginTop: 10 }}><b style={{ fontSize: 12 }}>Fixed automatically</b>{last.fixes_applied.map((f, i) => <div key={i} className="muted" style={{ fontSize: 12 }}>✓ {FIX_LABEL[f.action ?? ''] ?? f.action}{typeof f.affected === 'number' ? ` (${f.affected})` : ''}{f.error ? ` — failed: ${f.error}` : ''}</div>)}</div>}
      </>}
    </div>}

    <div className="card" style={{ marginBottom: 20, borderColor: pending.length ? 'var(--cyan)' : 'var(--line)' }}>
      <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Suggestions waiting for you</span><span>{pending.length}</span></div>
      {!pending.length && <p className="muted">Nothing new. Ideas will appear here after the next nightly run.</p>}
      {pending.map(s => <div key={s.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b>{s.title}</b><span className="muted" style={{ fontSize: 11 }}>{s.kind} · {s.priority} priority</span></div>
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 10px' }}>{s.detail}</p>
        <div style={{ display: 'flex', gap: 8 }}><button className="button primary" onClick={() => void decide(s.id, 'APPROVED')}><Check size={14} /> Approve</button><button className="button ghost" onClick={() => void decide(s.id, 'DECLINED')}><X size={14} /> Decline</button></div>
      </div>)}
    </div>

    {approved.length > 0 && <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Approved — waiting to be built</span><span>{approved.length}</span></div>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Tell Claude in your project chat to build these. Mark them done once added.</p>
      {approved.map(s => <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 }}><div style={{ flex: 1 }}><b>{s.title}</b><div className="muted" style={{ fontSize: 12 }}>{s.detail}</div></div><button className="button ghost" style={{ padding: '6px 10px' }} onClick={() => void decide(s.id, 'DONE')}>Mark done</button></div>)}
    </div>}

    {recent.length > 0 && <div className="card"><div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Recently closed</span></div>
      {recent.map(s => <div key={s.id} className="muted" style={{ fontSize: 12, padding: '4px 0' }}>{s.status === 'DONE' ? '✓ Done' : '✗ Declined'} — {s.title}</div>)}</div>}
  </>;
}
