// Astro Master: all calculations run in the browser (free, instant, private). Vedic (sidereal, Lahiri), numerology, tarot.
// The AI only INTERPRETS these computed facts; it never has to guess planet positions.
import * as A from 'astronomy-engine';

export const RASHIS = ['Mesha (Aries)', 'Vrishabha (Taurus)', 'Mithuna (Gemini)', 'Karka (Cancer)', 'Simha (Leo)', 'Kanya (Virgo)', 'Tula (Libra)', 'Vrishchika (Scorpio)', 'Dhanu (Sagittarius)', 'Makara (Capricorn)', 'Kumbha (Aquarius)', 'Meena (Pisces)'];
export const RASHI_LORDS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
export const NAKSHATRAS = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];
const DASHA_ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'] as const;
export const DASHA_YEARS: Record<string, number> = { Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17 };
const TITHIS = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi'];
const VARA = ['Sunday (Sun)', 'Monday (Moon)', 'Tuesday (Mars)', 'Wednesday (Mercury)', 'Thursday (Jupiter)', 'Friday (Venus)', 'Saturday (Saturn)'];
const YEAR_DAYS = 365.2425, DAY = 86400000;
const norm = (x: number) => ((x % 360) + 360) % 360;
const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;

// ------------------------------------------------------------------ positions
/** Lahiri ayanamsa in degrees (23.853 at 2000.0, moving about 50.29 arc-seconds per year). Accurate to well under a degree. */
export function lahiriAyanamsa(date: Date): number {
  const years = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / (DAY * YEAR_DAYS);
  return 23.85306 + (50.29 / 3600) * years;
}
const tropicalLon = (body: A.Body, date: Date) => norm(A.Ecliptic(A.GeoVector(body, date, true)).elon);
/** Mean lunar node (Rahu), degrees tropical. */
const meanNode = (date: Date) => { const T = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / (DAY * 36525); return norm(125.04452 - 1934.136261 * T); };

export type PlanetName = 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn' | 'Rahu' | 'Ketu';
export interface PlanetPos { name: PlanetName; lon: number; rashi: number; deg: number; nakshatra: string; pada: number }
const place = (name: PlanetName, sid: number): PlanetPos => {
  const lon = norm(sid), seg = 360 / 27, n = Math.floor(lon / seg);
  return { name, lon, rashi: Math.floor(lon / 30), deg: lon % 30, nakshatra: NAKSHATRAS[n], pada: Math.floor((lon % seg) / (seg / 4)) + 1 };
};
export function planetsAt(date: Date): PlanetPos[] {
  const ay = lahiriAyanamsa(date);
  const bodies: Array<[PlanetName, A.Body]> = [['Sun', A.Body.Sun], ['Moon', A.Body.Moon], ['Mars', A.Body.Mars], ['Mercury', A.Body.Mercury], ['Jupiter', A.Body.Jupiter], ['Venus', A.Body.Venus], ['Saturn', A.Body.Saturn]];
  const out = bodies.map(([n, b]) => place(n, tropicalLon(b, date) - ay));
  const rahu = meanNode(date);
  out.push(place('Rahu', rahu - ay), place('Ketu', rahu + 180 - ay));
  return out;
}

/** Tropical ascendant for a place (lat/lon in degrees, east positive). */
export function ascendantTropical(date: Date, lat: number, lon: number): number {
  const T = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / (DAY * 36525);
  const eps = rad(23.439291 - 0.0130042 * T);
  const ramc = rad(norm(A.SiderealTime(date) * 15 + lon));
  const phi = rad(lat);
  return norm(deg(Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps)))));
}

