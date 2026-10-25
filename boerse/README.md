# Gugu Börse: approved-phone passwordless access

Implementation draft: login and member administration only. Not deployed. The main
Gugu website is unchanged. Item listings and photo uploads are a later stage.

## Next steps for the owner

1. Create a Twilio account: https://www.twilio.com/try-twilio.
2. Open **Verify → Services → Create new Service** in the Twilio Console. Name it
   **Gugu Börse**, enable SMS and choose six-digit codes. Keep fraud protection on.
   Restrict destination permissions to countries your approved members use. Review
   current verification/SMS charges before upgrading; set conservative usage alerts.
   Alerts are not hard spending caps. Application send limits also apply.
3. Save the **Account SID**, **Verify Service SID**, and API key/secret privately in
   the backend environment. Never paste secrets into chat, GitHub or website code.
   Trial accounts can send only to verified recipient numbers; test with your own.
4. Open your specific Oracle database. Resolve private endpoint access first. A
   private endpoint needs a backend host with access to the database VCN. GitHub
   Pages cannot run this backend or connect privately to Oracle.
5. Create/use a dedicated `GUGU_BORSE` schema and run `backend/schema.sql` once there.
   Confirm all six GB_ tables exist. Do not prefix tables with PUBLIC. This does not
   migrate any existing MEMBERS/INVITATIONS tables.
6. Have an operator deploy the backend on a Node 22+ host with Oracle connectivity,
   secret storage and HTTPS. An OCI compute instance in the VCN is one option.
   `boerse.gugubasel.ch` is proposed; no hosting or DNS changes have been made.
7. Bootstrap your admin phone, test the flow, then add a Börse link to the home page.

References:
- https://www.twilio.com/docs/verify/api
- https://www.twilio.com/docs/verify/api/verification
- https://docs.oracle.com/en-us/iaas/autonomous-database-serverless/doc/private-endpoints-autonomous.html
- https://node-oracledb.readthedocs.io/en/latest/user_guide/connection_handling.html

## Member flow

Admin checks WhatsApp membership, enters approved phone, display name and optional
referrer, and creates a single-use 48-hour invitation. Admin copies the link into a
private WhatsApp message. No automatic WhatsApp membership lookup or messaging occurs.

The invitation sends SMS only to its stored phone number. Successful SMS verification
atomically consumes the invitation, activates the account and issues a 14-day session.
Future logins use the approved phone and another SMS code. No member passwords exist.

Resending revokes earlier unused invitations. **Deactivate access** blocks the account,
removes its sessions, revokes invitations and cancels local pending challenges. Every
protected request checks active membership. Removing someone from WhatsApp does NOT
remove website access: also deactivate their Börse account.

The badge means community approval and phone possession, not legal identity verification
or guaranteed honesty. Phone changes and blocked-account restoration require operator
review. There is no public endpoint for assigning administrator rights.

## Operator deployment

```
cd boerse/backend
npm ci --ignore-scripts
cp .env.example .env
# Fill .env privately, or use your host's secret manager.
node --env-file=.env bootstrap.mjs '+41YOURNUMBER' 'Your display name'
npm start
```

The placeholder above must be replaced with the owner's real approved number.
Bootstrap runs privately once and refuses if any admin already exists. Sign in at
`/boerse/` with that number and SMS code. Keep private operator access for recovery.

Use the actual Oracle connection string from your database. The driver uses Thin mode.
For mTLS, configure walletLocation, walletPassword and configDir in oracle.mjs as needed
and mount the wallet privately; do not enable broad public database access to connect
the frontend. Prefer a separate runtime user granted CRUD access only to the six GB_
tables. Schema creation is a separate operator action; no runtime DDL/DBA permissions.

PUBLIC_ORIGIN is the exact HTTPS origin without a trailing slash. Node listens only on
127.0.0.1. A local TLS reverse proxy forwards `/api/*` and `/boerse/*` to this process;
redirect `/` to `/boerse/`. Frontend and API share one origin. Publish only `public/`
assets, never backend source, .env or wallets. Configure process management and monitoring.

Set TRUST_LOCAL_PROXY=true only if the local proxy REPLACES X-Forwarded-For with the
actual client address. Never trust or append an incoming value. Otherwise leave false;
limits apply to the proxy IP. Do not expose the loopback port via an untrusted forwarder.

## Security and operations

- 256-bit random invitation/challenge/session tokens, stored only as SHA-256 hashes.
- Invitation secret in URL fragment, removed immediately; no analytics or external JS.
- Host-only Secure, HttpOnly, SameSite=Strict cookies; no localStorage credentials.
- Exact Origin and custom header required for JSON POSTs; no cross-origin API access.
- Shared persistent send limits: 20/IP/hour, 5/member/hour, 1/member/minute.
- Verification: 40/IP/hour, 5/challenge; provider limits also apply.
- Provider verification SID bound to challenge. Account/invitation rechecked after SMS.
- Member locks and transactions for activation and account lifecycle changes.
- Admin-only member directory, invitations and deactivation; audit records for actions.
- No credentials, phone numbers or tokens in application logs. Also configure proxy
  logs to exclude request bodies, Cookie headers and Authorization headers.
- Schedule deletion of expired sessions, challenges and rate buckets. Preserve unexpired
  challenge/invitation references. Document member/audit retention and privacy terms,
  restrict access to phone numbers and protect backups before launch.

## Validation

`cd boerse/backend && npm test` runs tests against a fake database/SMS provider.
Tests cover forwarding, access denial, expiry/reuse, verification failures, revocation
in flight, attempt caps, admin authorization and cookie flags.

Not yet validated: real Oracle SQL/locking, actual SMS, browser rendering, HTTPS proxy
and deployment. Before launch, staging tests must confirm:

1. Admin bootstrap, SMS sign-in, invitation and member activation.
2. Forwarded invitation sends SMS only to the approved number.
3. Invitation/challenge replay and concurrent redemption fail after first success.
4. Resending/revoking an invitation during SMS verification blocks old activation.
5. Deactivated signed-in users immediately lose API access.
6. Ordinary members cannot view phone lists, invite or deactivate members.
7. Limits survive restarts and apply across backend processes.
8. Cookie flags and Origin rejection work through the actual TLS proxy.
9. Mobile rendering, unavailable service and expired-code recovery behave correctly.

This branch prepares login; it is not a deployed or complete marketplace.
