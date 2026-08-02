#!/usr/bin/env bash
#
# Runs the real landrun with an explicit `--` inserted between landrun's own
# flags and the command it is asked to sandbox.
#
# Why this exists: comparator invokes
#
#     lean4export <Module> -- <Const> <Const> ...
#
# and lean4export splits its arguments on that bare `--`. landrun parses its
# command line with urfave/cli, which treats the first `--` it sees as the
# end-of-flags terminator and drops it. comparator's separator was the first one
# in the line, so it was the one consumed, and lean4export received the constant
# names where it expected module names -- every proof was rejected with
# "unknown module prefix 'Nat'".
#
# urfave/cli only consumes the first terminator and passes everything after it
# through verbatim, so supplying our own is enough to protect comparator's. The
# real sandbox still runs; nothing here weakens it. Confirmed by a control run
# with a pass-through shim, which verified successfully where real landrun did
# not.
#
# Point comparator at this with COMPARATOR_LANDRUN. It is restored from the base
# commit by verify-lean.yml along with the rest of the verifier, so a submitted
# proof cannot edit it.

set -uo pipefail

REAL_LANDRUN="${LANDRUN_BIN:-landrun}"

# landrun flags that consume the following argument. Anything not listed is
# treated as a boolean, which is the safe direction to be wrong in: mistaking a
# value for a command inserts the terminator too early and landrun reports an
# unknown command rather than silently sandboxing the wrong thing.
takes_value() {
  case "${1#-}" in
    -ro|ro|-rox|rox|-rw|rw|-rwx|rwx|-env|env|-unix|unix) return 0 ;;
    -bind-tcp|bind-tcp|-connect-tcp|connect-tcp|-log-level|log-level) return 0 ;;
    *) return 1 ;;
  esac
}

flags=()
while [ $# -gt 0 ]; do
  case "$1" in
    --)
      # Already terminated by the caller; nothing to do.
      shift
      exec "$REAL_LANDRUN" "${flags[@]}" -- "$@"
      ;;
    --*=*)
      flags+=("$1")
      shift
      ;;
    -*)
      flags+=("$1")
      if takes_value "$1"; then
        shift
        [ $# -gt 0 ] && { flags+=("$1"); shift; }
      else
        shift
      fi
      ;;
    *)
      # First non-flag token: the command. Terminate flags explicitly so that
      # any `--` further along belongs to the command and reaches it intact.
      exec "$REAL_LANDRUN" "${flags[@]}" -- "$@"
      ;;
  esac
done

echo "landrun-terminator: no command given" >&2
exit 2
