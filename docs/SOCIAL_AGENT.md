> **Already wired in this branch:** the app tab, functions, SQL and tests are in place (the old `setup/app-wiring.patch` is not needed). Setup files are in `setup/social-agent/`, tests in `tests/social-agent/`. Social functions: `social-agent` (webhook), `social-followups` (daily job), `social-reply` (owner replies).

# Bhajrang Fitness - Social Sales Agent (WhatsApp + Facebook + Instagram)

One AI team-member that answers your WhatsApp, Facebook Messenger and Instagram DMs 24/7 in
**English, Bengali (বাংলা) and Banglish**, sells your packages / PT / online-offline coaching / supplements,
books trial visits and PT consultations, tells **you** about hot leads, and chases old members to renew.

It runs on what you already have: **Supabase** (database + functions) and the **free Gemini/Groq** keys your app uses.
Nothing here changes your existing tables - it only *reads* `members`, `packages` and `inventory`.

## What it does

| Role | How the agent does it |
|---|---|
| Receptionist | Answers questions 24/7 from your real packages, store items, timings and facts |
| Sales | Finds the customer's goal, recommends the right package / PT / coaching, and always proposes a next step (visit, free trial, join link) |
| Customer relations | Warm, simple, polite; remembers each customer (summary + stage) and speaks their language |
| Product manager | Quotes **only** items and prices in your `inventory` table; says "out of stock" when quantity is 0 |
| Marketing / ads | Daily renewal + win-back messages (7 days before, 3 days before, expiry day, 1 / 7 / 30 / 90 days after) that offer PT as the faster, safer way to results |
| Booking desk | Collects name + time, saves a row in `sa_bookings`, and WhatsApps **you** instantly |

## Safety rules built into the code (not just the prompt)

* **No supplement doses, ever.** Medical, pregnancy, injury, medicine, steroid/SARM and dose questions never reach the AI: the customer gets a fixed polite reply ("our trainer/owner will guide you personally") and you get an alert. A second filter blocks any AI reply that contains mg/g/scoop/capsule amounts or guarantees ("100% results", "lose 10 kg in 30 days").
* **No guessing.** Prices and offers come only from your database. Empty facts = "the team will confirm".
* **Honest about being AI.** If someone sincerely asks, it says it is the gym's virtual assistant (Meta's rules also expect this). It never invents testimonials, scarcity or fake discounts.
* **Privacy.** Membership details are shared only on WhatsApp, only to the number registered on that membership. Facebook/Instagram identities are unverified, so no account details there.
* **STOP respected.** "STOP" ends all promotional follow-ups; "START" turns them back on.
* **You can take over any chat** from the Owner Inbox (see below): press "I'll handle this" or just send a reply, and the AI goes silent on that chat until you hand it back.
* Spam / cost guards: max 30 messages/hour per customer and 400 AI replies/hour overall.

## Setup (about 45 minutes, one time)

