# Admin AI Agent Hub

Owner-only master control, inside the Villain Vault → **AI Agent Hub**. It is a separate module:

| Part | Where |
|---|---|
| Screen | `src/agent-hub/` (only one import + one tab line were added to `App.tsx`) |
| Server | `supabase/functions/agent-hub/` (`router.ts` fail-over, `guard.ts` safety rules, `index.ts` actions) |
| Database | `supabase/migrations/20261016000000_rbf_agent_hub.sql` (all tables `agent_hub_*`, closed to the browser) |
| Tests | `tests/agent-hub/hub.test.ts` → `npx -y tsx --test tests/agent-hub/hub.test.ts` |

## Safety switches (added on review, both OFF by default)
The Hub is powerful: with approval it can run SQL on your live database and merge code on GitHub. So two switches ship **off**:
| Secret (Supabase → Edge Functions → Secrets) | What it unlocks |
|---|---|
| `HUB_ALLOW_SQL=true` | Testing and applying SQL proposals (including undo). Off = the Hub cannot touch the database at all. |
| `HUB_ALLOW_DEPLOY=true` | The Deploy button (merges the GitHub pull request, Render redeploys). Off = you merge the PR on GitHub yourself. |
Drafts, chat, member messages, social posts, settings and opening pull requests work without either switch. Turn a switch on only when you want it, and remove the secret to turn it off again.
**Always read a SQL or code proposal yourself before pressing approve.** The built-in checks are a keyword filter, not a guarantee.

## Setup (once)
1. Run the migration in the Supabase SQL editor.
2. Deploy the function: `supabase functions deploy agent-hub` (keep JWT verification on, like your other functions). Also set `SUPABASE_DB_URL` only if you will turn on `HUB_ALLOW_SQL` (Supabase provides it to functions automatically).
   If you ever ran the earlier simple hub's SQL (`ai-hub`, tables `hub_*`), run this migration after it: they share two function names and this one must win.
3. Open Villain Vault → AI Agent Hub → **AI Pool** → add one or more free AI keys → **Test**.
4. (Optional) **Connections** → GitHub (so Developer/Website agents can change code) and Facebook/Instagram.

## How it works
- **Free AI pool.** Keys sit in Supabase Vault. Requests go to the top AI first; on quota/rate limit it rests (minutes for per-minute limits, ~6 h for daily limits) and the next one answers. A rejected key is switched off until you replace it. Retired model names are re-discovered automatically.
- **Agents.** Built-in: Master Control (delegates), Developer, Money & Growth, Marketing & Social, Follow-up, Events, Website. Add more from the Agents tab (templates for Support, HR, Store, Reviews, or blank). A new agent shows up in Command immediately and Master can hand work to it.
- **Approval gate.** Agents cannot change anything. They create *proposals* (draft, member message, social post, setting, SQL, code). You press the button on a card. Approval is enforced on the server, not just in the screen.
- **Code changes** become a GitHub pull request; only **Deploy** merges it (Render then redeploys). To undo, press Revert on the merged PR.
- **SQL changes** can be tested first (run in a transaction and rolled back), run in one transaction, and an undo can be prepared (as a new proposal you also approve). Destructive SQL needs a tick-box confirmation. Applied SQL is also saved as a migration file in your repo when GitHub is connected.
- **Informing you:** every proposal and action is logged (Activity tab), and a Telegram alert is sent when one is waiting (if your Telegram alerts work).

## Deliberate limits (safety)
- Agents can never edit the Hub itself (`src/agent-hub/`, `supabase/functions/agent-hub/`, `agent_hub_*` tables), env files, `package.json`, build/deploy config, the vault, auth, RLS policies, roles, owner passcode objects, or GRANTs other than `GRANT EXECUTE ON FUNCTION`.
- Edge-function files changed through a PR are saved to GitHub only; redeploy them in Supabase.
- WhatsApp: opens ready-made `wa.me` chat links (one tap per member); email/push/Telegram use your existing `send-email`, `send-push`, `notify-telegram` functions.
- Agents see anonymous counters and aggregate money figures, never names, phone numbers or photos. Member lists for messages are resolved by the server from the audience you approve.

## Not verified against live services
Tested here: fail-over/guards (unit tests), migration (real Postgres engine), UI (headless browser, mocked backend), strict TypeScript build. **Not** run against your live Supabase, GitHub, Meta or the AI providers. Provider base URLs/limits are presets you can edit. Try each connection with the Test / Check buttons first.
