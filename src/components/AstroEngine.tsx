import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { hub } from '../agent-hub/api';
import { RASHIS, type Chart } from '../lib/astro';

type Ay = 'lahiri' | 'raman' | 'krishnamurti';
type Node = 'mean' | 'true';
export type SwissPlanet = { name: string; lon: number; rashi: number; deg: number; retrograde: boolean; house: number; nakshatra: string; pada: number; star_lord: string; sub_lord: string; navamsa: number };
export type SwissData = {
  facts: string;
  chart: { ephemeris: string; ayanamsa_deg: number; lagna: { lon: number; rashi: number; deg: number; nakshatra: string; pada: number; navamsa: number }; planets: SwissPlanet[];
    dasha: { maha: { lord: string; end: string }; antar: { lord: string; end: string }; pratyantar: { lord: string; end: string } } };
  transits: { sade_sati?: boolean; sade_sati_phase?: string | null };
};
export type SwissState = 'idle' | 'loading' | 'ok' | 'off' | 'error';
type BirthIn = { name: string; data: { date: string; time: string; timeKnown?: boolean; tzHours: number; lat: number; lon: number } };

const birthBody = (p: BirthIn, ay: Ay, node: Node) => ({ name: p.name, date: p.data.date, time: p.data.timeKnown === false ? '12:00' : p.data.time, tz_hours: p.data.tzHours, lat: p.data.lat, lon: p.data.lon, ayanamsa: ay, node, at: new Date().toISOString() });

/** Asks the Swiss Ephemeris engine (through the owner-only agent-hub function) for the chart. Silent if it is not connected. */
export function useSwiss(passcode: string, profile: BirthIn | null) {
  const [state, setState] = useState<SwissState>('idle');
  const [data, setData] = useState<SwissData | null>(null);
  const [msg, setMsg] = useState('');
  const [ay, setAy] = useState<Ay>('lahiri');
  const [node, setNode] = useState<Node>('mean');
  const run = useRef(0);
  const key = profile ? JSON.stringify([profile.name, profile.data, ay, node]) : '';

  const refresh = useCallback(async () => {
    if (!profile) { setState('idle'); setData(null); return; }
    const id = ++run.current; setState('loading'); setMsg('');
    const r = await hub.astro(passcode, 'chart', birthBody(profile, ay, node)) as { ok?: boolean; code?: string; error?: string } & Partial<SwissData>;
    if (id !== run.current) return;                       // a newer request replaced this one
    if (r?.ok && r.chart && r.facts) { setData({ facts: r.facts, chart: r.chart as SwissData['chart'], transits: (r.transits ?? {}) as SwissData['transits'] }); setState('ok'); return; }
    setData(null); setMsg(r?.error ?? 'No answer from the engine.');
    setState(r?.code === 'engine_not_configured' || /agent-hub/.test(r?.error ?? '') ? 'off' : 'error');
  }, [passcode, profile, ay, node]);   // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void refresh(); }, [key]);
  return { state, data, msg, ay, setAy, node, setNode, refresh };
}

const arc = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180) * 3600;
const fmt = (lon: number) => `${RASHIS[Math.floor(lon / 30)].split(' ')[0]} ${(lon % 30).toFixed(2)}°`;
const cell: React.CSSProperties = { padding: '5px 8px', borderBottom: '1px solid var(--line)', fontSize: 12, textAlign: 'left', whiteSpace: 'nowrap' };

