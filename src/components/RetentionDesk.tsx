import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, RefreshCw, TrendingUp, UserX } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Row = {
  member_id: string; name: string | null; phone: string | null; package: string | null; expiry_date: string | null;
  days_left: number | null; price: number | null; last_visit: string | null; visits_30d?: number;
  days_away?: number | null; never_visited?: boolean; last_contact: string | null;
};
type Overview = {
  today: string; churn_days: number;
  totals: {
    expected_7d: number; expected_14d: number; expected_30d: number; count_7d: number; count_14d: number; count_30d: number;
    expired_30d: number; expired_value_30d: number; unpriced: number; churn_count: number; churn_at_risk_30d: number;
  };
  renewals: Row[]; churn: Row[];
};
type Kind = 'renewal' | 'churn' | 'winback';

const rupees = (n: number | null | undefined) => `₹${(n ?? 0).toLocaleString('en-IN')}`;
const niceDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');
const firstName = (n: string | null) => (n ?? '').trim().split(/\s+/)[0] || 'there';
const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);
const waLink = (phone: string | null, text: string) => {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}?text=${encodeURIComponent(text)}`;
};

// Messages only use facts the gym already has (name, package, date, days). No offers, prices or promises are invented.
function renewalText(r: Row): string {
  const pkg = r.package || 'membership';
  const when = (r.days_left ?? 0) < 0 ? `ended on ${niceDate(r.expiry_date)}`
    : r.days_left === 0 ? 'ends today'
    : `ends on ${niceDate(r.expiry_date)} (${r.days_left} day${r.days_left === 1 ? '' : 's'} left)`;
  return `Hi ${firstName(r.name)}, this is Bhajrang Fitness. Your ${pkg} ${when}. Renew at the desk or reply here and we will help you. Keep your momentum going! 💪`;
}
function churnText(r: Row): string {
  if (r.never_visited) return `Hi ${firstName(r.name)}, welcome to Bhajrang Fitness! We have not seen you at the gym yet. Want help planning your first week? Reply here and we will sort it out. 💪`;
  return `Hi ${firstName(r.name)}, this is Bhajrang Fitness. We have not seen you for ${r.days_away ?? ''} days and we miss you! Is everything okay? Your plan is active till ${niceDate(r.expiry_date)}. Come in this week and we will help you restart. 💪`;
}

export function RetentionDesk({ passcode, notify }: { passcode: string; notify: (m: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [churnDays, setChurnDays] = useState(7);
  const [range, setRange] = useState<'week' | 'month' | 'expired'>('week');
  const [hideDone, setHideDone] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    const { data: d, error } = await supabase.rpc('admin_retention_overview', { p_passcode: passcode, p_churn_days: churnDays });
    if (error || !d) { setFailed(true); setLoading(false); return; }
    setData(d as Overview); setLoading(false);
  }, [passcode, churnDays]);
  useEffect(() => { void load(); }, [load]);

  // Opens WhatsApp (the link itself) and remembers that this person was messaged, so staff do not message twice.
  const logContact = async (id: string, kind: Kind) => {
    const stamp = new Date().toISOString();
    setData((cur) => cur && ({
      ...cur,
      renewals: kind === 'churn' ? cur.renewals : cur.renewals.map((r) => (r.member_id === id ? { ...r, last_contact: stamp } : r)),
      churn: kind === 'churn' ? cur.churn.map((r) => (r.member_id === id ? { ...r, last_contact: stamp } : r)) : cur.churn,
    }));
    const { error } = await supabase.rpc('admin_retention_log_contact', { p_passcode: passcode, p_member_id: id, p_kind: kind });
    if (error) notify('Message opened, but we could not remember it was sent.');
  };

  const renewals = useMemo(() => {
    const rows = data?.renewals ?? [];
    return rows.filter((r) => {
      const d = r.days_left ?? 0;
      return range === 'week' ? d >= 0 && d <= 7 : range === 'month' ? d > 7 : d < 0;
    });
  }, [data, range]);
  const churn = useMemo(() => (data?.churn ?? []).filter((r) => !hideDone || (daysSince(r.last_contact) ?? 99) >= 7), [data, hideDone]);

  const t = data?.totals;
  const ContactBadge = ({ at }: { at: string | null }) => {
    const d = daysSince(at);
    return d === null ? null : <span className="pill" style={{ marginLeft: 6 }}>{d === 0 ? 'Messaged today' : `Messaged ${d}d ago`}</span>;
  };
  const Person = ({ r, kind, text, sub }: { r: Row; kind: Kind; text: string; sub: string }) => {
    const link = waLink(r.phone, text);
    return <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{r.name || r.member_id}</b><ContactBadge at={r.last_contact} />
        <div className="muted" style={{ fontSize: 12 }}>{sub}</div>
      </div>
      {link
        ? <a className="button primary" style={{ padding: '8px 12px' }} href={link} target="_blank" rel="noreferrer" onClick={() => void logContact(r.member_id, kind)}><MessageCircle size={14} /> WhatsApp</a>
        : <span className="muted" style={{ fontSize: 12 }}>No phone</span>}
    </div>;
  };

  return <>
    <div className="page-head"><div>
      <p className="eyebrow">Keep your income</p><h1 className="title">Renewals & Churn</h1>
      <p className="sub">Who renews soon, what it is worth, and who has stopped coming. One tap opens a ready WhatsApp message. Nothing is sent automatically.</p>
    </div><button className="button ghost" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> Refresh</button></div>

    {failed && <div className="card" style={{ marginBottom: 16 }}><b>Could not load.</b> <span className="muted">Run the Retention Desk SQL step in Supabase, then press Refresh.</span></div>}
    {loading && !data && <div className="card empty">Loading…</div>}

    {data && t && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
        <div className="card"><div className="result-label">Expected, next 7 days</div><div className="stat-value">{rupees(t.expected_7d)}</div><div className="muted" style={{ fontSize: 12 }}>{t.count_7d} members</div></div>
        <div className="card"><div className="result-label">Next 14 days</div><div className="stat-value">{rupees(t.expected_14d)}</div><div className="muted" style={{ fontSize: 12 }}>{t.count_14d} members</div></div>
        <div className="card"><div className="result-label">Next 30 days</div><div className="stat-value">{rupees(t.expected_30d)}</div><div className="muted" style={{ fontSize: 12 }}>{t.count_30d} members</div></div>
        <div className="card"><div className="result-label">At risk (stopped coming)</div><div className="stat-value" style={{ color: 'var(--gold)' }}>{rupees(t.churn_at_risk_30d)}</div><div className="muted" style={{ fontSize: 12 }}>{t.churn_count} active members away {data.churn_days}+ days</div></div>
      </div>
      {t.unpriced > 0 && <p className="muted" style={{ fontSize: 12, margin: '-6px 0 14px' }}>{t.unpriced} expiring member{t.unpriced === 1 ? '' : 's'} have a package name that does not match your Packages list, so they are not counted in the money above.</p>}
      <p className="muted" style={{ fontSize: 12, margin: '-6px 0 14px' }}>Expected income uses package list prices. It is what renewing members would pay, not a promise that they will renew.</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title"><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><TrendingUp size={15} /> Renewals</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          {([['week', `Next 7 days (${t.count_7d})`], ['month', 'Days 8 to 30'], ['expired', `Expired, last 30 days (${t.expired_30d})`]] as const).map(([k, label]) =>
            <button key={k} className={`button ${range === k ? 'primary' : 'ghost'}`} style={{ padding: '6px 10px' }} onClick={() => setRange(k)}>{label}</button>)}
        </div>
        {range === 'expired' && t.expired_value_30d > 0 && <p className="muted" style={{ fontSize: 12 }}>Worth about {rupees(t.expired_value_30d)} if they come back.</p>}
        {renewals.length === 0 ? <div className="empty">Nobody here. 🎉</div> : renewals.map((r) =>
          <Person key={r.member_id} r={r} kind={range === 'expired' ? 'winback' : 'renewal'} text={renewalText(r)}
            sub={`${r.package || 'No package'} · ${(r.days_left ?? 0) < 0 ? `ended ${niceDate(r.expiry_date)}` : `ends ${niceDate(r.expiry_date)}`} · ${r.price != null ? rupees(r.price) : 'price unknown'} · ${r.last_visit ? `last visit ${daysSince(r.last_visit)}d ago` : 'no visits logged'}`} />)}
      </div>

      <div className="card">
        <div className="card-title"><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><UserX size={15} /> We miss you ({churn.length})</span></div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          <label className="muted" style={{ fontSize: 12 }}>Away for at least{' '}
            <select value={churnDays} onChange={(e) => setChurnDays(Number(e.target.value))}>
              {[5, 7, 10, 14, 21].map((n) => <option key={n} value={n}>{n} days</option>)}
            </select></label>
          <label className="muted" style={{ fontSize: 12 }}><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide people messaged in the last 7 days</label>
        </div>
        {churn.length === 0 ? <div className="empty">Everyone active is coming. 🎉</div> : churn.map((r) =>
          <Person key={r.member_id} r={r} kind="churn" text={churnText(r)}
            sub={`${r.never_visited ? 'Never visited' : `Away ${r.days_away} days`} · ${r.package || 'No package'} · ends ${niceDate(r.expiry_date)} · ${r.price != null ? rupees(r.price) : 'price unknown'}`} />)}
      </div>
    </>}
  </>;
}
