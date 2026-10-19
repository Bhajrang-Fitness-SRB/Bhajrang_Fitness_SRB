# All keys in one place

**Paste every key once into `keys.env`** (copy of `keys.env.example`, git-ignored, never uploaded), then run `scripts/keys/push-keys.sh`. It sends each key to where it is used. Run `--dry-run` first to see names only.

Why not literally one storage place: Supabase functions can only read Supabase secrets, GitHub's backup job can only read GitHub secrets, and Render only reads its own settings. The script is the single door to all three. Every function in the app reads from **Supabase → Edge Functions → Secrets**.

Needs once: Supabase CLI (`supabase login`) and GitHub CLI (`gh auth login`). The two Render values are public and you paste them in Render yourself.

| Key | Where to find it |
|---|---|
| GEMINI_API_KEY | aistudio.google.com → Get API key |
| GROQ_API_KEY | console.groq.com → API Keys |
| ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID (optional) | console.anthropic.com → API keys / your workspace |
| WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID | Meta for Developers → your app → WhatsApp → API Setup |
| WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID | same two values as above (social agent uses these names) |
| META_APP_SECRET | Meta app → Settings → Basic → App secret |
| META_VERIFY_TOKEN | text you invent; must match the webhook setting in Meta |
| PAGE_ACCESS_TOKEN | Meta → Messenger / Instagram setup → generate Page token |
| OWNER_WHATSAPP | your number with country code, digits only |
| SOCIAL_CRON_SECRET | long random text you invent; same one in `setup/social-agent/cron.sql` |
| APP_URL | your Render app address |
| RESEND_API_KEY, RESEND_FROM_EMAIL | resend.com → API Keys; a sender verified under Domains |
| ONESIGNAL_APP_ID, ONESIGNAL_API_KEY | OneSignal → your app → Settings → Keys & IDs |
| TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID | @BotFather → /newbot; then `api.telegram.org/bot<TOKEN>/getUpdates` |
| WA_RENEWAL_TEMPLATE, WA_TEMPLATE_LANG, OWNER_ALERT_TEMPLATE(_LANG), GRAPH_VERSION | optional; template names from Meta WhatsApp Manager |
| HUB_ALLOW_SQL, HUB_ALLOW_DEPLOY | leave blank (off); set `true` only when you want the Hub to change the database / merge code |
| SUPABASE_DB_URL (GitHub secret) | Supabase → Connect → **Session pooler** link, with your DB password in it |
| BACKUP_PASSPHRASE (GitHub secret) | you invent it: 20+ characters, keep a paper copy |
| VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (Render) | Supabase → Project Settings → API (both are public values) |

**Supabase provides these itself, never paste them:** SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL (inside functions).
**Entered inside the app, not in `keys.env`:** the Hub's free-AI pool keys (AI Agent Hub → AI Pool) and its GitHub connection (Connections); they are stored in Supabase Vault. Use a GitHub token limited to this one repo.
**Temporary switch:** `AUTH_GRACE=true` only for upgrades of the AI coach; leave it unset.

## Safety rules
* `keys.env` is git-ignored and the script refuses to run if it was ever added to git. Never paste its contents into chat.
* Any key that was pasted into a chat or committed must be **rotated** (make a new one, delete the old).
* Money/nightly agents can also read the Anthropic key from a database table. Supabase secrets take priority; keep the key only in Supabase.
* The old README mentions a default owner passcode. Change it in the app if you have not, and make the repo private.
