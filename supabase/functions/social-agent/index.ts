// Bhajrang Fitness - social sales agent webhook (WhatsApp + Facebook Messenger + Instagram DMs).
// Deploy with:  supabase functions deploy social-agent --no-verify-jwt
// (Meta cannot send a Supabase JWT; every request is authenticated by Meta's HMAC signature instead.)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  buildSystemPrompt, detectLang, digits, humanTopic, isOptIn, isOptOut, parseAgentJson,
  parseWebhook, safeFallback, verifySignature, violatesSafety,
  type AgentReply, type Inbound, type Lang,
} from '../_shared/social.ts';
import { callAI, sendText, sendTemplate, type Turn } from '../_shared/meta.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const env = (k: string) => Deno.env.get(k) ?? '';
const MAX_IN_PER_HOUR = 30;       // per customer - stops spam / loops
const MAX_OUT_PER_HOUR = 400;     // whole gym - protects your free AI quota
const HISTORY = 14;

function istNow(): string {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });
}
function daysLeftFrom(expiry: string | null | undefined): number | null {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return null;
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = expiry.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86400000);
}

async function notifyOwner(text: string): Promise<void> {
  const owner = digits(env('OWNER_WHATSAPP'));
  if (!owner) return;
  const msg = text.slice(0, 900);
  const r = await sendText('whatsapp', owner, msg);       // works while the owner has messaged the number in the last 24h
  if (!r.ok && env('OWNER_ALERT_TEMPLATE')) await sendTemplate(owner, env('OWNER_ALERT_TEMPLATE'), env('OWNER_ALERT_TEMPLATE_LANG') || 'en', [msg]);
}

