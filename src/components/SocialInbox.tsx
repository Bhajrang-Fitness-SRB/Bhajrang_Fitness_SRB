import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Check, ExternalLink, MessageSquare, RefreshCw, Send, UserCheck, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Channel = 'whatsapp' | 'facebook' | 'instagram';
type Stage = 'new' | 'interested' | 'hot' | 'booked' | 'customer' | 'lost';
type Conv = {
  id: string; channel: Channel; external_id: string; display_name: string | null; lang: string; stage: Stage; interests: string[]; summary: string;
  human_takeover: boolean; needs_attention: boolean; attention_reason: string | null; opted_out: boolean; member_id: string | null;
  last_inbound_at: string | null; last_outbound_at: string | null; last_activity: string | null; last_message: string | null; last_direction: 'in' | 'out' | null;
};
type Inbox = { counts: { needs_attention: number; new_bookings: number; draft_reminders: number; hot: number }; conversations: Conv[] };
type Msg = { id: number; direction: 'in' | 'out'; body: string; by_human: boolean; created_at: string };
type Thread = { conversation: Conv & { member_name?: string | null; member_package?: string | null; member_expiry?: string | null }; window_open: boolean; messages: Msg[] };
type Booking = { id: string; conversation_id: string | null; kind: string; customer_name: string | null; contact: string | null; channel: string | null; preferred_time: string; details: string; status: 'NEW' | 'CONFIRMED' | 'DONE' | 'CANCELLED'; created_at: string };
type Followup = { id: string; member_id: string; member_name: string; kind: string; expiry_date: string; message: string; wa_link: string | null; status: string; error: string | null; created_at: string };
type Fact = { key: string; title: string; content: string; updated_at: string };

const CH: Record<Channel, { label: string; color: string }> = {
  whatsapp: { label: 'WhatsApp', color: '#25d366' }, facebook: { label: 'Facebook', color: '#4c8bf5' }, instagram: { label: 'Instagram', color: '#e1306c' },
};
const STAGES: Stage[] = ['new', 'interested', 'hot', 'booked', 'customer', 'lost'];
const KIND: Record<string, string> = { trial: 'Free trial', pt_consult: 'PT consultation', join_visit: 'Joining visit', supplement_order: 'Supplement order', callback: 'Call back', other: 'Other' };
const FOLLOW: Record<string, string> = { renew_7: 'Ends in ~week', renew_3: 'Ends in 1–3 days', renew_0: 'Ends today', lapsed_1: 'Just expired', lapsed_7: 'Expired 1+ week', lapsed_30: 'Expired 1+ month', lapsed_90: 'Expired 3+ months' };
const FILTERS: Array<[string, string]> = [['all', 'All chats'], ['attention', 'Needs you'], ['hot', 'Hot / booked'], ['takeover', 'You are handling'], ['whatsapp', 'WhatsApp'], ['facebook', 'Facebook'], ['instagram', 'Instagram']];

const ago = (iso: string | null | undefined) => {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now'; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`; return `${Math.floor(s / 86400)}d`;
};
const niceName = (c: Pick<Conv, 'display_name' | 'external_id' | 'channel'>) => c.display_name || (c.channel === 'whatsapp' ? `+${c.external_id}` : `${CH[c.channel].label} user`);
const chip = (text: string, color = 'var(--muted, #9aa8bb)') => <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, border: `1px solid ${color}`, color, whiteSpace: 'nowrap' }}>{text}</span>;
const ctl: React.CSSProperties = { background: '#0c131e', border: '1px solid var(--line)', borderRadius: 7, padding: '8px 10px', color: '#fff', font: 'inherit', outline: 'none' };
const sectionTitle = (t: string, right?: React.ReactNode) => <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{t}</span>{right}</div>;