// ------------------------------------------------------------------ birth chart
export interface BirthInput { name: string; date: string; time: string; tzHours: number; lat: number; lon: number; place?: string }
export interface Chart {
  input: BirthInput; utc: Date; ayanamsa: number; lagna: PlanetPos & { lord: string };
  planets: Array<PlanetPos & { house: number; lord: string }>; moon: PlanetPos; sunSign: number;
}
export function birthToUtc(i: Pick<BirthInput, 'date' | 'time' | 'tzHours'>): Date {
  const [y, m, d] = i.date.split('-').map(Number); const [hh, mm] = (i.time || '12:00').split(':').map(Number);
  if (![y, m, d, hh, mm].every(Number.isFinite)) throw new Error('Please enter a valid birth date and time.');
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - i.tzHours * 3600000);
}
export function buildChart(input: BirthInput): Chart {
  const utc = birthToUtc(input);
  const ay = lahiriAyanamsa(utc);
  const lagnaSid = ascendantTropical(utc, input.lat, input.lon) - ay;
  const lg = place('Sun', lagnaSid);
  const lagna = { ...lg, lord: RASHI_LORDS[lg.rashi] };
  const planets = planetsAt(utc).map((p) => ({ ...p, house: ((p.rashi - lg.rashi + 12) % 12) + 1, lord: RASHI_LORDS[p.rashi] }));
  return { input, utc, ayanamsa: ay, lagna, planets, moon: planets.find((p) => p.name === 'Moon')!, sunSign: planets.find((p) => p.name === 'Sun')!.rashi };
}

// ------------------------------------------------------------------ Vimshottari dasha
export interface DashaPeriod { lord: string; start: Date; end: Date }
export function mahadashas(moonLon: number, birth: Date): DashaPeriod[] {
  const seg = 360 / 27, n = Math.floor(norm(moonLon) / seg), frac = (norm(moonLon) % seg) / seg;
  let idx = n % 9; const out: DashaPeriod[] = [];
  const first = DASHA_YEARS[DASHA_ORDER[idx]] * (1 - frac);
  let t = birth.getTime(); let len = first;
  for (let k = 0; k < 10; k++) {
    const lord = DASHA_ORDER[idx % 9];
    const end = t + len * YEAR_DAYS * DAY;
    out.push({ lord, start: new Date(t), end: new Date(end) });
    t = end; idx++; len = DASHA_YEARS[DASHA_ORDER[idx % 9]];
  }
  return out;
}
export function antardashas(maha: DashaPeriod, fullYears = DASHA_YEARS[maha.lord], fullStart?: Date): DashaPeriod[] {
  // The antardasha table is laid out over the FULL mahadasha; a partly-elapsed first mahadasha uses its virtual start.
  const start = (fullStart ?? maha.start).getTime(); const out: DashaPeriod[] = [];
  let t = start; let i = DASHA_ORDER.indexOf(maha.lord as typeof DASHA_ORDER[number]);
  for (let k = 0; k < 9; k++) {
    const lord = DASHA_ORDER[(i + k) % 9]; const len = (fullYears * DASHA_YEARS[lord]) / 120;
    const end = t + len * YEAR_DAYS * DAY; out.push({ lord, start: new Date(t), end: new Date(end) }); t = end;
  }
  return out;
}
export function currentDasha(chart: Chart, at: Date) {
  const list = mahadashas(chart.moon.lon, chart.utc);
  const maha = list.find((p) => at >= p.start && at < p.end) ?? list[list.length - 1];
  const full = DASHA_YEARS[maha.lord]; const virtualStart = new Date(maha.end.getTime() - full * YEAR_DAYS * DAY);
  const antar = antardashas(maha, full, virtualStart).find((p) => at >= p.start && at < p.end);
  return { maha, antar: antar ?? null, timeline: list };
}

