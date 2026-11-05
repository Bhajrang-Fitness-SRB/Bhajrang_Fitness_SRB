# Setup Everything — every key, address and place (step by step)

Read this top to bottom. Do **Part 1 first** (nothing works without it). Everything else is optional: do a part only when you want that feature.
Golden rules: (1) never paste a key in chat, GitHub or the browser address bar; (2) a key goes in ONE of 5 places, listed in Part 0; (3) after you add a Supabase secret, the function must be **deployed again** to see it.

---
## Part 0 — The 5 places keys live (this is where people get lost)

| # | Place | Who reads it | How to open it |
|---|---|---|---|
| A | **Render → your website → Environment** | The website while it is built | render.com → click your site (`rbf-gym-vault`) → **Environment** |
| B | **Supabase → Edge Functions → Secrets** | WhatsApp, email, push, Telegram, AI, Astro, social | supabase.com → project **Bhajrang_Fitness_SRB** → **Edge Functions** → **Secrets** |
| C | **Inside the app (Owner → AI Agent Hub → Connections / Providers)** | GitHub helper, Meta page token, AI providers, Claude key | Log in at `/villain` → **AI Agent Hub** |
| D | **GitHub → repo → Settings → Secrets and variables → Actions** | Nightly backup only | github.com → repo → **Settings** |
| E | **Render → astro-engine service → Environment** | The Astro engine | render.com → **bhajrang-astro-engine** → **Environment** |

Your addresses (write them once, use everywhere):
- Website: your Render address (example `https://bhajrang-fitness-srb.onrender.com`)
- Supabase project URL: `https://qcabkhhbcdjyefbwzexj.supabase.co`
- Function addresses: `https://qcabkhhbcdjyefbwzexj.supabase.co/functions/v1/<function-name>`
- Astro engine: `https://bhajrang-astro-engine.onrender.com` (health page: add `/health`)

---
## Part 1 — MUST DO (website + database). 10 minutes.

**1.1 Get the two Supabase values**
1. supabase.com → open the project → **Project Settings** (gear) → **API** (or **API Keys**).
2. Copy **Project URL** and the **anon / publishable** key. (Never copy the *service_role* / *secret* key into the website.)

**1.2 Put them on Render (place A)**
1. render.com → your website → **Environment** → **Add Environment Variable**.
2. `VITE_SUPABASE_URL` = the Project URL. `VITE_SUPABASE_ANON_KEY` = the anon key.
3. Optional now: `VITE_GYM_NAME` = Bhajrang Fitness.
4. **Save** → open **Manual Deploy** → **Deploy latest commit**. Wait for "Live".
5. Open the site. If you see "Almost ready", a value is missing or has a space.

**1.3 Change the default passcodes (security)**
1. `/villain` → log in → Settings → change the **Owner passcode**. Do the same for the Store owner at `/selling`.
2. Never reuse `925529`.

**1.4 Supabase safety settings**
1. Supabase → **Authentication → Settings**: nothing needed (the app uses its own passcodes).
2. Supabase → **Project Settings → Billing**: free projects **pause after 7 days of no use**. If your gym uses the app daily this will not happen. Upgrade to Pro for daily backups.

---
## Part 2 — Deploy the functions (needed for messages and AI)

Edge functions are small programs in Supabase. These are live today: send-whatsapp, send-email, send-push, notify-telegram, ai-coach, nightly-agent, money-agent. **NOT live yet: agent-hub, social-agent, social-reply, social-followups.**

On your Windows PC:
1. Install Node.js (nodejs.org, LTS). Open **Command Prompt**.
2. `npm install -g supabase` (if that fails, use `npx supabase` before every command below).
3. `supabase login` (browser opens → allow).
4. Go to your repo folder: `cd C:\path\to\Bhajrang_Fitness_SRB`
5. `supabase link --project-ref qcabkhhbcdjyefbwzexj`
6. Deploy: `supabase functions deploy send-whatsapp send-email send-push notify-telegram ai-coach money-agent nightly-agent agent-hub`
   (add `social-agent social-reply social-followups` later, Part 8).
7. In the Supabase dashboard → **Edge Functions**, each should show **Active**.

> Important: do NOT create a secret named `AUTH_GRACE`. It switches off the passcode check.

---
## Part 3 — WhatsApp reminders (renewal / birthday / due)  🔑 Meta

Two different names exist, set BOTH to the same token (this is the most common mistake):
- `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` → used by **send-whatsapp** (reminder buttons).
- `WA_ACCESS_TOKEN` and `WA_PHONE_NUMBER_ID` → used by the **AI agents / social inbox**.

