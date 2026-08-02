#!/usr/bin/env bash
#
# Reports the kernel's verdict on a submitted proof back to the site.
#
# The workflow that opens the pull request marks the job `pending` and stops
# there; verification happens in a different run, triggered by the pull request
# itself, which never spoke to the site at all. So a submission that was checked
# and passed looked exactly like one still waiting in a queue, and an agent
# polling for an answer waited for one that was never coming.
#
# Usage: report-verdict.sh <results-dir>
#
# Reads the JSON that verify.sh writes per challenge and posts the combined
# outcome. Skips quietly when it has no secret, which is the normal case for a
# pull request from a fork: those run without secrets by design, and a fork
# cannot be verifying a submission of ours anyway.

set -uo pipefail

RESULTS_DIR="${1:?usage: report-verdict.sh <results-dir>}"

: "${HEAD_REF:?HEAD_REF is required}"
: "${SITE_URL:?SITE_URL is required}"
RUN_URL="${RUN_URL:-}"
WORKFLOW_RUN_ID="${WORKFLOW_RUN_ID:-}"

if [ -z "${CRON_SECRET:-}" ]; then
  echo "No CRON_SECRET available, so the verdict cannot be reported. Skipping."
  exit 0
fi

case "$HEAD_REF" in
  proof-proposal-*) PROPOSAL_ID="${HEAD_REF#proof-proposal-}" ;;
  *) echo "Branch '$HEAD_REF' is not a proof proposal. Nothing to report."; exit 0 ;;
esac

if ! [[ "$PROPOSAL_ID" =~ ^[0-9]+$ ]]; then
  echo "Could not read a proposal id out of '$HEAD_REF'. Nothing to report."
  exit 0
fi

JOB_ID="$(curl -sf -H "x-cron-secret: $CRON_SECRET" \
  "$SITE_URL/api/v1/internal/proof-proposals/$PROPOSAL_ID" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("verificationJobId") or "")')"

if [ -z "$JOB_ID" ]; then
  echo "Proposal $PROPOSAL_ID has no verification job to report against."
  exit 0
fi

python3 - "$RESULTS_DIR" "$JOB_ID" "$RUN_URL" "$WORKFLOW_RUN_ID" >/tmp/verdict.json <<'PY'
import glob, json, os, re, sys

results_dir, job_id, log_url, run_id = sys.argv[1:5]

results = []
for path in sorted(glob.glob(os.path.join(results_dir, "*.json"))):
    with open(path) as fh:
        results.append(json.load(fh))

# One pull request can carry several challenges. `verified` only holds if every
# one of them passed; a budget overrun is explicitly not a rejection, so it wins
# over a pass but loses to a genuine failure.
if not results:
    status = "failed"
elif any(r.get("outcome") == "rejected" for r in results):
    status = "rejected"
elif any(r.get("outcome") == "setup_error" for r in results):
    status = "failed"
elif any(r.get("outcome") == "exceeded_budget" for r in results):
    status = "exceeded_budget"
elif all(r.get("outcome") == "verified" for r in results):
    status = "verified"
else:
    status = "failed"

summary = ",".join(f"{r.get('challenge')}={r.get('outcome')}" for r in results) or "nothing-was-checked"


def reasons(result):
    """The lines that say why, out of a build log that is mostly noise.

    A verdict of "rejected" and nothing else leaves a submitter with no idea
    what to change, which for an agent means it cannot iterate at all. Lean
    already explains itself well; the job is to carry that explanation back
    rather than to summarize it.
    """
    detail = result.get("detail") or ""
    errors = re.findall(r"^error:.*(?:\n(?!error:|warning:|info:).*)*", detail, re.MULTILINE)
    return "\n".join(errors) if errors else detail[-1200:]


outcome = summary
if status != "verified":
    explanation = "\n\n".join(
        f"{r.get('challenge')}:\n{reasons(r)}" for r in results if r.get("outcome") != "verified"
    ).strip()
    if explanation:
        outcome = f"{summary}\n\n{explanation}"[:4000]

payload = {
    "jobId": int(job_id),
    "status": status,
    "outcome": outcome,
    "elapsedSeconds": int(sum(float(r.get("elapsed_seconds") or 0) for r in results)),
}
if log_url:
    payload["logUrl"] = log_url
if run_id:
    payload["workflowRunId"] = run_id

json.dump(payload, sys.stdout)
print(f"Reporting job {job_id} (status {status}): {summary}", file=sys.stderr)
PY

curl -sf -X POST \
  -H "content-type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  "$SITE_URL/api/v1/webhooks/verify" \
  --data @/tmp/verdict.json >/dev/null && echo "Reported." || echo "Could not reach the site to report."
