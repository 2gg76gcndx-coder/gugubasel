#!/usr/bin/env bash
# Run on the existing Oracle Ubuntu host as the application owner.
set -Eeuo pipefail
umask 077
app_dir=${1:?Absolute application directory required}
service=${2:?Existing systemd service name required}
release=${3:?Commit SHA required}
archive=${4:?Release archive required}
[[ "$app_dir" == /* && "$app_dir" != / && -d "$app_dir" ]] || { echo 'Invalid application directory'; exit 1; }
[[ "$service" =~ ^[a-zA-Z0-9_-]+\.service$ ]] || { echo 'Invalid service name'; exit 1; }
[[ "$release" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid commit SHA'; exit 1; }
app_dir=$(realpath "$app_dir")
cd "$app_dir"
[[ -f .env && -f server.mjs ]] || { echo 'Expected existing server.mjs and .env; refusing a new installation'; exit 1; }
command -v flock >/dev/null
exec 9> .github-deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<22) process.exit(1)'
sudo -n systemctl is-active --quiet "$service"
port=$(node --env-file=.env -e 'const p=Number(process.env.PORT||3000);if(!Number.isInteger(p)||p<1||p>65535)process.exit(1);process.stdout.write(String(p))')
files=(app.js bootstrap.mjs gugu-boerse.css http.mjs index.html marketplace.mjs oracle.mjs package-lock.json package.json repository.mjs security.mjs server.mjs service.mjs webauthn.mjs)
mkdir -p .github-deploy-backups
backup=$(mktemp -d "$app_dir/.github-deploy-backups/${release}.XXXXXX")
stage=$(mktemp -d "$app_dir/.github-stage.XXXXXX")
changed=0
finished=0
cleanup() {
  result=$?
  trap - EXIT
  if (( changed && !finished )); then
    echo 'Deployment failed; restoring the previous application.'
    sudo -n systemctl stop "$service" || true
    for file in "${files[@]}"; do
      if [[ -f "$backup/$file" ]]; then cp -p "$backup/$file" "$app_dir/$file"; else rm -f "$app_dir/$file"; fi
    done
    if [[ -d "$backup/node_modules" ]]; then
      rm -rf "$app_dir/node_modules"
      mv "$backup/node_modules" "$app_dir/node_modules"
    elif [[ -f "$backup/no-node-modules" ]]; then
      rm -rf "$app_dir/node_modules"
    fi
    if sudo -n systemctl restart "$service"; then echo 'Previous application restarted.'; else echo 'ERROR: previous application could not restart.' >&2; fi
  fi
  rm -rf "$stage"
  exit "$result"
}
trap cleanup EXIT
# Extract only the known application files. Never deploy .env, uploads, wallets or SQL.
tar -xzf "$archive" -C "$stage" --no-same-owner -- "${files[@]}"
for file in "$stage"/*.mjs "$stage/app.js"; do node --check "$file"; done
(cd "$stage" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
for file in "${files[@]}"; do [[ ! -f "$file" ]] || cp -p "$file" "$backup/$file"; done
printf '%s\n' "$release" > "$backup/new-commit"
sudo -n systemctl stop "$service"
changed=1
if [[ -d node_modules ]]; then mv node_modules "$backup/node_modules"; else touch "$backup/no-node-modules"; fi
mv "$stage/node_modules" node_modules
for file in "${files[@]}"; do cp "$stage/$file" "$file"; done
sudo -n systemctl restart "$service"
for attempt in {1..15}; do
  if sudo -n systemctl is-active --quiet "$service" &&
     curl --fail --silent --max-time 5 "http://127.0.0.1:$port/boerse/" -o /dev/null &&
     curl --fail --silent --max-time 10 "http://127.0.0.1:$port/api/categories" -o /dev/null; then
    printf '%s\n' "$release" > .github-deployed-commit
    finished=1
    echo "Published $release; application and Oracle-backed API checks passed."
    echo "Previous application kept in $backup"
    exit 0
  fi
  sleep 2
done
echo 'Application or Oracle-backed API did not become healthy.' >&2
exit 1