export function SwissPanel({ passcode, profile, chart, sw }: { passcode: string; profile: BirthIn; chart: Chart; sw: ReturnType<typeof useSwiss> }) {
  const [wheel, setWheel] = useState<string | null>(null);
  const [wheelBusy, setWheelBusy] = useState(false);
  const [wheelErr, setWheelErr] = useState('');
  const showWheel = async () => {
    setWheelBusy(true); setWheelErr('');
    const r = await hub.astro(passcode, 'wheel', birthBody(profile, sw.ay, sw.node)) as { ok?: boolean; svg_base64?: string; error?: string };
    setWheelBusy(false);
    if (r?.ok && r.svg_base64) setWheel(r.svg_base64); else setWheelErr(r?.error ?? 'Could not draw the chart.');
  };
  const sel: React.CSSProperties = { background: '#0c131e', border: '1px solid var(--line)', borderRadius: 7, padding: '5px 8px', color: '#fff', font: 'inherit', fontSize: 12 };
  const tag = (t: string, c: string) => <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, border: `1px solid ${c}`, color: c }}>{t}</span>;
  const comparable = sw.ay === 'lahiri' && sw.node === 'mean';
  const d = sw.data;

  return <div className="card" style={{ marginTop: 14 }}>
    <div className="card-title"><span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Swiss Ephemeris check</span>
      {sw.state === 'ok' ? tag('connected', '#36d8d3') : sw.state === 'loading' ? tag('checking…', '#9aa8bb') : sw.state === 'off' ? tag('not connected: using built-in', '#9aa8bb') : sw.state === 'error' ? tag('engine problem', 'var(--gold)') : null}</div>
    {sw.state === 'off' && <p className="muted" style={{ fontSize: 12, margin: 0 }}>Your built-in calculator is working. To add the Swiss Ephemeris engine (extra precision checks, KP sub-lords, navamsa, chart picture), follow the Astro Engine guide.</p>}
    {sw.state === 'error' && <p style={{ fontSize: 12, color: 'var(--gold)', margin: 0 }}>{sw.msg}</p>}
    {sw.state === 'loading' && <p className="muted" style={{ fontSize: 12, margin: 0 }}>Waking the engine up. The first call can take up to a minute.</p>}
    {sw.state === 'ok' && d && <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <select value={sw.ay} onChange={(e) => sw.setAy(e.target.value as Ay)} style={sel} aria-label="Ayanamsa"><option value="lahiri">Lahiri</option><option value="raman">Raman</option><option value="krishnamurti">Krishnamurti (KP)</option></select>
        <select value={sw.node} onChange={(e) => sw.setNode(e.target.value as Node)} style={sel} aria-label="Rahu and Ketu"><option value="mean">Mean Rahu/Ketu</option><option value="true">True Rahu/Ketu</option></select>
        <button className="button ghost" onClick={() => void sw.refresh()}><RefreshCw size={13} /> Recheck</button>
        <button className="button ghost" disabled={wheelBusy} onClick={() => void showWheel()}>{wheelBusy ? 'Drawing…' : 'Show chart picture'}</button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Engine: {d.chart.ephemeris}. {comparable ? 'Compared with your built-in calculator (a small difference is normal; under 0.01° is excellent).' : 'Different settings, so the comparison column is hidden.'}</p>
      <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{['Body', 'Swiss position', 'Star (pada)', 'KP sub', 'Navamsa', 'House', ...(comparable ? ['Diff'] : [])].map((h) => <th key={h} style={{ ...cell, color: '#9aa8bb', fontWeight: 600 }}>{h}</th>)}</tr></thead>
        <tbody>
          <tr><td style={cell}>Lagna</td><td style={cell}>{fmt(d.chart.lagna.lon)}</td><td style={cell}>{d.chart.lagna.nakshatra} ({d.chart.lagna.pada})</td><td style={cell}>–</td><td style={cell}>{RASHIS[d.chart.lagna.navamsa].split(' ')[0]}</td><td style={cell}>1</td>{comparable && <td style={cell}>{arc(d.chart.lagna.lon, chart.lagna.lon).toFixed(0)}″</td>}</tr>
          {d.chart.planets.map((p) => { const mine = chart.planets.find((x) => x.name === p.name); return <tr key={p.name}>
            <td style={cell}>{p.name}{p.retrograde ? ' ℞' : ''}</td><td style={cell}>{fmt(p.lon)}</td><td style={cell}>{p.nakshatra} ({p.pada})</td><td style={cell}>{p.sub_lord}</td><td style={cell}>{RASHIS[p.navamsa].split(' ')[0]}</td><td style={cell}>{p.house}</td>
            {comparable && <td style={cell}>{mine ? `${arc(p.lon, mine.lon).toFixed(0)}″` : '–'}</td>}</tr>; })}
        </tbody></table></div>
      <p style={{ fontSize: 12, marginBottom: 0 }}>Dasha now (Swiss): <b>{d.chart.dasha.maha.lord}</b> / {d.chart.dasha.antar.lord} / {d.chart.dasha.pratyantar.lord} (this pratyantar ends {d.chart.dasha.pratyantar.end}).{d.transits.sade_sati ? ` Sade Sati: ${d.transits.sade_sati_phase ?? 'running'}.` : ''}</p>
      <p className="muted" style={{ fontSize: 11, marginBottom: 0 }}>These extra facts are also sent to Astro Master when you ask for a reading, so its answers use the more detailed numbers.</p>
    </>}
    {wheelErr && <p style={{ fontSize: 12, color: 'var(--gold)' }}>{wheelErr}</p>}
    {wheel && <div style={{ marginTop: 12, background: '#fff', borderRadius: 10, padding: 8, maxWidth: 520 }}><img alt="Birth chart wheel" style={{ width: '100%', display: 'block' }} src={`data:image/svg+xml;base64,${wheel}`} /></div>}
  </div>;
}
