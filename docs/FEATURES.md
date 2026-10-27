# Features, by web address

Status key: ✅ works with no extra keys · 🔑 needs a key/account (see `KEYS_CHECKLIST.md`) · 🚀 needs its edge function deployed.
Every database action below was checked to exist in the live database on 27 Oct 2026. Live logins were not tested by the author; do a 10-minute test with `docs/TEST_CHECKLIST.md`.

**Totals (counted from the code):** 7 web addresses · 20 staff tabs · 15 owner tabs · 7 store screens · 4 social-inbox screens · 146 database actions · 11 edge functions.

## `/` Reception desk (staff login) — 20 tabs
| Tab | What it does (2 lines) | Status |
|---|---|---|
| Overview | Today's numbers: active members, present now, dues, renewals, birthdays. | ✅ |
| Manual Attendance | Check a member in or out by hand when the kiosk is not used. | ✅ |
| New Member / Join | Add a walk-in, take payment, print the welcome kit. | ✅ |
| Approvals | Review online join requests; approve with package and payment, or reject. | ✅ |
| Warriors | Search, edit and renew members; reset a member passcode. | ✅ |
| Renewals & Churn | Who expires soon, who stopped coming; one-tap WhatsApp message (never auto-sent). | ✅ |
| Referrals | Link a friend to the member who invited them; owner gives free days. | ✅ |
| Gym QR | Shows the daily gate QR members scan with their phone. | ✅ |
| Due & Birthday Reminders | Dues, renewals and birthdays (date shown under each name) with message buttons. | ✅ (WhatsApp/email send 🔑🚀) |
| Notices & Freeze | Post notices; approve or decline freeze requests. | ✅ |
| Billing | Invoices, payments, discounts, outstanding dues. | ✅ |
| Expenses | Record gym expenses by category and payment mode. | ✅ |
| Store Inventory | Stock list and quantities. | ✅ |
| Leads & Recovery | Enquiries and lapsed members to win back. | ✅ |
| Workout Hub | Exercise library (195 exercises), plans, day templates, assign to members. | ✅ |
| Rule Book | The gym rules members can read. | ✅ |
| Fines & Punishments | Issue and resolve fines for rule breaks. | ✅ |
| Diary | Private staff diary notes. | ✅ |
| Flyer Studio | Make offer and festival flyers to share. | ✅ |
| Omni AI Hub | AI helper for staff questions and messages. | 🔑🚀 (`ai-coach`) |

## `/villain` Owner vault (owner passcode) — 15 tabs
Master overview · Financial Planner · Staff control · Kiosk & face scan · Member Vault Access · Packages · Workout Hub (PT/Prep) · Gym Rule Book · Fines & Punishments · Money Agent 🔑 · Social Sales Inbox 🔑🚀 · AI Agent Hub 🔑🚀 · AI Night Agent 🔑 · Payment Settings · Data & exports.
The first 9 and Payment Settings / Data & exports are ✅. The AI and social tabs need keys and their edge functions.

## `/warrior` Member app (member ID + passcode)
Digital gate pass · membership status and renewal request · recent attendance · notices · streak and badges · monthly leaderboard (opt-in) · refer a friend · workout log · progress photos · face-scan opt-in · profile change requests · freeze request. All ✅.

## `/kiosk` Gym entrance screen
Face-scan check-in, manual ID check-in, gate QR, voice greeting, two-screen mode. ✅ (camera needed)

## `/join` Online join form
New members fill details, photo, ID and health consent; staff approve in Approvals. ✅

## `/selling` Store (supplement / shop sales)
Owner: All sales · Sales staff · Products · Settings. Sales staff: Record a sale · Products · My sales. ✅

## `/install` Install help
Shows how to add each app to a phone or PC home screen. ✅

## Edge functions
| Function | Purpose | Needs |
|---|---|---|
| send-whatsapp | Renewal, birthday, due WhatsApp templates | 🔑 Meta WhatsApp |
| send-email | Email reminders | 🔑 Resend |
| send-push | Push notifications | 🔑 OneSignal |
| notify-telegram | Owner alerts | 🔑 Telegram bot |
| ai-coach | AI coaching and staff helper | 🔑 Groq/Gemini |
| money-agent / nightly-agent | Daily money check and night health report | 🔑 AI key |
| agent-hub | Owner AI Agent Hub | 🔑 AI key · 🚀 deploy |
| social-agent / social-reply / social-followups | Instagram/WhatsApp auto-reply inbox | 🔑 Meta · 🚀 deploy · social migrations |
