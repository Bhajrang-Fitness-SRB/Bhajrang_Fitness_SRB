import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BookOpen, Check, ChevronDown, ChevronUp, Gavel, Plus, Trash2, X } from 'lucide-react';
import { supabase, type Member } from '../lib/supabase';

export type Rule = { title: string; body: string; fine_amount: string };
type RuleRow = { rule_position: number; title: string; body: string; fine_amount: number | null; updated_at: string };

const money = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;

async function fetchRules(): Promise<RuleRow[]> {
  const { data } = await supabase.rpc('get_rule_book');
  return (data as RuleRow[]) ?? [];
}

/** Read-only rule book, laid out like a small book. Everyone can see it. */
export function RuleBookView({ onClose }: { onClose?: () => void }) {
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  useEffect(() => { void fetchRules().then(setRules); }, []);
  const body = <>
    <div className="modal-head"><div><p className="eyebrow">Bhajrang Fitness</p><h2 style={{ margin: 0 }}><BookOpen size={20} style={{ verticalAlign: -3 }} /> Gym Rule Book</h2>
      <p className="sub">Please read and follow these rules. Violations may lead to a fine or other action.</p></div>
      {onClose && <button type="button" className="close" onClick={onClose}><X /></button>}</div>
    {rules === null ? <div className="empty">Loading…</div> : rules.length === 0 ? <div className="empty">The rule book has not been written yet.</div> :
      <div style={{ display: 'grid', gap: 12 }}>{rules.map(r => <div key={r.rule_position} className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', justifyContent: 'space-between' }}>
          <b style={{ fontSize: 15 }}><span style={{ color: 'var(--gold)' }}>{r.rule_position}.</span> {r.title}</b>
          {r.fine_amount != null && <span className="pill red" style={{ whiteSpace: 'nowrap' }}>Fine {money(r.fine_amount)}</span>}
        </div>
        {r.body && <p className="sub" style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{r.body}</p>}
      </div>)}</div>}
  </>;
  return onClose ? <div className="modal-backdrop"><div className="modal" style={{ maxWidth: 640 }}>{body}</div></div> : <div>{body}</div>;
}

