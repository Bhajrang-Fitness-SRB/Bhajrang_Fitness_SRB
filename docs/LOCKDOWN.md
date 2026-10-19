# Lock-down: close the public-key holes in your database

An audit of your live Supabase project (read-only) found that anyone holding the public app key could still:
read every **expense**, read/edit **AI plans**, read/change/delete **progress photos**, read **attendance** (who comes when),
read/edit/delete **diary notes** and **inventory**, read/change **freeze requests**, post **fake notices** to every member,
and see your **purchase / wholesale / distributor prices** in the selling store. Several tables also carried TRUNCATE rights.
(Members and billing were already closed.)

This pack fixes all of it in 3 SQL steps plus one app patch. Run them **in this order**.

> **Changed after review:** the member portal does use progress photos, so they are NOT closed in step 1. New step **2b** (`20261021010000_rbf_lockdown_2b_progress_photos.sql`) adds passcode-checked photo functions, the app uses them, and step 3 closes the table.

## Step 1: run now (no app change, cannot break anything)
`supabase/migrations/20261020000000_rbf_lockdown_1_safe_now.sql` → Supabase → SQL Editor → Run.
Closes expenses, AI plans, progress photos (unused by the app), billing grants, TRUNCATE rights, leftover edit rights on packages/settings.

## Step 2: add the checked functions
`20261021000000_rbf_lockdown_2_gated_functions.sql` → Run, then `20261021010000_rbf_lockdown_2b_progress_photos.sql` → Run. Only adds functions (staff/owner passcode or member passcode checked). Nothing closes yet, so the current app keeps working.

## Step 3: update the app, then close the tables
1. The app change is already in this branch (patch applied to `src/App.tsx`, plus progress photos). It switches attendance, diary, inventory, notices, freeze requests and selling products to the new functions.
2. Build and deploy the app on Render. Check that the Diary, Inventory, Notices, Manual Attendance and Selling screens load.
3. Only then run `20261022000000_rbf_lockdown_3_close_tables.sql`.
   If you run it before the new app is live, those staff screens will look empty.

## Left open on purpose
Notices (members read them), gym settings (UPI id, address, brochure link), packages (read), and INSERT-only on pending approvals (public sign-up) and members (CSV import).

## Still not covered (honest list)
* Staff passcodes are stored as plain text in the `staff` table. Only the owner can read them, but hashing them is the next hardening step.
* The CSV member import still writes straight to `members`; moving it to an owner-checked function is a good follow-up.
* The progress-photo storage bucket is public by design (links work for anyone who has the link).

## Tests
`tests/sql.test.mjs` rebuilds your live table/policy layout on a real Postgres, runs all 3 steps twice, and checks: every function refuses wrong or empty passcodes, members see only their own attendance, staff/owner functions work, tables are closed after step 3, and the public sign-up, notices, settings and packages keep working. (needs `embedded-postgres` and `pg`)
