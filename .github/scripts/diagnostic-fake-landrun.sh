#!/usr/bin/env bash
#
# DIAGNOSTIC ONLY. NOT A SANDBOX. MUST NOT REACH main.
#
# Stands in for landrun to answer one question: is landrun eating the `--` that
# comparator puts between the module name and the constant list when it calls
# lean4export? Every verification currently fails with "unknown module prefix
# 'Nat'", which is what lean4export reports when it parses the constants as
# modules -- exactly what happens if the separator is missing.
#
# This drops landrun's own flags the way comparator's scripts/fake-landrun.sh
# does, stops at the first non-flag token, and execs the rest verbatim. Because
# it never treats an inner `--` as a terminator, the tail reaches the command
# intact. If verification passes with this in place, landrun is the culprit.
#
# It also logs the exact argv, so the run tells us what was really passed rather
# than what we believe was passed.

set -euo pipefail

flags_with_value=(--ro --rox --rw --rwx --bind-tcp --connect-tcp --log-level --env)

is_value_flag() {
  for vf in "${flags_with_value[@]}"; do
    [ "$1" = "$vf" ] && return 0
  done
  return 1
}

echo "diagnostic-fake-landrun received: $*" >&2

while [ $# -gt 0 ]; do
  case "$1" in
    --) shift; break ;;
    -*)
      is_value_flag "$1" && shift
      shift
      ;;
    *) break ;;
  esac
done

if [ $# -eq 0 ]; then
  echo "diagnostic-fake-landrun: no command given" >&2
  exit 2
fi

echo "diagnostic-fake-landrun exec: $*" >&2
exec "$@"
