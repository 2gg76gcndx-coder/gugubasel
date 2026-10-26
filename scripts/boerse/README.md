# Publish GUGU Börse from GitHub

Edit design in `boerse/index.html` and `boerse/gugu-boerse.css`, browser behaviour in `boerse/app.js`, and backend code in `boerse/*.mjs` on **boerse-open-registration**. Once enabled, saving those changes triggers publication to the existing Oracle Ubuntu server. The main GUGU homepage is separate.

The identical workflow and scripts are installed on `main` (so GitHub shows the Run workflow button) and `boerse-open-registration` (so pushes publish automatically). Keep automation files identical on both branches. A manual run always reads the current `boerse-open-registration` source, even when opened from main.

## One-time connection

Deployment is disabled until `BOERSE_DEPLOY_ENABLED` is set to `true`. First confirm the actual running service and directory on the Oracle server; do not guess:

```bash
systemctl list-units --type=service --all --no-pager | grep -Ei 'gugu|boerse|borse'
```

Then inspect the matching service with `systemctl show SERVICE.service -p User -p WorkingDirectory -p FragmentPath`. Do not paste `.env` contents, private keys or passwords into chat or GitHub files.

In repository **Settings → Secrets and variables → Actions**, add these repository secrets:

| Secret | Value |
| --- | --- |
| `BOERSE_SSH_HOST` | Oracle server IP or hostname |
| `BOERSE_SSH_USER` | Existing Ubuntu application owner with SSH access |
| `BOERSE_SSH_KEY` | Dedicated SSH private key; add its public key to that user's authorized_keys |
| `BOERSE_SSH_KNOWN_HOSTS` | Verified server SSH host-key entry, copied from a trusted connection |

Use a dedicated key for this deployment. Verify the server host key through your existing trusted SSH session; do not bypass host-key checking. The workflow uses port 22. Ensure it can reach the server without opening the Oracle database to the internet.

Add repository variables:

| Variable | Value |
| --- | --- |
| `BOERSE_APP_DIR` | Exact existing working directory, for example `/home/ubuntu/gugu-boerse-release` only if confirmed |
| `BOERSE_SERVICE` | Exact existing systemd unit, including `.service` |
| `BOERSE_DEPLOY_ENABLED` | `true` after connection setup |

The SSH user must own the application directory, use Bash, have Node 22+, npm, curl, tar and flock, and have passwordless sudo **only for systemctl is-active, stop and restart of this specific service**. An administrator can configure those narrowly scoped permissions. No root SSH login or unrestricted sudo is required. Keep the existing service, reverse proxy and firewall configuration.

Before first publication, save a server snapshot/back up Oracle data using the existing Oracle backup process. Confirm any intentional server-only code changes are committed to `boerse-open-registration`; publication replaces the listed application source files with that branch's versions.

Open **Actions → GUGU Borse - Oracle → Run workflow → check** first, then choose **deploy** for the first publication. Thereafter changes to the listed paths on `boerse-open-registration` publish automatically. A failed or skipped run has not confirmed publication.

## What GitHub manages

- Design and backend code, syntax validation, dependency installation, publication and service restart.
- A manual `check` operation that checks the running service, website and Oracle-backed categories API without changing database data.
- Existing Oracle connection settings stay in the server's `.env`. SQL schema/migration files remain versioned, but are never executed automatically. Oracle infrastructure, networking, database credentials and schema changes need a separately reviewed configuration/migration workflow tailored to the actual setup.

## Recovery and limits

The deployment stages dependencies before stopping the service. It backs up the managed source files and previous `node_modules` under `.github-deploy-backups/`, restarts the service, and checks the website plus database-backed API. On a failed deployment it attempts to restore the previous application automatically. `.env`, uploaded photos, wallets and database data are never included in the release or deleted by the deploy script. The application is briefly unavailable during replacement and restart.

Backups contain application code and dependencies, not an Oracle database backup. They are retained for manual recovery and require occasional cleanup after confirming a healthy release. Automatic rollback cannot recover from a host shutdown or forced kill; use the saved files if an interrupted deployment needs recovery. API checks verify availability, not every sign-in/listing operation. No live deployment is verified until a real GitHub run succeeds.
