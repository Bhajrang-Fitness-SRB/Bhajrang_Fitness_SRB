import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { hub } from './api';
import { AGENT_TEMPLATES, DATA_ACCESS, INTEL_KINDS } from './presets';
import type { AgentRow, ProviderRow } from './types';

type Draft = { key: string; name: string; icon: string; description: string; persona: string; data_access: string[]; proposal_kinds: string[]; preferred_provider: string; enabled: boolean; builtin?: boolean; isNew: boolean };

function AgentModal({ d, providers, passcode, onClose, onSaved, notify }: { d: Draft; providers: ProviderRow[]; passcode: string; onClose: () => void; onSaved: () => void; notify: (m: string) => void }) {
  const [v, setV] = useState(d); const [busy, setBusy] = useState(false);
  const flip = (k: 'data_access' | 'proposal_kinds', id: string) => setV(x => ({ ...x, [k]: x[k].includes(id) ? x[k].filter(i => i !== id) : [...x[k], id] }));
  const save = async () => {
    setBusy(true);
    const r = await hub.saveAgent(passcode, { key: v.key, name: v.name, icon: v.icon, description: v.description, persona: v.persona, data_access: v.data_access, proposal_kinds: v.proposal_kinds, preferred_provider: v.preferred_provider || null, enabled: v.enabled });
    setBusy(false); if (r.error) { notify(r.error); return; } notify('Agent saved.'); onSaved(); onClose();
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" style={{ width: 'min(720px,100%)' }} onClick={e => e.stopPropagation()}>
    <div className="modal-head"><div><p className="eyebrow">Agent</p><h2 style={{ margin: 0 }}>{v.isNew ? 'New agent' : v.name}</h2></div><button className="close" onClick={onClose}>×</button></div>
    <div className="form-grid">
      <div className="field"><label>Name</label><input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></div>
      <div className="field"><label>Icon (emoji)</label><input value={v.icon} maxLength={4} onChange={e => setV({ ...v, icon: e.target.value })} /></div>
      <div className="field"><label>Short id {v.isNew ? '(a-z, 0-9, _)' : '(fixed)'}</label><input value={v.key} disabled={!v.isNew} onChange={e => setV({ ...v, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} /></div>
      <div className="field"><label>Preferred AI (optional)</label><select value={v.preferred_provider} onChange={e => setV({ ...v, preferred_provider: e.target.value })}><option value="">Any (pool order)</option>{providers.map(p => <option key={p.id} value={p.id}>{p.slot_name}</option>)}</select></div>
      <div className="field full"><label>What it does (one line)</label><input value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></div>
      <div className="field full"><label>Instructions — who it is and how it should work</label><textarea style={{ minHeight: 150 }} value={v.persona} onChange={e => setV({ ...v, persona: e.target.value })} /></div>
    </div>
    <div className="hub-grid-2" style={{ marginTop: 14 }}>
      <div><b style={{ fontSize: 12 }}>It may look at</b>{DATA_ACCESS.map(a => <label className="hub-check" key={a.id}><input type="checkbox" checked={v.data_access.includes(a.id)} onChange={() => flip('data_access', a.id)} />{a.label}</label>)}</div>
      <div><b style={{ fontSize: 12 }}>It may propose (you always approve)</b>{INTEL_KINDS.map(k => <label className="hub-check" key={k.id}><input type="checkbox" checked={v.proposal_kinds.includes(k.id)} onChange={() => flip('proposal_kinds', k.id)} /><span>{k.label}<br /><span className="muted" style={{ fontSize: 10 }}>{k.hint}</span></span></label>)}</div>
    </div>
    <p className="muted" style={{ fontSize: 11 }}>Safety rules and the approval step are built into the Hub. Editing instructions can never remove them.</p>
    <button className="button primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save agent'}</button>
  </div></div>;
}

export function Agents({ agents, providers, passcode, notify, onChanged }: { agents: AgentRow[]; providers: ProviderRow[]; passcode: string; notify: (m: string) => void; onChanged: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const fromAgent = (a: AgentRow): Draft => ({ key: a.key, name: a.name, icon: a.icon, description: a.description, persona: a.persona, data_access: a.data_access, proposal_kinds: a.proposal_kinds, preferred_provider: a.preferred_provider ?? '', enabled: a.enabled, builtin: a.builtin, isNew: false });
  const toggle = async (a: AgentRow) => { const r = await hub.saveAgent(passcode, { ...a, enabled: !a.enabled }); if (r.error) notify(r.error); onChanged(); };
  const del = async (a: AgentRow) => { if (!confirm(`Delete agent “${a.name}”? Its chats are deleted too.`)) return; const r = await hub.deleteAgent(passcode, a.key); if (r.error) notify(r.error); onChanged(); };
  const unused = AGENT_TEMPLATES.filter(t => t.key === 'blank' || !agents.some(a => a.key === t.key));
  return <>
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Add another agent</span><span>room for everything a business needs</span></div>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>Start from an idea or a blank agent. A new agent appears in the Command tab immediately and Master Control can hand work to it.</p>
      <div className="hub-chips">{unused.map(t => <button key={t.key} className="hub-chip" onClick={() => setDraft({ ...t, preferred_provider: '', enabled: true, isNew: true, key: t.key === 'blank' ? '' : t.key, name: t.key === 'blank' ? '' : t.name })}>{t.icon} {t.name}</button>)}</div>
      <button className="button primary" onClick={() => setDraft({ key: '', name: '', icon: '🤖', description: '', persona: '', data_access: [], proposal_kinds: ['content'], preferred_provider: '', enabled: true, isNew: true })}><Plus size={14} /> New agent</button>
    </div>
    <div className="card">
      {agents.map(a => <div className="hub-row" key={a.key}>
        <div style={{ fontSize: 22 }}>{a.icon}</div>
        <div className="grow"><b>{a.name}</b> {a.builtin && <span className="pill">built-in</span>} {!a.enabled && <span className="pill red">off</span>}
          <div className="muted" style={{ fontSize: 12 }}>{a.description}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Can propose: {a.proposal_kinds.join(', ') || 'nothing (advice only)'} · looks at: {a.data_access.join(', ') || 'nothing'}</div></div>
        <button className="button ghost" onClick={() => void toggle(a)}>{a.enabled ? 'Turn off' : 'Turn on'}</button>
        <button className="button ghost hub-iconbtn" onClick={() => setDraft(fromAgent(a))}><Pencil size={14} /></button>
        {!a.builtin && <button className="button ghost danger hub-iconbtn" onClick={() => void del(a)}><Trash2 size={14} /></button>}
      </div>)}
    </div>
    {draft && <AgentModal d={draft} providers={providers} passcode={passcode} onClose={() => setDraft(null)} onSaved={onChanged} notify={notify} />}
  </>;
}
