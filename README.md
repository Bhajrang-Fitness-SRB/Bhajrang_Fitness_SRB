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

The `/villain` lock is a **client-side** passcode check — it hides the page from casual visitors, but the check happens in the browser, so anyone who reads the page's source can find the code. That's an acceptable tradeoff **only while this deployment stays private** (repo not public, URL not shared beyond people you trust). If the repo ever goes public, or you want the vault to survive the URL leaking, this needs a server-side check instead (a Supabase Edge Function or real login) — ask if you'd like that built.

To change the passcode: edit `VILLAIN_PASSCODE` near the top of `src/App.tsx`.

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
