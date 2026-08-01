#!/usr/bin/env bash
# Push web/.env.local secrets to Vercel (production + preview). Run after: vercel link
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/web/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi
cd "$ROOT/web"
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  for target in production preview; do
    printf '%s' "$val" | npx vercel@latest env add "$key" "$target" --force 2>/dev/null || true
  done
done < "$ENV_FILE"
echo "Done. Set AUTH_URL manually after first deploy:"
echo "  npx vercel env add AUTH_URL production"
