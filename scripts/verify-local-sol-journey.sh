#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output="$(mktemp -d /private/tmp/whirlpool-local-journey.XXXXXX)"
trap 'rm -rf "$output"' EXIT

if [[ ! -f "$root/spikes/v1-feasibility/candidate-circuits/generated/shield_final.zkey" ]]; then
  echo 'Missing local research proving artifacts. Reproduce the candidate-circuits spike first.' >&2
  exit 1
fi

(
  cd "$root/packages/protocol-client"
  WHIRLPOOL_LOCAL_JOURNEY_OUTPUT="$output" node scripts/local-journey.mjs
)
(
  cd "$root/programs/sol-pool"
  NO_DNA=1 cargo build-sbf --offline
  WHIRLPOOL_LOCAL_JOURNEY_OUTPUT="$output" NO_DNA=1 cargo test --offline --test local_journey -- --ignored
)
