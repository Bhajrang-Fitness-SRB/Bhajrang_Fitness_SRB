# Bhajrang Astro Engine (Swiss Ephemeris)

A small private web service for the owner's **Astro Master**. It calculates charts with the Swiss Ephemeris
(`pyswisseph`) and draws wheels / Western aspects with **Kerykeion**. The app still has its own built-in calculator,
so everything keeps working if this service is off.

What it adds: a second, independent calculation (the app shows the difference), KP sub-lords, navamsa (D9),
whole-sign aspects, Vimshottari to pratyantar level, true or mean Rahu/Ketu, three ayanamsas (Lahiri, Raman, Krishnamurti)
and a chart picture.

## Safety
* Every call except `/health` needs the header `x-engine-key` (the secret `ASTRO_ENGINE_KEY`). Without the key set, the service refuses to work.
* Only the Supabase function `agent-hub` calls it, and only after it has checked the OWNER passcode. The browser never sees the address or the key.
* The service stores nothing. Birth details are used for one calculation and forgotten.

## Run the tests
    cd astro-engine
    pip install -r requirements-dev.txt
    ASTRO_ENGINE_KEY=test pytest -q
The tests compare this engine with Kerykeion, VedicAstro (KP sub-lords and dasha dates) and the app's built-in calculator.

## Deploy on Render (step by step)
See the "Astro Engine setup guide" document, or: Render -> New -> Web Service -> your GitHub repo -> Root Directory `astro-engine`
-> Runtime Docker -> add environment variable `ASTRO_ENGINE_KEY` -> Create. Then in Supabase -> Edge Functions -> Secrets add
`ASTRO_ENGINE_URL` (the https address Render gives you) and `ASTRO_ENGINE_KEY` (the same key).

## Licences (important)
Swiss Ephemeris/pyswisseph and Kerykeion are AGPL-3.0 (Swiss Ephemeris is also sold under a paid licence by Astrodienst).
For a private tool only you use, this is normally fine. If you ever give access to members or the public, or sell the app,
you must publish this service's source code or buy the commercial licence. This is not legal advice.
