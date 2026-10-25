# Gugu Börse: WhatsApp approval + passkeys

Login-only draft; not deployed. Replaces the earlier SMS implementation. No Twilio,
email service or paid authentication messages are used. Hosting and Oracle may have
their own costs. The main Gugu website and item listings are outside this change.

## Member experience

1. Open `/boerse/`, choose **New member? Register**, enter a display name and WhatsApp
   number in international format, and create a passkey on the device.
2. Send the resulting 20-character registration reference privately to the admin using
   **Send reference on WhatsApp**. Send from the registered WhatsApp account. References
   expire 48 hours after registration starts. The request remains pending without access.
3. Admin checks the actual sender number and community membership in WhatsApp, then
   enters that reference and actual sender number in the admin screen and approves.
4. Member signs in using their number and passkey. Every authenticated request checks
   active membership; passkeys alone do not override a blocked member record.

The site cannot read community membership automatically. The admin must compare the
ACTUAL sender number shown by WhatsApp, not a number/name written inside a message,
and match the EXACT reference sent by that member. A list of pending registrations is
untrusted input and must never be approved blindly. Competing registrations for the
same number have different passkeys/references; approval binds only the chosen one.

## Admin controls

- **Approve this registration:** exact reference + actual WhatsApp sender number +
  explicit community-check confirmation. Number mismatch, expiry and replay fail.
- **Reject registration:** reject unwanted or suspicious requests.
- **Deactivate access:** block the member, revoke passkeys, delete sessions, cancel
  login challenges and reject outstanding registrations for that number.
- **Passkey recovery:** member creates a replacement and sends its NEW reference from
  the approved WhatsApp number. Admin rechecks sender and community, explicitly checks
  recovery, and approves. Old passkeys and sessions are revoked. Existing active
  accounts cannot gain a replacement credential through ordinary approval.
- Blocked accounts cannot be restored through recovery; operator review is required.
  Admin passkey recovery is also a private operator task, not a public API operation.

When someone leaves WhatsApp, deactivate their Börse account too. There is no automatic
membership synchronization. Phone possession/community admission is manually checked;
this is not legal identity verification or a guarantee against scammers. Users may
sync passkeys through their device provider. Device PIN/biometrics never reach the site.

## What is needed before activation

1. The owner's WhatsApp contact number for `ADMIN_WHATSAPP_NUMBER` (public contact).
2. A Node 22+ backend host with access to the Oracle database and private secret storage.
   GitHub Pages cannot run the backend. An OCI compute host in the database VCN is one
   option when Oracle uses a private endpoint.
3. A stable HTTPS origin, proposed `https://boerse.gugubasel.ch`, with DNS and a local
   TLS reverse proxy. No DNS or hosting changes have been made. Pick the final hostname
   BEFORE enrolling users: passkeys are bound to that hostname.
4. An Oracle application schema and tables, plus an owner passkey bootstrapped privately.

No email/SMS provider account is needed.

## Oracle setup

For a fresh installation, create a dedicated `GUGU_BORSE` schema and run
`backend/schema.sql` ONCE in that schema, not PUBLIC. It creates GB_MEMBERS,
GB_REGISTRATIONS, GB_PASSKEYS, GB_LOGIN_CHALLENGES, GB_SESSIONS, GB_RATE_LIMITS and GB_AUDIT.
It does not create or migrate item listings.

If the previous SMS draft tables already exist, do NOT rerun fresh schema.sql. Back up
the schema, stop the old backend and run `backend/migrate-passkeys.sql` instead. It
revokes SMS invitations/challenges and sessions, and adds three passkey tables without
dropping prior tables or changing existing items. Existing SMS-era active/admin accounts
need operator-assisted passkey enrollment; never silently attach a new key to them.
Keep SMS-era tables inaccessible to the new runtime account. Their later archival or
removal is a separate operator decision. Oracle DDL commits automatically.

Use the actual connection string from your Oracle database. Thin mode is the default.
For mTLS, configure walletLocation, walletPassword and configDir in oracle.mjs as needed
and mount the wallet privately. Keep a private database private; the frontend talks to
the backend, not directly to Oracle. A separate runtime user should have CRUD grants
only on the seven required tables, with no DDL/DBA privileges.

