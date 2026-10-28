/**
 * Kiosk voice: gentle, motivational announcements for welcome, exit, birthday and expiry.
 * Uses the best voices the kiosk device offers (on Windows + Edge/Chrome these are the free "Natural / Online"
 * neural voices), rotating through up to 5 female and 5 male voices so no two scans in a row sound the same.
 * No keys, no cost, works offline when the device has local voices.
 */
const GYM = 'Bhajrang Fitness';
export type Gender = 'female' | 'male';
export type Slot = { voice: SpeechSynthesisVoice | null; gender: Gender; pitch: number; rate: number };

export type Announcement = {
  action: 'CHECK-IN' | 'CHECK-OUT';
  name: string;
  expired?: boolean;
  days_left?: number | null;
  expiring_soon?: boolean;
  birthday?: boolean;
  minutes?: number | null;
  visits_this_month?: number | null;
};

// ---------- voice ranking ----------
const FEMALE_WORDS = /\b(female|woman|neerja|swara|heera|aria|jenny|sonia|libby|natasha|clara|emma|zira|hazel|susan|samantha|karen|moira|tessa|veena|priya|lekha|kalpana|raveena|amy|olivia|ava|michelle|ana|sara|nicole|joanna|salli|kendra|kimberly|ivy|serena|fiona|monica|aditi|jane|catherine|sonia|maisie|mia|ruth|lisa|allison|nancy|victoria)\b/i;
const MALE_WORDS = /\b(male|man|prabhat|ravi|hemant|guy|ryan|davis|christopher|eric|brian|thomas|mark|david|george|james|daniel|oliver|alex|fred|rishi|arthur|matthew|joey|justin|kevin|russell|nathan|aaron|liam|andrew|steffan|tony|jason|roger|ethan|gordon|lee|rishi|neel|dhruv)\b/i;

export function genderOf(v: { name: string }): Gender | null {
  const n = v.name;
  if (/female|woman/i.test(n)) return 'female';
  if (MALE_WORDS.test(n)) return 'male';
  if (FEMALE_WORDS.test(n)) return 'female';
  return null;
}

export function scoreOf(v: { name: string; lang: string; localService?: boolean }): number {
  const n = v.name.toLowerCase(), l = v.lang.replace('_', '-').toLowerCase();
  if (!l.startsWith('en')) return -1;
  let s = 0;
  if (/natural|neural|online|premium|enhanced/.test(n)) s += 60;
  if (/google|microsoft/.test(n)) s += 25;
  if (l === 'en-in') s += 22; else if (l === 'en-gb') s += 14; else if (l === 'en-us' || l === 'en-au') s += 10; else s += 4;
  if (/espeak|compact|robot|novelty|whisper|bad |good news|bells|bubbles|cellos|zarvox|organ|trinoids|boing|albert|junior|kathy|ralph/.test(n)) s -= 80;
  return s;
}

/** Up to 5 best voices per gender, then 10 alternating slots (F, M, F, M …). Missing voices are filled with gently different pitch/rate of the best ones. */
export function buildSlots(voices: SpeechSynthesisVoice[]): Slot[] {
  const by: Record<Gender, { v: SpeechSynthesisVoice; s: number }[]> = { female: [], male: [] };
  const seen = new Set<string>();
  for (const v of voices) {
    const g = genderOf(v), s = scoreOf(v);
    if (!g || s < 0 || seen.has(v.name)) continue;
    seen.add(v.name); by[g].push({ v, s });
  }
  (['female', 'male'] as Gender[]).forEach(g => by[g].sort((a, b) => b.s - a.s));
  const tweak = [{ pitch: 1, rate: 0.92 }, { pitch: 1.06, rate: 0.9 }, { pitch: 0.95, rate: 0.94 }, { pitch: 1.1, rate: 0.9 }, { pitch: 0.92, rate: 0.93 }];
  const lane = (g: Gender): Slot[] => {
    const list = by[g].slice(0, 5).map(x => x.v);
    const out: Slot[] = [];
    for (let i = 0; i < 5; i++) {
      const base = list.length ? list[i % list.length] : null;
      const reused = list.length > 0 && i >= list.length;
      const t = reused ? tweak[i] : { pitch: g === 'male' ? 0.96 : 1.02, rate: 0.92 };
      out.push({ voice: base, gender: g, pitch: t.pitch, rate: t.rate });
    }
    return out;
  };
  const f = lane('female'), m = lane('male'), slots: Slot[] = [];
  for (let i = 0; i < 5; i++) slots.push(f[i], m[i]);
  return slots;
}

// ---------- the words ----------
const pick = <T,>(a: T[], seed: number): T => a[Math.abs(seed) % a.length];
const first = (n: string) => { const w = (n || 'Champion').trim().split(/\s+/)[0] || 'Champion'; return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); };
function greeting(hour: number) { return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'; }
export function istHour(d = new Date()) { return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(d)) % 24; }

