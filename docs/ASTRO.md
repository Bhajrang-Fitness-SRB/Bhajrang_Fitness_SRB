# Astro Master (owner only)

One screen in your Villain Vault that combines **Vedic astrology (jyotish), numerology and tarot**, and turns them into daily, weekly, monthly and yearly guidance in plain language.

## How it works (and why you can trust the numbers)
* **Exact calculations on your own device, free.** Planet positions, rising sign (lagna), nakshatra, Vimshottari dasha periods, tithi, Saturn Sade Sati and daily transits are computed with the open-source `astronomy-engine` library (Lahiri sidereal zodiac, whole-sign houses, mean Rahu/Ketu). Numerology uses the Pythagorean method (11/22/33 kept as master numbers). Tarot uses a fair random draw from all 78 cards, 30% reversed.
* **The free AI only interprets** those computed facts through the Agent Hub (Gemini, Groq and others with automatic fail-over). It cannot invent positions.
* **Pictures** (a chart photo, a palm photo): read by the free Gemini AI only. It describes what it can see and says how sure it is.
* **Private.** Birth details and saved readings sit in tables the public key cannot read; only the owner passcode opens them.

## Setup
1. The Agent Hub must already be installed (SQL `20261019...`, `ai-hub` function, at least one free key; for pictures you need `GEMINI_API_KEY`).
2. Run `supabase/migrations/20261023000000_rbf_astro_master.sql` in the Supabase SQL Editor.
3. **Re-deploy** the function (it now understands pictures): `supabase functions deploy ai-hub --no-verify-jwt`.
4. In your app: `npm install astronomy-engine`, copy `src/lib/astro.ts` and `src/components/AstroMaster.tsx`, then apply the patches in this order: inbox patch, `app-wiring-hub.patch`, lock-down `app-lockdown.patch`, then `setup/app-wiring-astro.patch`.
5. Open Villain Vault → **Astro Master** → People → add your birth date, time and place (tick "This is me").

## Honest limits
* Astrology, numerology and tarot are traditions for reflection, not proven science. The screen says so, and the AI is told to speak in tendencies, never certainties.
* Built-in guard rails: no predictions of death, accidents, serious illness or court results; no fear talk; no selling gemstones or pujas; no medical, legal or investment advice; a caring response if you sound distressed.
* Accuracy: positions are accurate to a fraction of a degree. The rising sign changes about every 2 hours, so a wrong birth time gives a wrong lagna and houses. If you do not know the time, tick "unknown" (Moon sign, nakshatra and dasha stay approximately right).
* Different schools differ (ayanamsa, house system, dasha year length). Ask a family jyotishi if your tradition differs.
* Place list has 25 cities; others need latitude and longitude typed in.
* Daily guidance is made when you press the button. Automatic morning messages (WhatsApp/notification) can be added later.

## Tests
* `node --test tests/astro.test.mjs`: 12 checks. Sun and Moon against published values, precession, Mesha/Makara ingress dates, the rising point is really rising (altitude about 0 and in the east), moon phase agreement, new/full moon tithis, dasha continuity and 120 years, numerology, 78 unique tarot cards and fair draws.
* `node --import ./tests/smoke/register.mjs --test tests/smoke/hub.test.mjs`: includes the picture path (only Gemini is asked, bad pictures refused).
* `tests/astro.sql.test.mjs`: real Postgres check that only the owner can read or write profiles and readings.
