import { useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { supabase, type Billing, type Member, type Package } from '../lib/supabase';

/** Today's date in India (the gym's clock), as YYYY-MM-DD. */
export const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/** start + N months, clamped to month end (31 Jan + 1 month = 28/29 Feb) — same rule as the database. */
export function addMonthsClamped(ymd: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return '';
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const t = mo + Math.max(0, months);
  const ty = y + Math.floor(t / 12), tm = t % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
export const fmtDay = (ymd?: string | null) => { if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return '—'; const [y, m, d] = ymd.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const money = (n: number | null | undefined) => `₹${(n ?? 0).toLocaleString('en-IN')}`;
const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

/** Rule used everywhere: start = previous end (if still running) else today; end = start + package months. */
export function autoStart(prevExpiry?: string | null): string {
  const t = todayIST();
  return prevExpiry && /^\d{4}-\d{2}-\d{2}$/.test(prevExpiry) && prevExpiry >= t ? prevExpiry : t;
}

type Props = {
  passcode: string; members: Member[]; billing: Billing[]; packages: Package[];
  memberId?: string; invoice?: Billing | null; onClose: () => void; onSaved: () => void; notify: (m: string) => void;
};

/** Renew a membership (dates auto-calculated) or raise a non-membership invoice. */
export function RenewMembershipModal({ passcode, members, billing, packages, memberId, invoice, onClose, onSaved, notify }: Props) {
  const [mode, setMode] = useState<'renew' | 'other'>('renew');
  const [mid, setMid] = useState(memberId || invoice?.member_id || members[0]?.member_id || '');
  const guess = useMemo(() => packages.find(p => norm(p.name) === norm(invoice?.package_name)) ?? packages[0], [packages, invoice]);
  const [pkgName, setPkgName] = useState(guess?.name ?? '');
  const [startDate, setStartDate] = useState('');
  const [startTouched, setStartTouched] = useState(false);
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('0');
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState('UPI');
  const [otherName, setOtherName] = useState('Personal Training');
  const [saving, setSaving] = useState(false);

  const member = members.find(m => m.member_id === mid);
  const pkg = packages.find(p => p.name === pkgName);
  const prevBill = useMemo(() => billing.filter(b => b.member_id === mid && b.expiry_date).sort((a, b) => b.id - a.id)[0], [billing, mid]);
  const prevStart = prevBill?.start_date || prevBill?.payment_date || null;

  useEffect(() => { if (!pkgName && packages.length) setPkgName(packages[0].name); }, [packages, pkgName]);
  useEffect(() => { if (!startTouched) setStartDate(autoStart(member?.expiry_date)); }, [member?.expiry_date, startTouched, mid]);
  useEffect(() => { if (pkg && mode === 'renew') { setAmount(String(invoice?.amount && norm(invoice.package_name) === norm(pkg.name) ? invoice.amount : pkg.price)); setPaid(''); } }, [pkg, mode, invoice]);

  const endDate = pkg && startDate ? addMonthsClamped(startDate, pkg.duration_months) : '';
  const amt = Number(amount || 0), disc = Number(discount || 0);
  const net = Math.max(amt - disc, 0);
  const paidNow = paid === '' ? net : Math.min(Number(paid), net);
  const due = Math.max(net - paidNow, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!mid) return; setSaving(true);
    if (mode === 'renew') {
      const { data, error } = await supabase.rpc('admin_renew_membership', {
        p_passcode: passcode, p_member_id: mid, p_package_name: pkgName, p_amount: amt, p_discount: disc, p_paid: paidNow,
        p_method: method, p_start_date: startTouched ? startDate : null, p_billing_id: invoice?.id ?? null,
      });
      setSaving(false);
      if (error) { notify(error.message || 'Could not renew.'); return; }
      const r = data as { start: string; end: string; package: string };
      notify(`${member?.name || mid} renewed: ${r.package}, ${fmtDay(r.start)} → ${fmtDay(r.end)}.`);
    } else {
      const { error } = await supabase.rpc('admin_create_invoice', { p_passcode: passcode, p_member_id: mid, p_package_name: otherName, p_amount: amt, p_discount: disc, p_paid: paidNow, p_method: method });
      setSaving(false);
      if (error) { notify(error.message || 'Could not create the invoice.'); return; }
      notify('Invoice created.');
    }
    onSaved();
  };

  return <div className="modal-backdrop"><form className="modal" onSubmit={submit} style={{ maxWidth: 560 }}>
    <div className="modal-head"><div><p className="eyebrow">{invoice ? 'Apply to membership' : 'New invoice'}</p><h2 style={{ margin: 0 }}>{mode === 'renew' ? 'Renew membership' : 'Other invoice'}</h2></div><button type="button" className="close" onClick={onClose}><X /></button></div>
    {!invoice && <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <button type="button" className={`button ${mode === 'renew' ? 'primary' : 'ghost'}`} onClick={() => setMode('renew')}>Membership renewal</button>
      <button type="button" className={`button ${mode === 'other' ? 'primary' : 'ghost'}`} onClick={() => { setMode('other'); setAmount('1000'); setPaid(''); }}>Other (PT / product)</button></div>}
    <div className="form-grid">
      <div className="field full"><label>Warrior</label>
        <select required value={mid} disabled={!!memberId || !!invoice} onChange={e => { setMid(e.target.value); setStartTouched(false); }}>
          {members.map(m => <option key={m.member_id} value={m.member_id}>{m.name || m.member_id} ({m.member_id})</option>)}</select></div>

      {mode === 'renew' ? <>
        <div className="card full" style={{ gridColumn: '1 / -1', padding: 12, fontSize: 13 }}>
          <b>Current plan</b>
          <div className="muted">{member?.package || '—'} · {prevStart ? `${fmtDay(prevStart)} → ` : 'ends '}{fmtDay(member?.expiry_date)}</div>
        </div>
        <div className="field full"><label>New package</label>
          <select value={pkgName} onChange={e => setPkgName(e.target.value)}>{packages.map(p => <option key={p.id} value={p.name}>{p.name} — {money(p.price)} ({p.duration_months} mo)</option>)}</select></div>
        <div className="field"><label>Start date <span className="muted" style={{ fontSize: 11 }}>{startTouched ? '(changed)' : '(auto)'}</span></label>
          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setStartTouched(true); }} /></div>
        <div className="field"><label>New expiry (auto)</label><input type="date" value={endDate} readOnly style={{ opacity: .85 }} /></div>
      </> : <div className="field full"><label>What is this for?</label><input value={otherName} onChange={e => setOtherName(e.target.value)} /></div>}

      <div className="field"><label>Amount (₹)</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
      <div className="field"><label>Discount (₹)</label><input type="number" value={discount} onChange={e => setDiscount(e.target.value)} /></div>
      <div className="field"><label>Paid now (₹)</label><input type="number" value={paid} placeholder={String(net)} onChange={e => setPaid(e.target.value)} /></div>
      <div className="field"><label>Method</label><select value={method} onChange={e => setMethod(e.target.value)}><option>UPI</option><option>Cash</option><option>Card</option><option>Bank Transfer</option><option>Other</option></select></div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}><span className="muted">Due after this payment</span><b style={{ color: due > 0 ? 'var(--red)' : 'var(--green)' }}>{money(due)}</b></div>
    {mode === 'renew' && endDate && <p className="sub" style={{ marginTop: 8 }}>Membership will run <b>{fmtDay(startDate)}</b> → <b>{fmtDay(endDate)}</b> and appear in the member's Warrior app straight away.</p>}
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
      <button type="button" className="button ghost" onClick={onClose}>Cancel</button>
      <button className="button primary" disabled={saving || !mid || (mode === 'renew' && !pkg)}><Check size={15} /> {saving ? 'Saving…' : mode === 'renew' ? 'Renew & create invoice' : 'Create invoice'}</button></div>
  </form></div>;
}

