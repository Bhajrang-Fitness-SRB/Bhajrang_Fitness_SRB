# 🏋️ Gym Management Software

A complete gym system on **React + Supabase**: member join & approval, attendance (kiosk with face scan, gate QR), billing & dues, renewals & churn, birthday and due reminders, referrals, workout & diet plans, store inventory, fines & rule book, owner/staff panels, and an optional AI Agent Hub. Installs on phones and PCs like an app (PWA).

## Install it for a new branch (no coding)
Download **`gym-software-installer.zip`** from the Releases page (or build it: `npm run installer`) and follow `INSTALL.md` inside: create a Supabase project → run one SQL file → run `node setup.mjs` → upload the `app/` folder. Everything starts blank.

## Run it for development
```bash
npm ci
cp .env.example .env     # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build into `dist/` |
| `npm run test:db` | Replays all migrations on an empty Postgres (proves a blank install works) |
| `npm run installer` | Builds `release/gym-software-installer.zip` |

## Folders
`src/` app · `supabase/migrations/` database (baseline first, then every change) · `supabase/functions/` edge functions (WhatsApp, email, push, Telegram, AI) · `setup/` optional cron & backup jobs · `website/` public gym website · `installer/` + `scripts/` installer tools · `docs/` feature guides · `archive/` unused experiments.

## Security notes
All member, staff and owner data is reached only through passcode-checked database functions; the public key cannot read or change member tables. **Change the Owner passcode on first login.** Never commit `.env` or a `service_role` key.

## Optional CI
Copy `docs/ci.yml.example` to `.github/workflows/ci.yml` (GitHub needs a token with the workflow scope, or add it in the web editor).
