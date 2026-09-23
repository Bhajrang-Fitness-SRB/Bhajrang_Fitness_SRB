# RBF Gym Management Vault

A gym management system with four surfaces, each its own URL, backed by Supabase.

## Routes

- `/` — **Desk** (main URL, staff reception) — manual attendance, walk-in member joining, approvals, warrior directory, store inventory, due & birthday reminders (with click-to-WhatsApp), invoices/dues, expenses, diary, flyer studio, AI plans. No aggregate revenue/profit figures here by design — see `/villain` for that.
- `/warrior` — **Member app** — Warrior ID + passcode login, QR gate pass, membership status, attendance history, renew/upgrade request, calculators
- `/kiosk` — **AI Kiosk Terminal** (gym entrance tablet) — scan/type ID to check in/out
- `/join` — **Public signup** — no login required; full intake (personal, ID, occupation, address, health & body parameters with live BMI, medical conditions, consent) lands in the Desk's Approvals queue
- `/villain` — **Owner-only secret vault** — passcode-gated (default `295592`). This is the only place gross revenue, net profit, financial planning, and full payment reports live, plus staff account management and CSV data exports. Not linked from anywhere in the staff UI except a small "Owner vault" button in the Desk sidebar — reach it by URL or that button.

## Branding

Real Bhajrang Fitness / RB Warriors assets are wired in under `public/brand/`: app icon & favicon, a welcome splash shown once per session on any route, a low-opacity deity background watermark, the owner's photo on the `/villain` gate, the RB Warriors badge in the Desk sidebar, and the logo drawn directly onto every Flyer Studio poster.

## Security note on /villain

The `/villain` lock is checked **server-side**: `verify_owner_passcode` runs inside a Postgres SECURITY DEFINER function, the passcode is bcrypt-hashed (`pgcrypto`), and the hash is never readable from the client. As of the `20260923000000_rbf_owner_passcode_lockout` migration, 5 wrong attempts locks the vault for 15 minutes (globally — this app has one shared owner secret, not per-user accounts). What this does NOT give you: individual accountability (you can't tell which device made an attempt) or 2FA. If you ever want a real per-person login (email/password or magic link via Supabase Auth) instead of one shared passcode, ask and it can be built.

To change the passcode: open the Villain Vault and use "Change owner passcode" in Settings (or run `select set_owner_passcode('current','new');` directly in the Supabase SQL editor).

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Supabase (PostgreSQL with RLS)
- **PWA:** Installable on Android & iPhone, offline caching, app icons
- **Libraries:** lucide-react (icons), qrcode.react (QR codes)

## Quick Start

```bash
npm install
npm run dev      # start dev server
npm run build    # production build
npm run preview  # preview production build
```

## Environment Variables

Create a `.env` file in the project root (copy `.env.example`):

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Database

Run both files in `supabase/migrations/` against your Supabase project, in order:
1. `20260823171042_rbf_complete_existing_schema.sql` — core schema (members, billing, attendance, expenses, packages, ai_plans)
2. `20260826000000_rbf_staff_table.sql` — adds the `staff` table used by the Villain vault's Staff Control tab

All tables have RLS enabled with anon/authenticated policies (single-tenant app, no separate Supabase Auth screens — login is handled at the app level).

## Deploying to Render

1. Push this project to a GitHub repo (keep it **private** if you want `/villain` to stay meaningfully hidden).
2. In Render: **New → Static Site**, connect the repo. `render.yaml` in this project already sets the build command and publish path.
3. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Render's dashboard (Environment tab) — do not commit real keys to the repo.
4. Deploy. Render gives you a `https://<your-service>.onrender.com` URL — all four routes (`/warrior`, `/administration`, `/villain`, `/kiosk`) work directly since `render.yaml` rewrites all paths to `index.html` for this single-page app.
5. Share `https://<your-service>.onrender.com/warrior` with members and `https://<your-service>.onrender.com/administration` with staff. Keep `/villain` to yourself.

## Install as App (PWA)

1. Publish the built site to any static host (Render, Netlify, Vercel, GitHub Pages)
2. On Android: open in Chrome → menu → **Install app**
3. On iPhone: open in Safari → Share → **Add to Home Screen**

The app works offline after first load.

## Kiosk upgrade (this build)

The `/kiosk` screen now has:

- **Camera QR scanning** — tap "Scan with camera" to use the device's back camera (via `getUserMedia` + the `jsqr` library) instead of typing the Warrior ID. Falls back gracefully with an on-screen message if the camera is unavailable or permission is denied — typing the ID still always works.
- **Voice greeting** on check-in ("Welcome to Bhajrang Fitness, {name}") and a **randomized positive goodbye line** on check-out, using the browser's built-in Web Speech API (`speechSynthesis`) — no new service or API key needed. Silently does nothing on devices/browsers without speech support (e.g. some older Android WebViews).
- **3-day expiry alert** — if a member's `expiry_date` is within 3 days, the kiosk shows a pulsing yellow message instead of the plain green success message.
- **Expired-package voice announcement** — if a member's package has already expired, on top of the welcome voice, a second spoken line follows: "Attention. {name}, your package has expired. Please renew at reception." The status text also turns red.

### To run this build

```bash
npm install   # pulls in the new `jsqr` dependency
npm run dev
```

The camera feature requires HTTPS (or `localhost`) — it won't work over plain HTTP on a real device, which Vite's dev/preview and any real deployment already satisfy.

**Note:** this diagnosis of the changes was written and syntax-checked (TypeScript parse, no type-checker available offline) but could not be run through a live `npm install && npm run build` in the environment that produced it — please run a full build/test pass before deploying to the gym floor.

## Water tracker (this build)

Added a **Water goal tracker** card to:
- `/warrior` — each member's portal, using their own `weight_kg` on file
- Staff Desk → **Due & Birthday Reminders** tab — for your own daily planning (enter your weight manually)

How it works:
- Daily target = weight (kg) × 0.7 litres, split evenly across 30-min slots from 8:00am to 10:00pm.
- Tap a time slot once you've had that glass — progress bar and total litres update live.
- "Reminders on" toggle requests browser notification permission and pops a reminder each slot if you haven't logged it yet (falls back to an in-app toast if notifications are blocked/unsupported).
- Fully per-device (stored in `localStorage`), and can be turned off anytime with the toggle — no server changes needed for this version.

**Known limitation:** these reminders only fire while the app/PWA tab is open on that device — not a true background push when the app is fully closed. A real "notify me even when the app is closed" version needs Web Push (VAPID keys + a subscriptions table + a scheduled Supabase Edge Function firing every 30 min) — happy to build that next if you want it to survive the app being closed.

## Owner-vault lockout (this build)

New migration: `supabase/migrations/20260923000000_rbf_owner_passcode_lockout.sql` — adds a global 5-attempt / 15-minute lockout to the owner passcode check, plus an `owner_lockout_seconds_remaining()` RPC the login screen now polls to show a live countdown instead of letting attempts be unlimited.

**Run this migration on your Supabase project** (SQL editor, or your usual migration pipeline) — the frontend change alone does nothing without it.