// ------------------------------------------------------------------ daily panchang-lite and transits (gochar)
export function panchang(at: Date, tzHours = 5.5) {
  const p = planetsAt(at); const sun = p[0], moon = p[1];
  const elong = norm(moon.lon - sun.lon); const t = Math.floor(elong / 12); // 0..29
  const shukla = t < 15; const k = t % 15;
  const tithi = k === 14 ? (shukla ? 'Purnima' : 'Amavasya') : TITHIS[k];
  const local = new Date(at.getTime() + tzHours * 3600000);
  return { tithi: `${shukla ? 'Shukla' : 'Krishna'} ${tithi}`, vara: VARA[local.getUTCDay()], moonRashi: moon.rashi, moonNakshatra: moon.nakshatra, sunRashi: sun.rashi, elongation: elong };
}
export function gochar(chart: Chart, at: Date) {
  const now = planetsAt(at); const houseFromMoon = (r: number) => ((r - chart.moon.rashi + 12) % 12) + 1;
  const rows = now.map((p) => ({ name: p.name, rashi: p.rashi, nakshatra: p.nakshatra, houseFromMoon: houseFromMoon(p.rashi), houseFromLagna: ((p.rashi - chart.lagna.rashi + 12) % 12) + 1 }));
  const sat = rows.find((r) => r.name === 'Saturn')!; const sadeSati = [12, 1, 2].includes(sat.houseFromMoon);
  return { rows, sadeSati, sadeSatiPhase: sadeSati ? ({ 12: 'first phase (Saturn in 12th from Moon)', 1: 'peak phase (Saturn over Moon sign)', 2: 'last phase (Saturn in 2nd from Moon)' } as Record<number, string>)[sat.houseFromMoon] : null };
}

// ------------------------------------------------------------------ numerology (Pythagorean)
const MAP: Record<string, number> = {}; 'ABCDEFGHI'.split('').forEach((c, i) => { MAP[c] = i + 1; }); 'JKLMNOPQR'.split('').forEach((c, i) => { MAP[c] = i + 1; }); 'STUVWXYZ'.split('').forEach((c, i) => { MAP[c] = i + 1; });
export const reduceNum = (n: number): number => { while (n > 9 && n !== 11 && n !== 22 && n !== 33) n = String(n).split('').reduce((s, d) => s + Number(d), 0); return n; };
const plain = (n: number): number => { while (n > 9) n = String(n).split('').reduce((s, d) => s + Number(d), 0); return n; };
const nameSum = (name: string, pick: (c: string) => boolean) => name.toUpperCase().replace(/[^A-Z]/g, '').split('').filter(pick).reduce((s, c) => s + MAP[c], 0);
export function numerology(name: string, dateISO: string, today: Date) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const lifePath = reduceNum(reduceNum(d) + reduceNum(m) + reduceNum(y));
  const isV = (c: string) => 'AEIOU'.includes(c);
  const expression = reduceNum(nameSum(name, () => true));
  const soulUrge = reduceNum(nameSum(name, isV));
  const personality = reduceNum(nameSum(name, (c) => !isV(c)));
  const py = reduceNum(reduceNum(d) + reduceNum(m) + reduceNum(today.getUTCFullYear()));
  const pm = reduceNum(py + (today.getUTCMonth() + 1)); const pd = reduceNum(pm + today.getUTCDate());
  return { lifePath, birthday: reduceNum(d), expression, soulUrge, personality, personalYear: py, personalMonth: pm, personalDay: pd, mulank: plain(d) };
}
export const NUMBER_THEMES: Record<number, string> = {
  1: 'leadership, independence, starting things', 2: 'partnership, patience, diplomacy', 3: 'expression, creativity, social energy', 4: 'discipline, structure, steady building',
  5: 'change, freedom, adaptability', 6: 'responsibility, care, community', 7: 'study, reflection, inner work', 8: 'ambition, business, power and money lessons',
  9: 'completion, generosity, letting go', 11: 'intuition, inspiration (master number)', 22: 'big practical building (master number)', 33: 'teaching, service (master number)',
};

