#!/bin/sh

set -eu

if [ "${SSH_ORIGINAL_COMMAND:-}" != "deploy" ]; then
  echo "Only the deploy command is allowed." >&2
  exit 64
fi

deploy_path=/opt/coffee_bot
lock_file=/var/lock/coffee-bot-deploy.lock

exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Another coffee_bot deployment is already running." >&2
  exit 75
fi

cd "$deploy_path"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Tracked files in $deploy_path contain local changes." >&2
  exit 1
fi

git fetch --prune origin main
git checkout main
git merge --ff-only origin/main

docker compose config -q
docker compose up -d --build --remove-orphans --wait --wait-timeout 180

curl -fsS --connect-timeout 5 --max-time 15 http://172.22.1.1:3001/api/health
printf '\n'
docker compose ps
printf 'deployed_commit=%s\n' "$(git rev-parse --short HEAD)"
