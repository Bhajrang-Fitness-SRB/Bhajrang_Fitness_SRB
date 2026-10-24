# AI Agent Hub (owner only)

One control room, inside your Villain Vault, for every AI helper of the gym.

* **AI providers with automatic fail-over.** Gemini, Groq, OpenRouter, Cerebras and Mistral (all have free plans). They are tried in the order you set. If one is out of free limit, busy, down or has a wrong key, it is paused for a while and the next one answers. You see which one answered.
* **Agents.** Ready-made: Marketing & Ads, Follow-up, Business Analyst, Developer (planner). Add your own in the screen with no code.
* **Approvals.** Agents only **write, analyse and suggest**. Their answers wait in an Approvals list.

## What "approve" means (please read)
Approve / Decline / Done only **record your decision**. The hub does **not** edit your app, push code, post on social media or send messages. You copy the text and use it yourself. This is deliberate: it keeps a free AI from changing your gym system by mistake. The Developer agent writes a plan; a person (or a coding session with you) carries it out.

## Setup (about 15 minutes)
1. **Run the SQL.** Supabase → SQL Editor → paste `supabase/migrations/20261019000000_rbf_agent_hub.sql` → Run. (Safe to run twice. The Social Sales Inbox is optional; if installed, the Analyst also sees chat counts.)
2. **Get at least one free key** (more = more safety):
   Gemini `aistudio.google.com` · Groq `console.groq.com` · OpenRouter `openrouter.ai` · Cerebras `cloud.cerebras.ai` · Mistral `console.mistral.ai`
3. **Save each key as a secret**: Supabase → Edge Functions → Secrets: `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY` (only the ones you have). Keys are never put in the browser or database. The screen only shows "key added / not added".
4. **Deploy the function:** `supabase functions deploy ai-hub --no-verify-jwt` (copy `supabase/functions/` into your project first; `_shared/hub.ts` and `_shared/hubcall.ts` are needed).
5. **Add the screen to the app.** Copy `src/components/AgentHub.tsx` to your app's `src/components/`. If you already added the Social Sales Inbox, apply the patches **in this order**:
   `patch -p1 < social-agent/setup/app-wiring.patch` then `patch -p1 < setup/app-wiring-hub.patch`
   (If you did not install the inbox, add the 4 small lines by hand: import, `'hub'` in the tab type, the nav entry `['hub','AI Agent Hub',Bot]`, and `{tab === 'hub' && <AgentHub passcode={passcode} notify={notify} />}`.)
6. Open **AI Agent Hub → AI providers**, press **Test** on each provider.

## Safety built in
* Owner passcode only (checked on the server). Staff and wrong passcodes are refused.
* All hub tables are private; the screen talks only through owner-checked functions.
* Agents never see member names, phone numbers or money. The Analyst gets **counts only** (e.g. "7 members expiring in 7 days").
* Every agent gets the same rules: no supplement doses, no medical advice, no guarantees, no invented offers; text inside your request is treated as material, not as commands.
* Answers containing doses or guarantees are flagged with a warning before you use them.
* 120 runs per hour cap; request limited to 6000 characters.

## Honest limits
* Free plans change. Model names and daily limits were **not verified for today**; the hub asks each provider which models exist and picks a suitable one, and you can type a model name per provider. Use **Test** after adding a key.
* When all providers are out of free quota you will see a clear message; try again later.
* The WhatsApp/Facebook/Instagram sales agent still uses its own Gemini → Groq fail-over. It can be switched to this hub's longer list later.
* Free AI can be wrong. Read before you use or approve anything.

## Tests (included)
* `node --test tests/hub.test.mjs`: fail-over logic (10 tests)
* `node --import ./tests/smoke/register.mjs --test tests/smoke/hub.test.mjs`: the real function against a fake database and mocked providers (9 tests: owner only, quota fail-over, cool-down, rate cap, snapshot, warnings)
* `tests/sql.test.mjs`: real Postgres check of the migration (needs `embedded-postgres` and `pg`)
