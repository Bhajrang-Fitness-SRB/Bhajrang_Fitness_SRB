import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLines, buildSlots, genderOf, scoreOf } from '../../src/lib/kioskVoice.ts';

const v = (name: string, lang = 'en-IN') => ({ name, lang }) as unknown as SpeechSynthesisVoice;

test('gender detection', () => {
  assert.equal(genderOf(v('Microsoft Neerja Online (Natural) - English (India)')), 'female');
  assert.equal(genderOf(v('Microsoft Prabhat Online (Natural)')), 'male');
  assert.equal(genderOf(v('Google UK English Female')), 'female');
  assert.equal(genderOf(v('Google UK English Male')), 'male');
});
test('natural voices outrank basic ones; non-English skipped', () => {
  assert.ok(scoreOf(v('Microsoft Neerja Online (Natural)')) > scoreOf(v('Microsoft Heera')));
  assert.equal(scoreOf(v('Hindi Voice', 'hi-IN')), -1);
});
test('always 10 alternating slots, even with few voices', () => {
  const slots = buildSlots([v('Microsoft Neerja Online (Natural)'), v('Microsoft Prabhat Online (Natural)')]);
  assert.equal(slots.length, 10);
  assert.deepEqual(slots.slice(0, 4).map(s => s.gender), ['female', 'male', 'female', 'male']);
  const combos = new Set(slots.map(s => `${s.voice?.name}|${s.pitch}|${s.rate}`));
  assert.ok(combos.size >= 6, 'reused voices must still sound different');
});
test('welcome + birthday + expiring reminder', () => {
  const t = buildLines({ action: 'CHECK-IN', name: 'asha devi', birthday: true, expiring_soon: true, days_left: 3, visits_this_month: 12 }, 1, 9).join(' ');
  assert.match(t, /Asha/); assert.match(t, /birthday/i); assert.match(t, /ends in 3 days/); assert.match(t, /12 gym days/);
});
test('exit mentions minutes; expired is gentle', () => {
  const t = buildLines({ action: 'CHECK-OUT', name: 'Raj', minutes: 54, expired: true, days_left: -2 }, 2, 19).join(' ');
  assert.match(t, /54 minutes/); assert.match(t, /expired, 2 days ago/);
});
