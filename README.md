# 🏋️ Gym Management Software

A complete gym system on **React + Supabase**: member join & approval, attendance (kiosk with face scan, gate QR), billing & dues, renewals & churn, birthday and due reminders, referrals, workout & diet plans, store inventory, fines & rule book, owner/staff panels, and an optional AI Agent Hub. Installs on phones and PCs like an app (PWA).

## Install it for a new branch (no coding)
Download **`gym-software-installer.zip`** from the Releases page (or build it: `npm run installer`) and follow `INSTALL.md` inside: create a Supabase project → run one SQL file → run `node setup.mjs` → upload the `app/` folder. Everything starts blank.

## What it does
Full list by web address (what each tab does, and which need keys): **docs/FEATURES.md**. Keys and codes with a 2-line guide each: **docs/KEYS_CHECKLIST.md**. 10-minute live test: **docs/TEST_CHECKLIST.md**.

| Address | Who | Purpose |
|---|---|---|
| `/` | Staff | Reception desk, 20 tabs |
| `/villain` | Owner | Owner vault, 15 tabs |
| `/warrior` | Member | Gate pass, membership, streaks, referrals |
| `/kiosk` | Gym entrance | Face-scan and QR check-in |
| `/join` | Public | Online join form |
| `/selling` | Store | Shop sales |
| `/install` | Anyone | Add-to-home-screen help |

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
| Folder | What it holds |
|---|---|
| `src/` | The app (React + TypeScript): staff desk, owner vault, member app, kiosk, Agent Hub, Astro Master |
| `public/` | Icons, install manifests, service worker, `config.js` (runtime settings) |
| `supabase/migrations/` | Database: baseline first, then every change (file name `YYYYMMDDHHMMSS_name.sql`) |
| `supabase/functions/` | Edge functions: WhatsApp, email, push, Telegram, AI Agent Hub, social agent |
| `astro-engine/` | Swiss Ephemeris service for Astro Master (separate Render service, Docker) |
| `website/` | Public gym website (plain HTML/CSS/JS, separate Render static site) |
| `tests/` | Automated checks, one folder per feature |
| `installer/`, `scripts/` | Blank-install kit, backup and key tools |
| `setup/` | Optional cron and backup jobs |
| `docs/` | Guides (start at `docs/README.md`) |

Deployed on Render from this branch: the app (static, `npm run build` → `dist`), `website/` (static) and `astro-engine/` (Docker).

## Security notes
All member, staff and owner data is reached only through passcode-checked database functions; the public key cannot read or change member tables. **Change the Owner passcode on first login.** Never commit `.env` or a `service_role` key.

## Optional CI
Copy `docs/ci.yml.example` to `.github/workflows/ci.yml` (GitHub needs a token with the workflow scope, or add it in the web editor).