// ------------------------------------------------------------------ tarot
export interface TarotCard { name: string; arcana: 'major' | 'minor'; up: string; rev: string }
const MAJOR: Array<[string, string, string]> = [
  ['The Fool', 'new beginning, trust, leap of faith', 'recklessness, hesitation, poor planning'], ['The Magician', 'skill, willpower, making it happen', 'scattered effort, manipulation, unused talent'],
  ['The High Priestess', 'intuition, patience, hidden information', 'ignoring your gut, secrets, confusion'], ['The Empress', 'abundance, nurture, growth', 'neglect, dependence, stalled creativity'],
  ['The Emperor', 'structure, authority, discipline', 'rigidity, control issues, weak boundaries'], ['The Hierophant', 'tradition, learning from a mentor, proven methods', 'rebellion, dogma, breaking a rule that no longer fits'],
  ['The Lovers', 'a meaningful choice, alignment of values, partnership', 'misalignment, indecision, avoiding a choice'], ['The Chariot', 'drive, focus, victory through control', 'lack of direction, forcing things, losing momentum'],
  ['Strength', 'courage, patience, calm power', 'self-doubt, burnout, temper'], ['The Hermit', 'reflection, study, solitude for clarity', 'isolation, avoiding advice, overthinking'],
  ['Wheel of Fortune', 'change of cycle, timing, luck turning', 'resistance to change, setbacks, bad timing'], ['Justice', 'fairness, cause and effect, honest decisions', 'unfairness, avoiding accountability, lopsided choices'],
  ['The Hanged Man', 'pause, new perspective, surrender', 'stalling, needless sacrifice, indecision'], ['Death', 'ending, transformation, clearing the old', 'clinging to the past, slow change, fear of ending'],
  ['Temperance', 'balance, moderation, steady blending', 'excess, imbalance, impatience'], ['The Devil', 'attachment, habit, temptation, shadow', 'breaking free, regaining control, releasing a bad habit'],
  ['The Tower', 'sudden shake-up, truth revealed, rebuild', 'avoiding the inevitable, a smaller shock, fear of change'], ['The Star', 'hope, healing, renewed faith', 'discouragement, doubt, low energy'],
  ['The Moon', 'uncertainty, intuition, things not yet clear', 'confusion lifting, fear fading, clarity arriving'], ['The Sun', 'joy, success, vitality, clarity', 'temporary cloudiness, over-optimism, delayed success'],
  ['Judgement', 'reckoning, calling, a fresh start after review', 'self-criticism, ignoring the call, regret'], ['The World', 'completion, achievement, wholeness', 'unfinished business, delays, a goal not yet closed'],
];
const RANKS: Array<[string, string, string]> = [
  ['Ace', 'a fresh start and potential', 'a missed or delayed start'], ['Two', 'a choice or balance', 'imbalance or indecision'], ['Three', 'growth and teamwork', 'poor teamwork, delays'],
  ['Four', 'stability and rest', 'stagnation or restlessness'], ['Five', 'conflict, loss or challenge', 'recovering from conflict'], ['Six', 'harmony, help, progress', 'unequal exchange, slow progress'],
  ['Seven', 'testing and assessment', 'doubt, giving up too soon'], ['Eight', 'movement and mastery', 'rushing, scattered effort'], ['Nine', 'resilience, near completion', 'exhaustion, anxiety'],
  ['Ten', 'completion, a heavy load or full reward', 'burden dropped, overload'], ['Page', 'a learner, a message, curiosity', 'immaturity, unwelcome news'], ['Knight', 'pursuit, action, drive', 'impulsiveness, stalling'],
  ['Queen', 'mastery, care, inner strength', 'insecurity, withdrawn energy'], ['King', 'authority, control, outer success', 'misuse of power, rigidity'],
];
const SUITS: Array<[string, string]> = [['Wands', 'in work, energy and passion'], ['Cups', 'in feelings and relationships'], ['Swords', 'in thinking, truth and conflict'], ['Pentacles', 'in money, body and craft']];
export const DECK: TarotCard[] = [
  ...MAJOR.map(([name, up, rev]) => ({ name, arcana: 'major' as const, up, rev })),
  ...SUITS.flatMap(([suit, dom]) => RANKS.map(([rank, up, rev]) => ({ name: `${rank} of ${suit}`, arcana: 'minor' as const, up: `${up} ${dom}`, rev: `${rev} ${dom}` }))),
];
export interface Drawn { card: TarotCard; reversed: boolean; position: string }
/** Fair draw without repeats, using the browser's secure random source. */
export function drawTarot(count: number, positions: string[], rand: (n: number) => number = secureInt): Drawn[] {
  const idx = DECK.map((_, i) => i); const out: Drawn[] = [];
  for (let k = 0; k < count; k++) { const j = rand(idx.length); const [pick] = idx.splice(j, 1); out.push({ card: DECK[pick], reversed: rand(100) < 30, position: positions[k] ?? `Card ${k + 1}` }); }
  return out;
}
function secureInt(n: number): number { const lim = Math.floor(0x100000000 / n) * n; const b = new Uint32Array(1); do { crypto.getRandomValues(b); } while (b[0] >= lim); return b[0] % n; }
export const SPREADS: Record<string, string[]> = { 'One card (today)': ['Today'], 'Three cards (past, present, future)': ['Past', 'Present', 'Future'], 'Five cards (situation)': ['Where I am', 'Challenge', 'Hidden factor', 'Advice', 'Likely direction'] };

