// send-email — sends email through Resend. Admin passcode required.
// Secrets: RESEND_API_KEY, RESEND_FROM_EMAIL (e.g. "My Gym <hello@yourdomain.com>")
// Reports "not configured" until RESEND_API_KEY is set.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// The caller must send the staff/owner passcode in body.passcode (checked in the database).
async function isAdmin(passcode: unknown): Promise<boolean> {
  if (typeof passcode !== "string" || !passcode.trim()) return false;
  const url = Deno.env.get("SUPABASE_URL"); const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return false;
  const r = await fetch(`${url}/rest/v1/rpc/verify_admin_access`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_passcode: passcode }),
  });
  if (!r.ok) return false;
  const v = await r.json().catch(() => null);
  return v !== null && v !== false && v !== undefined;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { to, toName, subject, text, passcode } = await req.json();
    if (!(await isAdmin(passcode))) return json({ ok: false, reason: "Unauthorized: admin passcode required." }, 401);

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "Gym <onboarding@resend.dev>";
    if (!apiKey) return json({ configured: false, reason: "RESEND_API_KEY not set" });
    if (!to || !subject || !text) return json({ ok: false, reason: "Missing to/subject/text" }, 400);

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [toName ? `${toName} <${to}>` : to], subject, text }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return json({ ok: false, reason: errText.slice(0, 300) });
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, reason: String(e) });
  }
});
