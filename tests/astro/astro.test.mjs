import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from 'astronomy-engine';
import { planetsAt, lahiriAyanamsa, ascendantTropical, buildChart, mahadashas, currentDasha, panchang, gochar, numerology, reduceNum, DECK, drawTarot, DASHA_YEARS, chartFacts, todayFacts, SPREADS, birthToUtc, antardashas } from '../../src/lib/astro.ts';

const near = (a, b, tol, msg) => assert.ok(Math.abs(((a - b + 540) % 360) - 180) <= tol, `${msg}: ${a} vs ${b}`);

test('sun and moon at J2000 match published values', () => {
  const d = new Date('2000-01-01T12:00:00Z'); const ay = lahiriAyanamsa(d);
  near(ay, 23.853, 0.01, 'ayanamsa'); const p = planetsAt(d);
  near(p[0].lon + ay, 280.37, 0.05, 'sun tropical'); near(p[1].lon + ay, 223.3, 0.3, 'moon tropical');
  assert.equal(p.length, 9); near(p[7].lon, p[8].lon + 180, 1e-9, 'ketu opposite rahu');
});
test('sidereal sun enters Mesha near 14 April and Makara near 14 January (Lahiri)', () => {
  const sunRashi = (iso) => planetsAt(new Date(iso))[0].rashi;
  assert.equal(sunRashi('2026-04-10T00:00:00Z'), 11); assert.equal(sunRashi('2026-04-16T00:00:00Z'), 0);
  assert.equal(sunRashi('2026-01-10T00:00:00Z'), 8); assert.equal(sunRashi('2026-01-16T00:00:00Z'), 9);
});
test('precession is applied in 2026 (ecliptic of date, not J2000)', () => {
  const d = new Date('2026-10-19T00:00:00Z'); const sunDate = A.SunPosition(d).elon;
  const ours = planetsAt(d)[0].lon + lahiriAyanamsa(d);
  near(ours, sunDate, 0.02, 'sun vs SunPosition');
});
test('ascendant is a real rising point: altitude ~0 and in the east', () => {
  for (const [iso, lat, lon] of [['1990-08-15T04:30:00Z', 22.57, 88.36], ['2001-03-03T20:10:00Z', 28.61, 77.2], ['1985-12-25T01:00:00Z', 51.5, -0.12], ['2010-06-21T11:00:00Z', 13.08, 80.27]]) {
    const d = new Date(iso); const asc = ascendantTropical(d, lat, lon);
    const lam = (asc * Math.PI) / 180, T = (d - Date.UTC(2000, 0, 1, 12)) / (86400000 * 36525), eps = ((23.439291 - 0.0130042 * T) * Math.PI) / 180;
    const ra = Math.atan2(Math.sin(lam) * Math.cos(eps), Math.cos(lam)), dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const lst = ((A.SiderealTime(d) * 15 + lon) * Math.PI) / 180, H = lst - ra, phi = (lat * Math.PI) / 180;
    const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) * 180 / Math.PI;
    assert.ok(Math.abs(alt) < 0.05, `alt ${alt}`); assert.ok(Math.sin(H) < 0, 'rising in the east (hour angle negative)');
  }
});
test('birth chart structure, houses and nakshatra', () => {
  const c = buildChart({ name: 'Test', date: '1990-08-15', time: '10:00', tzHours: 5.5, lat: 22.5726, lon: 88.3639, place: 'Kolkata' });
  assert.equal(c.planets.length, 9); assert.ok(c.planets.every((p) => p.house >= 1 && p.house <= 12 && p.lon >= 0 && p.lon < 360));
  assert.equal(c.planets.find((p) => p.name === 'Sun').house, ((c.sunSign - c.lagna.rashi + 12) % 12) + 1);
  assert.match(chartFacts(c, new Date('2026-10-19T00:00:00Z')), /Lagna.*Moon sign.*Vimshottari/s);
  // a sunrise-ish birth on 15 Aug in Kolkata: Sun (tropical Leo ~22°, sidereal Cancer) near the lagna
  const sunrise = buildChart({ name: 'S', date: '1990-08-15', time: '05:20', tzHours: 5.5, lat: 22.5726, lon: 88.3639 });
  assert.ok(Math.abs(((sunrise.planets[0].lon - sunrise.lagna.lon + 540) % 360) - 180) < 20, 'sun close to lagna at sunrise');
});
test('vimshottari: starts with moon nakshatra lord, totals 120 years, antardashas fill the mahadasha', () => {
  const birth = new Date('1990-08-15T04:30:00Z'); const moonLon = 0.5; // Ashwini start -> Ketu with full 7y
  const l = mahadashas(moonLon, birth); assert.equal(l[0].lord, 'Ketu'); assert.ok(Math.abs((l[0].end - l[0].start) / (365.2425 * 86400000) - 7 * (1 - 0.5 / 13.3333333)) < 0.01);
  const m2 = l[1]; assert.equal(m2.lord, 'Venus'); assert.ok(Math.abs((m2.end - m2.start) / (365.2425 * 86400000) - 20) < 1e-6);
  const ad = antardashas(m2); assert.equal(ad[0].lord, 'Venus'); assert.ok(Math.abs(ad.at(-1).end - m2.end) < 1000); assert.equal(Object.values(DASHA_YEARS).reduce((a, b) => a + b), 120);
  const c = buildChart({ name: 'T', date: '1990-08-15', time: '10:00', tzHours: 5.5, lat: 22.57, lon: 88.36 });
  const cd = currentDasha(c, new Date('2026-10-19T00:00:00Z')); assert.ok(cd.maha && cd.antar); assert.ok(cd.antar.start >= new Date(cd.maha.end - 19 * 365.25 * 864e5));
  // continuity: a timeline never overlaps or leaves gaps
  cd.timeline.slice(1).forEach((p, i) => assert.equal(p.start.getTime(), cd.timeline[i].end.getTime()));
});
test('panchang and gochar', () => {
  const full = planetsAt(new Date('2026-10-26T00:00:00Z')); // near full moon? just check structure
  const p = panchang(new Date('2026-10-19T00:00:00Z'));
  assert.match(p.tithi, /^(Shukla|Krishna) /); assert.match(p.vara, /Monday/); assert.ok(p.elongation >= 0 && p.elongation < 360);
  // known new moon 2026-10-10 ~15:50 UTC -> Amavasya; known full moon 2026-10-26 04:12 UTC (new moon 10-10 15:50), checked just before each -> Purnima
  assert.match(panchang(new Date('2026-10-10T15:00:00Z')).tithi, /Amavasya|Chaturdashi/); assert.match(panchang(new Date('2026-10-26T03:00:00Z')).tithi, /Purnima|Chaturdashi/);
  const c = buildChart({ name: 'T', date: '1990-08-15', time: '10:00', tzHours: 5.5, lat: 22.57, lon: 88.36 });
  const g = gochar(c, new Date('2026-10-19T00:00:00Z')); assert.equal(g.rows.length, 9); assert.ok(g.rows.every((r) => r.houseFromMoon >= 1 && r.houseFromMoon <= 12));
  assert.match(todayFacts(c, new Date('2026-10-19T06:00:00Z')), /Sade Sati/); assert.ok(full.length === 9);
});
test('numerology known values', () => {
  assert.equal(reduceNum(29), 11); assert.equal(reduceNum(38), 11); assert.equal(reduceNum(15), 6); assert.equal(reduceNum(44), 8);
  const n = numerology('Rahul Das', '1990-08-15', new Date('2026-10-19T00:00:00Z')); assert.equal(n.lifePath, 6); assert.equal(n.birthday, 6);
  assert.equal(numerology('A', '2000-01-01', new Date('2026-10-19')).expression, 1);
  const x = numerology('John Smith', '1985-11-29', new Date('2026-01-01T00:00:00Z')); assert.equal(x.lifePath, reduceNum(reduceNum(29) + reduceNum(11) + reduceNum(1985)));
  assert.ok(n.personalYear >= 1 && n.personalDay >= 1);
});
test('tarot deck is complete and draws are fair and unique', () => {
  assert.equal(DECK.length, 78); assert.equal(new Set(DECK.map((c) => c.name)).size, 78); assert.equal(DECK.filter((c) => c.arcana === 'major').length, 22);
  for (const [, pos] of Object.entries(SPREADS)) { const d = drawTarot(pos.length, pos); assert.equal(new Set(d.map((x) => x.card.name)).size, pos.length); assert.deepEqual(d.map((x) => x.position), pos); }
  assert.equal(drawTarot(78, []).length, 78);
  const counts = new Array(78).fill(0); for (let i = 0; i < 39000; i++) counts[DECK.indexOf(drawTarot(1, ['x'])[0].card)]++;
  assert.ok(Math.min(...counts) > 350 && Math.max(...counts) < 650, 'roughly uniform (expected 500 each)');
  let rev = 0; for (let i = 0; i < 5000; i++) if (drawTarot(1, ['x'])[0].reversed) rev++; assert.ok(rev > 1300 && rev < 1700);
});
test('birth time parsing errors are clear', () => { assert.throws(() => birthToUtc({ date: 'bad', time: '10:00', tzHours: 5.5 }), /valid birth/); });

import { periodFacts } from '../../src/lib/astro.ts';
test('period facts cover dasha changes and transit samples', () => {
  const c = buildChart({ name: 'T', date: '1990-08-15', time: '10:00', tzHours: 5.5, lat: 22.57, lon: 88.36 });
  const t = periodFacts(c, new Date('2026-10-25T00:00:00Z'), new Date('2027-10-25T00:00:00Z'));
  assert.match(t, /Window: 2026-10-25 to 2027-10-25/); assert.match(t, /Dasha \(mahadasha\/antardasha\) inside this window: \w+\/\w+/); assert.equal(t.split('\n').length, 2 + 4);
  assert.match(periodFacts(c, new Date('2026-10-25T00:00:00Z'), new Date('2026-10-26T00:00:00Z'), 1), /Saturn/);
});

test('moon-sun elongation agrees with the astronomy library moon phase on several dates', () => {
  for (const iso of ['1990-08-15T04:30:00Z', '2026-10-25T00:00:00Z', '2010-03-03T10:00:00Z', '1975-01-01T00:00:00Z']) {
    const d = new Date(iso), p = planetsAt(d); near((p[1].lon - p[0].lon + 360) % 360, A.MoonPhase(d), 0.05, 'elongation ' + iso);
  }
});