export function buildLines(a: Announcement, seed: number, hour = istHour()): string[] {
  const n = first(a.name), g = greeting(hour), lines: string[] = [];
  if (a.action === 'CHECK-IN') {
    lines.push(pick([
      `${g}, ${n}. Welcome to ${GYM}. Let's make today count.`,
      `Welcome back, ${n}. Strength is built one session at a time.`,
      `${g}, ${n}. Breathe, focus, and enjoy your workout.`,
      `Great to see you, ${n}. Showing up is already a victory.`,
      `Welcome, ${n}. Every rep brings you closer to your goal.`,
      `${g}, ${n}. Small steps today, big results tomorrow.`,
      `Welcome to ${GYM}, ${n}. Train with patience and power.`,
      `Hello ${n}. Your consistency is your superpower.`,
    ], seed));
    if ((a.visits_this_month ?? 0) >= 8) lines.push(`That is ${a.visits_this_month} gym days this month. Wonderful dedication.`);
  } else {
    const mins = a.minutes && a.minutes >= 5 ? `${a.minutes} minutes of effort today. Be proud of that. ` : '';
    lines.push(pick([
      `Well done, ${n}. ${mins}Rest well and drink plenty of water.`,
      `Great session, ${n}. ${mins}See you soon, stay strong.`,
      `That is how champions train, ${n}. ${mins}Recover well and come back stronger.`,
      `Thank you for training with us, ${n}. ${mins}Take care and stay motivated.`,
      `Excellent work, ${n}. ${mins}Eat well, sleep well, and we will see you next time.`,
      `Goodbye ${n}. ${mins}Every workout counts. Keep going.`,
    ], seed + 3).replace(/\s+/g, ' ').trim());
  }
  if (a.birthday) lines.push(pick([
    `And a very happy birthday to you, ${n}! May this year bring you strength, health and happiness. The whole ${GYM} family is celebrating you today.`,
    `Happy birthday, ${n}! Wishing you a year of great health, joy and personal records. Enjoy your special day.`,
    `Many happy returns of the day, ${n}! Your ${GYM} family is proud of you. Stay blessed and keep shining.`,
  ], seed + 5));
  const d = a.days_left;
  if (a.expired) {
    const ago = d != null && d < 0 ? Math.abs(d) : null;
    lines.push(`A gentle reminder, ${n}: your membership has expired${ago ? `, ${ago} day${ago === 1 ? '' : 's'} ago` : ''}. Please meet the reception to renew and continue your journey.`);
  } else if (a.expiring_soon && d != null) {
    lines.push(d === 0
      ? `A quick reminder, ${n}: your membership ends today. Please renew at the reception to keep your progress going.`
      : `A friendly reminder, ${n}: your membership ends in ${d} day${d === 1 ? '' : 's'}. Please renew at the reception to keep your progress going.`);
  }
  return lines;
}

// ---------- speaking ----------
const KEY_ON = 'rbf_voice_on', KEY_I = 'rbf_voice_i';
let slots: Slot[] = [];
let lastSpoken: { voice: string; gender: Gender } | null = null;
const synth = (): SpeechSynthesis | null => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);

export function isVoiceOn(): boolean { try { return localStorage.getItem(KEY_ON) !== '0'; } catch { return true; } }
export function setVoiceOn(on: boolean) { try { localStorage.setItem(KEY_ON, on ? '1' : '0'); } catch { /* ignore */ } if (!on) synth()?.cancel(); }
export function lastVoiceInfo() { return lastSpoken; }
export function voiceCount() { return slots.filter(s => s.voice).map(s => s.voice!.name).filter((v, i, a) => a.indexOf(v) === i).length; }

export function preloadVoices(): Promise<void> {
  const s = synth(); if (!s) return Promise.resolve();
  return new Promise(res => {
    const done = () => { slots = buildSlots(s.getVoices()); res(); };
    if (s.getVoices().length) return done();
    s.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

function nextSlot(): Slot {
  if (!slots.length) { const s = synth(); if (s) slots = buildSlots(s.getVoices()); }
  let i = 0; try { i = Number(localStorage.getItem(KEY_I) || '0') || 0; localStorage.setItem(KEY_I, String((i + 1) % 10)); } catch { /* ignore */ }
  return slots.length ? slots[i % slots.length] : { voice: null, gender: 'female', pitch: 1, rate: 0.92 };
}

/** Speak the lines one after another with a short calm pause, all in the same rotating voice. */
export function speakLines(lines: string[]): void {
  const s = synth(); if (!s || !isVoiceOn() || !lines.length) return;
  const slot = nextSlot();
  lastSpoken = { voice: slot.voice?.name || 'device default', gender: slot.gender };
  s.cancel();
  const run = (i: number) => {
    if (i >= lines.length) return;
    const u = new SpeechSynthesisUtterance(lines[i]);
    if (slot.voice) { u.voice = slot.voice; u.lang = slot.voice.lang; } else u.lang = 'en-IN';
    u.pitch = slot.pitch; u.rate = slot.rate; u.volume = 1;
    u.onend = () => setTimeout(() => run(i + 1), 380);
    u.onerror = () => undefined;
    s.speak(u);
  };
  setTimeout(() => run(0), 80);
}

let counter = Math.floor(Math.random() * 1000);
export function announce(a: Announcement): void { counter += 1; speakLines(buildLines(a, counter)); }
export function testVoice(): void { announce({ action: 'CHECK-IN', name: 'Champion', birthday: false, visits_this_month: 0 }); }