/** Owner only: write and edit the rule book. */
export function RuleBookEditor({ passcode, notify }: { passcode: string; notify: (m: string) => void }) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { void fetchRules().then(rows => setRules(rows.map(r => ({ title: r.title, body: r.body, fine_amount: r.fine_amount == null ? '' : String(r.fine_amount) })))); }, []);
  const upd = (i: number, f: keyof Rule, v: string) => setRules(rs => rs!.map((r, j) => j === i ? { ...r, [f]: v } : r));
  const move = (i: number, d: number) => setRules(rs => { const a = [...rs!]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('admin_save_rule_book', { p_passcode: passcode, p_rules: rules!.filter(r => r.title.trim()) });
    setSaving(false);
    if (error) { notify(error.message || 'Could not save the rule book.'); return; }
    notify('Rule book saved. Members can see it now.');
  };
  if (rules === null) return <div className="empty">Loading…</div>;
  return <>
    <div className="page-head"><div><p className="eyebrow">Owner only</p><h1 className="title">Gym Rule Book</h1><p className="sub">Write the rules here. Everyone can read them; only you can edit. Add an optional fine for each rule.</p></div>
      <button className="button primary" disabled={saving} onClick={() => void save()}><Check size={15} /> {saving ? 'Saving…' : 'Save rule book'}</button></div>
    <div style={{ display: 'grid', gap: 14 }}>
      {rules.map((r, i) => <div key={i} className="card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <b style={{ color: 'var(--gold)' }}>{i + 1}.</b>
          <input className="search" style={{ flex: 1, minWidth: 0 }} placeholder="Rule title (e.g. Wipe the equipment after use)" maxLength={120} value={r.title} onChange={e => upd(i, 'title', e.target.value)} />
          <button className="button ghost" style={{ padding: '6px 8px' }} onClick={() => move(i, -1)} disabled={i === 0}><ChevronUp size={14} /></button>
          <button className="button ghost" style={{ padding: '6px 8px' }} onClick={() => move(i, 1)} disabled={i === rules.length - 1}><ChevronDown size={14} /></button>
          <button className="button danger" style={{ padding: '6px 8px' }} onClick={() => setRules(rs => rs!.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
        </div>
        <div className="field"><textarea placeholder="Describe the rule…" maxLength={5000} value={r.body} onChange={e => upd(i, 'body', e.target.value)} /></div>
        <div className="field" style={{ marginTop: 10, maxWidth: 220 }}><label>Fine for breaking it (₹, optional)</label><input type="number" min={0} max={100000} value={r.fine_amount} onChange={e => upd(i, 'fine_amount', e.target.value)} /></div>
      </div>)}
      <button className="button ghost" style={{ justifyContent: 'center' }} onClick={() => setRules(rs => [...rs!, { title: '', body: '', fine_amount: '' }])}><Plus size={15} /> Add a rule</button>
    </div>
  </>;
}

type Fine = { id: string; member_id: string; member_name: string | null; rule_title: string | null; reason: string; amount: number; punishment: string | null; status: 'UNPAID' | 'PAID' | 'WAIVED'; issued_by: string; issued_at: string; resolved_at: string | null; resolved_by: string | null };

/** Owner or staff: charge a fine / punishment and track payment. */
export function FinesDesk({ passcode, members, isOwner, notify }: { passcode: string; members: Member[]; isOwner: boolean; notify: (m: string) => void }) {
  const [fines, setFines] = useState<Fine[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [form, setForm] = useState({ memberId: '', rule: '', reason: '', amount: '', punishment: '' });
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('admin_list_fines', { p_passcode: passcode });
    setFines((data as Fine[]) ?? []);
  }, [passcode]);
  useEffect(() => { void load(); void fetchRules().then(setRules); }, [load]);

  const pickRule = (title: string) => {
    const r = rules.find(x => x.title === title);
    setForm(f => ({ ...f, rule: title, amount: r?.fine_amount != null ? String(r.fine_amount) : f.amount, reason: f.reason || (title ? `Broke rule: ${title}` : '') }));
  };
  const issue = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.rpc('admin_issue_fine', { p_passcode: passcode, p_member_id: form.memberId, p_rule_title: form.rule || null, p_reason: form.reason, p_amount: Number(form.amount) || 0, p_punishment: form.punishment || null });
    setBusy(false);
    if (error) { notify(error.message || 'Could not issue the fine.'); return; }
    notify('Fine recorded. The member can see it in their app.');
    setForm({ memberId: '', rule: '', reason: '', amount: '', punishment: '' }); void load();
  };
  const resolve = async (id: string, action: 'PAID' | 'WAIVED') => {
    if (action === 'WAIVED' && !confirm('Waive this fine? The member will not have to pay it.')) return;
    const { error } = await supabase.rpc('admin_resolve_fine', { p_passcode: passcode, p_fine_id: id, p_action: action });
    if (error) { notify(error.message || 'Could not update the fine.'); return; }
    notify(action === 'PAID' ? 'Marked as paid.' : 'Fine waived.'); void load();
  };
  const shown = fines.filter(f => !q || (f.member_name || '').toLowerCase().includes(q.toLowerCase()) || f.member_id.toLowerCase().includes(q.toLowerCase()));
  const unpaidTotal = fines.filter(f => f.status === 'UNPAID').reduce((s, f) => s + Number(f.amount), 0);

  return <>
    <div className="page-head"><div><p className="eyebrow">Discipline</p><h1 className="title">Fines &amp; Punishments</h1><p className="sub">Charge a member who breaks the rules. {fines.filter(f => f.status === 'UNPAID').length} unpaid · {money(unpaidTotal)} outstanding.</p></div></div>
    <div className="grid layout-2">
      <form className="card" onSubmit={issue}>
        <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}><Gavel size={15} /> Charge a fine</span></div>
        <div className="field"><label>Member</label>
          <select required value={form.memberId} onChange={e => setForm(f => ({ ...f, memberId: e.target.value }))}>
            <option value="">Select a member</option>
            {members.map(m => <option key={m.member_id} value={m.member_id}>{m.name || m.member_id} · {m.member_id}</option>)}
          </select></div>
        <div className="field" style={{ marginTop: 12 }}><label>Rule broken (optional)</label>
          <select value={form.rule} onChange={e => pickRule(e.target.value)}>
            <option value="">— Other / not in the rule book —</option>
            {rules.map(r => <option key={r.rule_position} value={r.title}>{r.rule_position}. {r.title}{r.fine_amount != null ? ` (${money(r.fine_amount)})` : ''}</option>)}
          </select></div>
        <div className="field" style={{ marginTop: 12 }}><label>What happened</label><textarea required maxLength={1000} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></div>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="field"><label>Fine amount (₹)</label><input type="number" min={0} max={100000} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
          <div className="field"><label>Punishment (optional)</label><input maxLength={1000} placeholder="e.g. 1 week suspension" value={form.punishment} onChange={e => setForm(f => ({ ...f, punishment: e.target.value }))} /></div>
        </div>
        <button className="button primary" style={{ marginTop: 16, width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? 'Saving…' : 'Record fine'}</button>
      </form>
      <div className="card">
        <div className="card-title">All fines <span>{fines.length}</span></div>
        <input className="search" style={{ width: '100%', marginBottom: 12 }} placeholder="Search member" value={q} onChange={e => setQ(e.target.value)} />
        {shown.length === 0 ? <div className="empty">No fines yet.</div> : <div style={{ display: 'grid', gap: 12, maxHeight: 520, overflow: 'auto' }}>{shown.map(f => <div key={f.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div><b>{f.member_name || f.member_id}</b> <span className="muted" style={{ fontSize: 11 }}>{f.member_id}</span>
              <div style={{ fontSize: 12, marginTop: 4 }}>{f.rule_title && <b>{f.rule_title} — </b>}{f.reason}</div>
              {f.punishment && <div style={{ fontSize: 12, color: 'var(--gold)' }}>Punishment: {f.punishment}</div>}
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>By {f.issued_by} · {new Date(f.issued_at).toLocaleDateString()}{f.resolved_by ? ` · ${f.status.toLowerCase()} by ${f.resolved_by}` : ''}</div></div>
            <div style={{ textAlign: 'right' }}><b>{money(f.amount)}</b><div><span className={f.status === 'UNPAID' ? 'pill red' : f.status === 'PAID' ? 'pill' : 'pill gold'}>{f.status}</span></div></div>
          </div>
          {f.status === 'UNPAID' && <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="button primary" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => void resolve(f.id, 'PAID')}><Check size={12} /> Mark paid</button>
            {isOwner && <button className="button ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => void resolve(f.id, 'WAIVED')}>Waive</button>}</div>}
        </div>)}</div>}
      </div>
    </div>
  </>;
}

type MyFine = { id: string; rule_title: string | null; reason: string; amount: number; punishment: string | null; status: string; issued_at: string };

/** Member app: their own fines, shown only when there are any. */
export function MyFines({ member, passcode }: { member: Member; passcode: string }) {
  const [fines, setFines] = useState<MyFine[]>([]);
  useEffect(() => { void supabase.rpc('member_list_my_fines', { p_member_id: member.member_id, p_passcode: passcode }).then(({ data }) => setFines((data as MyFine[]) ?? [])); }, [member.member_id, passcode]);
  if (!fines.length) return null;
  const due = fines.filter(f => f.status === 'UNPAID').reduce((s, f) => s + Number(f.amount), 0);
  return <div className="card" style={{ marginBottom: 18, borderColor: due > 0 ? 'var(--red)' : 'var(--line)' }}>
    <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}><Gavel size={15} /> My fines</span><span>{due > 0 ? `${money(due)} due — pay at reception` : 'Nothing due'}</span></div>
    {fines.map(f => <div key={f.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ fontSize: 13 }}>{f.rule_title && <b>{f.rule_title} — </b>}{f.reason}{f.punishment && <div style={{ color: 'var(--gold)', fontSize: 12 }}>Punishment: {f.punishment}</div>}<div className="muted" style={{ fontSize: 11 }}>{new Date(f.issued_at).toLocaleDateString()}</div></div>
      <div style={{ textAlign: 'right' }}><b>{money(f.amount)}</b><div><span className={f.status === 'UNPAID' ? 'pill red' : f.status === 'PAID' ? 'pill' : 'pill gold'}>{f.status}</span></div></div>
    </div>)}
  </div>;
}
