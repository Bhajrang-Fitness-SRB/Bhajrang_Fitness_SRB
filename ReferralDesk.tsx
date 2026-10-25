import { useCallback, useEffect, useState } from 'react';
import { Gift, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Ref = {
  id: string; status: 'invited' | 'joined' | 'rewarded' | 'void'; referrer_id: string; referrer_name: string | null;
  friend_name: string | null; friend_phone: string | null; referred_id: string | null; referred_name: string | null;
  created_at: string; joined_at: string | null; rewarded_at: string | null; reward_days: number | null;
};
type Overview = { is_owner: boolean; settings: { referral_reward_days: number; referral_monthly_cap: number; streak_weekly_target: number }; referrals: Ref[] };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

export function ReferralDesk({ passcode, notify }: { passcode: string; notify: (m: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [linkIds, setLinkIds] = useState<Record<string, string>>({});
  const [vals, setVals] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setFailed(false);
    const { data: d, error } = await supabase.rpc('admin_referral_overview', { p_passcode: passcode });
    if (error || !d) { setFailed(true); return; }
    const o = d as Overview; setData(o);
    setVals({ referral_reward_days: String(o.settings.referral_reward_days), referral_monthly_cap: String(o.settings.referral_monthly_cap), streak_weekly_target: String(o.settings.streak_weekly_target) });
  }, [passcode]);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const { error } = await supabase.rpc(fn, { p_passcode: passcode, ...args });
    setBusy(false);
    if (error) { notify(error.message || 'Not allowed.'); return false; }
    notify(ok); void load(); return true;
  };

  const rows = data?.referrals ?? [];
  const invited = rows.filter((r) => r.status === 'invited');
  const joined = rows.filter((r) => r.status === 'joined');
  const done = rows.filter((r) => r.status === 'rewarded').slice(0, 30);
  const owner = !!data?.is_owner;
  const days = data?.settings.referral_reward_days ?? 7;

  return <>
    <div className="page-head"><div>
      <p className="eyebrow">Free marketing</p><h1 className="title">Referrals</h1>
      <p className="sub">Members bring friends; when a friend joins and you confirm, both get free days. Staff link friends, only the owner gives the reward.</p>
    </div><button className="button ghost" onClick={() => void load()} disabled={busy}><RefreshCw size={14} /> Refresh</button></div>

    {failed && <div className="card" style={{ marginBottom: 16 }}><b>Could not load.</b> <span className="muted">Run the Referrals SQL step in Supabase, then press Refresh.</span></div>}

    {data && <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title"><Gift size={15} /> Walk-in said "a member sent me"</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Referrer member ID (e.g. RB001)" value={a} onChange={(e) => setA(e.target.value)} style={{ flex: '1 1 160px' }} />
          <input placeholder="New member ID" value={b} onChange={(e) => setB(e.target.value)} style={{ flex: '1 1 160px' }} />
          <button className="button primary" disabled={busy || !a.trim() || !b.trim()} onClick={async () => { if (await run('admin_referral_create', { p_referrer_id: a, p_referred_id: b }, 'Referral saved. The owner can now give the reward.')) { setA(''); setB(''); } }}>Save referral</button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>The friend must be a member who joined in the last 30 days, with a different phone number from the referrer.</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Joined, waiting for the owner ({joined.length})</div>
        {joined.length === 0 ? <div className="empty">Nothing waiting.</div> : joined.map((r) =>
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ flex: 1, minWidth: 0 }}><b>{r.referrer_name || r.referrer_id}</b> <span className="muted">brought</span> <b>{r.referred_name || r.referred_id}</b>
              <div className="muted" style={{ fontSize: 12 }}>{r.referrer_id} → {r.referred_id} · joined {when(r.joined_at)}</div></div>
            {owner
              ? <><button className="button primary" style={{ padding: '7px 10px' }} disabled={busy} onClick={() => { if (window.confirm(`Give ${days} free days to both ${r.referrer_id} and ${r.referred_id}?`)) void run('admin_referral_reward', { p_referral_id: r.id }, `Reward given: ${days} days added to both.`); }}>Reward</button>
                <button className="button ghost" style={{ padding: '7px 10px' }} disabled={busy} onClick={() => { if (window.confirm('Cancel this referral?')) void run('admin_referral_void', { p_referral_id: r.id }, 'Referral cancelled.'); }}>Cancel</button></>
              : <span className="muted" style={{ fontSize: 12 }}>Owner approves</span>}
          </div>)}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Invited by members ({invited.length})</div>
        {invited.length === 0 ? <div className="empty">No open invites.</div> : invited.map((r) =>
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 180px', minWidth: 0 }}><b>{r.friend_name}</b> <span className="muted">· {r.friend_phone}</span>
              <div className="muted" style={{ fontSize: 12 }}>invited by {r.referrer_name || r.referrer_id} ({r.referrer_id}) · {when(r.created_at)}</div></div>
            <input placeholder="New member ID" value={linkIds[r.id] ?? ''} onChange={(e) => setLinkIds((m) => ({ ...m, [r.id]: e.target.value }))} style={{ width: 130 }} />
            <button className="button primary" style={{ padding: '7px 10px' }} disabled={busy || !(linkIds[r.id] ?? '').trim()} onClick={() => void run('admin_referral_link', { p_referral_id: r.id, p_referred_id: linkIds[r.id] }, 'Friend linked. Waiting for the owner.')}>Link</button>
            {owner && <button className="button ghost" style={{ padding: '7px 10px' }} disabled={busy} onClick={() => { if (window.confirm('Cancel this invite?')) void run('admin_referral_void', { p_referral_id: r.id }, 'Invite cancelled.'); }}>Cancel</button>}
          </div>)}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Rewarded recently</div>
        {done.length === 0 ? <div className="empty">None yet.</div> : done.map((r) =>
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }}>
            <span>{r.referrer_name || r.referrer_id} + {r.referred_name || r.referred_id}</span><span className="muted">{r.reward_days} days · {when(r.rewarded_at)}</span></div>)}
      </div>

      {owner && <div className="card">
        <div className="card-title">Reward rules (owner)</div>
        {([['referral_reward_days', 'Free days per referral (1 to 30)'], ['referral_monthly_cap', 'Max rewards per member per month (1 to 50)'], ['streak_weekly_target', 'Visit days per week to keep a streak (1 to 7)']] as const).map(([k, label]) =>
          <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', flexWrap: 'wrap' }}>
            <span style={{ flex: '1 1 220px' }}>{label}</span>
            <input type="number" value={vals[k] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} style={{ width: 80 }} />
            <button className="button ghost" style={{ padding: '6px 10px' }} disabled={busy} onClick={() => void run('admin_reward_set', { p_key: k, p_value: Number(vals[k]) }, 'Saved.')}>Save</button>
          </div>)}
      </div>}
    </>}
  </>;
}
