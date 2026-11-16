# Astro Master (owner only)

One screen in the owner vault (`/villain` → **Astro Master**) that combines **Vedic astrology (jyotish), numerology and tarot**
and turns them into daily, weekly, monthly and yearly guidance in plain language.

## The three parts (all wired and live)

| Part | What it does | Where it runs |
|---|---|---|
| **Built-in calculator** | Planets, lagna, nakshatra, dasha, tithi, Sade Sati, transits (`astronomy-engine`, Lahiri, whole-sign houses, mean Rahu/Ketu). Numerology (Pythagorean) and a fair 78-card tarot draw. | In the browser (`src/lib/astro.ts`). Always works, no keys. |
| **Swiss Ephemeris engine** | A second, independent calculation: KP sub-lords, navamsa (D9), Vimshottari to pratyantar, true or mean Rahu/Ketu, three ayanamsas (Lahiri, Raman, Krishnamurti), chart wheel. The app shows any difference from the built-in result. | Render web service `bhajrang-astro-engine` (folder `astro-engine/`). |
| **AI interpretation** | Turns the computed facts into guidance. It cannot invent positions. | Agent Hub (`astro_master` agent) with automatic fail-over across the free providers. |

```
Astro Master screen ──► Supabase function agent-hub (owner passcode checked) ──► Render astro-engine  (/chart, /transits, /wheel, /western-aspects)
                                   └────────────────────────────────────────────► free AI providers (Groq / Gemini …)
```

The browser never sees the engine address or key. They are stored encrypted in the Supabase Vault
(`hub_astro_engine_url`, `hub_astro_engine_key`) and only `agent-hub` reads them. A Supabase function secret of the same
name (`ASTRO_ENGINE_URL`, `ASTRO_ENGINE_KEY`) takes priority if you set one.

## Keeping it fast
Render's free plan puts the engine to sleep after 15 idle minutes and a cold start takes about a minute.
The database therefore pings `/health` every 10 minutes (`pg_cron` job `astro-engine-keepalive`, migration
`20261116015456`). One always-on free service fits inside Render's 750 free hours a month.
To stop it: `select cron.unschedule('astro-engine-keepalive');`

## Setup on a new install
1. Run the migrations (`supabase/migrations/…rbf_astro_master.sql` creates the private tables and owner-only functions).
2. Deploy the engine: Render → New → Web Service → this repo → Root Directory `astro-engine` → Runtime Docker →
   environment variable `ASTRO_ENGINE_KEY` (any long random string). See `astro-engine/README.md`.
3. Save the engine address and the same key in the Agent Hub secrets (names above), or as Supabase function secrets.
4. Deploy the function: `supabase functions deploy agent-hub`.
5. Add at least one free AI key in Agent Hub → AI Pool (Groq or Google Gemini). Pictures (chart or palm photo) need a Gemini key.
6. Open `/villain` → **Astro Master** → People → add birth date, time and place (tick "This is me").

## How to check it is working
* Engine health (no key needed): open `https://<your-engine>.onrender.com/health`. It shows `"ok": true`.
* Agent Hub → **AI Pool** → **Test** on each provider. An "Invalid API key" result means that slot needs a new key.
* In Astro Master, the **Swiss Ephemeris check** panel shows *connected* when the engine answered, or *not connected: using built-in* (the built-in calculator keeps working). The first call after a long idle can say "Waking the engine up".

## Honest limits
* Astrology, numerology and tarot are traditions for reflection, not proven science. The screen says so, and the AI speaks in tendencies, never certainties.
* Guard rails: no predictions of death, accidents, serious illness or court results; no fear talk; no selling gemstones or pujas; no medical, legal or investment advice; a caring reply if you sound distressed.
* Accuracy: positions are accurate to a fraction of a degree. The rising sign changes about every 2 hours, so a wrong birth time gives a wrong lagna and houses. If the time is unknown, tick "unknown".
* Schools differ (ayanamsa, house system, dasha year length). Ask a family jyotishi if your tradition differs.
* The place list has 25 cities; others need latitude and longitude typed in.
* Licence: Swiss Ephemeris and Kerykeion are AGPL-3.0. For a private owner-only tool this is normally fine. If you give members or the public access, or sell the app, you must publish the engine source or buy the commercial licence. This is not legal advice.

## Tests
* `node --test tests/astro/astro.test.mjs` — 12 checks of the built-in calculator (Sun and Moon against published values, ingress dates, rising point, tithis, dasha continuity, numerology, 78 unique tarot cards).
* `cd astro-engine && pip install -r requirements-dev.txt && ASTRO_ENGINE_KEY=test pytest -q` — engine against Kerykeion, VedicAstro and the built-in calculator.