## Backend deployment

```
cd boerse/backend
npm ci --ignore-scripts
cp .env.example .env
# Fill the environment privately, or use the host's secret manager.
npm test
npm start
```

PUBLIC_ORIGIN must be the exact HTTPS origin without a trailing slash. RP ID is that
origin's hostname. The backend binds 127.0.0.1. A local TLS reverse proxy forwards all
`/api/*` and `/boerse/*` requests to it and redirects `/` to `/boerse/`. Frontend and
API must share one origin. Serve only explicit public routes, never backend source,
.env, node_modules directories or wallet files. `/boerse/webauthn.js` serves only the
installed browser library bundle; no CDN or build step is required.

Enable TRUST_LOCAL_PROXY only when a local proxy REPLACES X-Forwarded-For with the
actual client address. Never append/trust client-supplied headers. Otherwise leave it
false: limits apply to the proxy IP. Use a process manager, restart policy and monitoring.
Keep credentials out of chat, GitHub and frontend code. Add the homepage Börse link
only after end-to-end production testing.

## First owner registration

1. Start the configured backend and open its final HTTPS `/boerse/` page.
2. Register YOUR number and create your own passkey. Keep the reference on screen.
3. On the private backend host, run the following with your actual reference/number:

```
node --env-file=.env bootstrap.mjs 'AAAA-BBBB-CCCC-DDDD-EEEE' '+41YOURNUMBER'
```

4. Sign in with that passkey. Your account now exposes the admin controls.

Bootstrap refuses if any admin already exists or the owner number already has a member
record. It verifies that the reference is a pending cryptographically verified passkey
registration and matches the supplied phone. Only an operator who controls the host can
bootstrap the first admin. Run bootstrap once; do not run concurrent bootstrap commands.
Keep private operator access and backups for owner recovery.

## Security and maintenance

WebAuthn uses SimpleWebAuthn with exact expected origin, RP ID, challenge, user presence
and user verification. Each ceremony is single use. Credential ownership and user handle
are checked; authenticator counters are updated under member/key row locks. A failed
login consumes its challenge, so users must start again. Registration reserves the
credential only; approval attaches it to an active member. The database stores public
keys, never passkey private keys, biometrics or device PINs.

Sessions use random 256-bit tokens stored only as hashes, host-only Secure/HttpOnly/
SameSite=Strict cookies and a fixed 14-day expiry. No localStorage credentials. POSTs
require exact Origin, JSON and a custom header. CSP allows only local scripts. No
third-party analytics. Application logs omit numbers, references, keys and cookies;
configure proxy logs to omit bodies and credentials too.

Persistent registration limits: 20/IP/hour and 10/phone/day. Completion checks:
40/IP/hour. Login options: 40/IP/hour; login completion: 60/IP/hour. Limits persist in
Oracle across processes. Production traffic may require tuning/CAPTCHA if abused.

Schedule cleanup: expired sessions/login challenges/rate buckets can be deleted.
For expired unapproved registrations, first delete unattached passkeys, then their
registration records. Keep approved registration records while referenced by passkeys.
Set a documented retention policy for member/audit records, restrict phone-list access,
protect backups, and document privacy terms before launch.

## Validation

`npm test` covers the full register/approve/login/recovery/deactivate flow with an
in-memory transactional repository and REAL WebAuthn registration/signature validation.
It also checks origin/RP/challenge/user-verification rejection, credential ownership,
reference reuse, competing claims, expiry, revoked sessions, counters, admin restrictions,
CSRF protections, local assets and removal of old SMS endpoints.

Browser rendering/real-device passkeys have not been verified in this environment.
Real Oracle SQL, database locks, TLS proxy and production deployment still require
staging tests. In particular, test simultaneous registrations/approvals with Oracle,
limits across multiple processes, unsupported browsers, real iOS/Android passkeys,
passkey recovery and removal while signed in. Bootstrap and community verification are
operator/admin actions, not automated claims of identity or WhatsApp membership.

Official reference: https://simplewebauthn.dev/docs/packages/server
