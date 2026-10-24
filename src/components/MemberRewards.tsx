import { useCallback, useEffect, useState } from 'react';
import { Flame, Gift, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Streak = {
  total_visits: number; visits_30d: number; this_week: number; weekly_target: number; week_streak: number; best_week_streak: number;
  badges: { code: string; label: string; earned: boolean }[]; next_visit_goal: number | null;
};
type Board = { month: string; listed: boolean; me: { days: number; rank: number; of: number } | null; top: { name: string; days: number; rank: number; me: boolean }[] };
type Friend = { name: string; status: 'invited' | 'joined' | 'rewarded'; created_at: string };
type Summary = { code: string; reward_days: number; invited: number; joined: number; rewarded: number; free_days_earned: number; friends: Friend[] };

const statusText: Record<Friend['status'], string> = { invited: 'Invited', joined: 'Joined, waiting for reward', rewarded: 'Reward given' };

export function MemberRewards({ member, passcode, notify }: { member: { member_id: string; name: string | null }; passcode: string; notify: (m: string) => void }) {
  const id = member.member_id;
  const [streak, setStreak] = useState<Streak | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [ref, setRef] = useState<Summary | null>(null);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const args = { p_member_id: id, p_passcode: passcode };
    const [s, b, r] = await Promise.all([supabase.rpc('member_streak', args), supabase.rpc('member_leaderboard', args), supabase.rpc('member_referral_summary', args)]);
    // If the database update has not been installed yet, stay invisible instead of showing errors to members.
    if (s.error || !s.data) { setReady(false); return; }
    setStreak(s.data as Streak); setBoard((b.data as Board) ?? null); setRef((r.data as Summary) ?? null); setReady(true);
  }, [id, passcode]);
  useEffect(() => { void load(); }, [load]);

  if (!ready || !streak) return null;

  const toggleBoard = async (show: boolean) => {
    const { error } = await supabase.rpc('member_set_leaderboard', { p_member_id: id, p_passcode: passcode, p_show: show });
    if (error) { notify('Could not save that. Try again.'); return; }
    const { data } = await supabase.rpc('member_leaderboard', { p_member_id: id, p_passcode: passcode });
    if (data) setBoard(data as Board);
  };
  const invite = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('member_refer_friend', { p_member_id: id, p_passcode: passcode, p_name: name, p_phone: phone });
    setBusy(false);
    if (error) { notify(error.message || 'Could not save your friend.'); return; }
    setName(''); setPhone(''); notify('Saved! Tell your friend to mention your code when joining.');
    void load();
  };

  const shareText = `Join me at Bhajrang Fitness! Tell them my code ${id} when you join and we both get ${ref?.reward_days ?? 7} free days. 💪`;
  const earned = streak.badges.filter((b) => b.earned);
  const left = streak.next_visit_goal ? streak.next_visit_goal - streak.total_visits : 0;
  const dots = Array.from({ length: Math.max(streak.weekly_target, 1) }, (_, i) => i < streak.this_week);

  return <>
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-title"><Flame size={15} color="var(--gold)" /> Your streak</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="stat-value" style={{ color: 'var(--gold)' }}>{streak.week_streak}</span>
        <span>{streak.week_streak === 1 ? 'week' : 'weeks'} in a row</span>
        <span className="muted" style={{ fontSize: 12 }}>best {streak.best_week_streak} · {streak.total_visits} gym days in total</span>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '8px 0 4px' }}>Visit {streak.weekly_target} different days a week to keep it going. This week: {Math.min(streak.this_week, streak.weekly_target)} of {streak.weekly_target}</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>{dots.map((on, i) => <span key={i} style={{ width: 22, height: 8, borderRadius: 4, background: on ? 'var(--gold)' : 'rgba(255,255,255,0.12)' }} />)}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {streak.badges.map((b) => <span key={b.code} className="pill" style={{ opacity: b.earned ? 1 : 0.35 }}>{b.earned ? '🏅 ' : ''}{b.label}</span>)}
      </div>
      {streak.next_visit_goal && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{left} more gym day{left === 1 ? '' : 's'} to the {streak.next_visit_goal}-day badge.{earned.length === 0 ? ' Your first badge is one visit away.' : ''}</p>}
    </div>

    {board && <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-title"><Trophy size={15} color="var(--gold)" /> Most active in {board.month}</div>
      {board.me && <p style={{ margin: '0 0 8px' }}>You: <b>#{board.me.rank}</b> of {board.me.of} members · {board.me.days} day{board.me.days === 1 ? '' : 's'}</p>}
      {board.top.length > 0
        ? board.top.map((t, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: t.me ? 700 : 400 }}><span>#{t.rank} {t.name}{t.me ? ' (you)' : ''}</span><span>{t.days} days</span></div>)
        : <p className="muted" style={{ fontSize: 13 }}>Nobody has joined the board yet. Be the first.</p>}
      <label className="muted" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>
        <input type="checkbox" checked={board.listed} onChange={(e) => void toggleBoard(e.target.checked)} /> Show my name on this board (first name and initial only)
      </label>
    </div>}

    {ref && <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-title"><Gift size={15} color="var(--gold)" /> Bring a friend, you both get {ref.reward_days} free days</div>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>Your code is <b>{ref.code}</b>. When your friend joins and the gym confirms it, both memberships get {ref.reward_days} extra days.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input placeholder="Friend's name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 140px' }} maxLength={60} />
        <input placeholder="Friend's phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ flex: '1 1 140px' }} maxLength={20} />
        <button className="button primary" disabled={busy || name.trim().length < 2 || phone.replace(/\D/g, '').length < 10} onClick={() => void invite()}>Save friend</button>
      </div>
      <a className="button ghost" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
      {(ref.joined + ref.rewarded + ref.invited) > 0 && <p className="muted" style={{ fontSize: 12, margin: '12px 0 4px' }}>{ref.rewarded} rewarded · {ref.joined} joined · {ref.invited} invited · {ref.free_days_earned} free days earned</p>}
      {ref.friends.map((f, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}><span>{f.name}</span><span className="muted">{statusText[f.status]}</span></div>)}
    </div>}
  </>;
}
