import { useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, FlaskConical, Pencil, Plus, Trash2 } from 'lucide-react';
import { hub } from './api';
import { PRESETS } from './presets';
import type { ProviderRow } from './types';

function state(p: ProviderRow): { cls: string; text: string } {
  if (!p.enabled) return { cls: '', text: 'Switched off' };
  if (!p.has_key) return { cls: 'bad', text: 'No key saved' };
  if (p.status === 'invalid') return { cls: 'bad', text: 'Key rejected — replace it' };
  if (p.status === 'cooldown' && p.cooldown_until && new Date(p.cooldown_until) > new Date()) return { cls: 'rest', text: `Free limit reached — resting until ${new Date(p.cooldown_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` };
  if (p.status === 'ok') return { cls: 'ok', text: 'Ready' };
  return { cls: '', text: 'Not tested yet' };
}

function ProviderModal({ initial, passcode, nextPriority, onClose, onSaved, notify }: { initial: ProviderRow | null; passcode: string; nextPriority: number; onClose: () => void; onSaved: () => void; notify: (m: string) => void }) {
  const [preset, setPreset] = useState(initial?.preset ?? 'groq');
  const pr = PRESETS.find(x => x.id === preset) ?? PRESETS[0];
  const [name, setName] = useState(initial?.slot_name ?? '');
  const [base, setBase] = useState(initial?.base_url ?? PRESETS.find(x => x.id === 'groq')!.base_url);
  const [models, setModels] = useState((initial?.models ?? []).join(', '));
  const [filter, setFilter] = useState(initial?.model_filter ?? '');
  const [cap, setCap] = useState(initial?.daily_limit ? String(initial.daily_limit) : '');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (id: string) => { const x = PRESETS.find(p => p.id === id)!; setPreset(id); setBase(x.base_url); setFilter(x.filter ?? ''); if (!initial && !name.trim()) setName(x.label); };
  const save = async () => {
    if (!initial && !key.trim()) { notify('Paste the API key.'); return; }
    setBusy(true);
    const r = await hub.saveProvider(passcode, {
      id: initial?.id ?? null, slot_name: name.trim() || pr.label, preset, kind: pr.kind, base_url: pr.kind === 'gemini' ? (base || pr.base_url) : base,
      models: models.split(',').map(s => s.trim()).filter(Boolean), model_filter: filter.trim() || null, priority: initial?.priority ?? nextPriority, enabled: initial?.enabled ?? true,
      daily_limit: cap.trim() ? Number(cap) : null,
    }, key.trim());
    setBusy(false);
    if (r.error) { notify(r.error); return; }
    notify('Saved. Use “Test” to check it works.'); onSaved(); onClose();
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>
    <div className="modal-head"><div><p className="eyebrow">AI Pool</p><h2 style={{ margin: 0 }}>{initial ? 'Edit AI' : 'Add a free AI'}</h2></div><button className="close" onClick={onClose}>×</button></div>
    <div className="form-grid">
      <div className="field"><label>Provider</label><select value={preset} onChange={e => pick(e.target.value)}>{PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
      <div className="field"><label>Name (to tell accounts apart)</label><input value={name} onChange={e => setName(e.target.value)} placeholder={pr.label} /></div>
      <div className="field full"><label>API key {initial && '(leave empty to keep the saved one)'}</label><input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={initial?.has_key ? '•••••• saved' : 'paste key'} /></div>
      {pr.kind === 'openai' && <div className="field full"><label>Base URL</label><input value={base} onChange={e => setBase(e.target.value)} placeholder="https://…/v1" /></div>}
      <div className="field"><label>Models (optional, comma separated)</label><input value={models} onChange={e => setModels(e.target.value)} placeholder="empty = pick the best automatically" /></div>
      <div className="field"><label>Daily request cap (optional)</label><input inputMode="numeric" value={cap} onChange={e => setCap(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 200" /></div>
      {pr.kind === 'openai' && <div className="field full"><label>Auto-pick filter (optional regex)</label><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="e.g. :free$" /></div>}
    </div>
    <p className="muted" style={{ fontSize: 12 }}>{pr.note} {pr.signup && <a href={pr.signup} target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>Get a free key <ExternalLink size={11} /></a>}</p>
    <p className="muted" style={{ fontSize: 11 }}>The key is stored encrypted in Supabase Vault. It is never shown again, and the browser never sees it after saving.</p>
    <button className="button primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
  </div></div>;
}

export function Pool({ providers, passcode, notify, onChanged }: { providers: ProviderRow[]; passcode: string; notify: (m: string) => void; onChanged: () => void }) {
  const [edit, setEdit] = useState<ProviderRow | null | 'new'>(null);
  const [testing, setTesting] = useState('');
  const [results, setResults] = useState<Record<string, string>>({});
  const sorted = [...providers].sort((a, b) => a.priority - b.priority);

  const test = async (p: ProviderRow) => {
    setTesting(p.id); const r = await hub.testProvider(passcode, p.id); setTesting('');
    setResults(x => ({ ...x, [p.id]: r.ok ? `✓ Working (${(r as any).model}, ${(r as any).ms} ms)` : `✗ ${r.error ?? 'Failed'}` })); onChanged();
  };
  const toggle = async (p: ProviderRow) => { const r = await hub.saveProvider(passcode, { ...p, enabled: !p.enabled }); if (r.error) notify(r.error); onChanged(); };
  const move = async (p: ProviderRow, dir: -1 | 1) => {
    const order = [...sorted]; const i = order.findIndex(x => x.id === p.id); const k = i + dir; if (k < 0 || k >= order.length) return;
    [order[i], order[k]] = [order[k], order[i]];
    for (let n = 0; n < order.length; n++) if (order[n].priority !== (n + 1) * 10) await hub.saveProvider(passcode, { ...order[n], priority: (n + 1) * 10 });
    onChanged();
  };
  const del = async (p: ProviderRow) => { if (!confirm(`Remove “${p.slot_name}” and its saved key?`)) return; const r = await hub.deleteProvider(passcode, p.id); if (r.error) notify(r.error); onChanged(); };
  const ready = sorted.filter(p => state(p).cls === 'ok' || (p.enabled && p.has_key && p.status === 'unknown')).length;

  return <>
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Free AI pool</span><span>{ready} of {providers.length} ready</span></div>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>Every agent uses this pool. Requests go to the AI at the top first. When a free limit runs out, that AI rests automatically and the next one answers, so work never stops. Add several free accounts (even two keys from the same provider) to get more free capacity.</p>
      <div style={{ marginTop: 12 }}><button className="button primary" onClick={() => setEdit('new')}><Plus size={14} /> Add a free AI</button></div>
    </div>
    <div className="card">
      {!sorted.length && <div className="empty">No AI connected yet. Add a free key — Gemini or Groq take about 2 minutes.</div>}
      {sorted.map((p, i) => { const s = state(p); return <div className="hub-row" key={p.id}>
        <div style={{ width: 22, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>{i + 1}</div>
        <div className="grow">
          <div><span className={`hub-dot ${s.cls}`} /><b>{p.slot_name}</b> <span className="muted" style={{ fontSize: 11 }}>{p.preset}{p.models.length ? ` · ${p.models.join(', ')}` : ' · auto model'}</span></div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{s.text} · today {p.req_today} request(s){p.tokens_today ? `, ~${Math.round(p.tokens_today / 1000)}k tokens` : ''}{p.daily_limit ? ` of your ${p.daily_limit} cap` : ''} · {p.total_failures} failure(s) in {p.total_requests}</div>
          {p.last_error && s.cls !== 'ok' && <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 4 }}>Last problem: {p.last_error}</div>}
          {results[p.id] && <div style={{ fontSize: 12, marginTop: 4 }}>{results[p.id]}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="button ghost hub-iconbtn" title="Try first" disabled={i === 0} onClick={() => void move(p, -1)}><ArrowUp size={14} /></button>
          <button className="button ghost hub-iconbtn" title="Try later" disabled={i === sorted.length - 1} onClick={() => void move(p, 1)}><ArrowDown size={14} /></button>
          <button className="button ghost" disabled={!!testing} onClick={() => void test(p)}><FlaskConical size={14} /> {testing === p.id ? 'Testing…' : 'Test'}</button>
          <button className="button ghost" onClick={() => void toggle(p)}>{p.enabled ? 'Turn off' : 'Turn on'}</button>
          <button className="button ghost hub-iconbtn" onClick={() => setEdit(p)}><Pencil size={14} /></button>
          <button className="button ghost danger hub-iconbtn" onClick={() => void del(p)}><Trash2 size={14} /></button>
        </div></div>; })}
    </div>
    <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>Usage is counted per day. Only providers you add here are ever used; if you add a paid key, that provider’s own billing applies — use the daily cap to limit it.</p>
    {edit && <ProviderModal initial={edit === 'new' ? null : edit} passcode={passcode} nextPriority={(sorted[sorted.length - 1]?.priority ?? 0) + 10} onClose={() => setEdit(null)} onSaved={onChanged} notify={notify} />}
  </>;
}
