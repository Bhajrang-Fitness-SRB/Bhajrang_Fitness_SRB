# Automatic database backups

Every night at 02:00 (India time) GitHub makes an **encrypted** copy of your database and keeps it for 30 days. Supabase's free plan has no backups of its own, so this is your safety net (also against a wrong Hub or SQL change).

## What is and is not saved
Saved: everything in the app's database (`public` schema): members, billing, attendance, notices, settings, Hub and social data, plus the lock-down permissions.
**Not saved:** uploaded files (progress photos, logos) in Supabase Storage; secrets (Hub API keys in Vault, function secrets); the owner passcode lives in the database so it IS saved. After a restore you re-enter the AI keys.

## One-time setup (10 minutes)
1. **Make the repo private** (GitHub → repo → Settings → General → Danger Zone → Change visibility). Backups are encrypted, but your code and data files should not be public. Private repos get 2,000 free Actions minutes a month; this job uses about 2 minutes a night. Render can deploy private repos, so reconnect it if it asks.
2. Supabase → **Connect** → choose **Session pooler** → copy the URI and put your database password in. Use the pooler, not "Direct": GitHub only speaks IPv4 and Direct is IPv6.
3. Choose a **backup passphrase**, 20+ random characters (for example four unrelated words plus numbers). **Store it in a password manager and on paper.** If it is lost, every backup is unreadable. Nobody, including me, can recover it.
4. GitHub → repo → Settings → Secrets and variables → Actions → New repository secret:
   * `SUPABASE_DB_URL` = the pooler URI from step 2
   * `BACKUP_PASSPHRASE` = your passphrase
5. Actions tab → **Nightly database backup** → **Run workflow**. A green tick and a downloadable `bhajrang-db-backup-…` file means it works. If it fails on "pg_dump version mismatch", add a repository **variable** `PG_MAJOR` with your database's major version (Supabase → Settings → Infrastructure) and run again.
6. Settings → Notifications: keep "Actions" email alerts on, so a failed night reaches you.

GitHub pauses scheduled jobs in a repo with no activity for 60 days, so look at the Actions tab now and then.

## Restore (practice this once, before you need it)
Safest: create a **new empty Supabase project**, then on a computer with PostgreSQL tools:
```
export BACKUP_PASSPHRASE='your passphrase'
scripts/backup/restore.sh bhajrang-YYYYMMDD-HHMM.dump.enc 'postgresql://postgres:PASSWORD@HOST:5432/postgres'
```
It checks the file, asks you to type `RESTORE`, then rebuilds the tables, data, functions and permissions. Then check the members count and a recent payment, re-enter the Hub AI keys, deploy the edge functions to the new project and point the app's Supabase URL and key at it.
**Never restore over your live database unless it is already ruined**: it replaces tables of the same names.

## Monthly drill (5 minutes)
Download the newest backup, restore it into a throwaway project, and look at the members list. A backup you never tested is a hope, not a backup.

## Tests
`scripts/backup/*.sh` were tested on real PostgreSQL 16: encrypted file contains no readable data, short passphrase and empty database are refused, wrong passphrase and tampered files are refused, restore brings back data, the lock-down permissions and row-level security, and restoring twice is safe. The GitHub workflow itself can only be proven by its first real run (step 5).
