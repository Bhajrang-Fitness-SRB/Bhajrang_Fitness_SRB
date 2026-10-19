import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  verifySignature, parseWebhook, detectLang, isOptOut, isOptIn, humanTopic, violatesSafety,
  insideWindow, splitMessage, toWaNumber, followKind, followPhrase, parseAgentJson, buildSystemPrompt,
} from '../../supabase/functions/_shared/social.ts';

const sign = (body, secret) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

test('signature: accepts valid, rejects tampered / missing / wrong secret', async () => {
  const body = '{"a":1}';
  assert.equal(await verifySignature(body, sign(body, 's3cret'), 's3cret'), true);
  assert.equal(await verifySignature(body + ' ', sign(body, 's3cret'), 's3cret'), false);
  assert.equal(await verifySignature(body, sign(body, 'other'), 's3cret'), false);
  assert.equal(await verifySignature(body, null, 's3cret'), false);
  assert.equal(await verifySignature(body, 'sha256=abc', 's3cret'), false);
  assert.equal(await verifySignature(body, sign(body, 's3cret'), ''), false);
});

test('parse WhatsApp text, button, media; ignore statuses', () => {
  const body = { object: 'whatsapp_business_account', entry: [{ changes: [{ value: {
    contacts: [{ wa_id: '919876543210', profile: { name: 'Rahul' } }],
    messages: [
      { from: '919876543210', id: 'wamid.1', type: 'text', text: { body: 'Monthly fee koto?' } },
      { from: '919876543210', id: 'wamid.2', type: 'audio', audio: {} },
      { from: '919876543210', id: 'wamid.3', type: 'interactive', interactive: { button_reply: { title: 'Join' } } },
      { from: '919876543210', id: 'wamid.4', type: 'sticker' },
    ],
    statuses: [{ id: 'x', status: 'read' }],
  } }] }] };
  const r = parseWebhook(body);
  assert.equal(r.length, 3);
  assert.deepEqual([r[0].channel, r[0].externalId, r[0].name, r[0].text, r[0].mid], ['whatsapp', '919876543210', 'Rahul', 'Monthly fee koto?', 'wamid.1']);
  assert.match(r[1].text, /voice note/);
  assert.equal(r[2].text, 'Join');
});

test('parse Messenger + Instagram, skip echoes and self', () => {
  const page = { object: 'page', entry: [{ id: 'PAGE', messaging: [
    { sender: { id: 'U1' }, message: { mid: 'm1', text: 'Hi' } },
    { sender: { id: 'PAGE' }, message: { mid: 'm2', text: 'bot', is_echo: true } },
    { sender: { id: 'U2' }, message: { mid: 'm3', attachments: [{}] } },
    { sender: { id: 'U3' }, postback: { title: 'Get Started' }, timestamp: 5 },
  ] }] };
  const r = parseWebhook(page);
  assert.deepEqual(r.map((x) => [x.channel, x.externalId]), [['facebook', 'U1'], ['facebook', 'U2'], ['facebook', 'U3']]);
  const ig = parseWebhook({ object: 'instagram', entry: [{ id: 'IGB', messaging: [{ sender: { id: 'IG1' }, message: { mid: 'i1', text: 'price?' } }] }] });
  assert.equal(ig[0].channel, 'instagram');
  assert.deepEqual(parseWebhook(null), []);
  assert.deepEqual(parseWebhook({ object: 'unknown' }), []);
});

test('language detection: Bengali script, Banglish, English', () => {
  assert.equal(detectLang('জিম এর মাসিক ফি কত?'), 'bn');
  assert.equal(detectLang('apnader gym er monthly fee koto?'), 'bn-roman');
  assert.equal(detectLang('ami PT korte chai'), 'bn-roman');
  assert.equal(detectLang('What are your gym timings and fees please'), 'en');
  assert.equal(detectLang('ok', 'bn-roman'), 'bn-roman');
  assert.equal(detectLang('👍', 'bn'), 'bn');
});

test('STOP / START', () => {
  for (const t of ['STOP', 'stop.', ' Unsubscribe ', 'opt out', 'বন্ধ']) assert.equal(isOptOut(t), true, t);
  for (const t of ['please stop the pain in my knee', 'stopwatch', 'I will not stop training']) assert.equal(isOptOut(t), false, t);
  assert.equal(isOptIn('START'), true);
  assert.equal(isOptIn('start gym tomorrow'), false);
});

test('human-only topics are caught; ordinary sales questions are not', () => {
  const must = {
    'Can I take whey with my thyroid medicine?': 'health',
    'I am pregnant, can I join?': 'health',
    'how many scoops of creatine per day': 'dose',
    'what dose of creatine': 'dose',
    'steroid cycle chahi': 'banned',
    'I want my refund, this is a scam': 'complaint',
    'my son is 15 can he join': 'minor',
    'I have slip disc problem': 'health',
  };
  for (const [t, why] of Object.entries(must)) assert.ok(humanTopic(t), `${why}: ${t}`);
  const fine = ['monthly fee koto?', 'what are your timings', 'do you have whey protein', 'PT price?', 'I want to join tomorrow', 'gym kobe khola', 'operation hours?', 'do you have a medicine ball', 'bicycle parking?'];
  for (const t of fine) assert.equal(humanTopic(t), null, t);
});

