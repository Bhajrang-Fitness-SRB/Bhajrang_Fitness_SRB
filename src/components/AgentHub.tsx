import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Bot, Check, Copy, Play, Plus, RefreshCw, Trash2, X, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Health = 'untested' | 'ok' | 'rate_limited' | 'quota_out' | 'bad_key' | 'error';
type Provider = { key: string; enabled: boolean; priority: number; model: string | null; state: Health; cooldown_until: string | null; last_error: string | null; last_ok_at: string | null; ok_count: number; fail_count: number; calls_24h: number };
type Agent = { key: string; name: string; description: string; system_prompt: string; enabled: boolean; builtin: boolean; use_snapshot: boolean };
type Proposal = { id: string; agent_key: string; agent_name: string; title: string; detail: string; provider: string | null; status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'DONE'; created_at: string };
type Overview = { providers: Provider[]; agents: Agent[]; proposals: Proposal[]; runs_24h: number };
type Status = { key: string; label: string; envKey: string; configured: boolean; signup: string };
type RunResult = { ok: boolean; text?: string; provider?: string; error?: string; warnings?: string[]; proposal_id?: string | null; attempts?: Array<{ provider: string; ok: boolean; health?: string }> };

const HEALTH: Record<Health, { label: string; color: string }> = {
  untested: { label: 'Not tested', color: '#9aa8bb' }, ok: { label: 'Working', color: 'var(--green)' }, rate_limited: { label: 'Busy, retrying soon', color: 'var(--gold)' },
  quota_out: { label: 'Free limit finished', color: 'var(--gold)' }, bad_key: { label: 'Key not accepted', color: '#ff6b6b' }, error: { label: 'Problem', color: '#ff6b6b' },
};
const ctl: React.CSSProperties = { background: '#0c131e', border: '1px solid var(--line)', borderRadius: 7, padding: '8px 10px', color: '#fff', font: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' };
const chip = (text: string, color: string) => <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, border: `1px solid ${color}`, color, whiteSpace: 'nowrap' }}>{text}</span>;
const sectionTitle = (t: string, right?: React.ReactNode) => <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{t}</span>{right}</div>;
const until = (iso: string | null) => {
  if (!iso) return ''; const ms = Date.parse(iso) - Date.now(); if (ms <= 0) return '';
  const m = Math.ceil(ms / 60000); return m < 90 ? `back in ~${m} min` : `back in ~${Math.round(m / 60)} h`;
};
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Owner only: one control room for every AI agent. Providers fail over automatically; agents only write and propose; you approve. */
export function AgentHub({ passcode, notify }: { passcode: string; notify: (m: string) => void }) {
  const [tab, setTab] = useState<'run' | 'approvals' | 'providers' | 'agents'>('run');
  const [ov, setOv] = useState<Overview | null>(null);
  const [status, setStatus] = useState<Status[] | null>(null);
  const [agentKey, setAgentKey] = useState('marketing');
  const [input, setInput] = useState('');
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', prompt: '', snapshot: false });

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_hub_overview', { p_passcode: passcode });
    if (error) { notify('Could not load the Agent Hub. Only the owner can open it.'); return; }
    setOv(data as Overview);
  }, [passcode, notify]);
  const loadStatus = useCallback(async () => {
    const { data } = await supabase.functions.invoke('ai-hub', { body: { passcode, action: 'status' } });
    setStatus((data as { providers?: Status[] } | null)?.providers ?? []);
  }, [passcode]);
  useEffect(() => { void load(); void loadStatus(); }, [load, loadStatus]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) void load(); }, 30000); return () => clearInterval(t); }, [load]);

  const rpc = async (name: string, args: Record<string, unknown>, ok?: string) => {
    const { error } = await supabase.rpc(name, { p_passcode: passcode, ...args });
    if (error) { notify(error.message || 'That did not work.'); return false; }
    if (ok) notify(ok); void load(); return true;
  };
  const run = async () => {
    setBusy(true); setResult(null);
    const { data, error } = await supabase.functions.invoke('ai-hub', { body: { passcode, action: 'run', agent_key: agentKey, input, save_proposal: save } });
    setBusy(false);
    const d = data as RunResult | null;
    if (error && !d) { notify('Could not reach the AI Hub. Check the ai-hub function is deployed.'); return; }
    setResult(d ?? { ok: false, error: 'No answer.' }); void load();
  };
  const test = async (key: string) => {
    setTesting(key);
    const { data } = await supabase.functions.invoke('ai-hub', { body: { passcode, action: 'test', provider: key } });
    setTesting(null);
    const d = data as { ok?: boolean; error?: string; ms?: number } | null;
    notify(d?.ok ? `${key}: working (${d.ms} ms).` : `${key}: ${d?.error ?? 'did not answer.'}`); void load();
  };
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); notify('Copied.'); } catch { notify('Could not copy. Select the text instead.'); } };

  const providers = ov?.providers ?? [];
  const agents = ov?.agents ?? [];
  const pending = (ov?.proposals ?? []).filter(p => p.status === 'PENDING');
  const cfg = (k: string) => status?.find(s => s.key === k);
  const working = providers.filter(p => p.enabled && cfg(p.key)?.configured && !until(p.cooldown_until) && p.state !== 'bad_key').length;
  const move = (i: number, d: -1 | 1) => { const a = providers[i], b = providers[i + d]; if (a && b) void rpc('admin_hub_swap_priority', { p_a: a.key, p_b: b.key }); };
  const saveAgent = async () => {
    const key = slug(form.name); if (!key) { notify('Give the agent a name using English letters.'); return; }
    if (await rpc('admin_hub_save_agent', { p_key: key, p_name: form.name.trim(), p_description: form.description, p_prompt: form.prompt, p_enabled: true, p_use_snapshot: form.snapshot }, 'Agent saved.')) { setForm({ name: '', description: '', prompt: '', snapshot: false }); setAgentKey(key); }
  };

  return <>
    <div className="page-head"><div><p className="eyebrow">Owner only</p><h1 className="title">AI Agent Hub</h1>
      <p className="sub">All your free AI helpers in one place. If one runs out of free limit, the next takes over by itself. Agents only write and suggest; nothing happens until you approve.</p></div>
      <button className="button ghost" onClick={() => { void load(); void loadStatus(); }}><RefreshCw size={14} /> Refresh</button></div>

    <div className="grid stats" style={{ marginBottom: 16 }}>
      <div className="card"><div className="muted" style={{ fontSize: 12 }}>AI providers ready</div><div style={{ fontSize: 28, fontWeight: 700, color: working ? 'var(--green)' : '#ff6b6b' }}>{ov ? working : '–'}<span className="muted" style={{ fontSize: 14 }}> / {providers.length}</span></div></div>
      <button className="card" style={{ textAlign: 'left', cursor: 'pointer', color: '#fff', borderColor: pending.length ? 'var(--gold)' : 'var(--line)' }} onClick={() => setTab('approvals')}><div className="muted" style={{ fontSize: 12 }}>Waiting for your approval</div><div style={{ fontSize: 28, fontWeight: 700, color: pending.length ? 'var(--gold)' : '#fff' }}>{ov ? pending.length : '–'}</div></button>
      <div className="card"><div className="muted" style={{ fontSize: 12 }}>AI calls in last 24 h</div><div style={{ fontSize: 28, fontWeight: 700 }}>{ov?.runs_24h ?? '–'}</div></div>
      <div className="card"><div className="muted" style={{ fontSize: 12 }}>Agents</div><div style={{ fontSize: 28, fontWeight: 700 }}>{agents.filter(a => a.enabled).length}</div></div>
    </div>

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {([['run', 'Ask an agent'], ['approvals', `Approvals${pending.length ? ` (${pending.length})` : ''}`], ['providers', 'AI providers'], ['agents', 'Agents']] as const).map(([k, l]) =>
        <button key={k} className={tab === k ? 'button primary' : 'button ghost'} onClick={() => setTab(k)}>{l}</button>)}
    </div>

    {tab === 'run' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
      <div className="card">
        {sectionTitle('What do you need?')}
        <div className="field"><label>Agent</label><select value={agentKey} onChange={e => setAgentKey(e.target.value)} style={ctl}>{agents.filter(a => a.enabled).map(a => <option key={a.key} value={a.key}>{a.name}</option>)}</select></div>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>{agents.find(a => a.key === agentKey)?.description}</p>
        <div className="field"><label>Your request</label><textarea value={input} onChange={e => setInput(e.target.value)} rows={6} maxLength={6000} placeholder="Example: Write an Instagram post for our Diwali offer: Quarterly package Rs 200 off till 31 Oct." style={{ ...ctl, resize: 'vertical' }} /></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '8px 0 12px' }}><input type="checkbox" checked={save} onChange={e => setSave(e.target.checked)} /> Put the answer in my Approvals list</label>
        <button className="button primary" disabled={busy || !input.trim()} onClick={() => void run()}><Play size={14} /> {busy ? 'Working…' : 'Run agent'}</button>
      </div>
      <div className="card">
        {sectionTitle('Answer')}
        {!result && !busy && <div className="empty">Your agent's answer shows here. You can copy it, edit it, then use it yourself.</div>}
        {busy && <div className="empty">Thinking… if the first AI is busy, the next one is tried automatically.</div>}
        {result && !result.ok && <div style={{ color: '#ff9b9b', fontSize: 14 }}>{result.error ?? 'It did not work.'}</div>}
        {result?.ok && <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {chip(`Answered by ${cfg(result.provider ?? '')?.label ?? result.provider}`, 'var(--cyan)')}
            {(result.attempts?.length ?? 0) > 1 && chip('Switched automatically', 'var(--gold)')}
            {result.proposal_id && chip('Saved to Approvals', 'var(--green)')}
          </div>
          {result.warnings?.map(w => <div key={w} style={{ color: 'var(--gold)', fontSize: 13, marginBottom: 6 }}>⚠ {w}</div>)}
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, background: '#0c131e', border: '1px solid var(--line)', borderRadius: 8, padding: 12, maxHeight: 420, overflow: 'auto' }}>{result.text}</div>
          <button className="button ghost" style={{ marginTop: 10 }} onClick={() => void copy(result.text ?? '')}><Copy size={14} /> Copy</button>
        </>}
      </div>
    </div>}

    {tab === 'approvals' && <div className="card">
      {sectionTitle('Agent suggestions', <span className="muted" style={{ fontSize: 12 }}>Approving only records your decision. It does not change the app or send anything.</span>)}
      {!ov?.proposals.length && <div className="empty">Nothing here yet. Run an agent with “Put the answer in my Approvals list” ticked.</div>}
      {ov?.proposals.map(p => <div key={p.id} style={{ borderTop: '1px solid var(--line)', padding: '12px 4px' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
          <b style={{ fontSize: 14 }}>{p.title}</b>{chip(p.agent_name, 'var(--cyan)')}
          {chip(p.status === 'PENDING' ? 'Waiting' : p.status === 'APPROVED' ? 'Approved' : p.status === 'DONE' ? 'Done' : 'Declined', p.status === 'PENDING' ? 'var(--gold)' : p.status === 'DECLINED' ? '#9aa8bb' : 'var(--green)')}
        </div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5, color: '#d6dfeb', maxHeight: 220, overflow: 'auto' }}>{p.detail}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {p.status === 'PENDING' && <><button className="button primary" onClick={() => void rpc('admin_hub_decide_proposal', { p_id: p.id, p_status: 'APPROVED' }, 'Approved.')}><Check size={14} /> Approve</button>
            <button className="button ghost" onClick={() => void rpc('admin_hub_decide_proposal', { p_id: p.id, p_status: 'DECLINED' }, 'Declined.')}><X size={14} /> Decline</button></>}
          {p.status === 'APPROVED' && <button className="button ghost" onClick={() => void rpc('admin_hub_decide_proposal', { p_id: p.id, p_status: 'DONE' }, 'Marked done.')}><Check size={14} /> Mark done</button>}
          <button className="button ghost" onClick={() => void copy(p.detail)}><Copy size={14} /> Copy</button>
        </div>
      </div>)}
    </div>}

    {tab === 'providers' && <div className="card">
      {sectionTitle('Free AI providers, in the order they are tried', <span className="muted" style={{ fontSize: 12 }}>Top one is used first</span>)}
      {providers.map((p, i) => { const s = cfg(p.key); const h = HEALTH[p.state]; const cool = until(p.cooldown_until);
        return <div key={p.key} style={{ borderTop: '1px solid var(--line)', padding: '12px 4px', opacity: p.enabled ? 1 : 0.55 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted" style={{ width: 18 }}>{i + 1}</span><b style={{ fontSize: 14 }}>{s?.label ?? p.key}</b>
            {s ? (s.configured ? chip('Key added', 'var(--green)') : chip('No key yet', '#ff6b6b')) : null}
            {s?.configured && chip(h.label, h.color)}{cool && chip(cool, 'var(--gold)')}
            <span className="muted" style={{ fontSize: 12 }}>{p.calls_24h} calls today</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className="button ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={14} /></button>
              <button className="button ghost" disabled={i === providers.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={14} /></button>
            </span>
          </div>
          {!s?.configured && s && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Free key from {s.signup}. Save it in Supabase → Edge Functions → Secrets as <b>{s.envKey}</b>.</p>}
          {p.last_error && p.state !== 'ok' && p.state !== 'untested' && <p style={{ fontSize: 12, margin: '6px 0 0', color: '#ff9b9b' }}>{p.last_error}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={p.enabled} onChange={e => void rpc('admin_hub_set_provider', { p_key: p.key, p_enabled: e.target.checked })} /> In use</label>
            <input defaultValue={p.model ?? ''} key={p.key + (p.model ?? '')} placeholder="Model: automatic" style={{ ...ctl, width: 190 }} onBlur={e => { if (e.target.value.trim() !== (p.model ?? '')) void rpc('admin_hub_set_provider', { p_key: p.key, p_model: e.target.value.trim() }, 'Model saved.'); }} />
            <button className="button ghost" disabled={!s?.configured || testing === p.key} onClick={() => void test(p.key)}><Zap size={14} /> {testing === p.key ? 'Testing…' : 'Test'}</button>
            <button className="button ghost" onClick={() => void rpc('admin_hub_reset_provider', { p_key: p.key }, 'Waiting time cleared.')}>Try again now</button>
          </div>
        </div>; })}
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Keys are never shown here or stored in the database. Only “added / not added” is shown.</p>
    </div>}

    {tab === 'agents' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
      <div className="card">
        {sectionTitle('Your agents')}
        {agents.map(a => <div key={a.key} style={{ borderTop: '1px solid var(--line)', padding: '10px 4px', opacity: a.enabled ? 1 : 0.55 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><Bot size={14} /><b style={{ fontSize: 14 }}>{a.name}</b>{a.builtin && chip('Ready-made', '#9aa8bb')}{a.use_snapshot && chip('Sees gym numbers', 'var(--cyan)')}</div>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 6px' }}>{a.description}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button ghost" onClick={() => void rpc('admin_hub_save_agent', { p_key: a.key, p_name: a.name, p_description: a.description, p_prompt: a.system_prompt, p_enabled: !a.enabled, p_use_snapshot: a.use_snapshot })}>{a.enabled ? 'Switch off' : 'Switch on'}</button>
            {!a.builtin && <button className="button ghost" onClick={() => { if (confirm(`Delete ${a.name}?`)) void rpc('admin_hub_delete_agent', { p_key: a.key }, 'Deleted.'); }}><Trash2 size={14} /> Delete</button>}
          </div>
        </div>)}
      </div>
      <div className="card">
        {sectionTitle('Add your own agent')}
        <div className="field"><label>Name</label><input value={form.name} maxLength={60} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Event Planner" style={ctl} /></div>
        <div className="field"><label>What it does (one line)</label><input value={form.description} maxLength={300} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={ctl} /></div>
        <div className="field"><label>Instructions for the agent</label><textarea value={form.prompt} maxLength={4000} rows={6} onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))} placeholder="You plan monthly fitness events for the gym. Give a date idea, budget outline and a promotion message…" style={{ ...ctl, resize: 'vertical' }} /></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '8px 0 12px' }}><input type="checkbox" checked={form.snapshot} onChange={e => setForm(f => ({ ...f, snapshot: e.target.checked }))} /> Let it see anonymous gym counts (no names or phone numbers)</label>
        <button className="button primary" disabled={!form.name.trim() || !form.prompt.trim()} onClick={() => void saveAgent()}><Plus size={14} /> Save agent</button>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Every agent follows the same safety rules: no supplement doses, no medical advice, no guarantees, and no actions without your approval.</p>
      </div>
    </div>}
  </>;
}
