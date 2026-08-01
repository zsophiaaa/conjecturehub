#!/usr/bin/env bash
#
# Renders verification results as markdown for a job summary.

set -euo pipefail

DIR="${1:?usage: summarize-verification.sh <results-dir>}"

echo "## Lean verification"
echo
echo "| Challenge | Outcome | Time |"
echo "| --- | --- | --- |"

shopt -s nullglob
for file in "$DIR"/*.json; do
  python3 - "$file" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
icons = {
    "verified": "verified",
    "rejected": "rejected",
    "exceeded_budget": "exceeded budget",
    "setup_error": "setup error",
}
print(f"| `{r['challenge']}` | {icons.get(r['outcome'], r['outcome'])} | {r['elapsed_seconds']:.0f}s |")
PY
done

cat <<'EOF'

`exceeded budget` is neither a pass nor a fail. Around six percent of genuine proofs take longer than ten minutes; say so on the pull request and a maintainer will rerun with a longer limit.

A verified result means the Lean kernel, and an independent second kernel, accepted this proof of the **canonical statement**, using no axioms beyond `propext`, `Quot.sound` and `Classical.choice`. Whether that statement faithfully expresses the conjecture is a separate human judgement, recorded against the formal statement itself.
EOF