Steps:
1. developers.facebook.com → **My Apps → Create App → Business** → add the **WhatsApp** product.
2. WhatsApp → **API Setup**: copy the **Phone number ID**.
3. The temporary token on that page **dies in 24 hours**. Make a permanent one: business.facebook.com → **Business Settings → Users → System users → Add** (Admin) → **Add assets** (your WhatsApp account, Full control) → **Generate token** → tick `whatsapp_business_messaging` and `whatsapp_business_management` → copy it.
4. WhatsApp → **Message templates**: create and get approved (takes minutes to hours): `membership_renewal`, `birthday_wish`, `payment_due`. Each body uses `{{1}}`, `{{2}}` in the order the reminder screen sends (name first). Language: English (`en_US`) unless you change `WHATSAPP_TEMPLATE_LANG`.
5. Supabase → Edge Functions → **Secrets** → add:
   `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`.
   Optional: `WHATSAPP_TEMPLATE_RENEWAL`, `WHATSAPP_TEMPLATE_BIRTHDAY`, `WHATSAPP_TEMPLATE_DUE`, `WHATSAPP_TEMPLATE_LANG`, `DEFAULT_COUNTRY_CODE` (91).
6. Re-deploy: `supabase functions deploy send-whatsapp`.
7. Test: Due & Birthday Reminders → send one message to your own number.
Note: you can only start a conversation with an approved *template*. Business verification may be asked by Meta for higher limits.

---
## Part 4 — Email  🔑 Resend
1. resend.com → sign up → **Domains → Add Domain** → add the DNS records at your domain provider → wait for **Verified**.
2. **API Keys → Create API Key** (Sending access) → copy.
3. Supabase secrets: `RESEND_API_KEY` = key, `RESEND_FROM_EMAIL` = `Bhajrang Fitness <hello@yourdomain.com>`.
4. Re-deploy `send-email`. Test from Due & Birthday Reminders.
(Without a verified domain Resend only sends to your own email.)

---
## Part 5 — Push notifications  🔑 OneSignal
1. onesignal.com → **New App** → platform **Web** → site URL = your website address → **Save**.
2. **Settings → Keys & IDs**: copy **App ID** and **REST API Key**.
3. Supabase secrets: `ONESIGNAL_APP_ID`, `ONESIGNAL_API_KEY`.
4. Render (place A): `VITE_ONESIGNAL_APP_ID` = App ID → redeploy the site.
5. Re-deploy `send-push`. Members must tap **Allow** on their phone.

---
## Part 6 — Telegram owner alerts  🔑 Telegram
1. Telegram → search **@BotFather** → `/newbot` → name it → copy the **token**.
2. Open your new bot and press **Start**, send "hi".
3. In a browser open `https://api.telegram.org/bot<TOKEN>/getUpdates` (replace `<TOKEN>`; remove the brackets). Find `"chat":{"id": 123456789` → that number is the chat id.
4. Supabase secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Re-deploy `notify-telegram`.

---
## Part 7 — AI (coach, Omni AI Hub, Agent Hub, night & money agents)  🔑 free keys
1. **Groq** (fast, free): console.groq.com → **API Keys → Create** → copy.  Secret name `GROQ_API_KEY`.
2. **Gemini** (free): aistudio.google.com/apikey → **Create API key**.  Secret name `GEMINI_API_KEY`.
3. Add both in Supabase Secrets (place B). Re-deploy `ai-coach agent-hub money-agent nightly-agent`.
4. **Claude (optional, paid)** for the Night and Money agents: console.anthropic.com → **API Keys**; add credit. Save it in the app: Owner → **AI Night Agent** → paste key (stored in the database vault). Or set secret `ANTHROPIC_API_KEY`.
5. **AI Agent Hub → Providers** (place C): you can also paste provider keys here instead (stored safely in the vault).
6. **GitHub helper (optional)**: GitHub → profile → **Settings → Developer settings → Fine-grained tokens → Generate** → only this repo → permissions **Contents: Read & write**, **Pull requests: Read & write**. Paste in Owner → AI Agent Hub → **Connections → GitHub token**, set `owner/name` and branch, press **Test**. Changes only become pull requests; nothing goes live without you.
7. Leave `HUB_ALLOW_DEPLOY` and `HUB_ALLOW_SQL` **unset** (they let the AI run SQL / deploy; keep off).
8. The daily jobs (money 22:00 IST, night 02:00 IST) use a database secret called `agent_cron_secret`. It already exists; do not delete it.

---
## Part 8 — Astro Master (Swiss Ephemeris)
1. **Render engine (place E)**: bhajrang-astro-engine → Environment → `ASTRO_ENGINE_KEY` = a long random text (32+ letters/numbers). Save (it restarts). Test `https://bhajrang-astro-engine.onrender.com/health` → must show `"ok":true` and `"keyConfigured":true`. (Already OK on your side.)
2. **Supabase secrets (place B)**: `ASTRO_ENGINE_URL` = `https://bhajrang-astro-engine.onrender.com` (no slash at the end), `ASTRO_ENGINE_KEY` = the **same** text as Render.
3. Deploy `agent-hub` (Part 2 step 6). The secrets are only picked up by a function that is deployed *after* you add them.
4. Test: `/villain` → Astro Master → make one chart. If it says "not connected", the secret names or the key differ.
5. Render free plan sleeps after 15 minutes; the first chart can take about a minute. A free ping (UptimeRobot, below) keeps it awake.
6. Licence: Swiss Ephemeris is free for a private tool only. If you show charts to members or the public, you must publish the source or buy the commercial licence.