test('output safety: blocks doses and guarantees, allows normal selling', () => {
  for (const r of ['Take 5 g of creatine daily', 'Have 2 scoops after workout', 'take 1 capsule', 'one scoop a day', '500mg', 'We guarantee results', 'lose 10 kg in 30 days', '100% results', 'creatine 5g daily', 'Mix 30 g whey in water'])
    assert.ok(violatesSafety(r), r);
  for (const r of ['Our Monthly plan is Rs 1500. Want to visit for a free trial?', 'Whey protein helps you meet daily protein needs. Our trainer will guide you on how to use it.', 'PT sessions are 1 hour.', 'We open at 5 am.', 'We have Whey Protein 2000 g tub for Rs 2500.', 'Eat enough protein from food like eggs, dal and chicken.'])
    assert.equal(violatesSafety(r), null, r);
});

test('24h window', () => {
  const now = Date.parse('2026-10-17T10:00:00Z');
  assert.equal(insideWindow('2026-10-17T00:00:00Z', now), true);
  assert.equal(insideWindow('2026-10-16T09:00:00Z', now), false);
  assert.equal(insideWindow('2026-10-16T10:02:00Z', now), false);  // inside by 2 min, but inside safety margin
  assert.equal(insideWindow(null, now), false);
});

test('split long messages on boundaries, nothing lost', () => {
  const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about fitness.`).join(' ');
  const parts = splitMessage(long, 300);
  assert.ok(parts.length > 1 && parts.every((p) => p.length <= 300));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), long.replace(/\s+/g, ' '));
  assert.deepEqual(splitMessage('short'), ['short']);
});

test('phone normalisation (India default)', () => {
  assert.equal(toWaNumber('98765 43210'), '919876543210');
  assert.equal(toWaNumber('+91 98765-43210'), '919876543210');
  assert.equal(toWaNumber('09876543210'), '919876543210');
  assert.equal(toWaNumber('919876543210'), '919876543210');
  assert.equal(toWaNumber('12345'), null);
  assert.equal(toWaNumber(''), null);
  assert.equal(toWaNumber(null), null);
});

test('follow-up buckets cover every day without gaps, each once', () => {
  const expect = { 7: 'renew_7', 4: 'renew_7', 3: 'renew_3', 1: 'renew_3', 0: 'renew_0', '-1': 'lapsed_1', '-6': 'lapsed_1', '-7': 'lapsed_7', '-29': 'lapsed_7', '-30': 'lapsed_30', '-89': 'lapsed_30', '-90': 'lapsed_90', '-180': 'lapsed_90' };
  for (const [d, k] of Object.entries(expect)) assert.equal(followKind(Number(d)), k, d);
  assert.equal(followKind(8), null);
  assert.equal(followKind(-181), null);
  assert.equal(followKind(NaN), null);
  for (let d = -180; d <= 7; d++) assert.ok(followKind(d), `gap at ${d}`);
  assert.equal(followPhrase('renew_3', 3), 'ends in 3 days');
  assert.equal(followPhrase('renew_3', 1), 'ends in 1 day');
  assert.equal(followPhrase('renew_0', 0), 'ends today');
  assert.equal(followPhrase('lapsed_7', -9), 'ended 9 days ago');
});

test('parse AI JSON: clean, fenced, plain text, garbage, bad enums', () => {
  const ok = parseAgentJson('```json\n{"reply":"Hi!","lang":"bn","stage":"hot","interest":["pt"],"action":{"type":"book","kind":"trial","when":"kal 6pm","details":"Rahul"},"summary":"wants PT"}\n```', 'en');
  assert.equal(ok.reply, 'Hi!'); assert.equal(ok.stage, 'hot'); assert.equal(ok.action.kind, 'trial'); assert.deepEqual(ok.interests, ['pt']);
  const bad = parseAgentJson('{"reply":"Hello","lang":"fr","stage":"weird","action":{"type":"rm -rf"}}', 'bn-roman');
  assert.equal(bad.lang, 'bn-roman'); assert.equal(bad.stage, 'interested'); assert.equal(bad.action, null);
  assert.equal(parseAgentJson('Sure, our fee is Rs 1500.', 'en').reply, 'Sure, our fee is Rs 1500.');
  assert.equal(parseAgentJson('{"reply":""}', 'en'), null);
  assert.equal(parseAgentJson('', 'en'), null);
  assert.equal(parseAgentJson('{broken json', 'en'), null);
});

test('system prompt: facts included, unknowns flagged, identity guard for social channels', () => {
  const base = { nowIst: 'Saturday', lang: 'bn-roman', appUrl: 'https://x.test', packages: [{ name: 'Monthly', duration_months: 1, price: 1500, description: '' }], products: [{ item_name: 'Whey 1kg', category: 'Supplement', unit_price: 2500, quantity: 0 }], knowledge: [{ title: 'PT', content: '' }, { title: 'Timings', content: '5am-10pm' }], member: null, summary: '', stage: 'new' };
  const wa = buildSystemPrompt({ ...base, channel: 'whatsapp' });
  assert.match(wa, /Monthly: 1 month\(s\), Rs 1500/);
  assert.match(wa, /Whey 1kg \(Supplement\): Rs 2500 - currently OUT OF STOCK/);
  assert.match(wa, /5am-10pm/);
  assert.doesNotMatch(wa, /## PT/);
  assert.match(wa, /Banglish/);
  assert.match(wa, /not matched to any member/);
  const fb = buildSystemPrompt({ ...base, channel: 'facebook', member: null });
  assert.match(fb, /NOT verified/);
  const mem = buildSystemPrompt({ ...base, channel: 'whatsapp', member: { name: 'Rahul', package: 'Monthly', expiry_date: '2026-10-20', days_left: 3, goal: 'fat loss' } });
  assert.match(mem, /VERIFIED EXISTING MEMBER[^\n]*Rahul[^\n]*3 days left/);
});
