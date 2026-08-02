#!/usr/bin/env python3
"""Work out where a submitted proof has to be written for CI to check it.

`select-challenges.sh` picks a challenge only when the file at the exact path
its config names has changed. So a submission parked under any other name is
carried through the pull request, verified by nothing, and reported as neither
passing nor failing.

The conjecture id alone does not identify the path, because a conjecture can
carry several challenges: erdos-647 has one for the bound and one for its
negation, each with its own solution module. What does identify it is the
theorem the submission declares. Selecting on that is also what stops a proof of
the easy direction being filed against the hard one.

Usage: solution-path.py <conjecture-id> <submitted-lean-file>

Prints the repository-relative path to write. Exits non-zero, with the reason on
stderr, when the submission matches no challenge or more than one.
"""

import json
import pathlib
import re
import sys

CHALLENGE_DIR = pathlib.Path("statements/challenges")


def declares(body: str, theorem: str) -> bool:
    """True when the file declares this theorem, matched on its bare name."""
    return re.search(rf"\b{re.escape(theorem.split('.')[-1])}\b", body) is not None


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2

    conjecture_id, lean_file = sys.argv[1], sys.argv[2]
    body = pathlib.Path(lean_file).read_text(encoding="utf-8")

    candidates = []
    for config_path in sorted(CHALLENGE_DIR.glob("*.json")):
        config = json.loads(config_path.read_text(encoding="utf-8"))
        if config.get("conjecture_id") == conjecture_id:
            candidates.append((config_path, config))

    if not candidates:
        print(f"No challenge in {CHALLENGE_DIR} targets '{conjecture_id}'.", file=sys.stderr)
        return 1

    matched = [
        (path, config)
        for path, config in candidates
        if any(declares(body, name) for name in config["comparator"]["theorem_names"])
    ]

    if len(matched) != 1:
        names = ", ".join(p.stem for p in (m[0] for m in matched)) or "none"
        expected = ", ".join(
            f"{p.stem} ({'/'.join(c['comparator']['theorem_names'])})" for p, c in candidates
        )
        print(
            f"The submission matches {len(matched)} of the {len(candidates)} challenges for "
            f"'{conjecture_id}' (matched: {names}). It has to declare exactly one of: {expected}.",
            file=sys.stderr,
        )
        return 1

    module = matched[0][1]["comparator"]["solution_module"]
    relative = module.removeprefix("Solution.").replace(".", "/")
    print(f"statements/Solution/{relative}.lean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
