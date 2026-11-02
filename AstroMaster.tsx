import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Moon, RefreshCw, Save, Sparkles, Star, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { hub } from '../agent-hub/api';
import { SwissPanel, useSwiss } from './AstroEngine';
import {
  CITIES, NAKSHATRAS, RASHIS, SPREADS, buildChart, chartFacts, currentDasha, drawTarot, gochar, numerology, numerologyFacts, NUMBER_THEMES,
  panchang, periodFacts, tarotFacts, todayFacts, type Chart, type Drawn,
} from '../lib/astro';

type Profile = { id: string; name: string; is_self: boolean; data: { date: string; time: string; timeKnown?: boolean; tzHours: number; lat: number; lon: number; place?: string } };
type Reading = { id: string; profile_id: string | null; kind: string; title: string; body: string; created_at: string };
type Overview = { profiles: Profile[]; readings: Reading[] };
type Tab = 'today' | 'tarot' | 'numbers' | 'ask' | 'saved' | 'people';

const ctl: React.CSSProperties = { background: '#0c131e', border: '1px solid var(--line)', borderRadius: 7, padding: '8px 10px', color: '#fff', font: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' };
const chip = (text: string, color = '#9aa8bb') => <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, border: `1px solid ${color}`, color, whiteSpace: 'nowrap' }}>{text}</span>;
const sectionTitle = (t: string, right?: React.ReactNode) => <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{t}</span>{right}</div>;
const short = (r: number) => RASHIS[r].split(' ')[0];
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const tzNow = () => new Date();

