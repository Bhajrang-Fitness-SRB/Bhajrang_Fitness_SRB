# Gym software — install on a new branch (about 15 minutes)

You need: a free **Supabase** account, any place to host a website (Render, Netlify, Cloudflare Pages, Vercel…), and **Node 18+** on one computer (only to run the setup helper).

## 1. Create the database
1. supabase.com → **New project**. Copy the **Project URL** and the **anon / publishable key** (Project Settings → API).
2. Open **SQL Editor**, paste all of `database/install.sql`, press **Run**.
3. The last result shows **YOUR FIRST OWNER PASSCODE**. Write it down.

## 2. Set up the app
```
node setup.mjs
```
It asks for the gym name, the Supabase URL and key, then brands and connects the `app/` folder. No rebuild needed.

## 3. Put it online
Upload the `app/` folder to your host (it is a static site; add a rule that sends every path to `index.html`, already included as `_redirects` for Netlify/Render).
Open the site on phone or PC and use **Install / Add to Home screen**.

## 4. First login
Log in as **Owner** with the passcode from step 1 → change it in Settings → add your **packages, staff, rules, notices** and gym details. Everything starts blank.

## Optional: WhatsApp, email, push, Telegram, AI
Install the Supabase CLI, then in this folder:
```
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy send-whatsapp send-email send-push notify-telegram ai-coach agent-hub money-agent
```
Add the keys you have (leave the rest out; each feature simply stays off until its key exists):
```
supabase secrets set WHATSAPP_TOKEN=… WHATSAPP_PHONE_NUMBER_ID=…
supabase secrets set RESEND_API_KEY=… RESEND_FROM_EMAIL="My Gym <hello@yourdomain.com>"
supabase secrets set ONESIGNAL_API_KEY=… ONESIGNAL_APP_ID=…
supabase secrets set TELEGRAM_BOT_TOKEN=… TELEGRAM_CHAT_ID=…
supabase secrets set GROQ_API_KEY=… GEMINI_API_KEY=…
```
Push also needs the same OneSignal App ID in `app/config.js` (`ONESIGNAL_APP_ID`).

## Images
Replace the files in `app/brand/` (logo.png, icon-192.png, icon-512.png …) with your own. Keep the same file names.

## Safety
Never put a Supabase **service_role** key in `app/`. Only the URL and anon key go there. Keep your Owner passcode private.
