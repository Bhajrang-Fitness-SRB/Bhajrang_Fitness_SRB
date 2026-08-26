# RBF Ghost Vault — Gym Command OS

A complete, self-contained gym management system. No subscriptions, no external services, no API keys required. All data is stored in the browser's local storage and persists across sessions.

## Features

Three connected surfaces:

- **Supreme Command Center** (Admin Dashboard) — live telemetry, member approvals, billing, expenses, AI plan generation
- **Warrior Portal** (Member PWA) — login with Warrior ID + passcode, QR gate pass, membership status, 6 fitness calculators
- **AI Kiosk Terminal** (Gym Entrance) — scan/type Warrior ID to check in/out, live action logs

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Data Storage:** Browser localStorage (no database server needed)
- **PWA:** Installable on Android & iPhone, offline caching, app icons
- **Libraries:** lucide-react (icons), qrcode.react (QR codes)

## Quick Start

```bash
npm install
npm run dev      # start dev server
npm run build    # production build
npm run preview  # preview production build
```

No environment variables needed. No `.env` file required.

## Demo Logins

- Warrior ID: `SRB92900001` / Passcode: `1234`
- Warrior ID: `SRB92900002` / Passcode: `5678`

## How It Works

The app stores all data — members, billing, attendance, expenses, pending approvals — in the browser's built-in localStorage. This means:

- No database to configure
- No server to run
- No subscription or paid service required
- Data persists across page reloads
- Data is private to each device/browser

## Install as App (PWA)

1. Publish the built site to any static host (Netlify, Vercel, GitHub Pages, or any web server)
2. On Android: open in Chrome → menu → **Install app**
3. On iPhone: open in Safari → Share → **Add to Home Screen**

The app works offline after first load and never expires.

## Deploy Anywhere

The build output in `dist/` is pure static files. Upload to any web host:
- GitHub Pages (free)
- Netlify (free tier)
- Vercel (free tier)
- Any FTP/web hosting
