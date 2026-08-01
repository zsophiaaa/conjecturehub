#!/usr/bin/env bash
#
# Works out which challenges need checking, given a base commit.
#
# A challenge is selected when its solution file changed. The smoke test is
# added whenever the verification pipeline itself changed, so that a broken
# verifier is caught by the verifier rather than by a wrong result on somebody's
# real submission.

set -euo pipefail

BASE_SHA="${1:?usage: select-challenges.sh <base-sha>}"

CHANGED="$(git diff --name-only --diff-filter=ACMR "$BASE_SHA...HEAD" -- statements/Solution || true)"
echo "changed solution files:"
echo "${CHANGED:-  (none)}"

NAMES=()
for config in statements/challenges/*.json; do
  [ -f "$config" ] || continue
  name="$(basename "$config" .json)"
  module="$(python3 -c "import json;print(json.load(open('$config'))['comparator']['solution_module'])")"
  relative="statements/Solution/$(echo "${module#Solution.}" | tr '.' '/').lean"
  if echo "$CHANGED" | grep -qx "$relative"; then
    NAMES+=("$name")
  fi
done

PIPELINE_CHANGED="$(git diff --name-only "$BASE_SHA...HEAD" -- \
  statements/verify.sh \
  statements/lakefile.toml \
  .github/actions/setup-lean \
  .github/workflows/verify-lean.yml || true)"

if [ -n "$PIPELINE_CHANGED" ]; then
  case " ${NAMES[*]-} " in
    *" smoke "*) ;;
    *) NAMES+=("smoke") ;;
  esac
fi

JOINED="${NAMES[*]-}"
echo "names=$JOINED" >> "${GITHUB_OUTPUT:-/dev/stdout}"
echo "will check: ${JOINED:-(nothing)}"