/** Warrior app: live package, start/end, days left and past packages. */
export type LiveMembership = { package: string | null; expiry_date: string | null; joining_date: string | null; days_left: number | null; pending_request: boolean; history: { package: string | null; start: string | null; end: string | null; paid: number | null; due: number | null }[] };

export function MembershipCard({ live }: { live: LiveMembership | null }) {
  if (!live) return null;
  const d = live.days_left;
  const tone = d === null ? 'var(--muted)' : d < 0 ? 'var(--red)' : d <= 7 ? 'var(--gold)' : 'var(--green)';
  return <div className="card" style={{ marginBottom: 18 }}>
    <div className="card-title">My membership <span style={{ color: tone }}>{d === null ? '' : d < 0 ? `Expired ${-d} day(s) ago` : d === 0 ? 'Expires today' : `${d} day(s) left`}</span></div>
    <div style={{ fontSize: 15 }}><b>{live.package || 'Membership'}</b></div>
    <div className="muted" style={{ fontSize: 13 }}>Valid until <b style={{ color: '#fff' }}>{fmtDay(live.expiry_date)}</b>{live.pending_request ? ' · renewal request waiting for reception' : ''}</div>
    {live.history.length > 0 && <div style={{ marginTop: 12 }}>
      <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Previous packages</div>
      {live.history.map((h, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--line)', padding: '8px 0', fontSize: 13 }}>
        <span>{h.package || '—'}</span><span className="muted">{fmtDay(h.start)} → {fmtDay(h.end)}</span></div>)}</div>}
  </div>;
}
