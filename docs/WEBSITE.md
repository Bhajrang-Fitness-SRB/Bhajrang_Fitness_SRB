# Public website (`website/`)

Plain HTML/CSS/JS, no build step, no keys. Separate from the app, so it does not change how the app builds.

## Put it online (Render, free static site)
1. Render → New → **Static Site** → pick this repo.
2. **Root Directory:** `website`  ·  **Build Command:** `echo ok`  ·  **Publish Directory:** `.`
3. Deploy. (`website/render.yaml` shows the same settings plus cache and basic security headers; Render only reads a root-level blueprint, so set it in the dashboard.)

## Fill in your details (`website/config.js`)
`PHONE`, `WHATSAPP` (digits with country code), `ADDRESS`, `MAP_URL`, `INSTAGRAM`, `FACEBOOK`, `YOUTUBE`. Anything left empty is hidden, so no dead buttons. Until you fill them, visitors cannot call or WhatsApp you from the site.

## After it is live
Add the website link to your Google Business Profile and Instagram bio.
