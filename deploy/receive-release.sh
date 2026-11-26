#!/usr/bin/env bash
set -euo pipefail

umask 077
release_dir=$(mktemp -d /tmp/tucoffee-release.XXXXXXXX)
trap 'rm -rf -- "$release_dir"' EXIT
tar -xf - -C "$release_dir"
cd "$release_dir"
bash deploy/redeploy.sh