async function handle(sb: SupabaseClient, m: Inbound): Promise<void> {
  // 1) ignore duplicate deliveries (Meta retries webhooks)
  const { data: dup } = await sb.from('sa_messages').select('id').eq('provider_mid', m.mid).maybeSingle();
  if (dup) return;

  // 2) conversation row
  let { data: conv } = await sb.from('sa_conversations').select('*').eq('channel', m.channel).eq('external_id', m.externalId).maybeSingle();
  const lang: Lang = detectLang(m.text, (conv?.lang as Lang) ?? 'en');
  if (!conv) {
    const ins = await sb.from('sa_conversations').insert({ channel: m.channel, external_id: m.externalId, display_name: m.name ?? null, lang }).select('*').single();
    if (ins.error || !ins.data) { console.error('conv insert', ins.error?.message); return; }
    conv = ins.data;
  }
  const now = new Date().toISOString();

  // 3) store the inbound message (also claims the provider_mid)
  const stored = await sb.from('sa_messages').insert({ conversation_id: conv.id, direction: 'in', body: m.text.slice(0, 4000), provider_mid: m.mid });
  if (stored.error) return;                                           // unique violation = duplicate
  await sb.from('sa_conversations').update({ last_inbound_at: now, lang, ...(m.name && !conv.display_name ? { display_name: m.name } : {}) }).eq('id', conv.id);

  // 4) STOP / START handling (marketing consent)
  if (isOptOut(m.text)) {
    await sb.from('sa_conversations').update({ opted_out: true }).eq('id', conv.id);
    const txt = lang === 'bn' ? 'ঠিক আছে, আমরা আর প্রচারমূলক মেসেজ পাঠাব না। দরকার হলে যেকোনো সময় লিখবেন। 🙏'
      : lang === 'bn-roman' ? 'Thik ache, amra ar promotional message pathabo na. Proyojon hole ja-kono somoy likhben. 🙏'
      : "Done - we won't send you promotional messages. You can message us anytime. 🙏";
    await reply(sb, conv.id, m, txt);
    return;
  }
  if (isOptIn(m.text) && conv.opted_out) {
    await sb.from('sa_conversations').update({ opted_out: false }).eq('id', conv.id);
    await reply(sb, conv.id, m, 'Welcome back! 🙏 How can we help you today?');
    return;
  }

  // 5) owner has taken over this chat -> stay silent, but flag it
  if (conv.human_takeover) {
    await sb.from('sa_conversations').update({ needs_attention: true, attention_reason: 'Customer wrote while you are handling this chat' }).eq('id', conv.id);
    return;
  }

  // 6) rate limits
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const [{ count: inCount }, { count: outCount }] = await Promise.all([
    sb.from('sa_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conv.id).eq('direction', 'in').gte('created_at', hourAgo),
    sb.from('sa_messages').select('id', { count: 'exact', head: true }).eq('direction', 'out').gte('created_at', hourAgo),
  ]);
  if ((inCount ?? 0) > MAX_IN_PER_HOUR || (outCount ?? 0) > MAX_OUT_PER_HOUR) return;

  // 7) topics that must never be answered by the AI (medical, doses, banned substances) -> fixed safe reply + owner
  const topic = humanTopic(m.text);
  if (topic && ['health or medical question', 'banned-substance question', 'dose question'].includes(topic)) {
    await escalate(sb, conv, m, topic, safeFallback(lang), lang);
    return;
  }

  // 8) gather context
  const phone = m.channel === 'whatsapp' ? m.externalId : '';
  const [pk, inv, kn, hist, mem] = await Promise.all([
    sb.from('packages').select('name,duration_months,price,description').order('duration_months'),
    sb.from('inventory').select('item_name,category,unit_price,quantity').order('category'),
    sb.from('sa_knowledge').select('key,title,content'),
    sb.from('sa_messages').select('direction,body').eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(HISTORY),
    phone ? sb.rpc('sa_find_member', { p_phone: phone }) : Promise.resolve({ data: null }),
  ]);
  const memberRow = Array.isArray(mem.data) ? mem.data[0] : null;
  if (memberRow && conv.member_id !== memberRow.member_id) await sb.from('sa_conversations').update({ member_id: memberRow.member_id }).eq('id', conv.id);
  const { data: lastFollow } = memberRow
    ? await sb.from('sa_followups').select('message').eq('member_id', memberRow.member_id).in('status', ['SENT', 'DRAFT']).order('created_at', { ascending: false }).limit(1).maybeSingle()
    : { data: null };

  const system = buildSystemPrompt({
    nowIst: istNow(), channel: m.channel, lang, appUrl: env('APP_URL') || 'https://bhajrang-fitness-srb.onrender.com',
    packages: (pk.data ?? []) as never, products: (inv.data ?? []) as never,
    knowledge: ((kn.data ?? []) as Array<{ key: string; title: string; content: string }>).filter((k) => !['default_language', 'auto_send_followups'].includes(k.key)),
    member: memberRow ? { name: memberRow.name, package: memberRow.package, expiry_date: memberRow.expiry_date, days_left: daysLeftFrom(memberRow.expiry_date), goal: memberRow.goal ?? '' } : null,
    summary: conv.summary ?? '', stage: conv.stage ?? 'new', lastFollowup: lastFollow?.message ?? null,
  });
  const turns: Turn[] = ((hist.data ?? []) as Array<{ direction: string; body: string }>).reverse()
    .map((h) => ({ role: h.direction === 'in' ? 'user' : 'assistant', text: h.body }));

  // 9) think
  const ai = await callAI(system, turns, true);
  let out: AgentReply | null = ai.text ? parseAgentJson(ai.text, lang) : null;
  if (!out) {
    console.error('AI failed', ai.errors.join(' | '));
    await escalate(sb, conv, m, 'AI unavailable', lang === 'bn' ? 'ধন্যবাদ! আমাদের টিম খুব শীঘ্রই আপনাকে উত্তর দেবে। 🙏' : lang === 'bn-roman' ? 'Dhonnobad! Amader team khub shighroi apnake reply debe. 🙏' : 'Thanks for messaging Bhajrang Fitness! Our team will reply to you very shortly. 🙏', lang);
    return;
  }

  // 10) final safety check on what we are about to send
  const bad = violatesSafety(out.reply);
  if (bad) {
    await escalate(sb, conv, m, `AI reply blocked (${bad})`, safeFallback(lang), lang);
    return;
  }

  // 11) send + remember
  const sent = await reply(sb, conv.id, m, out.reply);
  const interests = Array.from(new Set([...(conv.interests ?? []), ...out.interests])).slice(0, 8);
  await sb.from('sa_conversations').update({ stage: out.stage, interests, summary: out.summary || conv.summary, lang: out.lang }).eq('id', conv.id);
  if (!sent) return;

  // 12) actions: booking or owner hand-off
  const name = conv.display_name || m.name || '';
  const contact = m.channel === 'whatsapp' ? `+${m.externalId}` : `${m.channel} id ${m.externalId}`;
  if (out.action?.type === 'book') {
    await sb.from('sa_bookings').insert({ conversation_id: conv.id, kind: out.action.kind ?? 'other', customer_name: name || null, contact, channel: m.channel, preferred_time: out.action.when ?? '', details: out.action.details ?? '' });
    await sb.from('sa_conversations').update({ stage: 'booked' }).eq('id', conv.id);
    await notifyOwner(`NEW BOOKING (${out.action.kind})\n${name || 'Customer'} - ${contact}\nWhen: ${out.action.when || 'not given'}\n${out.action.details || ''}`);
  } else if (out.action?.type === 'handoff' || topic) {
    const reason = out.action?.reason || topic || 'needs owner';
    await sb.from('sa_conversations').update({ needs_attention: true, attention_reason: reason }).eq('id', conv.id);
    await notifyOwner(`PLEASE REPLY: ${name || 'Customer'} (${contact})\nReason: ${reason}\nThey said: "${m.text.slice(0, 200)}"`);
  } else if (out.stage === 'hot' && conv.stage !== 'hot') {
    await notifyOwner(`HOT LEAD: ${name || 'Customer'} (${contact}) - ${out.summary}`);
  }
}

/** Send a text, store it, return whether it went out. */
async function reply(sb: SupabaseClient, convId: string, m: Inbound, text: string): Promise<boolean> {
  const r = await sendText(m.channel, m.externalId, text);
  if (!r.ok) { console.error('send failed', m.channel, r.error); return false; }
  await sb.from('sa_messages').insert({ conversation_id: convId, direction: 'out', body: text });
  await sb.from('sa_conversations').update({ last_outbound_at: new Date().toISOString() }).eq('id', convId);
  return true;
}

async function escalate(sb: SupabaseClient, conv: { id: string; display_name?: string | null }, m: Inbound, reason: string, text: string, _lang: Lang): Promise<void> {
  await reply(sb, conv.id, m, text);
  await sb.from('sa_conversations').update({ needs_attention: true, attention_reason: reason }).eq('id', conv.id);
  const contact = m.channel === 'whatsapp' ? `+${m.externalId}` : `${m.channel} id ${m.externalId}`;
  await notifyOwner(`PLEASE REPLY: ${conv.display_name || m.name || 'Customer'} (${contact})\nReason: ${reason}\nThey said: "${m.text.slice(0, 200)}"`);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // Meta webhook verification handshake
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && env('META_VERIFY_TOKEN') && url.searchParams.get('hub.verify_token') === env('META_VERIFY_TOKEN');
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const raw = await req.text();
  const secret = env('META_APP_SECRET');
  if (!secret) return new Response('server not configured', { status: 500 });
  if (!(await verifySignature(raw, req.headers.get('x-hub-signature-256'), secret))) return new Response('bad signature', { status: 401 });

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  const messages = parseWebhook(body);
  if (!messages.length) return new Response('ok', { status: 200 });   // delivery receipts, reads, etc.

  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const work = (async () => {
    for (const m of messages) {
      try { await handle(sb, m); } catch (e) { console.error('handle error', String(e)); }
    }
  })();
  // Answer Meta immediately (it retries slow webhooks) and finish the AI work in the background.
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work); else await work;
  return new Response('ok', { status: 200 });
});
