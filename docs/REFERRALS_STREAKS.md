# Referral rewards, streaks, badges, leaderboard

## For members (My portal, under the membership card)
* **Streak:** weeks in a row with at least 3 different visit days (you can change 3 to 1-7). A week still in progress never breaks it.
* **Badges:** gym days (1, 10, 25, 50, 100, 200, 365) and streak weeks (4, 8, 12, 26, 52).
* **Leaderboard:** this month's most active members. **Off by default**: a member appears only if they tick the box, as "Rahul D.".
* **Bring a friend:** member saves a friend's name and phone and can share a WhatsApp message with their code.

## For you (Admin → Referrals)
1. Friend invited by a member: when they join, enter their new member ID and press **Link**.
2. Walk-in says "RB001 sent me": use **Save referral** (referrer ID + new member ID).
3. **Owner only:** press **Reward**. Both memberships get the free days (default 7, counted from the current end date, or from today if already expired). Staff can link but cannot reward, so staff cannot give free weeks to friends or themselves.
Guards: no self-referral; the friend must be a member who joined in the last 30 days; different phone number from the referrer; one reward per friend; monthly cap per member (default 5); nothing is automatic.
Settings (owner, bottom of the Referrals screen): free days, monthly cap, visit days per week for a streak.

## Install
1. Run `supabase/migrations/20261024000000_rbf_referrals_streaks.sql` in Supabase → SQL Editor (safe to run twice).
2. Deploy the app. Until step 1 is done, members see nothing new and nothing breaks.

## Notes
* A free week is time you give away: it costs nothing if the friend is a new paying member, but check the monthly cap suits you.
* Visits come from attendance records (including kiosk scans). If staff do not log visits, streaks will look short.
* Test: `tests/referrals/sql.test.mjs` (real Postgres; needs `embedded-postgres` and `pg`).