/** Owner only: Vedic astrology + numerology + tarot in one place. Positions are calculated here; the free AI only interprets them. */
export function AstroMaster({ passcode, notify }: { passcode: string; notify: (m: string) => void }) {
  const [tab, setTab] = useState<Tab>('today');
  const [ov, setOv] = useState<Overview | null>(null);
  const [pid, setPid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ kind: string; title: string; text: string; provider?: string; warn?: string } | null>(null);
  const [spread, setSpread] = useState(Object.keys(SPREADS)[0]);
  const [question, setQuestion] = useState('');
  const [cards, setCards] = useState<Drawn[] | null>(null);
  const [askText, setAskText] = useState('');
  const blank = { name: '', date: '', time: '06:00', timeKnown: true, tzHours: '5.5', city: 'Kolkata', lat: '22.5726', lon: '88.3639', self: false };
  const [form, setForm] = useState({ ...blank, id: '' as string });

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_astro_overview', { p_passcode: passcode });
    if (error) { notify('Could not open Astro Master. Only the owner can use it.'); return; }
    const d = data as Overview; setOv(d);
    setPid((cur) => cur && d.profiles.some((p) => p.id === cur) ? cur : (d.profiles.find((p) => p.is_self) ?? d.profiles[0])?.id ?? null);
  }, [passcode, notify]);
  useEffect(() => { void load(); }, [load]);

  const profile = ov?.profiles.find((p) => p.id === pid) ?? null;
  const chart: Chart | null = useMemo(() => {
    if (!profile) return null;
    try { return buildChart({ name: profile.name, date: profile.data.date, time: profile.data.timeKnown === false ? '12:00' : profile.data.time, tzHours: profile.data.tzHours, lat: profile.data.lat, lon: profile.data.lon, place: profile.data.place }); }
    catch { return null; }
  }, [profile]);
  const now = tzNow();
  const glance = useMemo(() => {
    if (!chart) return null;
    const d = currentDasha(chart, now); const p = panchang(now); const g = gochar(chart, now); const n = numerology(chart.input.name, chart.input.date, now);
    return { d, p, g, n };
  }, [chart]);   // eslint-disable-line react-hooks/exhaustive-deps

  const unknownTime = profile?.data.timeKnown === false;
  const sw = useSwiss(passcode, profile ? { name: profile.name, data: profile.data } : null);

  const ask = async (kind: string, title: string, facts: string, request: string, _opts?: { max?: number }) => {
    setBusy(true); setAnswer(null);
    const tail = `\n\nREQUEST: ${request}`.slice(0, 1200);
    const head = [facts, sw.state === 'ok' && sw.data ? sw.data.facts : ''].filter(Boolean).join('\n').slice(0, 5900 - tail.length);
    const input = head + tail;
    const d = await hub.chat(passcode, 'astro_master', input, null) as { ok?: boolean; reply?: string; provider?: string; error?: string };
    setBusy(false);
    if (!d?.ok) { notify(d?.error ?? 'No answer right now.'); return; }
    setAnswer({ kind, title, text: d.reply ?? '', provider: d.provider });
  };
  const saveAnswer = async () => {
    if (!answer) return;
    const { error } = await supabase.rpc('admin_astro_save_reading', { p_passcode: passcode, p_profile_id: pid, p_kind: answer.kind, p_title: answer.title, p_body: answer.text });
    if (error) { notify(error.message || 'Could not save.'); return; } notify('Saved.'); void load();
  };
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); notify('Copied.'); } catch { notify('Could not copy.'); } };

  const needChart = () => { if (!chart) { notify('Add your birth details first (People tab).'); setTab('people'); return false; } return true; };
  const fmtLong = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const period = (label: string, days: number) => {
    if (!needChart() || !chart) return;
    const end = addDays(now, days);
    void ask(label.toLowerCase(), `${label} guidance, ${fmtLong(now)}`, [chartFacts(chart, now), todayFacts(chart, now), numerologyFacts(chart.input.name, chart.input.date, now), days > 1 ? periodFacts(chart, now, end) : ''].filter(Boolean).join('\n'),
      days <= 1 ? 'Give today\'s guidance: a short mood of the day, what to focus on, what to avoid, a "do / avoid / focus" list for gym work, health habits and money, and 3 next steps. Combine the Vedic, numerology facts.'
        : `Give a ${label.toLowerCase()} outlook for the window above: the main themes, supportive stretches, stretches needing care, and how to use them for my training, business and relationships. Include month-by-month or week-by-week pointers that match the facts, then 3 next steps.`, { max: days > 60 ? 2600 : 2000 });
  };
  const drawCards = () => { setCards(drawTarot(SPREADS[spread].length, SPREADS[spread])); setAnswer(null); };
  const readCards = () => { if (!cards) return; void ask('tarot', `Tarot: ${spread}`, [tarotFacts(cards, question), chart ? todayFacts(chart, now) : ''].filter(Boolean).join('\n'), 'Read these cards for my question. Explain each card in its position, then the overall story, and give practical advice with 3 next steps. Mention that tarot is for reflection.', { max: 1800 }); };

  const saveProfile = async () => {
    const lat = Number(form.lat), lon = Number(form.lon), tz = Number(form.tzHours);
    if (!form.name.trim() || !form.date) { notify('Enter a name and birth date.'); return; }
    if (![lat, lon, tz].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || Math.abs(tz) > 14) { notify('Check the place numbers (latitude, longitude, time zone).'); return; }
    const { error } = await supabase.rpc('admin_astro_save_profile', { p_passcode: passcode, p_id: form.id || null, p_name: form.name.trim(), p_is_self: form.self,
      p_data: { date: form.date, time: form.time || '12:00', timeKnown: form.timeKnown, tzHours: tz, lat, lon, place: form.city } });
    if (error) { notify(error.message || 'Could not save.'); return; } notify('Saved.'); setForm({ ...blank, id: '' }); void load();
  };
  const editProfile = (p: Profile) => setForm({ id: p.id, name: p.name, date: p.data.date, time: p.data.time, timeKnown: p.data.timeKnown !== false, tzHours: String(p.data.tzHours), city: p.data.place || 'Other', lat: String(p.data.lat), lon: String(p.data.lon), self: p.is_self });

  const Answer = () => answer ? <div className="card" style={{ marginTop: 16 }}>
    {sectionTitle(answer.title, <span style={{ display: 'flex', gap: 6 }}>{answer.provider && chip(`by ${answer.provider}`, 'var(--cyan)')}</span>)}
    <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, background: '#0c131e', border: '1px solid var(--line)', borderRadius: 8, padding: 14, maxHeight: 520, overflow: 'auto' }}>{answer.text}</div>
    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}><button className="button primary" onClick={() => void saveAnswer()}><Save size={14} /> Save this reading</button><button className="button ghost" onClick={() => void copy(answer.text)}><Copy size={14} /> Copy</button></div>
  </div> : busy ? <div className="card" style={{ marginTop: 16 }}><div className="empty">Reading the stars… if the first free AI is busy, the next one is tried automatically.</div></div> : null;

  const TabBtn = ({ k, l }: { k: Tab; l: string }) => <button className={tab === k ? 'button primary' : 'button ghost'} onClick={() => setTab(k)}>{l}</button>;

  return <>
    <div className="page-head"><div><p className="eyebrow">Owner only · private</p><h1 className="title">Astro Master</h1>
      <p className="sub">Vedic astrology, numerology and tarot together. Positions are calculated exactly on this device; the free AI explains them and turns them into simple daily actions.</p></div>
      <button className="button ghost" onClick={() => void load()}><RefreshCw size={14} /> Refresh</button></div>

    <div className="card" style={{ marginBottom: 14, borderColor: 'var(--line)' }}>
      <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>For reflection and planning. Astrology, numerology and tarot are traditions, not proven science, and cannot promise events. Use this to think and to build good habits, and never for medical, legal or money decisions. The AI is told not to predict illness, accidents or death and not to sell remedies.</p>
    </div>

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
      <TabBtn k="today" l="Today & chart" /><TabBtn k="tarot" l="Tarot" /><TabBtn k="numbers" l="Numerology" /><TabBtn k="ask" l="Ask" /><TabBtn k="saved" l={`Saved${ov?.readings.length ? ` (${ov.readings.length})` : ''}`} /><TabBtn k="people" l="People" />
      {ov && ov.profiles.length > 1 && <select value={pid ?? ''} onChange={(e) => { setPid(e.target.value); setAnswer(null); }} style={{ ...ctl, width: 'auto', marginLeft: 'auto' }}>{ov.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_self ? ' (me)' : ''}</option>)}</select>}
    </div>

    {tab === 'today' && <>
      {!chart && <div className="card"><div className="empty">Add your birth date, time and place in the People tab to see your chart.</div><button className="button primary" onClick={() => setTab('people')}>Add birth details</button></div>}
      {chart && glance && <>
        {unknownTime && <div className="card" style={{ borderColor: 'var(--gold)', marginBottom: 12 }}><span style={{ color: 'var(--gold)', fontSize: 13 }}>Birth time is unknown, so the rising sign and houses are not reliable. Moon sign, nakshatra and dasha are still approximately right.</span></div>}
        <div className="grid stats" style={{ marginBottom: 16 }}>
          <div className="card"><div className="muted" style={{ fontSize: 12 }}>Rising sign (lagna)</div><div style={{ fontSize: 20, fontWeight: 700 }}>{unknownTime ? '–' : short(chart.lagna.rashi)}</div><div className="muted" style={{ fontSize: 12 }}>Moon sign {short(chart.moon.rashi)} · Sun {short(chart.sunSign)}</div></div>
          <div className="card"><div className="muted" style={{ fontSize: 12 }}>Birth star (nakshatra)</div><div style={{ fontSize: 20, fontWeight: 700 }}>{chart.moon.nakshatra}</div><div className="muted" style={{ fontSize: 12 }}>pada {chart.moon.pada}</div></div>
          <div className="card"><div className="muted" style={{ fontSize: 12 }}>Dasha period now</div><div style={{ fontSize: 20, fontWeight: 700 }}>{glance.d.maha.lord}{glance.d.antar ? ` / ${glance.d.antar.lord}` : ''}</div><div className="muted" style={{ fontSize: 12 }}>main period to {fmtLong(glance.d.maha.end)}</div></div>
          <div className="card"><div className="muted" style={{ fontSize: 12 }}>Today</div><div style={{ fontSize: 16, fontWeight: 700 }}>{glance.p.tithi}</div><div className="muted" style={{ fontSize: 12 }}>{glance.p.vara.split(' ')[0]} · Moon in {short(glance.p.moonRashi)}</div></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          {glance.g.sadeSati ? chip('Saturn Sade Sati running', 'var(--gold)') : chip('No Sade Sati now', '#9aa8bb')}
          {chip(`Personal day ${glance.n.personalDay}: ${NUMBER_THEMES[glance.n.personalDay] ?? ''}`, 'var(--cyan)')}
        </div>
        {profile && !unknownTime && <SwissPanel passcode={passcode} profile={{ name: profile.name, data: profile.data }} chart={chart} sw={sw} />}
        <div className="card" style={{ marginTop: 12 }}>
          {sectionTitle('Guidance')}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="button primary" disabled={busy} onClick={() => period('Daily', 1)}><Sparkles size={14} /> Today</button>
            <button className="button ghost" disabled={busy} onClick={() => period('Weekly', 7)}>Next 7 days</button>
            <button className="button ghost" disabled={busy} onClick={() => period('Monthly', 30)}>Next 30 days</button>
            <button className="button ghost" disabled={busy} onClick={() => period('Yearly', 365)}>Next 12 months</button>
          </div>
        </div>
        <details className="card" style={{ marginTop: 12 }}><summary style={{ cursor: 'pointer', color: '#fff' }}>Birth chart details</summary>
          <div className="table-wrap" style={{ marginTop: 10 }}><table className="table"><thead><tr><th>Planet</th><th>Sign</th><th>°</th><th>House</th><th>Nakshatra</th></tr></thead>
            <tbody>{chart.planets.map((p) => <tr key={p.name}><td><b>{p.name}</b></td><td>{short(p.rashi)}</td><td>{p.deg.toFixed(1)}</td><td>{unknownTime ? '–' : p.house}</td><td>{p.nakshatra} {p.pada}</td></tr>)}</tbody></table></div>
          <p className="muted" style={{ fontSize: 12 }}>Lahiri (Chitrapaksha) sidereal zodiac, whole-sign houses, mean Rahu/Ketu. Upcoming main periods: {glance.d.timeline.filter((p) => p.start > now).slice(0, 3).map((p) => `${p.lord} from ${fmtLong(p.start)}`).join(', ')}.</p>
        </details>
      </>}
      <Answer />
    </>}

    {tab === 'tarot' && <>
      <div className="card">
        {sectionTitle('Draw cards')}
        <div className="field"><label>Your question (optional)</label><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Should I expand the gym this year?" maxLength={300} style={ctl} /></div>
        <div className="field"><label>Spread</label><select value={spread} onChange={(e) => { setSpread(e.target.value); setCards(null); }} style={ctl}>{Object.keys(SPREADS).map((s) => <option key={s}>{s}</option>)}</select></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="button primary" onClick={drawCards}><Star size={14} /> Draw</button>{cards && <button className="button ghost" disabled={busy} onClick={readCards}><Sparkles size={14} /> Read these cards</button>}</div>
        {cards && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 14 }}>
          {cards.map((c) => <div key={c.position} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: '#0c131e', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{c.position}</div>
            <div style={{ fontSize: 28, margin: '8px 0', transform: c.reversed ? 'rotate(180deg)' : 'none' }}>{c.card.arcana === 'major' ? '✦' : '◈'}</div>
            <b style={{ fontSize: 13 }}>{c.card.name}</b>{c.reversed && <div style={{ color: 'var(--gold)', fontSize: 11 }}>reversed</div>}
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>{c.reversed ? c.card.rev : c.card.up}</div></div>)}</div>}
      </div>
      <Answer />
    </>}

    {tab === 'numbers' && <>
      {!chart && <div className="card"><div className="empty">Add your name and birth date in the People tab.</div></div>}
      {chart && glance && <div className="card">
        {sectionTitle(`Numbers for ${chart.input.name}`)}
        <div className="grid stats">
          {([['Life path', glance.n.lifePath], ['Birthday number', glance.n.birthday], ['Name (expression)', glance.n.expression], ['Soul urge', glance.n.soulUrge], ['Personality', glance.n.personality], ['Personal year', glance.n.personalYear], ['Personal month', glance.n.personalMonth], ['Personal day', glance.n.personalDay]] as const).map(([l, v]) =>
            <div key={l} className="card"><div className="muted" style={{ fontSize: 12 }}>{l}</div><div style={{ fontSize: 26, fontWeight: 700 }}>{v}</div><div className="muted" style={{ fontSize: 11 }}>{NUMBER_THEMES[v]}</div></div>)}
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Pythagorean method; 11, 22 and 33 are kept as master numbers. Try a different spelling of your name (for example your business name) in the Ask tab.</p>
        <button className="button primary" disabled={busy} onClick={() => void ask('numerology', 'Numerology reading', [numerologyFacts(chart.input.name, chart.input.date, now), todayFacts(chart, now)].join('\n'), 'Explain my numbers: strengths, challenges, and what this personal year, month and day suggest for work, training and relationships. End with 3 next steps.')}><Sparkles size={14} /> Explain my numbers</button>
      </div>}
      <Answer />
    </>}

    {tab === 'ask' && <>
      <div className="card">
        {sectionTitle('Ask anything')}
        <div className="field"><label>Your question</label><textarea rows={4} value={askText} onChange={(e) => setAskText(e.target.value)} maxLength={900} placeholder="Example: Is this a good month to start a new membership offer? What should I watch out for in business this quarter?" style={{ ...ctl, resize: 'vertical' }} /></div>
        <button className="button primary" disabled={busy || !askText.trim()} onClick={() => void ask('question', 'Question', chart ? [chartFacts(chart, now), todayFacts(chart, now), numerologyFacts(chart.input.name, chart.input.date, now)].join('\n') : 'No birth chart saved; answer using numerology/tarot/general reflection only and say that a chart would make it better.', askText.trim(), { max: 2200 })}><Moon size={14} /> Ask Astro Master</button>
      </div>
      <Answer />
    </>}

    {tab === 'saved' && <div className="card">
      {sectionTitle('Saved readings')}
      {!ov?.readings.length && <div className="empty">Nothing saved yet. Save a reading to keep it, then look back later to see what really happened.</div>}
      {ov?.readings.map((r) => <details key={r.id} style={{ borderTop: '1px solid var(--line)', padding: '10px 4px' }}>
        <summary style={{ cursor: 'pointer' }}><b style={{ fontSize: 14 }}>{r.title}</b> {chip(r.kind, 'var(--cyan)')} <span className="muted" style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString('en-IN')}</span></summary>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.55, margin: '8px 0', color: '#d6dfeb' }}>{r.body}</div>
        <div style={{ display: 'flex', gap: 8 }}><button className="button ghost" onClick={() => void copy(r.body)}><Copy size={14} /> Copy</button>
          <button className="button ghost" onClick={async () => { if (!confirm('Delete this reading?')) return; await supabase.rpc('admin_astro_delete_reading', { p_passcode: passcode, p_id: r.id }); void load(); }}><Trash2 size={14} /> Delete</button></div>
      </details>)}
    </div>}

    {tab === 'people' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
      <div className="card">
        {sectionTitle(form.id ? 'Edit person' : 'Add birth details')}
        <div className="field"><label>Name (as used day to day)</label><input value={form.name} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={ctl} /></div>
        <div className="field"><label>Birth date</label><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={ctl} /></div>
        <div className="field"><label>Birth time</label><input type="time" value={form.time} disabled={!form.timeKnown} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} style={ctl} /></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '0 0 12px' }}><input type="checkbox" checked={!form.timeKnown} onChange={(e) => setForm((f) => ({ ...f, timeKnown: !e.target.checked }))} /> I don't know the birth time</label>
        <div className="field"><label>Birth place</label><select value={form.city} style={ctl} onChange={(e) => { const c = CITIES.find((x) => x.name === e.target.value); setForm((f) => c ? { ...f, city: c.name, lat: String(c.lat), lon: String(c.lon) } : { ...f, city: 'Other' }); }}>
          {CITIES.map((c) => <option key={c.name}>{c.name}</option>)}<option>Other</option></select></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div className="field"><label>Latitude</label><input value={form.lat} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value, city: 'Other' }))} style={ctl} /></div>
          <div className="field"><label>Longitude</label><input value={form.lon} onChange={(e) => setForm((f) => ({ ...f, lon: e.target.value, city: 'Other' }))} style={ctl} /></div>
          <div className="field"><label>Time zone (+hours)</label><input value={form.tzHours} onChange={(e) => setForm((f) => ({ ...f, tzHours: e.target.value }))} style={ctl} /></div>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>India is +5.5. For a place not in the list choose Other and type its latitude and longitude (east and north are positive).</p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '4px 0 12px' }}><input type="checkbox" checked={form.self} onChange={(e) => setForm((f) => ({ ...f, self: e.target.checked }))} /> This is me (use for daily guidance)</label>
        <div style={{ display: 'flex', gap: 8 }}><button className="button primary" onClick={() => void saveProfile()}><Save size={14} /> Save</button>{form.id && <button className="button ghost" onClick={() => setForm({ ...blank, id: '' })}>Cancel</button>}</div>
      </div>
      <div className="card">
        {sectionTitle('Saved people')}
        {!ov?.profiles.length && <div className="empty">No one added yet.</div>}
        {ov?.profiles.map((p) => <div key={p.id} style={{ borderTop: '1px solid var(--line)', padding: '10px 4px' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><b>{p.name}</b>{p.is_self && chip('me', 'var(--green)')}<span className="muted" style={{ fontSize: 12 }}>{p.data.date} {p.data.timeKnown === false ? '(time unknown)' : p.data.time} · {p.data.place}</span></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}><button className="button ghost" onClick={() => { setPid(p.id); setTab('today'); }}>Open</button><button className="button ghost" onClick={() => editProfile(p)}>Edit</button>
            <button className="button ghost" onClick={async () => { if (!confirm(`Delete ${p.name} and their saved readings?`)) return; await supabase.rpc('admin_astro_delete_profile', { p_passcode: passcode, p_id: p.id }); void load(); }}><Trash2 size={14} /></button></div>
        </div>)}
      </div>
    </div>}
  </>;
}

export const _astroNames = { NAKSHATRAS };   // keeps the list tree-shake-safe for tests
