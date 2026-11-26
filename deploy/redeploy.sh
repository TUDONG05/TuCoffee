#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose --project-name tucoffee --env-file /home/tudong/TuCoffee/.env)
exec 9>"/home/tudong/.tucoffee-deploy.lock"
flock 9

"${compose[@]}" config --quiet
"${compose[@]}" build api web
"${compose[@]}" up -d --no-build

curl --fail --silent --show-error --retry 30 --retry-all-errors \
  --retry-delay 3 --max-time 5 https://tucoffee.tudv.tech/api/v1/health
curl --fail --silent --show-error --max-time 10 -o /dev/null https://tucoffee.tudv.tech/
