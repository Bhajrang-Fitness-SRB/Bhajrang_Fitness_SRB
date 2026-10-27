# Keys and codes you need (easy guide)

Rule: **nothing is required to start.** Add a key only when you want that feature. Put server keys in Supabase (`supabase secrets set NAME=value`) or run `scripts/keys/push-keys.sh`. Never paste keys into chat or commit them.

| # | Key | Turns on | Get it (2 lines) |
|---|---|---|---|
| 1 | Supabase **Project URL** + **anon key** | The whole app | supabase.com → your project → Project Settings → API. Copy both into `config.js` (or Render env). |
| 2 | Supabase **Database password** / Session pooler link | Daily backup job | Supabase → Connect → Session pooler. Save as GitHub secret `SUPABASE_DB_URL`. |
| 3 | **Owner passcode** | Owner login | You choose it. Change it in the app on day one. |
| 4 | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp reminders | developers.facebook.com → your app → WhatsApp → API Setup. Approve templates `membership_renewal`, `birthday_wish`, `payment_due`. |
| 5 | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Email reminders | resend.com → API Keys; verify your domain under Domains. |
| 6 | `ONESIGNAL_APP_ID`, `ONESIGNAL_API_KEY` | Push notifications | onesignal.com → your app → Settings → Keys & IDs. App ID also goes in `config.js`. |
| 7 | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Owner alerts | Telegram → @BotFather → /newbot. Message your bot, then open `api.telegram.org/bot<TOKEN>/getUpdates` for the chat id. |
| 8 | `GROQ_API_KEY` and/or `GEMINI_API_KEY` | AI coach, Agent Hub | console.groq.com → API Keys; aistudio.google.com → Get API key. Both are free to start. |
| 9 | `ANTHROPIC_API_KEY` (optional) | Money & night agents | console.anthropic.com → API keys. |
| 10 | `META_APP_SECRET`, `META_VERIFY_TOKEN`, `PAGE_ACCESS_TOKEN`, `OWNER_WHATSAPP` | Social sales inbox | Meta app → Settings → Basic for the secret; verify token is any text you invent; Page token from Messenger/Instagram setup. |
| 11 | `SOCIAL_CRON_SECRET`, `APP_URL` | Social follow-ups | Invent a long random text; `APP_URL` is your site address. |
| 12 | `BACKUP_PASSPHRASE` | Encrypted backups | Invent 20+ characters. Keep a paper copy. Save as GitHub secret. |

## Deploy the functions once (needs Supabase CLI)
```
supabase login && supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy send-whatsapp send-email send-push notify-telegram ai-coach money-agent nightly-agent agent-hub social-agent social-reply social-followups
```
Supabase adds `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` itself. Never paste the service-role key into the app.

## Keep it private
GitHub repo = Private. Render/Netlify env holds only the URL and anon key. Rotate any key that was ever pasted in a chat.
