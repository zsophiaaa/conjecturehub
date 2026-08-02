#!/usr/bin/env bash
#
# Checks one submitted proof with leanprover/comparator.
#
# Usage: ./verify.sh <challenge-name> [result-json-path]
#
# Exit codes:
#   0  verified
#   1  rejected (wrong statement, disallowed axiom, or the kernel refused it)
#   2  exceeded the time budget -- neither a pass nor a fail
#   3  setup problem, nothing was checked
#
# Roughly six percent of real submissions run longer than ten minutes, so the
# budget outcome is a first-class result rather than a failure. Reporting a slow
# proof as wrong would be a lie.

set -uo pipefail

CHALLENGE="${1:-}"
RESULT_PATH="${2:-}"
BUDGET_SECONDS="${VERIFY_BUDGET_SECONDS:-600}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_SRC="$HERE/challenges/$CHALLENGE.json"

emit() {
  local outcome="$1" detail="$2" elapsed="${3:-0}"
  if [ -n "$RESULT_PATH" ]; then
    python3 - "$RESULT_PATH" "$CHALLENGE" "$outcome" "$detail" "$elapsed" <<'PY'
import json, sys
path, challenge, outcome, detail, elapsed = sys.argv[1:6]
json.dump({
    "challenge": challenge,
    "outcome": outcome,
    "detail": detail[-4000:],
    "elapsed_seconds": float(elapsed),
}, open(path, "w"), indent=2)
PY
  fi
  echo "$CHALLENGE: $outcome"
}

if [ -z "$CHALLENGE" ]; then
  echo "usage: verify.sh <challenge-name> [result-json-path]" >&2
  exit 3
fi

if [ ! -f "$CONFIG_SRC" ]; then
  emit "setup_error" "No challenge configuration at $CONFIG_SRC"
  exit 3
fi

for binary in landrun lean4export comparator; do
  if ! command -v "$binary" >/dev/null 2>&1; then
    emit "setup_error" "$binary is not on PATH"
    exit 3
  fi
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
CONFIG="$WORK/config.json"

# The repository file wraps the comparator config with our own metadata; peel it
# off and hand comparator exactly the schema it expects.
python3 - "$CONFIG_SRC" "$CONFIG" <<'PY'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
config = json.load(open(src))["comparator"]
required = {"challenge_module", "solution_module", "theorem_names", "permitted_axioms"}
missing = required - set(config)
if missing:
    raise SystemExit(f"challenge config is missing {sorted(missing)}")

# An allowlist is the only thing that works. Blocking axiom names by pattern
# fails because Lean 4.29 and later emit a uniquely-named axiom for every
# `native_decide` call, and one benchmark submission smuggled an axiom past a
# text filter by assembling its name through string concatenation.
allowed = {"propext", "Quot.sound", "Classical.choice"}
extra = set(config["permitted_axioms"]) - allowed
if extra:
    raise SystemExit(f"challenge permits axioms outside the allowlist: {sorted(extra)}")

json.dump(config, open(dst, "w"))
PY

if [ $? -ne 0 ]; then
  emit "setup_error" "Challenge configuration rejected"
  exit 3
fi

cd "$HERE"

LOG="$WORK/comparator.log"
START="$(date +%s)"

# `systemd-run --user` starts from a clean environment, so anything comparator
# needs has to be forwarded explicitly. It reads COMPARATOR_LANDRUN,
# COMPARATOR_LEAN4EXPORT and COMPARATOR_NANODA to locate its helper binaries;
# without this they are silently ignored on the systemd path and honoured on the
# fallback path, which is a difference that will waste somebody's afternoon.
COMPARATOR_ENV=()
for var in COMPARATOR_LANDRUN COMPARATOR_LEAN4EXPORT COMPARATOR_NANODA; do
  if [ -n "${!var:-}" ]; then
    COMPARATOR_ENV+=("-E" "$var=${!var}")
  fi
done

# systemd-run blocks AF_UNIX, closing a landrun sandbox escape that is not fixed
# until Linux 7.1. Where it is unavailable we still run, but we say so, because
# the guarantee is weaker.
if command -v systemd-run >/dev/null 2>&1 && systemd-run --user --quiet true 2>/dev/null; then
  timeout --signal=KILL "$BUDGET_SECONDS" \
    systemd-run --property=RestrictAddressFamilies=~AF_UNIX --user --pipe --quiet \
      -E PATH="$PATH" "${COMPARATOR_ENV[@]}" --working-directory "$HERE" \
      -- bash -c "lake env comparator '$CONFIG'" >"$LOG" 2>&1
  STATUS=$?
else
  echo "warning: systemd-run unavailable, sandboxing relies on landrun alone" >&2
  timeout --signal=KILL "$BUDGET_SECONDS" \
    bash -c "lake env comparator '$CONFIG'" >"$LOG" 2>&1
  STATUS=$?
fi

ELAPSED=$(( $(date +%s) - START ))
DETAIL="$(cat "$LOG" 2>/dev/null || true)"

case "$STATUS" in
  0)   emit "verified" "$DETAIL" "$ELAPSED"; exit 0 ;;
  124|137) emit "exceeded_budget" "Ran longer than ${BUDGET_SECONDS}s and was stopped. This is not a rejection." "$ELAPSED"; exit 2 ;;
  *)   emit "rejected" "$DETAIL" "$ELAPSED"; exit 1 ;;
esac
