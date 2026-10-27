# Gym QR attendance

Members scan a QR at the gym with their phone and are checked **in** or **out** (the scan toggles). Their details appear on their phone: name, package, valid-till date, days left, gym days this month, and any payment due.

## How it stays honest
* **Rotating QR.** The screen at the entrance (Admin → **Gym QR**) shows a code that changes every minute. A photo sent to a friend stops working within about 2 minutes.
* **Location.** The phone shares its position. The check passes when the phone's position, allowing for its GPS error, touches the allowed distance from the entrance (default 20 feet).
* **Member passcode.** The member must be signed in. 10 wrong tries in 10 minutes block that member for 10 minutes. (The older member screens do not have this limit yet.)
* **Privacy.** Member coordinates are never saved. Only distance and GPS error are logged, so you can tune the setting. Staff see them under "Recent scans".

## One-time setup
1. Run `supabase/migrations/20261028000000_rbf_gate_qr_attendance.sql` in Supabase (already applied to your live database).
2. Deploy the app (this branch). 
3. **Owner:** stand where the QR screen will be (a door or window is best). Open the staff app → **Gym QR** → **Use my location now**, wait 10 seconds, check the accuracy shown, then **Save location**.
4. Put a tablet or phone there with Gym QR open (the screen stays awake). Log in on it with a staff passcode.
5. Members: open the member app → **Scan gym QR**, or scan the QR with the phone's camera app (it opens the member page, they sign in, and it finishes by itself).

## About the 20-foot rule (please read)
Phone GPS is usually 5 to 15 metres off, and worse inside buildings. 20 feet is only 6 metres, so honest members may be turned away. That is why the check allows for each phone's own GPS error, and why the distance is adjustable (10 to 500 ft). If you see "Too far" or "Weak GPS" for people who are standing at the gym, raise the distance (60 to 100 feet is common) in the Gym QR screen. The "Recent scans" list shows how far each scan measured.
GPS can also be faked with special apps, which is why the rotating QR is the stronger protection.

## Notes
* Expired members are recorded and shown a "membership expired, please renew" message (same as the kiosk). Tell me if you want them blocked instead.
* The camera and location both need the https website address (yours is).
* On iPhones the camera app opens the link in Safari, so the member signs in there.
* Tests: `tests/gate/sql.test.mjs` (real Postgres, needs `embedded-postgres` and `pg`) and `tests/gate/qr.test.ts`.

## Kiosk
The same rotating QR can be shown on `/kiosk` next to the scanner. See `docs/KIOSK.md`.
