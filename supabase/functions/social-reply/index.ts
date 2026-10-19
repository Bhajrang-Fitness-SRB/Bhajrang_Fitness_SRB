// Owner Inbox "Reply" button: sends a message YOU typed to a customer on their channel.
// Deploy with:  supabase functions deploy social-reply --no-verify-jwt
// Auth: the owner passcode (checked with verify_admin_access, owner role only), like the app's other owner functions.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { insideWindow } from '../_shared/social.ts';
import { sendText } from '../_shared/meta.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let b: { passcode?: string; conversation_id?: string; text?: string; keep_ai_on?: boolean };
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const text = (b.text ?? '').trim();
  if (!b.passcode || !b.conversation_id || !text) return json({ error: 'Missing passcode, conversation or text.' }, 400);
  if (text.length > 3000) return json({ error: 'Message too long (max 3000 characters).' }, 400);

  // owner check (anon client calling the same RPC the app uses)
  const anon = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
  const { data: who } = await anon.rpc('verify_admin_access', { p_passcode: b.passcode });
  if (!who || (who as { role?: string }).role !== 'owner') return json({ error: 'Only the owner can reply from here.' }, 401);

  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: conv } = await sb.from('sa_conversations').select('id,channel,external_id,last_inbound_at,opted_out').eq('id', b.conversation_id).maybeSingle();
  if (!conv) return json({ error: 'Conversation not found.' }, 404);

  // Meta only allows free-form messages within 24h of the customer's last message.
  if (!insideWindow(conv.last_inbound_at)) {
    return json({ ok: false, reason: 'window_closed', message: 'More than 24 hours since the customer last wrote, so WhatsApp/Facebook/Instagram will not allow a free-form message. Wait for them to message you, or use an approved WhatsApp template.' });
  }

  const sent = await sendText(conv.channel, conv.external_id, text);
  if (!sent.ok) return json({ ok: false, reason: 'send_failed', message: 'Meta refused the message.', detail: (sent.error ?? '').slice(0, 300) });

  await sb.from('sa_messages').insert({ conversation_id: conv.id, direction: 'out', body: text, by_human: true });
  // You are now handling this chat: pause the AI (unless you asked to keep it on) and clear the "needs you" flag.
  await sb.from('sa_conversations').update({
    last_outbound_at: new Date().toISOString(), needs_attention: false, attention_reason: null,
    ...(b.keep_ai_on ? {} : { human_takeover: true }),
  }).eq('id', conv.id);
  return json({ ok: true });
});
