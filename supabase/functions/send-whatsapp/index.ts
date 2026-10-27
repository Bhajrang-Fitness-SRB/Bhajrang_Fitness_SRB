// send-whatsapp — sends an approved WhatsApp template (renewal / birthday / due / test) through Meta's Cloud API.
// Admin passcode required. Secrets: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
// Optional: WHATSAPP_TEMPLATE_RENEWAL / _BIRTHDAY / _DUE, WHATSAPP_TEMPLATE_LANG, DEFAULT_COUNTRY_CODE (default 91)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Admin gate: the caller must send the staff/owner passcode in body.passcode (checked in the database).
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

// Local 10-digit numbers need the country code; WhatsApp wants digits only (E.164 without "+").
const CC = (Deno.env.get('DEFAULT_COUNTRY_CODE') || '91').replace(/\D/g, '');
function toWhatsAppNumber(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `${CC}${digits}`;
  if (digits.length === CC.length + 10 && digits.startsWith(CC)) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return `${CC}${digits.slice(1)}`;
  return digits;
}

async function sendTemplate(token: string, phoneNumberId: string, to: string, templateName: string, lang: string, params: string[]) {
  const resp = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: lang },
        components: params.length ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p) })) }] : [],
      },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

const TEMPLATE_BY_KIND: Record<string, string> = {
  renewal: Deno.env.get('WHATSAPP_TEMPLATE_RENEWAL') || 'membership_renewal',
  birthday: Deno.env.get('WHATSAPP_TEMPLATE_BIRTHDAY') || 'birthday_wish',
  due: Deno.env.get('WHATSAPP_TEMPLATE_DUE') || 'payment_due',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    if (!(await isAdmin(body.passcode))) return json({ ok: false, error: 'Unauthorized: admin passcode required.' }, 401);

    const token = Deno.env.get('WHATSAPP_TOKEN');
    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
    const templateLang = Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'en_US';
    if (!token || !phoneNumberId) {
      return json({ configured: false, reason: 'WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set yet.' });
    }

    const to = toWhatsAppNumber(body.to);
    if (!to) return json({ configured: true, ok: false, error: 'Missing or invalid phone number.' });

    const kind = body.kind as string;
    const params: string[] = Array.isArray(body.params) ? body.params : [];

    let result;
    if (kind === 'test') {
      result = await sendTemplate(token, phoneNumberId, to, 'hello_world', 'en_US', []);
    } else if (TEMPLATE_BY_KIND[kind]) {
      result = await sendTemplate(token, phoneNumberId, to, TEMPLATE_BY_KIND[kind], templateLang, params);
    } else {
      return json({ configured: true, ok: false, error: `Unknown kind "${kind}". Use "renewal", "birthday", "due", or "test".` });
    }
    return json({ configured: true, ok: result.ok, status: result.status, data: result.data });
  } catch (err) {
    return json({ configured: true, ok: false, error: String(err) });
  }
});
