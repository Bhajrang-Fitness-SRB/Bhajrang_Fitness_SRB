// Daily renewal / win-back job. Called by pg_cron (see setup/cron.sql) with header x-agent-secret.
// Deploy with:  supabase functions deploy social-followups --no-verify-jwt
//
// For every member whose plan ends within 7 days or ended within the last 180 days it prepares ONE
// short, personal message per stage (7 days before, 3 days before, expiry day, 1 / 7 / 30 / 90 days after),
// each at most once per membership cycle. It mentions PT as the way to reach goals faster.
//
// Default behaviour is SAFE: messages are saved as DRAFTS (with a one-tap wa.me link) for you to send.
// Set knowledge key auto_send_followups = yes AND configure an approved template to send automatically.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildFollowupPrompt, followKind, followPhrase, insideWindow, toWaNumber, violatesSafety, type Lang } from '../_shared/social.ts';
import { callAI, sendTemplate, sendText } from '../_shared/meta.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const MAX_PER_RUN = 25;

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

// What the customer actually sees when the approved template is used (keep in sync with the template you submit to Meta).
const templatePreview = (name: string, phrase: string) =>
  `Hi ${name}, your Bhajrang Fitness membership ${phrase}. Reply here to renew, or to know about Personal Training and current offers. - Team Bhajrang`;

function plainFallback(name: string, phrase: string, lang: Lang): string {
  if (lang === 'bn') return `নমস্কার ${name}! আপনার Bhajrang Fitness মেম্বারশিপ ${phrase}। রিনিউ করতে বা পার্সোনাল ট্রেনিং (PT) সম্পর্কে জানতে রিপ্লাই দিন। 🙏`;
  if (lang === 'bn-roman') return `Namaskar ${name}! Apnar Bhajrang Fitness membership ${phrase}. Renew korte ba Personal Training (PT) somporke jante reply din. 🙏`;
  return `Hi ${name}! Your Bhajrang Fitness membership ${phrase}. Reply here to renew, or to hear how Personal Training (PT) can get you to your goal faster. 🙏`;
}

Deno.serve(async (req: Request) => {
  const secret = env('SOCIAL_CRON_SECRET');
  if (!secret || req.headers.get('x-agent-secret') !== secret) return json({ error: 'unauthorized' }, 401);
  let body: { dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: kn } = await sb.from('sa_knowledge').select('key,content');
  const K = Object.fromEntries((kn ?? []).map((r: { key: string; content: string }) => [r.key, r.content]));
  const defaultLang = (['en', 'bn', 'bn-roman'].includes(K.default_language) ? K.default_language : 'en') as Lang;
  const autoSend = String(K.auto_send_followups ?? 'no').trim().toLowerCase() === 'yes';
  const template = env('WA_RENEWAL_TEMPLATE');

  const { data: cands, error } = await sb.rpc('sa_followup_candidates', { p_days_ahead: 7, p_days_back: 180 });
  if (error) return json({ error: error.message }, 500);

  const members = (cands ?? []) as Array<{ member_id: string; name: string; phone: string; whatsapp: string; package: string; expiry_date: string; goal: string; days_left: number }>;
  const { data: done } = await sb.from('sa_followups').select('member_id,kind,expiry_date').in('member_id', members.map((m) => m.member_id));
  const seen = new Set((done ?? []).map((d: { member_id: string; kind: string; expiry_date: string }) => `${d.member_id}|${d.kind}|${d.expiry_date}`));

  const stats = { candidates: members.length, drafted: 0, sent: 0, skipped: 0, failed: 0, remaining: 0 };
  let processed = 0;

  // Oldest-urgency first: people about to expire before long-lapsed ones.
  members.sort((a, b) => Math.abs(a.days_left) - Math.abs(b.days_left));

  for (const m of members) {
    const kind = followKind(m.days_left);
    if (!kind || seen.has(`${m.member_id}|${kind}|${m.expiry_date}`)) continue;
    if (processed >= MAX_PER_RUN) { stats.remaining++; continue; }
    processed++;

    const to = toWaNumber(m.whatsapp || m.phone);
    if (!to) { stats.skipped++; continue; }
    const first = (m.name || '').trim().split(/\s+/)[0] || 'there';
    const phrase = followPhrase(kind, m.days_left);

    const { data: conv } = await sb.from('sa_conversations').select('id,lang,opted_out,last_inbound_at').eq('channel', 'whatsapp').eq('external_id', to).maybeSingle();
    const row = { member_id: m.member_id, kind, expiry_date: m.expiry_date, phone: to };

    if (conv?.opted_out) {
      if (!body.dry_run) await sb.from('sa_followups').insert({ ...row, message: '', status: 'SKIPPED', error: 'customer opted out' });
      stats.skipped++; continue;
    }
    const lang = ((conv?.lang as Lang) ?? defaultLang) as Lang;

    // 1) write the personal message
    let text = plainFallback(first, phrase, lang);
    const ai = await callAI(
      'You write short, warm, honest WhatsApp messages for a gym. Output only the message text.',
      [{ role: 'user', text: buildFollowupPrompt({ name: first, kind, daysLeft: m.days_left, pkg: m.package, goal: m.goal, lang, gymName: 'Bhajrang Fitness', offers: K.offers ?? '', ptInfo: K.pt_info ?? '', appUrl: env('APP_URL') || '' }) }],
      false,
    );
    if (ai.text && !violatesSafety(ai.text) && ai.text.trim().length > 10) text = ai.text.trim().replace(/^["']|["']$/g, '').slice(0, 700);

    const wa_link = `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
    if (body.dry_run) { stats.drafted++; continue; }

    // 2) deliver or draft
    let status: 'SENT' | 'DRAFT' | 'FAILED' = 'DRAFT';
    let err: string | null = null;
    let stored = text;
    if (autoSend) {
      if (conv && insideWindow(conv.last_inbound_at)) {
        const r = await sendText('whatsapp', to, text);
        status = r.ok ? 'SENT' : 'FAILED'; err = r.error ?? null;
      } else if (template) {
        const r = await sendTemplate(to, template, env('WA_TEMPLATE_LANG') || 'en', [first, phrase]);
        status = r.ok ? 'SENT' : 'FAILED'; err = r.error ?? null; stored = templatePreview(first, phrase);
      }
    }

    await sb.from('sa_followups').insert({ ...row, message: stored, wa_link, status, error: err });
    if (status === 'SENT') {
      stats.sent++;
      let convId = conv?.id as string | undefined;
      if (!convId) {
        const ins = await sb.from('sa_conversations').insert({ channel: 'whatsapp', external_id: to, display_name: m.name, lang, member_id: m.member_id, stage: 'customer' }).select('id').single();
        convId = ins.data?.id;
      }
      if (convId) {
        await sb.from('sa_messages').insert({ conversation_id: convId, direction: 'out', body: stored });
        await sb.from('sa_conversations').update({ last_outbound_at: new Date().toISOString() }).eq('id', convId);
      }
    } else if (status === 'FAILED') stats.failed++; else stats.drafted++;
  }
  return json({ ok: true, auto_send: autoSend, template_configured: !!template, ...stats });
});
