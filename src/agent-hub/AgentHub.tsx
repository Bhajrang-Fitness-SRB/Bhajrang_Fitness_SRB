import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, ClipboardCheck, Cpu, History, Link2, Mic, MicOff, RefreshCw, Send, Sun, Trash2, Users } from 'lucide-react';
import './hub.css';
import { hub } from './api';
import { Md } from './Md';
import { Approvals, ProposalCard } from './Approvals';
import { Pool } from './Pool';
import { Agents } from './Agents';
import { Connections } from './Connections';
import { QUICK_PROMPTS } from './presets';
import type { ActivityRow, AgentRow, ChatMsg, Overview, Proposal } from './types';

type Tab = 'command' | 'approvals' | 'agents' | 'pool' | 'connections' | 'activity';
type Fail = { error: string; code?: string; attempts?: { provider: string; model: string; error?: string }[] };

function Command({ ov, passcode, notify, onChanged, goto }: { ov: Overview; passcode: string; notify: (m: string) => void; onChanged: () => void; goto: (t: Tab) => void }) {
  const agents = ov.agents.filter(a => a.enabled);
  const [agentKey, setAgentKey] = useState(agents[0]?.key ?? 'master');
  const [convId, setConvId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<Proposal[]>([]);
  const [fail, setFail] = useState<Fail | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState<'en-IN' | 'hi-IN'>('en-IN');
  const rec = useRef<any>(null);
  const SR = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
  const toggleMic = () => {
    if (!SR) { notify('Voice input is not supported in this browser. Try Chrome.'); return; }
    if (listening) { rec.current?.stop(); return; }
    const r = new SR(); r.lang = lang; r.interimResults = true; r.continuous = false;
    const base = text ? text.trimEnd() + ' ' : '';
    r.onresult = (e: any) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setText(base + t); };
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    rec.current = r; setListening(true); try { r.start(); } catch { setListening(false); }
  };
  useEffect(() => () => { try { rec.current?.abort(); } catch { /* ignore */ } }, []);
  const agent: AgentRow | undefined = agents.find(a => a.key === agentKey) ?? agents[0];
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);

  const openConv = async (id: string, key: string) => {
    setConvId(id); setAgentKey(key); setFresh([]); setFail(null);
    const r = await hub.messages(passcode, id); setMsgs(r.data ?? []);
  };
  const newChat = (key?: string) => { setConvId(null); setMsgs([]); setFresh([]); setFail(null); if (key) setAgentKey(key); };
  const send = async (override?: string) => {
    const message = (override ?? text).trim(); if (!message || busy || !agent) return;
    setText(''); setBusy(true); setFail(null); setFresh([]);
    setMsgs(m => [...m, { role: 'user', content: message }]);
    const r: any = await hub.chat(passcode, agent.key, message, convId);
    setBusy(false);
    if (r.conversation_id) setConvId(r.conversation_id);
    if (r.ok) {
      setMsgs(m => [...m, { role: 'assistant', content: r.reply, agent_key: agent.key, provider_slot: r.provider, model: r.model }]);
      setFresh(r.proposals ?? []);
    } else setFail({ error: r.error ?? 'Something went wrong.', code: r.code, attempts: r.attempts });
    onChanged();
  };
  const delConv = async (id: string) => { await hub.deleteConversation(passcode, id); if (id === convId) newChat(); onChanged(); };
  const convs = ov.conversations;

  if (!agent) return <div className="empty">All agents are switched off. Turn one on in the Agents tab.</div>;
  return <div className="hub-chat">
    <div className="hub-side">
      <h4>Agents</h4>
      {agents.map(a => <button key={a.key} className={`hub-agent-btn ${a.key === agent.key ? 'on' : ''}`} onClick={() => newChat(a.key)}><span style={{ fontSize: 16 }}>{a.icon}</span><span>{a.name}</span></button>)}
      <h4>Recent chats</h4>
      {convs.slice(0, 12).map(c => <div key={c.id} style={{ display: 'flex', gap: 4 }}>
        <button className={`hub-conv ${c.id === convId ? 'on' : ''}`} onClick={() => void openConv(c.id, c.agent_key)} title={c.title}>{ov.agents.find(a => a.key === c.agent_key)?.icon ?? '🤖'} <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span></button>
        <button className="button ghost hub-iconbtn" aria-label="Delete chat" onClick={() => void delConv(c.id)}><Trash2 size={12} /></button></div>)}
    </div>
    <div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 22 }}>{agent.icon}</span><div><b>{agent.name}</b><div className="muted" style={{ fontSize: 12 }}>{agent.description}</div></div>
          <button className="button ghost" style={{ marginLeft: 'auto' }} onClick={() => newChat()}>New chat</button></div>
        <div className="hub-thread">
          {!msgs.length && !busy && <div className="muted" style={{ fontSize: 13, padding: '16px 4px' }}>Tell {agent.name} what you want in your own words — in English, Hindi or Hinglish. It will answer, and if something should be changed, sent or posted it will prepare it for your approval.
            <div style={{ marginTop: 10 }}><button className="button cyan" onClick={() => void send(agent.key === 'master' ? "Give me today's briefing: how the gym is doing, what needs my attention, and the 3 best actions for today." : `Give me today's briefing for your area and the 3 best actions for today.`)}><Sun size={15} /> Today's briefing</button></div>
            <div className="hub-chips">{(QUICK_PROMPTS[agent.key] ?? []).map(q => <button key={q} className="hub-chip" onClick={() => void send(q)}>{q}</button>)}</div></div>}
          {msgs.map((m, i) => <div key={m.id ?? i} className={`hub-msg ${m.role}`}><Md text={m.content} />
            {m.role === 'assistant' && m.provider_slot && <div className="hub-meta">answered by {m.provider_slot}{m.model ? ` · ${m.model}` : ''}</div>}</div>)}
          {busy && <div className="hub-msg assistant muted"><Bot size={14} style={{ verticalAlign: 'middle' }} /> {agent.name} is working… (it switches to another free AI by itself if one is out of quota)</div>}
          <div ref={end} />
        </div>
        {fail && <div className="hub-warn red"><b>{fail.error}</b>
          {fail.code === 'no_providers' && <div style={{ marginTop: 6 }}><button className="button primary" onClick={() => goto('pool')}>Open AI Pool</button></div>}
          {fail.attempts && fail.attempts.length > 0 && <details style={{ marginTop: 6 }}><summary style={{ cursor: 'pointer' }}>What was tried</summary>{fail.attempts.map((a, i) => <div key={i} style={{ fontSize: 11 }}>{a.provider} {a.model !== '-' ? `(${a.model})` : ''}: {a.error ?? 'ok'}</div>)}</details>}</div>}
        {fresh.length > 0 && <div style={{ marginTop: 10 }}><b style={{ fontSize: 13 }}>{fresh.length} proposal{fresh.length > 1 ? 's' : ''} ready for your decision</b>
          <div style={{ marginTop: 8 }}>{fresh.map(p => <ProposalCard key={p.id} p={ov.proposals.find(x => x.id === p.id) ?? { ...p, agent_key: agent.key, test_result: null, result: null, created_at: new Date().toISOString() } as Proposal} passcode={passcode} agents={ov.agents} notify={notify} onChanged={onChanged} />)}</div></div>}
        <div className="hub-composer">
          <textarea value={text} placeholder={`Ask or instruct ${agent.name}…`} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send(); }} />
          <button className={`button ghost hub-iconbtn ${listening ? 'hub-mic-on' : ''}`} title={listening ? 'Stop listening' : 'Speak your instruction'} aria-label="Voice input" onClick={toggleMic}>{listening ? <MicOff size={16} /> : <Mic size={16} />}</button>
          <button className="button ghost hub-iconbtn" title="Voice language" onClick={() => setLang(l => l === 'en-IN' ? 'hi-IN' : 'en-IN')} style={{ fontSize: 11 }}>{lang === 'en-IN' ? 'EN' : 'हिं'}</button>
          <button className="button primary" disabled={busy || !text.trim()} onClick={() => void send()}><Send size={15} /> Send</button>
        </div>
        <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>Ctrl+Enter to send · Agents cannot change anything until you approve.</div>
      </div>
    </div>
  </div>;
}