/** Owner only: read the AI's WhatsApp / Facebook / Instagram chats, take over, reply, confirm bookings, send reminders, edit what the AI knows. */
export function SocialInbox({ passcode, notify }: { passcode: string; notify: (m: string) => void }) {
  const [tab, setTab] = useState<'chats' | 'bookings' | 'reminders' | 'facts'>('chats');
  const [filter, setFilter] = useState('all');
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [followups, setFollowups] = useState<Followup[] | null>(null);
  const [facts, setFacts] = useState<Fact[] | null>(null);
  const [draftFacts, setDraftFacts] = useState<Record<string, string>>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const loadInbox = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_sa_inbox', { p_passcode: passcode, p_filter: filter, p_limit: 80 });
    if (error) { notify('Could not load the inbox. Only the owner can open it.'); return; }
    setInbox(data as Inbox);
  }, [passcode, filter, notify]);
  const loadThread = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc('admin_sa_thread', { p_passcode: passcode, p_conversation_id: id, p_limit: 120 });
    if (error) { notify('Could not open that chat.'); return; }
    setThread(data as Thread);
  }, [passcode, notify]);
  const loadBookings = useCallback(async () => { const { data } = await supabase.rpc('admin_sa_bookings', { p_passcode: passcode }); setBookings((data as Booking[]) ?? []); }, [passcode]);
  const loadFollowups = useCallback(async () => { const { data } = await supabase.rpc('admin_sa_followups', { p_passcode: passcode }); setFollowups((data as Followup[]) ?? []); }, [passcode]);
  const loadFacts = useCallback(async () => {
    const { data } = await supabase.rpc('admin_sa_knowledge', { p_passcode: passcode });
    const rows = (data as Fact[]) ?? []; setFacts(rows); setDraftFacts(Object.fromEntries(rows.map(r => [r.key, r.content])));
  }, [passcode]);

  const refreshAll = useCallback(() => { void loadInbox(); if (openId) void loadThread(openId); if (tab === 'bookings') void loadBookings(); if (tab === 'reminders') void loadFollowups(); }, [loadInbox, loadThread, loadBookings, loadFollowups, openId, tab]);
  useEffect(() => { void loadInbox(); }, [loadInbox]);
  useEffect(() => { if (openId) void loadThread(openId); else setThread(null); }, [openId, loadThread]);
  useEffect(() => { if (tab === 'bookings') void loadBookings(); if (tab === 'reminders') void loadFollowups(); if (tab === 'facts') void loadFacts(); }, [tab, loadBookings, loadFollowups, loadFacts]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) refreshAll(); }, 20000); return () => clearInterval(t); }, [refreshAll]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [thread?.messages.length, openId]);

  const setConv = async (id: string, patch: { human_takeover?: boolean; needs_attention?: boolean; stage?: Stage }, done?: string) => {
    const { error } = await supabase.rpc('admin_sa_set_conversation', { p_passcode: passcode, p_id: id, p_human_takeover: patch.human_takeover ?? null, p_needs_attention: patch.needs_attention ?? null, p_stage: patch.stage ?? null });
    if (error) { notify('Could not update this chat.'); return; }
    if (done) notify(done); void loadInbox(); void loadThread(id);
  };

  const sendReply = async () => {
    if (!thread || !text.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('social-reply', { body: { passcode, conversation_id: thread.conversation.id, text: text.trim() } });
    setBusy(false);
    const d = data as { ok?: boolean; message?: string } | null;
    if (error || !d?.ok) { notify(d?.message ?? 'Could not send. Check the social-reply function is deployed.'); return; }
    setText(''); notify('Sent. The AI is paused on this chat until you hand it back.'); void loadInbox(); void loadThread(thread.conversation.id);
  };

  const setBooking = async (id: string, status: Booking['status']) => {
    const { error } = await supabase.rpc('admin_sa_set_booking', { p_passcode: passcode, p_id: id, p_status: status });
    if (error) { notify('Could not update the booking.'); return; } void loadBookings(); void loadInbox();
  };
  const markFollowup = async (id: string, status: 'SENT' | 'SKIPPED') => {
    const { error } = await supabase.rpc('admin_sa_mark_followup', { p_passcode: passcode, p_id: id, p_status: status });
    if (error) { notify('Could not update that reminder.'); return; } void loadFollowups(); void loadInbox();
  };
  const saveFact = async (key: string) => {
    const { error } = await supabase.rpc('admin_sa_set_knowledge', { p_passcode: passcode, p_key: key, p_content: draftFacts[key] ?? '' });
    if (error) { notify(error.message || 'Could not save.'); return; } notify('Saved. The AI uses this from its next message.'); void loadFacts();
  };

  const counts = inbox?.counts;
  const c = thread?.conversation;

  return <>
    <div className="page-head"><div><p className="eyebrow">WhatsApp · Facebook · Instagram</p><h1 className="title">Social Sales Inbox</h1>
      <p className="sub">Everything your AI sales assistant is saying to customers. It sells and books by itself; you step in only when it asks for you.</p></div>
      <button className="button ghost" onClick={refreshAll}><RefreshCw size={14} /> Refresh</button></div>

    <div className="grid stats" style={{ marginBottom: 16 }}>
      {([['Needs you', counts?.needs_attention, 'attention', 'var(--gold)'], ['Hot / booked chats', counts?.hot, 'hot', 'var(--green)']] as const).map(([l, v, f, col]) =>
        <button key={l} className="card" style={{ textAlign: 'left', cursor: 'pointer', color: '#fff', borderColor: (v ?? 0) > 0 ? col : 'var(--line)' }} onClick={() => { setTab('chats'); setFilter(f); }}>
          <div className="muted" style={{ fontSize: 12 }}>{l}</div><div style={{ fontSize: 28, fontWeight: 700, color: (v ?? 0) > 0 ? col : '#fff' }}>{v ?? '–'}</div></button>)}
      <button className="card" style={{ textAlign: 'left', cursor: 'pointer', color: '#fff', borderColor: (counts?.new_bookings ?? 0) > 0 ? 'var(--cyan)' : 'var(--line)' }} onClick={() => setTab('bookings')}>
        <div className="muted" style={{ fontSize: 12 }}>New bookings</div><div style={{ fontSize: 28, fontWeight: 700 }}>{counts?.new_bookings ?? '–'}</div></button>
      <button className="card" style={{ textAlign: 'left', cursor: 'pointer', color: '#fff' }} onClick={() => setTab('reminders')}>
        <div className="muted" style={{ fontSize: 12 }}>Renewal reminders to send</div><div style={{ fontSize: 28, fontWeight: 700 }}>{counts?.draft_reminders ?? '–'}</div></button>
    </div>

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {([['chats', 'Chats'], ['bookings', 'Bookings'], ['reminders', 'Renewal reminders'], ['facts', 'What the AI knows']] as const).map(([k, l]) =>
        <button key={k} className={tab === k ? 'button primary' : 'button ghost'} onClick={() => setTab(k)}>{l}</button>)}
    </div>

    {tab === 'chats' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
      <div className="card" style={{ maxHeight: 640, overflow: 'auto' }}>
        {sectionTitle('Conversations', <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...ctl, maxWidth: 150 }}>{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>)}
        {!inbox && <div className="empty">Loading…</div>}
        {inbox && !inbox.conversations.length && <div className="empty">No chats here yet. Once customers message your number, page or Instagram, they appear here.</div>}
        {inbox?.conversations.map(v => <div key={v.id} onClick={() => setOpenId(v.id)} style={{ borderTop: '1px solid var(--line)', padding: '10px 6px', cursor: 'pointer', background: openId === v.id ? 'rgba(80,170,255,.09)' : 'transparent' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14 }}>{niceName(v)}</b>
            {chip(CH[v.channel].label, CH[v.channel].color)}
            {v.needs_attention && chip('Needs you', 'var(--gold)')}
            {v.human_takeover && chip('You handle', 'var(--cyan)')}
            {v.stage === 'hot' && chip('Hot', 'var(--green)')}
            {v.stage === 'booked' && chip('Booked', 'var(--green)')}
            {v.opted_out && chip('Opted out', 'var(--red, #ff5d5d)')}
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{ago(v.last_activity)}</span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.last_direction === 'out' ? '↩ ' : ''}{v.last_message}</div>
          {v.needs_attention && v.attention_reason && <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 2 }}>⚑ {v.attention_reason}</div>}
        </div>)}
      </div>

      <div className="card">
        {!c && <div className="empty"><MessageSquare size={18} /> Pick a chat to read it.</div>}
        {c && thread && <>
          {sectionTitle(niceName(c), <span>{chip(CH[c.channel].label, CH[c.channel].color)} {c.channel === 'whatsapp' && <a href={`https://wa.me/${c.external_id}`} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12 }}><ExternalLink size={12} /> open</a>}</span>)}
          {c.member_id && <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--green)' }}>✓ Existing member: {c.member_name ?? c.member_id}{c.member_package ? ` · ${c.member_package}` : ''}{c.member_expiry ? ` · expires ${c.member_expiry}` : ''}</p>}
          {c.summary && <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>🧠 {c.summary}</p>}
          {c.needs_attention && <p style={{ fontSize: 12, color: 'var(--gold)', margin: '0 0 8px' }}>⚑ {c.attention_reason ?? 'The AI asked you to look at this chat.'}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
            {c.human_takeover
              ? <button className="button cyan" onClick={() => void setConv(c.id, { human_takeover: false, needs_attention: false }, 'AI is handling this chat again.')}><Bot size={14} /> Hand back to AI</button>
              : <button className="button ghost" onClick={() => void setConv(c.id, { human_takeover: true }, 'AI paused. You are handling this chat.')}><UserCheck size={14} /> I’ll handle this (pause AI)</button>}
            {c.needs_attention && <button className="button ghost" onClick={() => void setConv(c.id, { needs_attention: false }, 'Marked as handled.')}><Check size={14} /> Mark handled</button>}
            <select value={c.stage} onChange={e => void setConv(c.id, { stage: e.target.value as Stage })} style={{ ...ctl, maxWidth: 130 }}>{STAGES.map(s => <option key={s} value={s}>{s}</option>)}</select>
          </div>

          <div style={{ maxHeight: 340, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 2px', borderTop: '1px solid var(--line)' }}>
            {thread.messages.map(m => <div key={m.id} style={{ alignSelf: m.direction === 'in' ? 'flex-start' : 'flex-end', maxWidth: '86%' }}>
              <div style={{ padding: '7px 11px', borderRadius: 12, fontSize: 13, whiteSpace: 'pre-wrap', background: m.direction === 'in' ? 'rgba(255,255,255,.07)' : m.by_human ? 'rgba(255,190,60,.18)' : 'rgba(80,170,255,.16)' }}>{m.body}</div>
              <div className="muted" style={{ fontSize: 10, textAlign: m.direction === 'in' ? 'left' : 'right' }}>{m.direction === 'in' ? 'Customer' : m.by_human ? 'You' : 'AI'} · {ago(m.created_at)}</div>
            </div>)}
            <div ref={bottom} />
          </div>

          {c.opted_out && <p style={{ fontSize: 12, color: 'var(--red, #ff5d5d)' }}>This customer sent STOP. Reply only if they message you again.</p>}
          {!thread.window_open && <p className="muted" style={{ fontSize: 12 }}>⏱ More than 24 hours since they last wrote, so WhatsApp / Facebook / Instagram will not let you send a free message. When they write again you can reply.</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder={thread.window_open ? 'Type your reply… (sending pauses the AI on this chat)' : 'Replying is locked until the customer writes again'} disabled={!thread.window_open || busy}
              style={{ ...ctl, flex: 1, resize: 'vertical' }} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void sendReply(); }} />
            <button className="button primary" disabled={!thread.window_open || busy || !text.trim()} onClick={() => void sendReply()}><Send size={14} /> {busy ? '…' : 'Send'}</button>
          </div>
        </>}
      </div>
    </div>}

    {tab === 'bookings' && <div className="card">
      {sectionTitle('Trials, PT consultations & orders the AI collected', <span>{bookings?.length ?? 0}</span>)}
      {!bookings && <div className="empty">Loading…</div>}
      {bookings && !bookings.length && <div className="empty">No bookings yet.</div>}
      {bookings?.map(b => <div key={b.id} style={{ borderTop: '1px solid var(--line)', padding: '12px 0' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b>{KIND[b.kind] ?? b.kind}</b> {chip(b.status, b.status === 'NEW' ? 'var(--gold)' : b.status === 'CANCELLED' ? 'var(--red, #ff5d5d)' : 'var(--green)')}
          <span className="muted" style={{ fontSize: 11 }}>{ago(b.created_at)} ago</span></div>
        <div style={{ fontSize: 13, margin: '4px 0' }}>{b.customer_name || 'Customer'} · {b.contact}{b.preferred_time ? ` · wants: ${b.preferred_time}` : ''}</div>
        {b.details && <div className="muted" style={{ fontSize: 12 }}>{b.details}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {b.conversation_id && <button className="button ghost" style={{ padding: '5px 10px' }} onClick={() => { setTab('chats'); setOpenId(b.conversation_id); }}>Open chat</button>}
          {b.status === 'NEW' && <button className="button primary" style={{ padding: '5px 10px' }} onClick={() => void setBooking(b.id, 'CONFIRMED')}><Check size={13} /> Confirmed</button>}
          {(b.status === 'NEW' || b.status === 'CONFIRMED') && <button className="button ghost" style={{ padding: '5px 10px' }} onClick={() => void setBooking(b.id, 'DONE')}>Done</button>}
          {(b.status === 'NEW' || b.status === 'CONFIRMED') && <button className="button ghost" style={{ padding: '5px 10px' }} onClick={() => void setBooking(b.id, 'CANCELLED')}><X size={13} /> Cancel</button>}
        </div>
      </div>)}
    </div>}

    {tab === 'reminders' && <div className="card">
      {sectionTitle('Renewal & win-back messages', <span>{followups?.filter(f => f.status === 'DRAFT').length ?? 0} waiting</span>)}
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>The AI writes one personal message per member at each stage, mentioning Personal Training. Tap “Open WhatsApp”, press send there, then “Mark sent”.</p>
      {!followups && <div className="empty">Loading…</div>}
      {followups && !followups.length && <div className="empty">Nothing yet. The daily job fills this list.</div>}
      {followups?.map(f => <div key={f.id} style={{ borderTop: '1px solid var(--line)', padding: '12px 0' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b>{f.member_name}</b>{chip(FOLLOW[f.kind] ?? f.kind)}{chip(f.status, f.status === 'DRAFT' ? 'var(--gold)' : f.status === 'FAILED' ? 'var(--red, #ff5d5d)' : 'var(--green)')}<span className="muted" style={{ fontSize: 11 }}>expiry {f.expiry_date}</span></div>
        <div style={{ fontSize: 13, margin: '6px 0', whiteSpace: 'pre-wrap' }}>{f.message}</div>
        {f.error && <div style={{ fontSize: 11, color: 'var(--red, #ff5d5d)' }}>{f.error.slice(0, 160)}</div>}
        {(f.status === 'DRAFT' || f.status === 'FAILED') && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {f.wa_link && <a className="button primary" style={{ padding: '5px 10px' }} href={f.wa_link} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open WhatsApp</a>}
          <button className="button ghost" style={{ padding: '5px 10px' }} onClick={() => void markFollowup(f.id, 'SENT')}><Check size={13} /> Mark sent</button>
          <button className="button ghost" style={{ padding: '5px 10px' }} onClick={() => void markFollowup(f.id, 'SKIPPED')}>Skip</button>
        </div>}
      </div>)}
    </div>}

    {tab === 'facts' && <div className="card">
      {sectionTitle('What the AI knows about your gym', <span>{facts?.length ?? 0} topics</span>)}
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Package prices come from your Packages tab and store prices from Inventory. Fill in the rest here. Anything left empty, the AI will not guess: it says “our team will confirm”. Only write real offers and prices.</p>
      {!facts && <div className="empty">Loading…</div>}
      {facts?.map(f => <div key={f.key} className="field" style={{ marginBottom: 14 }}>
        <label>{f.title}</label>
        {f.key === 'auto_send_followups'
          ? <select value={draftFacts[f.key] ?? 'no'} onChange={e => setDraftFacts(d => ({ ...d, [f.key]: e.target.value }))}><option value="no">No — save reminders as drafts for me (safe)</option><option value="yes">Yes — send reminders automatically (needs approved template)</option></select>
          : f.key === 'default_language'
            ? <select value={draftFacts[f.key] ?? 'en'} onChange={e => setDraftFacts(d => ({ ...d, [f.key]: e.target.value }))}><option value="en">English</option><option value="bn">Bengali (বাংলা)</option><option value="bn-roman">Banglish (Bengali in English letters)</option></select>
            : <textarea rows={3} maxLength={4000} value={draftFacts[f.key] ?? ''} onChange={e => setDraftFacts(d => ({ ...d, [f.key]: e.target.value }))} />}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <button className="button primary" style={{ padding: '5px 12px' }} disabled={(draftFacts[f.key] ?? '') === f.content} onClick={() => void saveFact(f.key)}>Save</button>
          {(draftFacts[f.key] ?? '') !== f.content && <span className="muted" style={{ fontSize: 11 }}>unsaved changes</span>}
        </div>
      </div>)}
    </div>}
  </>;
}
