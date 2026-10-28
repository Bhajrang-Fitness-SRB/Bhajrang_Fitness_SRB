# System scan report — 29 Oct 2026 (6 passes)

| # | Pass | Result |
|---|---|---|
| 1 | Static check of every database function (plpgsql_check) | **2 real bugs fixed**: `walkin_join_member` always crashed (text into date columns) and `warrior_get_my_workout` always crashed (bad array). Now 0 errors. |
| 2 | App → database contract (146 calls: names and parameters) | 0 mismatches. 9 social-inbox functions still missing (not applied yet). |
| 3 | Data health and clutter | Removed test join request "ZZPIPE Test", 25 noisy log lines and the leftover table `billing_removed_backup`. Found 4 stale join requests, 2 members without invoices, 45 expired members (see PENDING_TODO). |
| 4 | Speed and freezing | Whole database is 18 MB; every query under 45 ms; members list is 25 kB. All timers in the code are cleaned up. No screen can stay blank: a crash shows a Reload button. |
| 5 | Live services | Cron jobs money-agent and nightly-agent succeeded, 0 failures in 7 days. Edge runtime healthy. Browser errors: fixed a phone crash in the water reminder (`new Notification` is not allowed on Android) and made error logs useful. |
| 6 | Code and repo | 0 vulnerable packages, 0 secrets in the repo, no junk files, unused imports removed. Fresh-install test found and fixed 3 more install bugs: missing member-ID sequence, a duplicate `approve_member`, and the walk-in join failing when no PT package was chosen. |

Earlier in the same day: kiosk attendance (every scan crashed, 0 attendance rows), open public access to member tables, missing core tables in the install script, 4 missing edge-function sources, 9 missing referral/streak functions.

Automated checks that now run on every `npm run test:db`: a full blank-database install plus walk-in join, kiosk check-in/out, workout, streak, reminders, and "no duplicate function versions".