function Activity({ passcode }: { passcode: string }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  useEffect(() => { void hub.activity(passcode).then(r => setRows(r.data ?? [])); }, [passcode]);
  if (!rows) return <div className="empty">Loading…</div>;
  return <div className="card"><div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Everything the Hub did</span><span>latest 100</span></div>
    {!rows.length && <p className="muted">Nothing yet.</p>}
    {rows.map(r => <div className="hub-row" key={r.id} style={{ padding: '9px 0' }}><span className="muted" style={{ fontSize: 11, width: 140 }}>{new Date(r.at).toLocaleString()}</span><span className="pill gold">{r.actor}</span><span style={{ fontSize: 12 }}><b>{r.event.replace(/_/g, ' ')}</b> <span className="muted">{[r.detail.title, r.detail.name, r.detail.kind, r.detail.error].filter(Boolean).join(' · ')}</span></span></div>)}
  </div>;
}

/** Owner-only master control for all AI agents. Self-contained: needs only the owner passcode. */
export function AgentHub({ passcode, notify }: { passcode: string; notify: (m: string) => void }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>('command');
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await hub.overview(passcode);
    if (r.error) { setErr(/function .*does not exist|admin_hub_overview/i.test(r.error) ? 'The Hub database part is not installed yet. Run the migration 20261016000000_rbf_agent_hub.sql in Supabase.' : r.error); return; }
    setErr(''); setOv(r.data);
  }, [passcode]);
  useEffect(() => { void load(); }, [load]);

  if (err) return <div className="card"><div className="hub-warn red">{err}</div><button className="button" onClick={() => void load()}><RefreshCw size={14} /> Try again</button></div>;
  if (!ov) return <div className="empty">Loading the Agent Hub…</div>;
  const waiting = ov.proposals.filter(p => p.status === 'PENDING' || p.status === 'PR_OPEN').length;
  const ready = ov.providers.filter(p => p.enabled && p.has_key && p.status !== 'invalid').length;
  const tabs: [Tab, string, typeof Bot, number?][] = [['command', 'Command', Bot], ['approvals', 'Approvals', ClipboardCheck, waiting], ['agents', 'Agents', Users], ['pool', 'AI Pool', Cpu], ['connections', 'Connections', Link2], ['activity', 'Activity', History]];
  return <>
    <div className="page-head"><div><p className="eyebrow">Owner only · master control</p><h1 className="title">AI Agent Hub</h1>
      <p className="sub">All your free AIs work together. Ask for anything; agents prepare it, you approve it. {ready ? `${ready} AI${ready > 1 ? 's' : ''} ready.` : 'No AI connected yet — start in the AI Pool tab.'}</p></div>
      <button className="button" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button></div>
    <div className="hub-orbs" aria-label="AI pool health">{ov.providers.length === 0 ? <span className="muted" style={{ fontSize: 11 }}>No AI connected</span> : [...ov.providers].sort((a, b) => a.priority - b.priority).map(p => { const rest = p.status === 'cooldown' && p.cooldown_until && new Date(p.cooldown_until) > new Date(); const cls = !p.enabled || !p.has_key ? 'off' : p.status === 'invalid' ? 'bad' : rest ? 'rest' : 'ok'; return <span key={p.id} className={`hub-orb ${cls}`} title={`${p.slot_name}: ${cls === 'ok' ? 'ready' : cls === 'rest' ? 'resting (free limit)' : cls === 'bad' ? 'key rejected' : 'off'}`}><i />{p.slot_name}</span>; })}</div>
    <div className="hub-tabs" role="tablist">{tabs.map(([k, label, Icon, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon size={15} /> {label}{!!n && <span className="hub-badge">{n}</span>}</button>)}</div>
    {tab === 'command' && <Command ov={ov} passcode={passcode} notify={notify} onChanged={() => void load()} goto={setTab} />}
    {tab === 'approvals' && <Approvals proposals={ov.proposals} passcode={passcode} agents={ov.agents} notify={notify} onChanged={() => void load()} />}
    {tab === 'agents' && <Agents agents={ov.agents} providers={ov.providers} passcode={passcode} notify={notify} onChanged={() => void load()} />}
    {tab === 'pool' && <Pool providers={ov.providers} passcode={passcode} notify={notify} onChanged={() => void load()} />}
    {tab === 'connections' && <Connections settings={ov.settings} secrets={ov.secrets} passcode={passcode} notify={notify} onChanged={() => void load()} />}
    {tab === 'activity' && <Activity passcode={passcode} />}
  </>;
}
