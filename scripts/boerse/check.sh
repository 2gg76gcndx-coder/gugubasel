#!/usr/bin/env bash
# Read-only check of the existing service and Oracle-backed API.
set -Eeuo pipefail
app_dir=${1:?Application directory required}
service=${2:?Service name required}
[[ "$app_dir" == /* && "$app_dir" != / && -d "$app_dir" ]]
[[ "$service" =~ ^[a-zA-Z0-9_-]+\.service$ ]]
cd "$app_dir"
sudo -n systemctl is-active --quiet "$service"
port=$(node --env-file=.env -e 'const p=Number(process.env.PORT||3000);if(!Number.isInteger(p)||p<1||p>65535)process.exit(1);process.stdout.write(String(p))')
curl --fail --silent --max-time 10 "http://127.0.0.1:$port/boerse/" -o /dev/null
curl --fail --silent --max-time 20 "http://127.0.0.1:$port/api/categories" -o /dev/null
echo 'Service, website and Oracle-backed categories API are healthy.'