### 1. Meta accounts (you do this; I cannot do it for you)
1. Create a free **Meta Business account** (business.facebook.com) and a **Meta developer app** (developers.facebook.com, type *Business*).
2. **WhatsApp:** add the WhatsApp product, get a **Phone Number ID** and a **permanent access token** (System User token). The number must be registered with the WhatsApp *Cloud API*.
3. **Facebook + Instagram:** link your Facebook Page and Instagram *professional* account; generate a **Page access token**.
4. Webhook (App > WhatsApp / Messenger / Instagram > Configuration):
   * Callback URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/social-agent`
   * Verify token: any long random text (you choose; same value in step 3 below)
   * Subscribe to: WhatsApp `messages`; Page `messages`, `messaging_postbacks`; Instagram `messages`.
5. For **real customers** (not just test accounts) Meta requires **Business Verification** and **App Review** for `whatsapp_business_messaging`, `pages_messaging` and `instagram_manage_messages`. This takes days. WhatsApp works for testing with up to 5 numbers immediately.

### 2. Database
Run these two files, in this order, in the Supabase SQL editor (or copy both into your repo's `supabase/migrations/` and push). Both are safe to run twice:
1. `supabase/migrations/20261017000000_rbf_social_sales_agent.sql` - tables, locked to the server only
2. `supabase/migrations/20261018000000_rbf_social_inbox_rpcs.sql` - the passcode-protected functions the Owner Inbox uses Then edit and run `setup/fill-knowledge.sql` with your real details.

### 3. Deploy the three functions (copy the `supabase/functions/*` folders into your repo)
```
supabase functions deploy social-agent     --no-verify-jwt
supabase functions deploy social-followups --no-verify-jwt
supabase functions deploy social-reply     --no-verify-jwt
```
(`--no-verify-jwt` is required: Meta cannot send a Supabase login token. Every webhook is verified by Meta's cryptographic signature instead.)

### 4. Secrets (Supabase > Edge Functions > Secrets, or `supabase secrets set NAME=value`)
| Secret | Value |
|---|---|
| `META_APP_SECRET` | Meta app > Settings > Basic > App secret |
| `META_VERIFY_TOKEN` | the verify token you chose in step 1.4 |
| `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN` | from WhatsApp setup |
| `PAGE_ACCESS_TOKEN` | Facebook Page token (also used for Instagram DMs) |
| `OWNER_WHATSAPP` | your own WhatsApp number with country code, e.g. `919876543210` |
| `GEMINI_API_KEY` and/or `GROQ_API_KEY` | the free keys you already use for `ai-coach` |
| `SOCIAL_CRON_SECRET` | the random secret you put into `setup/cron.sql` |
| `APP_URL` | `https://bhajrang-fitness-srb.onrender.com` (used for the join link) |
| optional `GRAPH_VERSION` | defaults to `v23.0` - **check Meta's current version** and update if it has been retired |
| optional `WA_RENEWAL_TEMPLATE`, `WA_TEMPLATE_LANG`, `OWNER_ALERT_TEMPLATE` | see step 6 |

### 5. Schedule the daily renewal job
Edit and run `setup/cron.sql` once.

### 6. WhatsApp templates (needed only to message people who have not written in the last 24 hours)
WhatsApp only lets a business start a conversation with an **approved template**. In WhatsApp Manager > Message templates create:

* **`renewal_reminder`** (category *Marketing*, language English):
  `Hi {{1}}, your Bhajrang Fitness membership {{2}}. Reply here to renew, or to know about Personal Training and current offers. - Team Bhajrang`
  Samples: `Rahul`, `ends in 3 days`. Then set the secret `WA_RENEWAL_TEMPLATE=renewal_reminder`.
* **`owner_alert`** (Utility): `Bhajrang Fitness alert: {{1}}` -> secret `OWNER_ALERT_TEMPLATE=owner_alert`.
  (Without it, owner alerts still work whenever you have messaged the bot number in the last 24 hours - just send it "hi" each morning.)

When a member replies to the template, the 24-hour window opens and the agent continues the full sales conversation, already knowing what was sent.

**Renewal reminders are saved as DRAFTS by default** (table `sa_followups`, each with a one-tap `wa_link`). They only send automatically if you set `auto_send_followups` to `yes` in `sa_knowledge`. Please only turn that on for members who agreed to receive messages from you (Meta and Indian rules require opt-in for promotional messages), and note Meta charges per marketing template message. Replies inside 24 hours are free.

## The Owner Inbox screen (in your app's Owner Vault)

A new tab, **Social Sales Inbox**, shows everything the AI is doing. Only the **owner passcode** opens it (staff passcodes are refused by the database itself).

* **Chats** - every WhatsApp / Facebook / Instagram conversation, newest first, with "Needs you" chats on top. Open one to read it, see if the person is an existing member, and read the AI's one-line summary of them. Press **I'll handle this (pause AI)** or just type a reply and press **Send**: the message goes out on the customer's own channel and the AI pauses on that chat. Press **Hand back to AI** when you are done.
* **Bookings** - trials, PT consultations and supplement orders the AI collected. Confirm / Done / Cancel.
* **Renewal reminders** - the personal messages the AI prepared for members whose plan is ending or ended. Press **Open WhatsApp**, send, then **Mark sent**.
* **What the AI knows** - your timings, PT prices, real offers, supplement policy, and the on/off switch for automatic reminders. Type, Save, and the AI uses it on its very next message.

**Important - replying:** a number registered on the WhatsApp Cloud API normally cannot also be used in the WhatsApp phone app, so you reply from this Inbox (or from Meta's own WhatsApp Manager). Meta also only allows a free-form message within **24 hours** of the customer's last message; the Inbox shows when a chat is locked.

### Adding the Inbox to your app
1. Copy `src/components/SocialInbox.tsx` into your app's `src/components/`.
2. Apply the four small edits in `setup/app-wiring.patch` to `src/App.tsx` (from your app folder: `git apply setup/app-wiring.patch`). It adds the import, the `'social'` tab name, the tab button, and the line that shows the screen.
3. Deploy the `social-reply` function (step 3 above), then build and push as usual. This was checked against a copy of your app: `npm run build` passes.

## Running it day to day (Supabase Table editor, if you prefer)
Everything above can also be done directly in the tables: `sa_conversations` (filter `needs_attention`; set `human_takeover`), `sa_bookings`, `sa_followups`, `sa_knowledge`.

## Limits to know
* It cannot browse the live internet; general fitness knowledge comes from the AI model. Anything specific to your gym comes from your tables.
* Voice notes and images are not understood; the agent asks the customer to type.
* Instagram/Facebook let a business reply only within 24 hours of the customer's last message.
* The AI is good but not perfect. Read `sa_messages` for the first week and tell me what to tune.

## Tests
```
node --test tests/social.test.mjs                                             # 13 logic tests
node --import ./tests/smoke/register.mjs --test tests/smoke/flow.test.mjs     # 13 end-to-end flows against the real handlers
```
The database functions were also run against a real PostgreSQL: the public key cannot read any `sa_*` table, wrong / empty / staff passcodes are refused on all 9 inbox functions, and bad statuses or stages are rejected (`tests/sql.test.mjs`, needs `npm i embedded-postgres pg`).