---
## Part 9 — Social Sales Inbox (Instagram / Facebook / WhatsApp auto-reply)  🔑 Meta  (advanced)
Needs: Part 3 done, a Facebook Page, an Instagram business account, and the two database migrations `rbf_social_sales_agent` + `rbf_social_inbox_rpcs` (run `supabase db push`).
1. Supabase secrets: `META_APP_SECRET` (Meta app → Settings → Basic → App secret), `META_VERIFY_TOKEN` (any text you invent), `PAGE_ACCESS_TOKEN` (Page token from Messenger/Instagram setup), `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `OWNER_WHATSAPP` (your number, digits only with 91), `OWNER_ALERT_TEMPLATE`, `SOCIAL_CRON_SECRET` (long random), `APP_URL` (your website address), `WA_RENEWAL_TEMPLATE`.
2. Deploy `social-agent social-reply social-followups`.
3. Meta app → **Webhooks**: callback URL `https://qcabkhhbcdjyefbwzexj.supabase.co/functions/v1/social-agent`, verify token = `META_VERIFY_TOKEN`; subscribe to messages for Page, Instagram and WhatsApp.
4. Schedule follow-ups: run `setup/social-agent/cron.sql` (replace `YOUR_PROJECT_REF` and the secret).
5. Meta app review is needed before strangers can message the bot (can take days).

---
## Part 10 — Backups  (GitHub Actions)
1. GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**.
2. `SUPABASE_DB_URL` = Supabase → **Connect → Session pooler** connection string (replace `[YOUR-PASSWORD]` with the database password from Project Settings → Database).
3. `BACKUP_PASSPHRASE` = 20+ characters. Keep a paper copy; without it backups cannot be opened.
4. Add the workflow file from `docs/BACKUPS.md` using the GitHub web editor (**Add file → Create new file** at `.github/workflows/backup.yml`).

---
## Part 11 — Kiosk, QR and voices (no keys)
1. Reception PC: open `/kiosk` in Chrome or Edge → allow **Camera**.
2. Supabase/Owner → **Kiosk & face scan** → approve this device.
3. Tap **🔊 Voice** once (browsers need one tap before speaking). Use Edge on Windows for the best natural voices.
4. Gym QR: reception → **Gym QR** → **Save gym location** while standing inside the gym; print the QR.
5. Windows auto-start: put an Edge shortcut with `--kiosk https://your-site/kiosk` in `shell:startup`.

---
## Part 12 — Extra things list (do not miss)
**Security**
- Change Owner, Store-owner and every staff passcode; remove ex-staff.
- Revoke any token that ever appeared in chat. Rotate keys every 6 months.
- Turn on **2-step login** for GitHub, Supabase, Render, Meta, Google.
- Keep the repo **Private**. Do not commit `.env` files.
**Reliability**
- UptimeRobot (free): monitor the website, `/health` of the astro engine, and a daily ping so Render never sleeps.
- Supabase free plan pauses after 7 days idle and has no daily backup; Pro ($25/mo) adds daily backups. Keep Part 10 either way.
- Put a UPS and a spare phone with the app installed at reception.
**Legal / trust (India)**
- Face scan = biometric data. Keep the member consent tick on the join form, add a short privacy notice at the desk, and allow members to opt out (the app has this).
- Show your GST / invoice details in Payment Settings if you charge GST.
**Business**
- Send the renewal WhatsApp messages every week from Renewals & Churn.
- Review Approvals and Dues every morning.
**Website**
- Edit `website/config.js` (APP_URL, PHONE, WHATSAPP). Replace images in `public/brand/`.
**Domain (optional)**
- Buy a domain, add it in Render → **Settings → Custom Domains**, then update `APP_URL`, Meta webhook, Resend and OneSignal site URL.

---
## Part 13 — Checklist (tick when done)
- [ ] 1.2 Render: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY, redeployed, site opens
- [ ] 1.3 Owner and Store passcodes changed
- [ ] 2 Functions deployed (agent-hub included)
- [ ] 3 WhatsApp: 4 secrets + 3 templates approved
- [ ] 4 Resend domain verified + 2 secrets
- [ ] 5 OneSignal: 2 secrets + VITE_ONESIGNAL_APP_ID
- [ ] 6 Telegram: 2 secrets
- [ ] 7 Groq + Gemini keys
- [ ] 8 Astro: key on Render, 2 secrets on Supabase, chart works
- [ ] 10 Backup secrets + workflow
- [ ] 11 Kiosk approved, voice tested, Gym QR location saved
- [ ] UptimeRobot monitors added

## If something says "not configured" or "not connected"
1. The secret name is wrong (copy it exactly, capital letters, underscores).
2. There is a space before/after the value.
3. You added the secret but did not re-deploy that function.
4. The same key has two names (WhatsApp, Part 3). Set both.
5. The key itself expired (WhatsApp temporary token = 24 hours).
