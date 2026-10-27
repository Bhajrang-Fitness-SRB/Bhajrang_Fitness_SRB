// notify-telegram — sends an alert to the owner's Telegram chat. Admin passcode required.
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function isAdmin(passcode: unknown): Promise<boolean> {
  if (typeof passcode !== 'string' || !passcode.trim()) return false;
  const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) return false;
  const r = await fetch(`${url}/rest/v1/rpc/verify_admin_access`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_passcode: passcode }),
  });
  if (!r.ok) return false;
  const v = await r.json().catch(() => null);
  return v !== null && v !== false && v !== undefined;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { message, passcode } = await req.json();
    if (!(await isAdmin(passcode))) return json({ ok: false, error: 'Unauthorized: admin passcode required.' }, 401);

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
    if (!token || !chatId) return json({ configured: false, reason: 'Telegram bot token/chat id not set yet.' });
    if (!message) return json({ error: 'Missing message' }, 400);

    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: String(message).slice(0, 3500) }),
    });
    const result = await resp.json().catch(() => ({}));
    return json({ configured: true, ok: resp.ok, result });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
