# Kiosk (/kiosk) - two screens in one

Open `/kiosk` on the desk tablet / phone. It shows two panels side by side (stacked on a phone):

| Left: kiosk scanner | Right: for members' own phones |
|---|---|
| **QR pass** (starts by itself): member shows the QR from their Warrior app | **Gym QR**: the rotating QR from Admin -> Gym QR; member scans it with their phone, signs in, location is checked |
| **Face scan**: switch on the same panel (only members who turned face scan on) | **ID / Mobile + passcode**: switch on the same panel; member types Member ID *or* mobile number + passcode |

All four ways check the member in, and the next one checks them out. Expired members are recorded and told to renew (voice + red banner). Welcome / goodbye voice is unchanged.

## Safety
* The kiosk must be approved by staff first (same as before). The gym QR and the typed entry both refuse unapproved devices.
* Typed entry: 10 wrong tries block that member for 10 minutes (the same counter the phone QR uses); 30 wrong tries on one kiosk block that kiosk for 10 minutes. Wrong ID, wrong mobile and wrong passcode all show the same message.
* If two members share one mobile number, only the one whose passcode matches is checked in.
* The typed form clears itself and returns to the QR after 45 seconds, and the passcode is wiped after every try.
* The screen is kept awake while the kiosk is open (where the browser allows it).
* Passcodes are 4 digits, so they are guessable over days (10 tries / 10 min / member). Consider longer passcodes.

## One-time setup
Run `supabase/migrations/20261029000000_rbf_kiosk_dual_screen.sql` in Supabase (already applied to your live database). The Gym QR panel also needs the gym location saved once in Admin -> Gym QR.

Tests: `node tests/kiosk/sql.test.mjs` (needs `npm i --no-save embedded-postgres pg`).
