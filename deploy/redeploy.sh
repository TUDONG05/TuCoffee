#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose --project-name tucoffee --env-file /home/tudong/TuCoffee/.env)
exec 9>"/home/tudong/.tucoffee-deploy.lock"
flock 9

"${compose[@]}" config --quiet
"${compose[@]}" build api web
"${compose[@]}" up -d --no-build

if ! curl --fail --silent --show-error --retry 60 --retry-all-errors \
  --retry-delay 5 --retry-max-time 300 --max-time 5 https://tucoffee.tudv.tech/api/v1/health; then
  "${compose[@]}" ps
  "${compose[@]}" logs --no-color --tail 80 api web
  exit 1
fi
curl --fail --silent --show-error --max-time 10 -o /dev/null https://tucoffee.tudv.tech/