// ------------------------------------------------------------------ plain-text fact sheets handed to the AI
const fmtDeg = (p: { rashi: number; deg: number }) => `${RASHIS[p.rashi]} ${p.deg.toFixed(1)}°`;
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
export function chartFacts(chart: Chart, at: Date): string {
  const dsh = currentDasha(chart, at);
  const lines = [
    `Person: ${chart.input.name}. Born ${chart.input.date} ${chart.input.time} (UTC offset ${chart.input.tzHours}), ${chart.input.place || 'place not named'} (lat ${chart.input.lat}, lon ${chart.input.lon}).`,
    `System: Vedic sidereal, Lahiri ayanamsa ${chart.ayanamsa.toFixed(2)}°, whole-sign houses, mean node Rahu/Ketu.`,
    `Lagna (ascendant): ${fmtDeg(chart.lagna)}, lord ${chart.lagna.lord}. Moon sign (rashi): ${RASHIS[chart.moon.rashi]}, nakshatra ${chart.moon.nakshatra} pada ${chart.moon.pada}. Sun sign: ${RASHIS[chart.sunSign]}.`,
    'Planets: ' + chart.planets.map((p) => `${p.name} ${fmtDeg(p)} house ${p.house} (${p.nakshatra})`).join('; ') + '.',
    `Vimshottari dasha now: ${dsh.maha.lord} mahadasha (${fmtDate(dsh.maha.start)} to ${fmtDate(dsh.maha.end)})${dsh.antar ? `, ${dsh.antar.lord} antardasha (to ${fmtDate(dsh.antar.end)})` : ''}. Next mahadashas: ${dsh.timeline.filter((p) => p.start > at).slice(0, 3).map((p) => `${p.lord} from ${fmtDate(p.start)}`).join(', ')}.`,
  ];
  if (!chart.input.time) lines.push('NOTE: birth time unknown, so lagna and houses are unreliable.');
  return lines.join('\n');
}
export function todayFacts(chart: Chart, at: Date, tzHours = 5.5): string {
  const pn = panchang(at, tzHours), g = gochar(chart, at);
  return [
    `Today (${fmtDate(new Date(at.getTime() + tzHours * 3600000))}): ${pn.vara}, ${pn.tithi}, Moon in ${RASHIS[pn.moonRashi]} (${pn.moonNakshatra}).`,
    `Transits from natal Moon sign: ` + g.rows.filter((r) => r.name !== 'Ketu').map((r) => `${r.name} in ${RASHIS[r.rashi]} (${r.houseFromMoon}th from Moon)`).join('; ') + '.',
    g.sadeSati ? `Saturn Sade Sati is running: ${g.sadeSatiPhase}.` : 'Saturn Sade Sati is not running.',
  ].join('\n');
}
export function numerologyFacts(name: string, dateISO: string, at: Date): string {
  const n = numerology(name, dateISO, at);
  return `Numerology (Pythagorean) for ${name}: life path ${n.lifePath} (${NUMBER_THEMES[n.lifePath]}); birthday number ${n.birthday}; expression ${n.expression}; soul urge ${n.soulUrge}; personality ${n.personality}. Right now: personal year ${n.personalYear} (${NUMBER_THEMES[n.personalYear]}), personal month ${n.personalMonth}, personal day ${n.personalDay} (${NUMBER_THEMES[n.personalDay]}).`;
}
export function tarotFacts(d: Drawn[], question: string): string {
  return `Tarot question: ${question || 'general guidance'}. Cards drawn: ` + d.map((x) => `${x.position}: ${x.card.name}${x.reversed ? ' (reversed)' : ''} - ${x.reversed ? x.card.rev : x.card.up}`).join('; ') + '.';
}

