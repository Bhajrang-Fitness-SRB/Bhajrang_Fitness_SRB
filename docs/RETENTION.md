# Renewals & Churn (Retention Desk)

Admin menu → **Renewals & Churn**. Staff and owner passcodes both work.

* **Money cards:** expected renewal income for the next 7 / 14 / 30 days (package list prices of members whose plan ends in that window) and the amount "at risk" from active members who stopped coming.
* **Renewals:** next 7 days, days 8–30, and expired in the last 30 days (win-back). One tap opens a ready WhatsApp message.
* **We miss you:** active members with no visit for 5–21 days (default 7), including members who joined but never came.
* **Already messaged:** each tap is remembered, so staff do not message the same person twice. Churn list hides people messaged in the last 7 days (switch off with the tick box).

Nothing is sent automatically. Messages use only the member's name, package, dates and days away. No offers, prices or promises are invented.

## Install
1. Run `supabase/migrations/20261023000000_rbf_retention_desk.sql` in Supabase → SQL Editor (safe to run twice).
2. Deploy the app. If you have not merged the `lockdown` branch yet, merge it first (this branch builds on it).

## Notes
* Money uses the package name on the member matched to your Packages list. Unmatched names are shown as "price unknown" and counted in a note.
* "Away" is judged from attendance logs (including kiosk scans).
* Test: `tests/retention/sql.test.mjs` (needs `embedded-postgres` and `pg`).
