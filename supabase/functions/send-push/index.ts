// send-push — sends a push notification through OneSignal to one member (external_id) or all subscribers.
// Admin passcode required. Secrets: ONESIGNAL_API_KEY, ONESIGNAL_APP_ID

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
    const { member_id, title, message, url, passcode } = await req.json();
    if (!(await isAdmin(passcode))) return json({ ok: false, reason: "Unauthorized: admin passcode required." }, 401);

    const apiKey = Deno.env.get("ONESIGNAL_API_KEY");
    const appId = Deno.env.get("ONESIGNAL_APP_ID");
    if (!apiKey || !appId) {
      return json({ configured: false, reason: "ONESIGNAL_API_KEY or ONESIGNAL_APP_ID not set yet." });
    }
    if (!title || !message) return json({ ok: false, reason: "Missing title/message" }, 400);

    const payload: Record<string, unknown> = { app_id: appId, headings: { en: title }, contents: { en: message } };
    if (url) payload.url = url;
    if (member_id) {
      payload.include_aliases = { external_id: [String(member_id)] };
      payload.target_channel = "push";
    } else {
      payload.included_segments = ["Subscribed Users"];
    }

    const resp = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    return json({ configured: true, ok: resp.ok, data });
  } catch (e) {
    return json({ configured: true, ok: false, reason: String(e) });
  }
});