export const CITIES: Array<{ name: string; lat: number; lon: number }> = [
  { name: 'Kolkata', lat: 22.5726, lon: 88.3639 }, { name: 'Delhi', lat: 28.6139, lon: 77.209 }, { name: 'Mumbai', lat: 19.076, lon: 72.8777 }, { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 }, { name: 'Hyderabad', lat: 17.385, lon: 78.4867 }, { name: 'Pune', lat: 18.5204, lon: 73.8567 }, { name: 'Ahmedabad', lat: 23.0225, lon: 72.5714 },
  { name: 'Jaipur', lat: 26.9124, lon: 75.7873 }, { name: 'Lucknow', lat: 26.8467, lon: 80.9462 }, { name: 'Patna', lat: 25.5941, lon: 85.1376 }, { name: 'Guwahati', lat: 26.1445, lon: 91.7362 },
  { name: 'Bhubaneswar', lat: 20.2961, lon: 85.8245 }, { name: 'Siliguri', lat: 26.7271, lon: 88.3953 }, { name: 'Durgapur', lat: 23.5204, lon: 87.3119 }, { name: 'Asansol', lat: 23.6739, lon: 86.9524 },
  { name: 'Howrah', lat: 22.5958, lon: 88.2636 }, { name: 'Dhaka', lat: 23.8103, lon: 90.4125 }, { name: 'Chandigarh', lat: 30.7333, lon: 76.7794 }, { name: 'Bhopal', lat: 23.2599, lon: 77.4126 },
  { name: 'Indore', lat: 22.7196, lon: 75.8577 }, { name: 'Nagpur', lat: 21.1458, lon: 79.0882 }, { name: 'Kochi', lat: 9.9312, lon: 76.2673 }, { name: 'Thiruvananthapuram', lat: 8.5241, lon: 76.9366 },
  { name: 'Ranchi', lat: 23.3441, lon: 85.3096 }, { name: 'Varanasi', lat: 25.3176, lon: 82.9739 },
];

/** Facts for a longer window (week / month / year): dasha changes inside it, and where the slow planets sit at a few dates. */
export function periodFacts(chart: Chart, start: Date, end: Date, samples = 4): string {
  const dsh = currentDasha(chart, start);
  const lines: string[] = [`Window: ${fmtDate(start)} to ${fmtDate(end)}.`];
  const changes: string[] = [];
  for (const m of dsh.timeline) {
    if (m.end > start && m.start < end) {
      for (const a of antardashas(m, DASHA_YEARS[m.lord], new Date(m.end.getTime() - DASHA_YEARS[m.lord] * YEAR_DAYS * DAY))) {
        if (a.end > start && a.start < end) changes.push(`${m.lord}/${a.lord} (${fmtDate(a.start < start ? start : a.start)} to ${fmtDate(a.end > end ? end : a.end)})`);
      }
    }
  }
  lines.push('Dasha (mahadasha/antardasha) inside this window: ' + (changes.length ? changes.join('; ') : 'no change') + '.');
  const span = end.getTime() - start.getTime();
  for (let i = 0; i < samples; i++) {
    const at = new Date(start.getTime() + (span * i) / Math.max(1, samples - 1));
    const g = gochar(chart, at);
    lines.push(`${fmtDate(at)}: ` + g.rows.filter((r) => ['Sun', 'Mars', 'Jupiter', 'Saturn', 'Rahu'].includes(r.name)).map((r) => `${r.name} ${RASHIS[r.rashi].split(' ')[0]} (${r.houseFromMoon}th from Moon)`).join(', ') + (g.sadeSati ? ' [Sade Sati]' : ''));
  }
  return lines.join('\n');
}
