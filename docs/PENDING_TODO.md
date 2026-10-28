# Your to-do list (only you can do these)

## Today (security, 15 minutes)
1. **Change the Owner passcode** (it is still the shipped default). Owner → Settings. Also change the **Store owner** passcode in `/selling`.
2. **Delete the GitHub token** you shared in chat (GitHub → Settings → Developer settings → Tokens → Delete). Create a new one only when needed.
3. **Merge branch `clean-install-v2`** into your main branch (GitHub → Pull requests → Merge). Render redeploys. Then press **Ctrl+F5** on the kiosk and the reception PC.
4. **Deploy the edge functions** (needs Supabase CLI, see `KEYS_CHECKLIST.md`). This also removes an old "skip the passcode" switch from the live WhatsApp / email / push functions.

## This week (business)
5. **Test the kiosk voice**: press the 🔊 button on `/kiosk`, check the voices sound right. Do one real check-in and check-out.
6. **Run `docs/TEST_CHECKLIST.md`** once (10 minutes).
7. **4 join requests are waiting more than 14 days**: Riya Dutta, Deep Dutta, Dip Ghosh, Pinki Adhikary. Approve or reject them in Approvals.
8. **2 members have no invoice**: Vivekananda Sen (SRB92900004) and Rehana Khantun (SRB92900003). Create their invoice in Billing, or confirm they are free.
9. **45 of 67 members are expired (about 67%).** Open Renewals & Churn and send the one-tap WhatsApp messages. This is your biggest money win.
10. **Gym QR**: open Gym QR, save the gym location, then test phone check-in from the street and from inside.
11. **Add keys only for features you want** (WhatsApp, email, push, Telegram, AI): `KEYS_CHECKLIST.md`.
12. **Backups**: turn on the nightly backup (`docs/BACKUPS.md`): add the GitHub secrets `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE`.

## When you are ready (ask me)
13. Social Sales Inbox: needs 2 database migrations, 4 function deploys and Meta keys.
14. Studio-quality paid voices (ElevenLabs / Google) for the kiosk.
15. Add `.github/workflows/ci.yml` from `docs/ci.yml.example` using the GitHub web editor.
16. Member passcodes are stored readable for the owner vault. If you want them hidden (hashed), I can change this, but the "show member passcode" feature would stop.
