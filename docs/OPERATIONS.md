# Operations

What runs, where, and what it costs. The short version: nothing costs anything, and that is a design constraint rather than a happy accident.

## Where compute lives

| Job | Runs on | Why there |
| --- | --- | --- |
| Source sweep, every 6 hours | GitHub Actions | Actions minutes are free and unmetered on public repositories. Vercel's Hobby plan caps cron at once per day, which is not enough. |
| Lean verification | GitHub Actions | Needs 4 CPUs, 16 GB and a Linux sandbox. Free runners provide exactly that. |
| Schema validation and screening | GitHub Actions | Runs on every pull request. |
| The website | Vercel | Fully static export, so it is only file serving. |

## Workflows

| File | Trigger | What it does |
| --- | --- | --- |
| `validate.yml` | push, pull request | Schema and semantic validation of every record; typechecks and builds the site. |
| `screen.yml` | pull request touching `conjectures/` | Enforces the append-only rule, checks sources, advisory quality screen. Read-only token. |
| `screen-report.yml` | after `screen.yml` | Posts the screening result as a comment. Split out so the privileged half never touches contributor code. |
| `sweep.yml` | every 6 hours, manual | Runs the sweep and opens a pull request with new unverified claims. |
| `verify-lean.yml` | pull request touching `statements/` | Checks submitted proofs with comparator. |
| `record-verification.yml` | push to `main` touching `statements/Solution/` | Re-verifies on the default branch and writes the receipt into the corpus. |

## Configuration

Everything is optional. Each degrades to something sensible rather than failing.

| Name | Kind | Effect if absent |
| --- | --- | --- |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | secrets / variable | **Required for auto-classification.** Without them the sweep still fetches, filters, and name-matches, but matches are reported for human triage instead of becoming claims. |
| `ZULIP_EMAIL`, `ZULIP_API_KEY` | secrets | The Lean Zulip source is skipped; every other source still runs. |
| `LLM_DAILY_BUDGET` | variable | Defaults to 120 classifier calls per sweep run. |

**Note:** GitHub Models (`models.github.ai`) was retired 2026-07-30. This repo no longer uses `GITHUB_TOKEN` for inference. Point `LLM_BASE_URL` at any OpenAI-compatible API (OpenAI, OpenRouter, Groq, etc.) and store the key in Actions secrets.

## Things that will break, and what to do

**The sweep proposes nothing for days.** Usually correct — genuine resolutions are rare. Check the run summary: if `matched` is zero across several runs, a source is probably returning an empty feed. Failed sources are listed by name in the summary and never abort the run.

**Classifier budget exhausted every run.** The prefilter has stopped discriminating, usually because a new cue phrase is matching everything. Tighten `ingest/src/sweep/prefilter.ts` rather than raising the budget.

**A workflow stops firing on schedule.** GitHub drops scheduled runs under load, and it disables scheduled workflows entirely after 60 days without repository activity. The `17 */6 * * *` offset avoids the top-of-hour peak.

**Mathlib cache misses and verification takes an hour.** Expected after a toolchain bump. Bump `LEAN_TOOLCHAIN` and `MATHLIB_REV` together in `verify-lean.yml` and `record-verification.yml`; the first run afterwards is slow and every run after that is cached.

**Every proof is rejected with "incompatible header".** `lean4export` reads `.olean` files, and Lean refuses to read one written by a different version. comparator pins its own `lean-toolchain`, so if that pin and `LEAN_TOOLCHAIN` disagree, nothing can ever verify. `COMPARATOR_REV` is therefore a commit SHA rather than `master`: tracking the branch means an upstream toolchain bump silently breaks verification here. `setup-lean` compares the two and fails with an explicit message, so this should now surface at setup rather than as a rejection. When bumping `LEAN_TOOLCHAIN`, find a comparator revision on the same Lean version:

```bash
gh api "repos/leanprover/comparator/commits?path=lean-toolchain" \
  --jq '.[] | .sha[0:12] + "  " + (.commit.message | split("\n")[0])'
```

**Fork pull requests cannot comment.** By design. `pull_request` gives untrusted code a read-only token, and the privileged reporting workflow runs separately via `workflow_run`. Do not "fix" this by switching to `pull_request_target`.

**The bot's pull request has no checks on it.** Also expected: a pull request opened with `GITHUB_TOKEN` does not trigger other workflows. `sweep.yml` therefore runs validation itself before opening one.

## Re-seeding

`npm run seed` re-ingests from upstream and rewrites `conjectures/`. It never deletes a record that upstream has dropped, because a published id is permanent and a conjecture vanishing from a snapshot is not evidence it stopped existing.

Pinned upstream versions live in `ingest/src/sources/`. formal-conjectures resolves to its latest semver tag rather than `main`, since formalizations stop compiling within months and an unpinned ingest would drift silently.

## Cost

Zero, with two caveats worth knowing before they matter.

Vercel's Hobby plan forbids commercial use. This is a public good today; if that ever changes, the plan has to change with it.

Actions minutes are unmetered only while the repository is public. Making it private would meter every sweep and every verification run.
